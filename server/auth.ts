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
import { buildNewDeviceLoginEmail } from "./new-device-login-email";
import { buildPasswordChangedEmail } from "./password-changed-email";
import { buildVerifyEmailEmail } from "./verify-email-email";
import { buildGuardianInviteEmail } from "./guardian-invite-email";
import { apiLimiter } from "./rate-limiters";
import { totpOtpauthUri } from "./mfa";
import { isNativeAppRequest, normalizeIp, resolveLocation, shouldTouchLastSeen, type SessionKind } from "./session-tracking";
import {
  signupSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  changePasswordSchema,
  backfillDateOfBirthSchema,
  claimProvisionalAthleteSchema,
  claimGuardianInviteSchema,
  type PublicUser,
} from "@shared/schema";
import { derivePrivacyTier, GUARDIAN_NOTICE_LIVE, type PrivacyTier } from "@shared/privacy-tiers";
import { notifyUser } from "./notify";

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
// A 6-digit TOTP code is only ~1M possibilities -- shared by the
// second-factor login step, setup confirmation, and disabling, all of
// which boil down to "guess a code," so all three get the same limiter.
const mfaCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});
// Guards repeated wrong-current-password guesses against
// /api/account/change-password -- same shape as mfaCodeLimiter, just for a
// different secret being guessed.
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});
const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});

function toPublicUser(user: any): PublicUser {
  // agreedToTermsText is a full snapshot of whatever the agreement said at
  // signup -- potentially long, and not something any client-side UI reads,
  // so it's stripped here the same way passwordHash/healthStatus already
  // are rather than round-tripping on every /api/auth/me call forever.
  // mfaSecret/mfaBackupCodeHashes never belong on the client past the
  // one-time setup/confirm response (see the /api/auth/mfa/* routes below,
  // which return them directly, not through this function).
  const { passwordHash, healthStatus, agreedToTermsText, mfaSecret, mfaBackupCodeHashes, ...rest } = user;
  return rest;
}

