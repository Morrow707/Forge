import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
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

// Keyed by IP (express-rate-limit's default) rather than by the submitted
// email -- an attacker can supply any email in the body, but not spoof
// their own connecting IP, which is what actually bounds a credential-
// stuffing or brute-force script. A real person mistyping a password a
// few times never comes close to these limits.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in a few minutes." },
});
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many accounts created from this network. Please try again later." },
});
// request-password-reset already replies identically whether or not the
// email exists (see the route below), which defends enumeration by
// response content -- this defends the other angle, an attacker hammering
// the endpoint to flood a real victim's inbox with reset emails.
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many reset requests. Please try again later." },
});

function toPublicUser(user: any): PublicUser {
  // agreedToTermsText is a full snapshot of whatever the agreement said at
  // signup -- potentially long, and not something any client-side UI reads,
  // so it's stripped here the same way passwordHash/healthStatus already
  // are rather than round-tripping on every /api/auth/me call forever.
  const { passwordHash, healthStatus, agreedToTermsText, ...rest } = user;
  return rest;
}

// Bearer-token fallback for the native app, alongside (not instead of) the
// cookie session above. iOS's WKWebView is subject to Apple's Intelligent
// Tracking Prevention, which silently drops a cross-origin Set-Cookie from a
// fetch() response -- forge-ebhd.onrender.com is "third-party" relative to
// the app's own capacitor://localhost origin, so the session cookie set by
// login never actually gets stored, and every request after it is
// unauthenticated. Login itself still appeared to work because its response
// body is used directly (see use-auth.tsx's setQueryData), never round-
// tripping through a second request -- but every GET after that (programs,
// classes, roster, calendar...) silently 401's, and the UI's `data ?? []`
// fallbacks render that identically to genuinely empty data. A signed,
// stateless token sent back as an ordinary response body field and replayed
// as an Authorization header sidesteps cookies (and ITP) entirely; it needs
// no server-side storage/revocation list since it's no more sensitive than
// the session cookie it stands in for, and it's silently ignored by the web
// client, which keeps using the cookie exactly as before.
const NATIVE_TOKEN_SECRET = process.env.SESSION_SECRET || "forge-dev-secret";
const NATIVE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // matches the cookie session's own maxAge

function signNativeToken(userId: number): string {
  const expiresAt = Date.now() + NATIVE_TOKEN_TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", NATIVE_TOKEN_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyNativeToken(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userIdStr, expiresAtStr, sig] = parts;
  const expected = crypto
    .createHmac("sha256", NATIVE_TOKEN_SECRET)
    .update(`${userIdStr}.${expiresAtStr}`)
    .digest("hex");
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  const userId = Number(userIdStr);
  return Number.isInteger(userId) ? userId : null;
}

// Registered once, right after setupAuth(app) in routes.ts, before any
// route. Only kicks in when the cookie session didn't already authenticate
// the request -- on web that's always the case (no token is ever sent), so
// this is a pure no-op there. req.user is set directly rather than via
// req.login(), since req.isAuthenticated() (which requireAuth/requireRole
// below both gate on) just checks `!!req.user` -- no session write, no
// cookie, nothing left behind for a request that's over in one round trip.
export const attachNativeTokenAuth: RequestHandler = async (req, res, next) => {
  if (req.isAuthenticated()) return next();
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  const userId = verifyNativeToken(header.slice(7));
  if (userId === null) return next();
  try {
    const user = await storage.getUser(userId);
    if (user) (req as any).user = user;
    next();
  } catch (err) {
    next(err);
  }
};

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
        // The native app's WKWebView/WebView origin (capacitor://localhost,
        // https://localhost) is never the same origin as this server, so
        // every request it makes is cross-site -- the default "lax" cookie
        // wouldn't be attached to those at all, which is exactly what was
        // silently breaking login there (a cross-origin fetch back with no
        // session cookie set, since the server never got the one from an
        // earlier request either). "none" requires secure:true, which is
        // already the case in production; left as "lax" in dev, where
        // secure is off and "none" would just make browsers drop the
        // cookie entirely instead of relaxing anything.
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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

  app.post("/api/auth/signup", signupLimiter, async (req, res, next) => {
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
        res.status(201).json({ ...toPublicUser(user), nativeToken: signNativeToken(user.id) });
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/login", loginLimiter, (req, res, next) => {
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
          res.json({ ...toPublicUser(user), nativeToken: signNativeToken(user.id) });
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
  app.post("/api/auth/request-password-reset", passwordResetLimiter, async (req, res, next) => {
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
