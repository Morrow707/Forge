import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";
import { hashPassword, comparePasswords } from "./auth-utils";
import { pool } from "./db";
import { sendEmail } from "./email";
import { buildWelcomeEmail } from "./welcome-email";
import { buildPasswordResetEmail } from "./password-reset-email";
import {
  signupSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  type PublicUser,
} from "@shared/schema";

const PgStore = connectPgSimple(session);

function toPublicUser(user: any): PublicUser {
  // agreedToTermsText is a full snapshot of whatever the agreement said at
  // signup -- potentially long, and not something any client-side UI reads,
  // so it's stripped here the same way passwordHash/healthStatus already
  // are rather than round-tripping on every /api/auth/me call forever.
  const { passwordHash, healthStatus, agreedToTermsText, ...rest } = user;
  return rest;
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(
    session({
      store: new PgStore({ pool, tableName: "session", createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET || "forge-dev-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user || !(await comparePasswords(password, user.passwordHash))) {
            return done(null, false, { message: "Invalid email or password" });
          }
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      },
    ),
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/auth/signup", async (req, res, next) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const { email, password, name, role, coachCode, phone } = parsed.data;
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "Email already in use" });
      }

      let coach = null;
      let team = null;
      if (role === "athlete" && coachCode) {
        coach = await storage.getUserByCoachCode(coachCode);
        if (!coach) {
          team = await storage.getTeamByCode(coachCode);
          if (team) coach = await storage.getUser(team.coachId);
        }
        if (!coach) {
          return res.status(400).json({ message: "Invalid invite code" });
        }
      }

      // Snapshotting the server's own current agreement text here (not
      // whatever the client might have sent) is what makes this a real
      // clickwrap record rather than just a checked box -- signupSchema
      // already rejects the request outright if agreedToTerms isn't
      // exactly true, so reaching this point means they saw and accepted
      // exactly this text.
      const agreedToTermsText = await storage.getLegalAgreement();

      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({
        email,
        passwordHash,
        name,
        role,
        phone: phone || null,
        agreedToTermsAt: new Date(),
        agreedToTermsText,
      });

      if (coach) {
        await storage.linkAthleteToCoach(coach.id, user.id);
        if (team) await storage.addAthleteToTeam(team.id, user.id);
      }

      req.login(user, (err) => {
        if (err) return next(err);
        // Fire-and-forget: sendEmail never throws (see email.ts) and a slow
        // or failed welcome email is never a reason to hold up the response
        // an athlete or coach is waiting on right after signing up.
        sendEmail({
          to: user.email,
          subject: "Welcome to Forge",
          html: buildWelcomeEmail(user, coach?.name ?? null),
        });
        res.status(201).json(toPublicUser(user));
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res
          .status(401)
          .json({ message: info?.message || "Invalid email or password" });
      }
      // req.login()'s callback isn't promise-aware -- it invokes this
      // function and ignores whatever it returns, so an unhandled `await`
      // rejection in here (a dropped DB connection, a transient query
      // failure) never reaches Express's error middleware. Without this
      // try/catch, that failure mode is a response that's never sent at
      // all: the client gets a connection reset with no JSON body, which
      // apiRequest's res.json() can't parse, falling back to an empty
      // res.statusText (blank over HTTP/2) and finally to the generic
      // "Login failed" toast -- indistinguishable from a wrong password,
      // even though the credentials were correct.
      req.login(user, async (err2) => {
        if (err2) return next(err2);
        try {
          await storage.touchUserActivity(user.id);
          res.json(toPublicUser(user));
        } catch (err3) {
          next(err3);
        }
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.status(204).end();
      });
    });
  });

  // Emails the reset link via Resend now that a provider is connected,
  // rather than handing the token straight back in the response for the
  // frontend to show as a copyable link (the previous stopgap while no
  // email service existed). Responds identically whether or not the email
  // is registered, and never reflects the token or any other tell back to
  // the caller -- otherwise this endpoint would let anyone check which
  // emails have accounts just by watching which responses differ.
  app.post("/api/auth/request-password-reset", async (req, res, next) => {
    try {
      const parsed = requestPasswordResetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const user = await storage.getUserByEmail(parsed.data.email);
      if (user) {
        const resetToken = await storage.createPasswordResetToken(user.id);
        // req.protocol/req.get("host") come straight from the request's own
        // Host header, which a caller can set to anything -- an attacker
        // could POST here with Host: evil.com and a victim's email, and the
        // REAL reset token would get emailed to the victim inside a link
        // pointing at evil.com (classic Host-header password-reset
        // poisoning). RENDER_EXTERNAL_URL is set by the platform itself,
        // not derived from anything a client sends, so it's what production
        // always uses; the request-derived fallback only still applies
        // locally, where there's no attacker-facing Host header to spoof.
        const origin = process.env.RENDER_EXTERNAL_URL ?? `${req.protocol}://${req.get("host")}`;
        const resetLink = `${origin}/reset-password?token=${resetToken}`;
        await sendEmail({
          to: user.email,
          subject: "Reset your Forge password",
          html: buildPasswordResetEmail(resetLink),
        });
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/reset-password", async (req, res, next) => {
    try {
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const record = await storage.getValidPasswordResetToken(parsed.data.token);
      if (!record) {
        return res.status(400).json({ message: "This reset link is invalid or has expired." });
      }
      const passwordHash = await hashPassword(parsed.data.password);
      await storage.consumePasswordResetToken(record.id, record.userId, passwordHash);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(toPublicUser(req.user));
  });

  app.post("/api/auth/join-coach", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      if (user.role !== "athlete") {
        return res.status(403).json({ message: "Only athletes can join a coach" });
      }
      const { coachCode } = req.body;
      let coach = await storage.getUserByCoachCode(coachCode || "");
      let team = null;
      if (!coach) {
        team = await storage.getTeamByCode(coachCode || "");
        if (team) coach = await storage.getUser(team.coachId);
      }
      if (!coach) {
        return res.status(400).json({ message: "Invalid invite code" });
      }
      await storage.linkAthleteToCoach(coach.id, user.id);
      if (team) await storage.addAthleteToTeam(team.id, user.id);
      res.json({ coachId: coach.id, coachName: coach.name });
    } catch (err) {
      next(err);
    }
  });
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
};

type Role = "coach" | "athlete" | "admin";

export const requireRole =
  (role: Role | Role[]): RequestHandler =>
  (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const allowed = Array.isArray(role) ? role : [role];
    if (!allowed.includes((req.user as any).role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