// Every endpoint that hands back a fresh user object (signup, login,
// /api/auth/me) needs to go through this, not just toPublicUser alone --
// use-auth.tsx's login/signup mutations seed the /api/auth/me query cache
// directly from THIS response body (see qc.setQueryData in use-auth.tsx),
// so a login response missing hiddenSections leaves a just-restricted staff
// coach's nav showing everything until their next full page load happens
// to trigger a real /api/auth/me refetch.
async function toPublicUserWithSections(user: any): Promise<PublicUser> {
  const publicUser = toPublicUser(user);
  if (user.role === "coach") {
    (publicUser as any).hiddenSections = await storage.getHiddenSectionsForCoach(user.id);
    (publicUser as any).staffTitle = await storage.getStaffTitleForCoach(user.id);
  }
  return publicUser;
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
// as an Authorization header sidesteps cookies (and ITP) entirely, and it's
// silently ignored by the web client, which keeps using the cookie exactly
// as before.
//
// The token now carries a sessionRecordId (a user_sessions row -- see
// session-tracking.ts/storage.ts) and IS checked against server-side
// revocation on every request (attachNativeTokenAuth below) -- it used to
// be a pure stateless signature check with no DB involved at all, which
// meant a native login could never actually be revoked before its own
// 30-day expiry. That's the whole point of "log out other devices"
// actually working for the native app, not just the web cookie session
// (which was always revocable, by deleting its row from connect-pg-simple's
// own session table).
const NATIVE_TOKEN_SECRET = process.env.SESSION_SECRET || "forge-dev-secret";
const NATIVE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // matches the cookie session's own maxAge

function signNativeToken(userId: number, sessionRecordId: number): string {
  const expiresAt = Date.now() + NATIVE_TOKEN_TTL_MS;
  const payload = `${userId}.${sessionRecordId}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", NATIVE_TOKEN_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyNativeToken(token: string): { userId: number; sessionRecordId: number } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userIdStr, sessionRecordIdStr, expiresAtStr, sig] = parts;
  const expected = crypto
    .createHmac("sha256", NATIVE_TOKEN_SECRET)
    .update(`${userIdStr}.${sessionRecordIdStr}.${expiresAtStr}`)
    .digest("hex");
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  const userId = Number(userIdStr);
  const sessionRecordId = Number(sessionRecordIdStr);
  if (!Number.isInteger(userId) || !Number.isInteger(sessionRecordId)) return null;
  return { userId, sessionRecordId };
}

// Identifies who's mid-login between the password check succeeding and the
// second factor being verified (see the login route's mfaEnabled branch
// below) -- reuses NATIVE_TOKEN_SECRET rather than getting its own secret,
// unlike media-url-signing.ts's MEDIA_URL_SECRET split: this token alone
// grants nothing by itself (it just names a userId to check a code
// against), so it doesn't carry the same "the token IS the credential"
// risk a signed media URL does. Five minutes is long enough to type a
// 6-digit code, short enough that an expired login attempt just means
// starting over.
const MFA_PENDING_TOKEN_TTL_MS = 5 * 60 * 1000;

function signMfaPendingToken(userId: number): string {
  const expiresAt = Date.now() + MFA_PENDING_TOKEN_TTL_MS;
  const payload = `mfa.${userId}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", NATIVE_TOKEN_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyMfaPendingToken(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "mfa") return null;
  const [, userIdStr, expiresAtStr, sig] = parts;
  const expected = crypto
    .createHmac("sha256", NATIVE_TOKEN_SECRET)
    .update(`mfa.${userIdStr}.${expiresAtStr}`)
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
// isNativeSessionValid is the actual revocation check -- see storage.ts's
// own comment on why a native session's revokedAt is checked directly here
// rather than through some other mechanism.
export const attachNativeTokenAuth: RequestHandler = async (req, res, next) => {
  if (req.isAuthenticated()) return next();
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  const decoded = verifyNativeToken(header.slice(7));
  if (decoded === null) return next();
  try {
    const valid = await storage.isNativeSessionValid(decoded.sessionRecordId);
    if (!valid) return next();
    const user = await storage.getUser(decoded.userId);
    if (user) {
      (req as any).user = user;
      (req as any).nativeSessionRecordId = decoded.sessionRecordId;
    }
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
  // Has to sit right here -- after session/passport are wired up (so its
  // own keying can call req.isAuthenticated) but before every route below,
  // including the ones in this very function. See apiLimiter's own comment
  // in rate-limiters.ts for why mounting it any later (routes.ts, after
  // setupAuth returns) would silently cover none of these.
  app.use("/api", apiLimiter);

  // Any validly-shaped hash.salt string -- see the timing-safety comment
  // at its use below. Its own "password" is never checked against
  // anything real.
  const DUMMY_PASSWORD_HASH =
    "0d72ca9628774094eb327bbd9d59b234559ef66e2e3e5fd4addf4c172c00cf3722a89d721a23a5191cbb5b95847ebf1efd945399284a55fec3bfd44bca226b81.a66cb4a6906024aa9ec0fd879ed89a68";

  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          // Always runs one real scrypt comparison, real user or not --
          // comparePasswords does genuine, measurable work (that's the
          // whole point of scrypt), and short-circuiting on "no such
          // user" before ever calling it means a real account responds
          // measurably slower than a nonexistent one. That's a timing
          // side channel an attacker can use to enumerate which emails
          // have Forge accounts without the response ever saying so --
          // DUMMY_PASSWORD_HASH is just any validly-shaped hash.salt
          // string so the same code path and cost runs either way; its
          // own password is never used for anything.
          const hashToCheck = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
          const passwordOk = await comparePasswords(password, hashToCheck);
          if (!user || !passwordOk) {
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
      const { email, password, name, role, coachCode, phone, dateOfBirth, guardianEmail } = parsed.data;
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "Email already in use" });
      }

      // Tier 1 (under 13) athletes can't self-register at all -- see
      // shared/privacy-tiers.ts's own comment on why this specific gate
      // exists and what still needs legal review around it. A coach role
      // signup skips this: a coach account for a 12-year-old isn't a real
      // case this app needs to handle, so the DOB is collected and stored
      // either way but only athlete self-serve is actually gated on it.
      const tier = derivePrivacyTier(dateOfBirth);
      if (role === "athlete" && tier === "tier1_under13") {
        return res.status(403).json({
          message:
            "Athletes under 13 can't create their own account. Ask your coach or program to set one up for you.",
          code: "coach_provisioning_required",
        });
      }

      // A minor athlete's profile needs an active guardian account before
      // anything new can be assigned to them (see
      // storage.assertMinorHasActiveGuardian) -- collecting the email now,
      // required, is what makes that reachable at all instead of a
      // permanent dead end. In practice only tier2 reaches this: tier1 is
      // already rejected above.
      if (role === "athlete" && tier !== "tier3_adult_18plus" && !guardianEmail) {
        return res.status(400).json({
          message: "A parent or guardian's email is required for an athlete under 18.",
        });
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
        emailVerified: false,
        phone: phone || null,
        dateOfBirth,
        requiresGuardianNotice: role === "athlete" && tier === "tier2_teen_13_17",
        agreedToTermsAt: new Date(),
        agreedToTermsText,
      });
      await storage.logConsentRecord({
        userId: user.id,
        consentType: "terms_of_service",
        documentText: agreedToTermsText,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      });

      if (coach) {
        // claimRosterSeat (not a bare linkAthleteToCoach) closes the seat-
        // count TOCTOU race once billing is live -- see its own comment.
        // On the rare failure (roster genuinely full, or lost a race for
        // the last seat), fall back to treating this signup as coachless
        // rather than failing the whole signup after the account already
        // exists -- every check below already branches on `coach` being
        // set, so clearing it here is enough to get consistent Free-Agent
        // treatment (own trial subscription, no coach name in the welcome
        // email) without duplicating that logic here.
        const claimed = await storage.claimRosterSeat(coach.id, user.id);
        if (!claimed.ok) coach = null;
      }
      if (coach) {
        if (team) await storage.addAthleteToTeam(team.id, user.id);
        // Gated off for now -- see GUARDIAN_NOTICE_LIVE's own comment.
        // Flip that one constant when this is ready to actually reach a
        // coach's inbox; nothing else in this route needs to change.
        if (GUARDIAN_NOTICE_LIVE && user.requiresGuardianNotice) {
          await notifyUser(
            coach.id,
            "guardian_notice_needed",
            `${user.name} may need a guardian waiver on file`,
            `${user.name} signed up as a minor (under 18). We'd recommend getting a parent/guardian waiver or consent on file for them, outside of Forge -- you can mark it done from their profile once you have.`,
            `/coach/roster/${user.id}`,
          );
        }
      }

      // Framework only -- see billing.ts's own comment. Harmless to create
      // unconditionally: nothing reads this row for gating anything until
      // BILLING_LIVE is set, but a real trial needs the row to already
      // exist the moment that flag flips, not retrofitted onto every
      // account that signed up before it did. A coached athlete (role
      // "athlete" with a coach linked above) is never billed directly, so
      // gets no subscription row of their own.
      if (role === "coach" || (role === "athlete" && !coach)) {
        await storage.createTrialSubscription(user.id, role === "coach" ? "coach" : "free_agent");
      }

      req.login(user, async (err) => {
        if (err) return next(err);
        // Fire-and-forget: sendEmail never throws (see email.ts) and a slow
        // or failed welcome email is never a reason to hold up the response
        // an athlete or coach is waiting on right after signing up.
        sendEmail({
          to: user.email,
          subject: "Welcome to Forge",
          html: buildWelcomeEmail(user, coach?.name ?? null),
        });
        sendVerificationEmail(req, user);
        issueGuardianInviteIfNeeded(req, user, guardianEmail, tier);
        const { nativeToken } = await trackNewSession(req, user.id);
        res.status(201).json({ ...(await toPublicUserWithSections(user)), nativeToken });
      });
    } catch (err) {
      next(err);
    }
  });

  // Deliberately unauthenticated -- whoever has the physical claim code (a
  // coach handed it to them off a printed intake sheet) needs to see whose
  // slot this is before they've ever logged in. Never reveals which coach
  // imported them; the claim-signup step below links that automatically.
  app.get("/api/claim/:code", async (req, res) => {
    const provisional = await storage.getProvisionalAthleteByClaimCode(req.params.code);
    if (!provisional) return res.status(404).json({ message: "This claim link isn't valid." });
    const { name, sport, position } = provisional;
    // Never sends the actual date back on this unauthenticated preview --
    // just whether the claim-signup form still needs to ask for one. Same
    // reasoning for needsGuardianEmail: if the tier isn't known yet either
    // (dateOfBirth still missing), this defaults to true rather than
    // guessing -- an unnecessary field beats a confusing rejection on submit.
    const needsGuardianEmail = provisional.dateOfBirth
      ? derivePrivacyTier(provisional.dateOfBirth) !== "tier3_adult_18plus"
      : true;
    res.json({
      name,
      sport,
      position,
      needsDateOfBirth: !provisional.dateOfBirth,
      needsGuardianEmail,
    });
  });

  // Finishes a player-inflow-sheet import (see provisionalAthletes' schema
  // comment): turns a coach-created provisional slot into a real account.
  // Same shape as /api/auth/signup below minus the coachCode step -- the
  // coach link is already implied by which provisional row this claims.
  app.post("/api/claim/:code/signup", signupLimiter, async (req, res, next) => {
    try {
      const parsed = claimProvisionalAthleteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const agreedToTermsText = await storage.getLegalAgreement();
      const result = await storage.claimProvisionalAthlete(
        String(req.params.code),
        parsed.data,
        agreedToTermsText,
        { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined },
      );
      if ("error" in result) return res.status(400).json({ message: result.error });
      const { user, coachId, tier } = result;
      // Same gate as the direct-signup route above -- see
      // GUARDIAN_NOTICE_LIVE's own comment.
      if (GUARDIAN_NOTICE_LIVE && user.requiresGuardianNotice) {
        await notifyUser(
          coachId,
          "guardian_notice_needed",
          `${user.name} may need a guardian waiver on file`,
          `${user.name} signed up as a minor (under 18). We'd recommend getting a parent/guardian waiver or consent on file for them, outside of Forge -- you can mark it done from their profile once you have.`,
          `/coach/roster/${user.id}`,
        );
      }
      req.login(user, async (err) => {
        if (err) return next(err);
        sendEmail({
          to: user.email,
          subject: "Welcome to Forge",
          html: buildWelcomeEmail(user, null),
        });
        sendVerificationEmail(req, user);
        issueGuardianInviteIfNeeded(req, user, parsed.data.guardianEmail, tier);
        const { nativeToken } = await trackNewSession(req, user.id);
        res.status(201).json({ ...(await toPublicUserWithSections(user)), nativeToken });
      });
    } catch (err) {
      next(err);
    }
  });

  // Public/unauthenticated preview -- same reasoning as GET /api/claim/:code
  // above: whoever has the emailed link needs to see whose invite this is
  // before they've ever logged in.
  app.get("/api/guardian-invites/:token", async (req, res) => {
    const preview = await storage.getGuardianInvitePreview(String(req.params.token));
    if (!preview) return res.status(404).json({ message: "This invite link isn't valid or has expired." });
    res.json(preview);
  });

  // Claiming is what actually creates the guardian's account (see
  // storage.claimGuardianInvite) -- same shape as the two signup routes
  // above: create, log in, track the session, return the public user.
  app.post("/api/guardian-invites/:token/claim", signupLimiter, async (req, res, next) => {
    try {
      const parsed = claimGuardianInviteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const agreedToTermsText = await storage.getLegalAgreement();
      const result = await storage.claimGuardianInvite(
        String(req.params.token),
        parsed.data.password,
        agreedToTermsText,
        { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined },
      );
      if ("error" in result) return res.status(400).json({ message: result.error });
      const { user } = result;
      req.login(user, async (err) => {
        if (err) return next(err);
        const { nativeToken } = await trackNewSession(req, user.id);
        res.status(201).json({ ...(await toPublicUserWithSections(user)), nativeToken });
      });
    } catch (err) {
      next(err);
    }
  });

  // Shared tail for both a normal password-only login and the second step
  // of an MFA login (/api/auth/mfa/verify-login below) -- factored out so
  // the touchUserActivity/response shape stays identical for both instead
  // of drifting out of sync. See the inline comment at its original call
  // site for why the try/catch around the async work inside req.login's
  // callback matters (its callback isn't promise-aware, so an unhandled
  // rejection in here would otherwise never reach Express's error middleware).
  //
  // Shared by every place that establishes a real session (login, signup,
  // the claim-provisional-athlete signup, MFA-verified login) -- creates
  // the user_sessions row "see who's logged in" reads from, and either
  // signs a real native token against it (native) or stashes the row's id
  // on req.session for connect-pg-simple's own table to carry along (web).
  // Geolocation is deliberately never awaited here -- see resolveLocation's
  // own comment on why an external lookup must never sit in a login's
  // critical path. notifyIfNewDevice is only ever passed true from a real
  // login (completeLogin below) -- a brand-new signup's very first session
  // is never "a new device someone should be alerted about," it's just the
  // account being created.
  // Fire-and-forget, called from both signup routes right after
  // storage.createUser -- a slow/failed verification email is never a
  // reason to hold up the signup response, same reasoning as the welcome
  // email it's sent alongside. See request-password-reset's own comment
  // for why RENDER_EXTERNAL_URL takes priority over the request's own
  // Host header (Host-header link-poisoning).
  function sendVerificationEmail(req: any, user: { id: number; email: string }) {
    storage
      .createEmailVerificationToken(user.id)
      .then((token) => {
        const origin = process.env.RENDER_EXTERNAL_URL ?? `${req.protocol}://${req.get("host")}`;
        const verifyLink = `${origin}/verify-email?token=${token}`;
        return sendEmail({
          to: user.email,
          subject: "Confirm your Forge email",
          html: buildVerifyEmailEmail(verifyLink),
        });
      })
      .catch((err) => console.error("sendVerificationEmail failed:", err));
  }

  // Fire-and-forget, same reasoning as sendVerificationEmail above --
  // issuing the invite (and the email carrying it) is never a reason to
  // hold up the signup response. No-ops for an adult; guardianEmail is
  // already required (and validated) for a minor by the time this is
  // called, so an absent email here only ever happens for an adult.
  function issueGuardianInviteIfNeeded(
    req: any,
    athlete: { id: number; name: string },
    guardianEmail: string | undefined,
    tier: PrivacyTier,
  ) {
    if (tier === "tier3_adult_18plus" || !guardianEmail) return;
    storage
      .createGuardianInvite(athlete.id, guardianEmail)
      .then(async (invite) => {
        if (!("token" in invite)) return;
        const origin = process.env.RENDER_EXTERNAL_URL ?? `${req.protocol}://${req.get("host")}`;
        const claimLink = `${origin}/guardian/claim?token=${invite.token}`;
        const parentalNotice = await storage.getLegalDocument("parental_notice");
        return sendEmail({
          to: guardianEmail,
          subject: `You've been listed as ${athlete.name}'s guardian on Forge`,
          html: buildGuardianInviteEmail(athlete.name, claimLink, parentalNotice?.content ?? ""),
        });
      })
      .catch((err) => console.error("issueGuardianInviteIfNeeded failed:", err));
  }

  async function trackNewSession(
    req: any,
    userId: number,
    options: { notifyIfNewDevice?: boolean } = {},
  ): Promise<{ nativeToken?: string }> {
    const kind: SessionKind = isNativeAppRequest(req) ? "native" : "web";
    const ip = normalizeIp(req.ip);
    const { session: record, isNewDevice } = await storage.createSessionRecord(userId, kind, {
      userAgent: req.headers["user-agent"],
      ipAddress: ip,
    });
    // Fire-and-forget, chained after the (also fire-and-forget) location
    // lookup so the alert email -- if one goes out -- includes an actual
    // location rather than always saying "Unknown." Never awaited by this
    // function itself; the login response doesn't wait on any of this.
    resolveLocation(ip)
      .then(async (location) => {
        if (location) await storage.setSessionLocation(record.id, location).catch(() => {});
        if (options.notifyIfNewDevice && isNewDevice) {
          const user = await storage.getUser(userId);
          if (user) {
            await sendEmail({
              to: user.email,
              subject: "New login to your Forge account",
              html: buildNewDeviceLoginEmail({
                name: user.name,
                deviceLabel: record.deviceLabel ?? "Unknown device",
                location,
                when: record.createdAt,
              }),
            });
          }
        }
      })
      .catch((err) => console.error("trackNewSession follow-up failed:", err));
    if (kind === "native") {
      return { nativeToken: signNativeToken(userId, record.id) };
    }
    req.session.sessionRecordId = record.id;
    // Without this, revokeSession/revokeAllOtherSessions (storage.ts) have
    // no webSessionId to look up -- express-session's own row in the
    // "session" table never gets deleted, so "log out this device" marks
    // the user_sessions row revoked but the actual browser cookie session
    // keeps working. req.sessionID is stable here (never regenerated
    // anywhere in this codebase) and is already assigned by express-session
    // before any route handler runs, so it's safe to read synchronously.
    await storage.setSessionWebId(record.id, req.sessionID);
    return {};
  }

  function completeLogin(req: any, res: any, next: any, user: any) {
    req.login(user, async (err2: any) => {
      if (err2) return next(err2);
      try {
        await storage.touchUserActivity(user.id);
        const { nativeToken } = await trackNewSession(req, user.id, { notifyIfNewDevice: true });
        res.json({ ...(await toPublicUserWithSections(user)), nativeToken });
      } catch (err3) {
        next(err3);
      }
    });
  }

  app.post("/api/auth/login", loginLimiter, (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res
          .status(401)
          .json({ message: info?.message || "Invalid email or password" });
      }
      // Password alone isn't enough for an MFA-enabled account -- hand
      // back a short-lived token identifying who's mid-login instead of
      // establishing the real session yet; the client collects a code and
      // finishes at /api/auth/mfa/verify-login below.
      if (user.mfaEnabled) {
        return res.json({ mfaRequired: true, mfaToken: signMfaPendingToken(user.id) });
      }
      completeLogin(req, res, next, user);
    })(req, res, next);
  });

  app.post("/api/auth/mfa/verify-login", mfaCodeLimiter, async (req, res, next) => {
    const mfaToken = typeof req.body?.mfaToken === "string" ? req.body.mfaToken : "";
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const userId = verifyMfaPendingToken(mfaToken);
    if (userId === null) {
      return res.status(401).json({ message: "That login attempt expired. Please log in again." });
    }
    const ok = await storage.verifyMfaLogin(userId, code);
    if (!ok) {
      return res.status(401).json({ message: "Invalid code" });
    }
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ message: "Account not found" });
    completeLogin(req, res, next, user);
  });

  app.get("/api/auth/mfa/status", requireAuth, (req, res) => {
    res.json({ enabled: !!(req.user as any).mfaEnabled });
  });

  // Coach/admin only -- those are the accounts with broad visibility into
  // other people's data (a coach's whole roster, an admin's whole
  // platform), so a compromised one is the highest-value target; an
  // athlete only ever sees their own. Writes a fresh secret but doesn't
  // enable anything yet; /api/auth/mfa/confirm below is what actually
  // flips mfaEnabled once the user proves they scanned it successfully.
  app.post("/api/auth/mfa/setup", requireRole(["coach", "admin"]), async (req, res) => {
    const user = req.user as any;
    const { secret } = await storage.startMfaSetup(user.id);
    res.json({ secret, otpauthUri: totpOtpauthUri(user.email, secret) });
  });

  app.post("/api/auth/mfa/confirm", requireRole(["coach", "admin"]), mfaCodeLimiter, async (req, res) => {
    const user = req.user as any;
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const result = await storage.confirmMfaSetup(user.id, code);
    if (!result) {
      return res.status(400).json({ message: "Invalid code -- check your authenticator app and try again." });
    }
    res.json(result);
  });

  app.post("/api/auth/mfa/disable", requireRole(["coach", "admin"]), mfaCodeLimiter, async (req, res) => {
    const user = req.user as any;
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const ok = await storage.disableMfa(user.id, password);
    if (!ok) return res.status(400).json({ message: "Incorrect password" });
    res.json({ ok: true });
  });

  // Set by attachNativeTokenAuth (native) or trackNewSession (web, on
  // req.session) -- absent for a session that predates this feature (a
  // cookie/token minted before user_sessions existed), in which case
  // nothing gets marked "current" and revoke-others simply revokes
  // everything trackable, which is the right behavior for that edge case.
  function currentSessionRecordId(req: any): number | null {
    return (req as any).nativeSessionRecordId ?? (req.session as any)?.sessionRecordId ?? null;
  }

  app.get("/api/auth/sessions", requireAuth, async (req, res) => {
    const user = req.user as any;
    const sessions = await storage.listUserSessions(user.id);
    const currentId = currentSessionRecordId(req);
    res.json(
      sessions.map(({ webSessionId: _webSessionId, ...s }) => ({ ...s, isCurrent: s.id === currentId })),
    );
  });

  app.post("/api/auth/sessions/:id/revoke", requireAuth, async (req, res) => {
    const user = req.user as any;
    const sessionRecordId = Number(req.params.id);
    if (!Number.isInteger(sessionRecordId)) return res.status(400).json({ message: "Invalid session id" });
    const result = await storage.revokeSession(user.id, sessionRecordId);
    if (!result) return res.status(404).json({ message: "Session not found" });
    if (result.webSessionId) {
      await pool.query('DELETE FROM "session" WHERE sid = $1', [result.webSessionId]);
    }
    res.json({ ok: true });
  });

  app.post("/api/auth/sessions/revoke-others", requireAuth, async (req, res) => {
    const user = req.user as any;
    const currentId = currentSessionRecordId(req);
    const result = await storage.revokeAllOtherSessions(user.id, currentId);
    if (result.webSessionIds.length > 0) {
      await pool.query('DELETE FROM "session" WHERE sid = ANY($1)', [result.webSessionIds]);
    }
    res.json({ ok: true, revokedCount: result.revokedCount });
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

  // Self-service, permanent account deletion -- any role. See
  // storage.deleteOwnAccount's own comment for exactly what this does and
  // doesn't clean up. Logs the session out the same way /api/auth/logout
  // does once the account itself is gone, since there's nothing left to
  // stay authenticated as.
  app.post("/api/account/delete", requireAuth, async (req, res, next) => {
    const user = req.user as { id: number };
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!password) return res.status(400).json({ message: "Password is required." });
    const result = await storage.deleteOwnAccount(user.id, password);
    if ("error" in result) return res.status(400).json({ message: result.error });
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
      // Log out everywhere -- if someone reset this password because an
      // attacker had it, leaving the attacker's existing session/native
      // token alive would defeat the whole point. Awaited (unlike the
      // confirmation email below): a security side effect, not a courtesy
      // notification, so the response shouldn't say "done" before it's
      // actually happened. revokeAllOtherSessions(userId, null) revokes
      // everything -- null never matches a real session id, so nothing is
      // excluded (there's no "current session" here; this request isn't
      // authenticated as anyone).
      const revoked = await storage.revokeAllOtherSessions(record.userId, null);
      if (revoked.webSessionIds.length > 0) {
        await pool.query('DELETE FROM "session" WHERE sid = ANY($1)', [revoked.webSessionIds]);
      }
      const user = await storage.getUser(record.userId);
      if (user) {
        sendEmail({
          to: user.email,
          subject: "Your Forge password was changed",
          html: buildPasswordChangedEmail(user.name),
        });
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // Self-service change while already logged in -- see
  // storage.changeOwnPassword's own comment. Revokes every OTHER session
  // (not this one -- the caller is actively using it right now) the same
  // way "log out of other devices" does, and sends the same "your
  // password was changed" confirmation email the reset flow does.
  app.post("/api/account/change-password", requireAuth, changePasswordLimiter, async (req, res, next) => {
    try {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const user = req.user as any;
      const result = await storage.changeOwnPassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
      if ("error" in result) return res.status(400).json({ message: result.error });
      const currentId = currentSessionRecordId(req);
      const revoked = await storage.revokeAllOtherSessions(user.id, currentId);
      if (revoked.webSessionIds.length > 0) {
        await pool.query('DELETE FROM "session" WHERE sid = ANY($1)', [revoked.webSessionIds]);
      }
      sendEmail({
        to: user.email,
        subject: "Your Forge password was changed",
        html: buildPasswordChangedEmail(user.name),
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // One-time fill for an account old enough to predate dateOfBirth as a
  // signup field at all -- see backfillDateOfBirthSchema's own comment.
  // requireAuth rather than requireRole("athlete") since a pre-dateOfBirth
  // coach account is just as real a case; the compliance-relevant
  // population (privacy tiers) is athlete-only, but there's no reason to
  // block a coach from fixing the same gap on their own profile.
  app.post("/api/account/backfill-date-of-birth", requireAuth, async (req, res, next) => {
    try {
      const parsed = backfillDateOfBirthSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const user = req.user as any;
      const result = await storage.backfillDateOfBirth(user.id, parsed.data.dateOfBirth);
      if ("error" in result) return res.status(400).json({ message: result.error });
      res.json(await toPublicUserWithSections(await storage.getUser(user.id)));
    } catch (err) {
      next(err);
    }
  });

  // Deliberately unauthenticated -- the link a user clicks from their inbox
  // may well be opened in a different browser/session than the one they
  // signed up in (a phone's default mail app, say). client/src/pages/
  // verify-email.tsx reads ?token= from the URL and POSTs it here.
  app.post("/api/auth/verify-email", async (req, res, next) => {
    try {
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      const record = await storage.getValidEmailVerificationToken(token);
      if (!record) {
        return res.status(400).json({ message: "This verification link is invalid or has expired." });
      }
      await storage.consumeEmailVerificationToken(record.id, record.userId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/resend-verification", requireAuth, resendVerificationLimiter, async (req, res) => {
    const user = req.user as any;
    if (user.emailVerified) return res.json({ ok: true });
    sendVerificationEmail(req, user);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(await toPublicUserWithSections(req.user));
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
      // claimRosterSeat (not a bare linkAthleteToCoach) closes the seat-
      // count TOCTOU race once billing is live -- see its own comment.
      const claimed = await storage.claimRosterSeat(coach.id, user.id);
      if (!claimed.ok) {
        return res.status(422).json({ message: claimed.error });
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

type Role = "coach" | "athlete" | "admin" | "guardian";

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
