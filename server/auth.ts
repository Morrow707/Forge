import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";
import { hashPassword, comparePasswords } from "./auth-utils";
import { pool } from "./db";
import {
  signupSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  type PublicUser,
} from "@shared/schema";

const PgStore = connectPgSimple(session);

function toPublicUser(user: any): PublicUser {
  const { passwordHash, healthStatus, ...rest } = user;
  return rest;
}

// A coach's login/me response needs their own display title (e.g.
// "Nutritionist") if the primary set one for them, and whether they ARE
// the primary -- both storage-backed, not users columns, so they're
// attached here rather than by toPublicUser itself (which has no async
// access to storage). isPrimaryCoach gates org-wide identity edits
// (branding, nav customization) to the one account whose call it should
// actually be, not any staff member sharing the roster -- see the
// requirePrimaryCoach guard in routes.ts.
async function withStaffTitle(user: any): Promise<PublicUser> {
  const publicUser = toPublicUser(user);
  if (user.role === "coach") {
    publicUser.staffTitle = await storage.getStaffTitleForCoach(user.id);
    const coachIds = await storage.getEffectiveCoachIds(user.id);
    publicUser.isPrimaryCoach = coachIds[0] === user.id;
  }
  return publicUser;
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

      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({
        email,
        passwordHash,
        name,
        role,
        phone: phone || null,
      });

      if (coach) {
        // Account already exists at this point -- a full roster (see
        // linkAthleteToCoach's billing-cap check) just leaves them a Free
        // Agent instead of failing the whole signup.
        const linked = await storage.linkAthleteToCoach(coach.id, user.id);
        if (linked && team) await storage.addAthleteToTeam(team.id, user.id);
      }

      req.login(user, (err) => {
        if (err) return next(err);
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
      req.login(user, async (err2) => {
        if (err2) return next(err2);
        await storage.touchUserActivity(user.id);
        res.json(await withStaffTitle(user));
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

  // No email service is wired up in this environment yet, so the reset
  // token is handed straight back in the response instead of being emailed
  // -- the frontend shows it directly as a copyable link. This does mean an
  // attacker can tell whether an email is registered (a real provider would
  // hide that by always responding the same way); acceptable for now given
  // there's no delivery mechanism to hide behind. Swap this for a real send
  // once a provider is connected -- everything else here already assumes
  // token-based reset, not email content.
  app.post("/api/auth/request-password-reset", async (req, res, next) => {
    try {
      const parsed = requestPasswordResetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const user = await storage.getUserByEmail(parsed.data.email);
      if (!user) {
        return res.json({ resetToken: null });
      }
      const resetToken = await storage.createPasswordResetToken(user.id);
      res.json({ resetToken });
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

  app.get("/api/auth/me", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(await withStaffTitle(req.user));
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
      const linked = await storage.linkAthleteToCoach(coach.id, user.id);
      if (!linked) {
        return res.status(402).json({ message: "This coach's roster is full -- ask them to upgrade their plan." });
      }
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
