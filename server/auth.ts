import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { z } from "zod";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";
import { bandForAthleteCount } from "@shared/billing-tiers";
import { hashPassword, comparePasswords } from "./auth-utils";
import { pool } from "./db";
import { sendEmail, isEmailConfigured } from "./email";
import { buildWelcomeEmail } from "./welcome-email";
import { buildPasswordResetEmail } from "./password-reset-email";
import { buildNewDeviceLoginEmail } from "./new-device-login-email";
import { buildDeviceApprovalEmail } from "./device-approval-email";
import {
  approvalState,
  consumeApproval,
  createDeviceApproval,
  decideApproval,
  findApprovalByActionToken,
  findApprovalByPollToken,
  findTrustedDevice,
  forgetAllDevices,
  forgetDevice,
  forgetDeviceById,
  hashDeviceId,
  isDeviceVerificationDisabled,
  isDeviceVerificationExempt,
  listTrustedDevices,
  normalizeDeviceId,
  setApprovalLocation,
  touchTrustedDevice,
  trustDevice,
} from "./trusted-devices";
import { buildPasswordChangedEmail } from "./password-changed-email";
import { buildVerifyEmailEmail } from "./verify-email-email";
import { buildGuardianInviteEmail } from "./guardian-invite-email";
import { buildGuardianConsentConfirmationEmail } from "./guardian-consent-confirmation-email";
import { reportJobFailure } from "./job-errors";
import { apiLimiter } from "./rate-limiters";
import { totpOtpauthUri } from "./mfa";
import { formatDeviceLabel, isNativeAppRequest, normalizeIp, resolveLocation, shouldTouchLastSeen, type SessionKind } from "./session-tracking";
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

// A hardcoded fallback secret in a public repo is the same as no secret at
// all: anyone can forge a session cookie or a native bearer token. The
// fallback still exists so `npm run dev` works with an empty .env, but it
// is refused outright in production -- a missing or renamed env var should
// fail the boot loudly, not quietly downgrade every signature in the app
// to a publicly known constant.
// express-session writes the session row back on essentially every request
// once `rolling: true` is on: even when nothing in the session changed,
// the cookie's expiry moved, so connect-pg-simple's `touch` fires an
// UPDATE. With the API limiter allowing 600 requests per 15 minutes per
// user, that is hundreds of Postgres writes per user per hour that exist
// only to push an expiry 30 days out that is already 30 days out.
//
// The 30-days-of-inactivity behaviour is worth keeping, so instead of
// dropping `rolling`, this store collapses the touches: it remembers the
// expiry it last persisted for a session and skips the UPDATE until the
// new expiry has moved by more than TOUCH_THROTTLE_MS. The stored expiry
// therefore trails real activity by at most that window -- five minutes
// against a thirty-day window -- while the write rate drops from
// per-request to at most one per session per five minutes.
const TOUCH_THROTTLE_MS = 5 * 60 * 1000;
// Bounds the bookkeeping map so a long-lived process that has seen a very
// large number of sessions can't grow it without limit. Dropping entries
// only costs an extra (correct) touch the next time those sessions are
// seen, so a blunt clear is safe.
const MAX_TRACKED_SESSIONS = 20000;

function expiryOf(sess: session.SessionData): number | null {
  const expires = sess?.cookie?.expires;
  if (!expires) return null;
  const ms = new Date(expires).getTime();
  return Number.isFinite(ms) ? ms : null;
}

class ThrottledPgStore extends PgStore {
  // sid -> the cookie expiry currently believed to be in Postgres.
  private persistedExpiry = new Map<string, number>();

  private remember(sid: string, expiry: number | null) {
    if (expiry === null) return;
    if (this.persistedExpiry.size >= MAX_TRACKED_SESSIONS) this.persistedExpiry.clear();
    this.persistedExpiry.set(sid, expiry);
  }

  get(sid: string, cb: (err: any, session?: session.SessionData | null) => void) {
    super.get(sid, (err: any, sess: session.SessionData | null | undefined) => {
      if (!err && sess) this.remember(sid, expiryOf(sess));
      cb(err, sess);
    });
  }

  set(sid: string, sess: session.SessionData, cb?: (err?: any) => void) {
    super.set(sid, sess, (err?: any) => {
      // A real write already moved the expiry; that becomes the new baseline.
      if (!err) this.remember(sid, expiryOf(sess));
      cb?.(err);
    });
  }

  touch(sid: string, sess: session.SessionData, cb?: (err?: any) => void) {
    const next = expiryOf(sess);
    const persisted = this.persistedExpiry.get(sid);
    if (next !== null && persisted !== undefined && next - persisted < TOUCH_THROTTLE_MS) {
      // Expiry has barely moved since the last write -- skip the UPDATE.
      cb?.();
      return;
    }
    super.touch(sid, sess, (err?: any) => {
      if (!err) this.remember(sid, next);
      cb?.(err);
    });
  }

  destroy(sid: string, cb?: (err?: any) => void) {
    this.persistedExpiry.delete(sid);
    super.destroy(sid, cb);
  }
}

const DEV_SECRET_FALLBACK = "forge-dev-secret";

function requireSecret(name: string): string {
  const value = process.env[name];
  if (value && value.trim().length > 0) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${name} is not set. Refusing to start in production: without it, session ` +
        `cookies and native app tokens would be signed with a public constant and ` +
        `could be forged by anyone. Set ${name} to a long random value.`,
    );
  }
  console.warn(
    `[auth] ${name} is not set -- falling back to the shared development secret. ` +
      `This is fine locally and fatal in production.`,
  );
  return DEV_SECRET_FALLBACK;
}

const SESSION_SECRET = requireSecret("SESSION_SECRET");


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
// The new-device approval endpoints. Status polling is one request every
// few seconds from a device that is waiting, so it gets room; the ones that
// decide or claim get the same budget as a code entry, because a token is
// a thing that can be guessed at.
const deviceApprovalPollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly." },
});
// Completing a reset with a token. Its own budget, deliberately separate from
// passwordResetLimiter's 8/hour: that one is shared with REQUESTING a reset, so
// putting completion under it could lock a legitimate user out of finishing a
// reset after a few request attempts. The token is 32 random bytes hashed at
// rest with a one-hour expiry, so this is consistency with the other
// token-bearing routes, not a defence that was missing.
const passwordResetCompleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again shortly." },
});

const deviceApprovalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again shortly." },
});

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

export function toPublicUser(user: any): PublicUser {
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
// to trigger a real /api/auth/me refetch. staffTitle/isPrimaryCoach/
// hiddenSections are all storage-backed, not users columns, so they're
// attached here rather than by toPublicUser itself (which has no async
// access to storage). isPrimaryCoach gates org-wide identity edits
// (branding, nav customization) to the one account whose call it should
// actually be, not any staff member sharing the roster -- see the
// requirePrimaryCoach guard in routes.ts.
async function toPublicUserWithSections(user: any): Promise<PublicUser> {
  const publicUser = toPublicUser(user);
  if (user.role === "athlete") {
    // What the client needs to render the blocked screen instead of an app
    // full of controls that all answer 403 -- see the guardian gate in
    // routes.ts, which is the thing actually enforcing this. This flag is a
    // convenience for the UI and is never the enforcement.
    // Whether to ask this athlete for the biometric release. True only where it would actually
    // change anything: an adult (a minor's comes from their guardian) who has not agreed. The
    // capture gate in submitWorkoutLog is the enforcement; this is what lets the client ask
    // rather than silently dropping what they film.
    publicUser.biometricReleaseRequired =
      user.dateOfBirth != null &&
      derivePrivacyTier(user.dateOfBirth) === "tier3_adult_18plus" &&
      !(await storage.hasBiometricConsent(user.id));
    // Whether to show this athlete the risk terms themselves. EVERY athlete, not only adults --
    // that is the whole point. For a minor the guardian's agreement is the legal instrument and
    // this changes nothing about it; what it changes is that the person actually lifting has
    // seen what they are being asked to accept, which a guardian ticking a box on another
    // screen does not accomplish.
    publicUser.assumptionOfRiskRequired = !(await storage.hasAcknowledgedAssumptionOfRisk(user.id));
    const gate = await storage.athleteGateStatus(user.id);
    publicUser.guardianLinkRequired = gate === "needs_guardian";
    publicUser.dateOfBirthRequired = gate === "needs_date_of_birth";
  }
  // Not gated on role, deliberately. Guardianship is a relationship, so any
  // account can hold links -- a parent training as a Free Agent, a coach who
  // is a parent of someone on another roster. This tells the client whether
  // to offer the guardian view; requireGuardianAccess is the enforcement.
  (publicUser as any).hasGuardianLinks =
    (await storage.getAthletesForGuardian(user.id)).length > 0;
  // Whether this account is still on the terms it accepted. One text comparison against the
  // live agreement -- cheap enough to ride along on every /api/auth/me rather than making the
  // client ask a second endpoint before it can decide whether to show anything. The full
  // status (and the text to render) is GET /api/auth/terms-status.
  publicUser.needsTermsAcceptance = (await storage.getTermsAcceptanceStatus(user.id))
    .needsAcceptance;
  if (user.role === "coach") {
    (publicUser as any).hiddenSections = await storage.getHiddenSectionsForCoach(user.id);
    publicUser.staffTitle = await storage.getStaffTitleForCoach(user.id);
    const coachIds = await storage.getEffectiveCoachIds(user.id);
    publicUser.isPrimaryCoach = coachIds[0] === user.id;
    // Lazy backfill for any coach account created before staffInviteCode
    // existed (see that column's own comment in schema.ts) -- fresh
    // signups already get one via storage.createUser.
    publicUser.staffInviteCode =
      user.staffInviteCode ?? (await storage.getOrCreateStaffInviteCode(user.id));
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
const NATIVE_TOKEN_SECRET = SESSION_SECRET;
const NATIVE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // matches the cookie session's own maxAge

let warnedNoEmailForDeviceGate = false;

// "s\u2022\u2022\u2022@live.com" -- enough for the person to know which inbox to open
// without the login screen echoing the whole address back to whoever typed
// a password into it.
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "your email";
  return `${email[0]}\u2022\u2022\u2022${email.slice(at)}`;
}

function approvalNonce(): string {
  return crypto.randomBytes(8).toString("hex");
}

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
      store: new ThrottledPgStore({ pool, tableName: "session", createTableIfMissing: true }),
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      // Without this, the 30-day window is fixed from the moment you log
      // in -- someone using the app daily still gets logged out 30 days
      // later. rolling re-issues the cookie's expiry on every request, so
      // it's 30 days of *inactivity*, not 30 days since login, which is
      // what "don't make me log in again" actually means in practice.
      rolling: true,
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
  // Same "before every route below, including the ones in this very
  // function" reasoning as apiLimiter just above -- this used to be mounted
  // in routes.ts, after registerRoutes calls setupAuth(app), which meant
  // every requireAuth/requireRole route registered INSIDE setupAuth (signup,
  // login, MFA setup/disable, session list/revoke, account delete/password-
  // change, backfill-date-of-birth, resend-verification, join-coach, and
  // /api/auth/me itself) never got a chance to see this fallback: their
  // requireAuth check ran before this middleware ever populated req.user
  // from a native bearer token, so every one of them 401'd on iOS native
  // with a perfectly valid, still-logged-in session. Most of the app never
  // surfaced this because the native client seeds its user data from the
  // login response body directly rather than re-fetching /api/auth/me (see
  // attachNativeTokenAuth's own comment) -- but any route in that list that
  // actually gets called mid-session hit it, silently.
  app.use(attachNativeTokenAuth);

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
      const {
        email,
        password,
        name,
        role,
        coachCode,
        dateOfBirth,
        guardianEmail,
        sport,
        position,
        heightIn,
        bodyWeightLbs,
        researchDataConsent,
        agreedToBiometricRelease,
        agreedToAssumptionOfRisk,
        expectedAthletes,
        staffInviteCode,
      } = parsed.data;
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "Email already in use" });
      }

      // Only an athlete needs these (a coach doesn't play the sport they
      // coach) -- same "required by the route, not the schema" posture as
      // guardianEmail below, since the schema alone can't see role.
      if (role === "athlete" && (!sport || !position)) {
        return res.status(400).json({ message: "Sport and position are required." });
      }

      // Same "required by the route, not the schema" posture as the athlete fields below: only
      // a coach signup picks a plan, and the schema alone cannot see role. This is what makes
      // the plan self-serve -- the number the school types here picks the band (see
      // bandForAthleteCount), so nobody waits on an admin to be assigned a tier.
      //
      // A coach who arrives any other way is NOT put through this: a staff coach joining an
      // existing org (POST /api/auth/join-staff) does not pick a plan, because the plan is the
      // primary coach's and lives on the primary's row.
      //
      // That other way is a staff invite code in the signup body: the assistant is joining a
      // program that already has a plan, so asking them for a headcount would either be
      // ignored or, worse, quote them a second bill. The code is checked BEFORE the account
      // is created so a typo is a 400 rather than an orphaned coach account.
      const staffPrimary =
        role === "coach" && staffInviteCode
          ? await storage.getUserByStaffInviteCode(staffInviteCode)
          : null;
      if (role === "coach" && staffInviteCode && (!staffPrimary || staffPrimary.role !== "coach")) {
        return res.status(400).json({
          message: "That staff invite code doesn't match any program. Ask your head coach for it.",
        });
      }
      const joiningStaff = staffPrimary !== null;
      if (role === "coach" && !joiningStaff && expectedAthletes === undefined) {
        return res.status(400).json({ message: "Tell us roughly how many athletes you'll have" });
      }

      // Same "required by the route, not the schema" posture as sport/position above -- height
      // is what camera calibration hard-requires (see pose-tracking.ts's calibrateFromFrames),
      // and an account with none on file silently produces no tracked numbers from any mode.
      if (role === "athlete" && (!heightIn || !bodyWeightLbs)) {
        return res.status(400).json({ message: "Height and weight are required." });
      }

      // Under-13 athletes CAN sign themselves up, and are held to exactly
      // the same rule every other minor is: a guardian email is required
      // below, the account is locked (see the minor gate in routes.ts) until
      // that guardian claims their own linked account, and the guardian's
      // claim is what gets logged as the consent behind a Tier 1 account
      // (guardian_coppa_consent, see storage.claimGuardianInvite). This
      // route used to refuse them outright and send them to a coach, which
      // left a 12-year-old with no coach no way in at all. The two
      // Tier-1-specific cautions the coach-provisioned path already applies
      // are applied here too: camera-tracking collection defaults OFF until
      // a guardian turns it on, and research consent is never self-given.
      // See shared/privacy-tiers.ts on what still needs legal review.
      const tier = derivePrivacyTier(dateOfBirth);

      // A minor athlete's profile needs an active guardian account before
      // anything new can be assigned to them (see
      // storage.assertMinorHasActiveGuardian) -- collecting the email now,
      // required, is what makes that reachable at all instead of a
      // permanent dead end. EVERY minor reaches this, tier1 included -- the
      // comment here used to say tier1 was "already rejected above", which
      // was true of the route that sent under-13s to find a coach and has
      // been false since it stopped (see the note eleven lines up). A stale
      // comment about who is rejected at signup is the kind that gets read
      // as the rule.
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
        dateOfBirth,
        sport: role === "athlete" ? sport : null,
        position: role === "athlete" ? position : null,
        heightIn: role === "athlete" ? heightIn : null,
        bodyWeightLbs: role === "athlete" ? bodyWeightLbs : null,
        // Snapshotted once, here, at creation -- see users.signupSport's
        // own comment for why this never gets touched again even if the
        // athlete's `sport` profile field changes later.
        signupSport: role === "athlete" ? sport : null,
        // What the school said they expect (never an athlete's -- the field is meaningless on
        // an athlete row), and the band that number falls into. isBetaAccount is deliberately
        // NOT touched: it defaults true and is the one switch that makes any of this actually
        // restrict an account, flipped by an admin and nothing else. Setting a tier here is a
        // price quote, not enforcement.
        // A staff coach's own row never carries a plan: everything billing reads resolves
        // off the primary's row, and a tier here would be a second quote nobody asked for.
        plannedAthleteCount: role === "coach" && !joiningStaff ? expectedAthletes ?? null : null,
        billingTier: role === "coach" && !joiningStaff && expectedAthletes !== undefined
          ? bandForAthleteCount(expectedAthletes).id
          : null,
        // Every minor, not just 13-17: an under-13 athlete needs the
        // coach-facing "get a guardian waiver on file" nudge at least as
        // much as a 15-year-old does.
        requiresGuardianNotice: role === "athlete" && tier !== "tier3_adult_18plus",
        // Same caution as the coach-provisioned Tier 1 path (see
        // storage.claimProvisionalAthlete): nobody with authority to say yes
        // has said yes to camera capture yet, so it starts off and the
        // guardian turns it on once they have claimed their account.
        // Off for an under-13 because nobody with authority has said yes yet, and off for an ADULT
        // who did not agree to the biometric release -- camera tracking is the thing that derives
        // skeletal coordinates, and deriving them from somebody who has not agreed is the
        // collection biometric-privacy statutes are about. Declining is a real option here rather
        // than a dead end: the rest of the app works, and agreeing later turns tracking on.
        trackingOptOut:
          role === "athlete" &&
          (tier === "tier1_under13" ||
            (tier === "tier3_adult_18plus" && agreedToBiometricRelease !== true)),
        agreedToTermsAt: new Date(),
        agreedToTermsText,
      });
      // The code was validated above, and a brand-new account has no staff of its own, so
      // the only way this returns null is the primary rotating their code in the same
      // second. Surface it rather than leave a coach who thinks they joined on their own.
      if (joiningStaff && staffInviteCode) {
        const joined = await storage.joinCoachStaffByCode(user.id, staffInviteCode);
        if (!joined) {
          return res.status(400).json({
            message: "That staff invite code stopped working. Ask your head coach for a fresh one.",
          });
        }
      }
      await storage.logConsentRecord({
        userId: user.id,
        consentType: "terms_of_service",
        documentText: agreedToTermsText,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      });

      // Research consent, only if they actually ticked it AND they are old
      // enough to answer for themselves. The client hides the box for a
      // minor, but the check belongs here: a hidden field is a client
      // convenience, not a rule, and a minor ticking it in a crafted request
      // would otherwise be recorded as valid consent. For a minor the
      // question goes to a guardian instead, through the coach-relayed flow.
      if (researchDataConsent === true && tier === "tier3_adult_18plus") {
        await storage.setResearchDataConsent({
          athleteId: user.id,
          granted: true,
          grantedByUserId: user.id,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") ?? undefined,
        });
      }

      // The biometric release, on the same terms as research consent above and for the same
      // reasons: only when actually ticked, and only for an athlete old enough to answer for
      // themselves. A coach is not the one being filmed. For a minor the question goes to their
      // guardian at claim time, and a minor ticking it in a crafted request is ignored here.
      //
      // The document text is snapshotted the way every other consent record's is -- a record
      // naming a document by type alone is worthless once an admin edits the document.
      if (
        agreedToBiometricRelease === true &&
        role === "athlete" &&
        tier === "tier3_adult_18plus"
      ) {
        const release = await storage.getLegalDocument("biometric_waiver");
        await storage.logConsentRecord({
          userId: user.id,
          consentType: "biometric_waiver",
          documentText: release?.content ?? agreedToTermsText,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") ?? undefined,
        });
      }

      // The assumption-of-risk release, same shape and same reasoning as the biometric release
      // above -- only when actually ticked, only for an adult athlete answering for themselves.
      // It is recorded SEPARATELY from the terms rather than folded into them, because it is the
      // one document that asks somebody to give up a right, and a waiver buried inside a general
      // terms box is the pattern the last several commits took the biometric consent out of.
      //
      // Skipped silently when the document does not exist rather than substituting the terms
      // text: a release is either what the person read or it is not evidence of anything.
      if (
        agreedToAssumptionOfRisk === true &&
        role === "athlete" &&
        tier === "tier3_adult_18plus"
      ) {
        const risk = await storage.getLegalDocument("assumption_of_risk");
        if (risk?.content) {
          await storage.logConsentRecord({
            userId: user.id,
            consentType: "assumption_of_risk",
            documentText: risk.content,
            ipAddress: req.ip,
            userAgent: req.get("user-agent") ?? undefined,
          });
        }
      }

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

      loginWithFreshSession(req, user, async (err: any) => {
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
        // try/catch for the same reason completeLogin has one: req.login's callback is not
        // promise-aware, so a rejection in here reaches no error middleware at all. There is
        // also no global unhandledRejection handler in this process (see rest-timer-push.ts's
        // own note) and Node's default is to throw on an unhandled one -- so a brief database
        // problem in either call below did not return an error to the person signing up, it took
        // the whole server down along with every other request in flight. The account is already
        // committed by this point, which is why this reports the failure rather than undoing it.
        try {
          const { nativeToken } = await trackNewSession(req, user.id);
          // The device an account is created on is its first trusted device:
          // the person just typed the email in, and an approval mail to an
          // address that may not even be verified yet would gate the first
          // minute of the product on the inbox.
          const createdOn = requestDeviceId(req);
          if (createdOn) await trustDevice(user.id, createdOn, deviceMeta(req));
          res.status(201).json({ ...(await toPublicUserWithSections(user)), nativeToken });
        } catch (sessionErr) {
          next(sessionErr);
        }
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
      needsSport: !provisional.sport,
      needsPosition: !provisional.position,
      needsHeight: !provisional.heightIn,
      needsWeight: !provisional.bodyWeightLbs,
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
      loginWithFreshSession(req, user, async (err: any) => {
        if (err) return next(err);
        sendEmail({
          to: user.email,
          subject: "Welcome to Forge",
          html: buildWelcomeEmail(user, null),
        });
        sendVerificationEmail(req, user);
        issueGuardianInviteIfNeeded(req, user, parsed.data.guardianEmail, tier);
        // Same try/catch as the signup route above, for the same reason -- an unhandled
        // rejection in a req.login callback crashes the process rather than erroring the request.
        try {
          const { nativeToken } = await trackNewSession(req, user.id);
          // The device an account is created on is its first trusted device:
          // the person just typed the email in, and an approval mail to an
          // address that may not even be verified yet would gate the first
          // minute of the product on the inbox.
          const createdOn = requestDeviceId(req);
          if (createdOn) await trustDevice(user.id, createdOn, deviceMeta(req));
          res.status(201).json({ ...(await toPublicUserWithSections(user)), nativeToken });
        } catch (sessionErr) {
          next(sessionErr);
        }
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
      // The "plus" in email-plus: a second, separate message to the same address, after the
      // consent rather than before it. A child who got hold of the first email has to still hold
      // the parent's inbox now, and a parent who did not consent finds out that somebody did it
      // in their name. Fire-and-forget for the same reason every other send here is -- a slow
      // mail provider must not hold up the response that unlocks a child's account -- but a
      // failure is logged loudly, because an unsent confirmation is a missing half of the
      // verification rather than a missing nicety.
      sendGuardianConsentConfirmation(req, user, result.athleteId);
      loginWithFreshSession(req, user, async (err: any) => {
        if (err) return next(err);
        // Same try/catch as the two signup routes above, for the same reason -- an unhandled
        // rejection in a req.login callback crashes the process rather than erroring the request.
        try {
          const { nativeToken } = await trackNewSession(req, user.id);
          // The device an account is created on is its first trusted device:
          // the person just typed the email in, and an approval mail to an
          // address that may not even be verified yet would gate the first
          // minute of the product on the inbox.
          const createdOn = requestDeviceId(req);
          if (createdOn) await trustDevice(user.id, createdOn, deviceMeta(req));
          res.status(201).json({ ...(await toPublicUserWithSections(user)), nativeToken });
        } catch (sessionErr) {
          next(sessionErr);
        }
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
  function sendGuardianConsentConfirmation(
    req: any,
    guardian: { id: number; email: string },
    athleteId: number,
  ) {
    const origin = process.env.RENDER_EXTERNAL_URL ?? `${req.protocol}://${req.get("host")}`;
    storage
      .getUser(athleteId)
      .then((athlete) => {
        const athleteName = athlete?.name ?? "your athlete";
        return sendEmail({
          to: guardian.email,
          subject: `You approved ${athleteName}'s Forge account`,
          html: buildGuardianConsentConfirmationEmail(
            athleteName,
            guardian.email,
            new Date(),
            `${origin}/guardian`,
          ),
        });
      })
      .catch((err) =>
        console.error("guardian consent confirmation (email-plus) failed to send:", err),
      );
  }

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
  // A minor blocked by the guardian gate (see routes.ts) needs some way to
  // nudge the parent whose inbox the invite is sitting in, otherwise the
  // block is a dead end and the account is abandoned. The athlete cannot
  // choose the address: it is re-sent to whatever the invite already went
  // to, so this is a nudge, not a way to nominate a friend as your guardian.
  app.post(
    "/api/account/guardian-invite/resend",
    requireAuth,
    resendVerificationLimiter,
    async (req, res) => {
      const user = req.user as any;
      if (user.role !== "athlete") {
        return res.status(403).json({ message: "Only an athlete can resend a guardian invite." });
      }
      const existingLink = await storage.getGuardianLinkForAthlete(user.id);
      if (existingLink) {
        return res.status(400).json({ message: "A guardian is already linked to this account." });
      }
      const email = await storage.getLastGuardianInviteEmail(user.id);
      if (!email) {
        return res.status(400).json({
          message: "We don't have a guardian's email on file for this account. Contact us and we'll sort it out.",
        });
      }
      const fullUser = await storage.getUser(user.id);
      if (!fullUser?.dateOfBirth) {
        return res.status(400).json({ message: "Add your date of birth first." });
      }
      issueGuardianInviteIfNeeded(req, fullUser, email, derivePrivacyTier(fullUser.dateOfBirth));
      // Deliberately not echoing the address back -- the athlete already
      // knows who their parent is, and this response is reachable by anyone
      // who gets into the account.
      res.json({ ok: true });
    },
  );

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
        const result = await sendEmail({
          to: guardianEmail,
          subject: `You've been listed as ${athlete.name}'s guardian on Forge`,
          html: buildGuardianInviteEmail(athlete.name, claimLink, parentalNotice?.content ?? ""),
        });
        // sendEmail reports a refusal by returning, not by throwing, so the
        // .catch below never saw one -- an unconfigured key, a provider
        // rejection, or the sandbox from-address (which 403s every
        // recipient but the account owner) all landed here as an ordinary
        // resolved promise. Recording the outcome is what lets an admin
        // tell an undelivered invite apart from an ignored one, which is
        // the difference between fixing an address and chasing a parent.
        // The athlete is locked out of the app either way until it lands.
        await storage.recordGuardianInviteDelivery(
          invite.inviteId,
          result.sent ? { sent: true } : { sent: false, error: result.error ?? "unknown" },
        );
        if (!result.sent) {
          reportJobFailure("guardian-invite-email", new Error(`Guardian invite email failed: ${result.error ?? "unknown"}`), {
            athleteId: athlete.id,
            inviteId: invite.inviteId,
          });
        }
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

  // Every path that establishes a session goes through here rather than
  // calling req.login directly. Regenerating first gives the authenticated
  // user a session id the pre-login request never saw, which is the whole
  // defence against session fixation: without it, an id an attacker planted
  // in the victim's browser before they logged in stays valid afterward,
  // now carrying their identity. Passport does not do this for you.
  //
  // Order matters twice over. The regenerate has to happen BEFORE req.login
  // (which writes the user into whatever session is current), and
  // trackNewSession reads req.sessionID afterward to record the row that
  // makes "log out this device" work -- so the id it stores is the fresh
  // one, not the discarded one. Nothing else is ever kept in the session
  // (sessionRecordId is written later, by trackNewSession itself), so there
  // is no pre-login state to carry across.
  function loginWithFreshSession(req: any, user: any, done: (err: any) => void) {
    req.session.regenerate((regenErr: any) => {
      if (regenErr) return done(regenErr);
      req.login(user, done);
    });
  }

  // The device id the client keeps for itself -- sent as a header on every
  // request (see authHeaders in client/src/lib/queryClient.ts) and, for the
  // login body, also accepted there. See server/trusted-devices.ts for what
  // it is and is not.
  function requestDeviceId(req: any): string | null {
    return normalizeDeviceId(req.headers["x-forge-device-id"]) ?? normalizeDeviceId(req.body?.deviceId);
  }

  function deviceMeta(req: any): { deviceLabel: string; ipAddress: string | undefined } {
    const kind: SessionKind = isNativeAppRequest(req) ? "native" : "web";
    return { deviceLabel: formatDeviceLabel(req.headers["user-agent"], kind), ipAddress: normalizeIp(req.ip) };
  }

  function publicOrigin(req: any): string {
    return process.env.RENDER_EXTERNAL_URL ?? `${req.protocol}://${req.get("host")}`;
  }

  async function sendDeviceApprovalEmail(
    req: any,
    user: { email: string; name: string },
    approval: { id: number; deviceLabel: string | null; location: string | null; createdAt: Date },
    actionToken: string,
  ): Promise<boolean> {
    const reviewLink = `${publicOrigin(req)}/device-approval?token=${actionToken}`;
    const { sent } = await sendEmail({
      to: user.email,
      subject: "Was this you? New device signing in to Forge",
      html: buildDeviceApprovalEmail({
        name: user.name,
        deviceLabel: approval.deviceLabel ?? "Unknown device",
        location: approval.location,
        when: approval.createdAt,
        reviewLink,
      }),
    });
    return sent;
  }

  type DeviceGate =
    | { kind: "trusted" }
    | { kind: "approval"; pollToken: string }
    | { kind: "unavailable" };

  // Password was right. Is this a device we know? See trusted-devices.ts for
  // the rule; this is where it is applied, and it runs BEFORE the
  // authenticator step so a stolen password meets the inbox first.
  async function deviceGate(req: any, user: { id: number; email: string; name: string }): Promise<DeviceGate> {
    if (isDeviceVerificationDisabled() || isDeviceVerificationExempt(user.email)) return { kind: "trusted" };
    if (!isEmailConfigured()) {
      // A dev box with no Resend key. Locking every login here would help
      // nobody; say so once per process instead.
      if (!warnedNoEmailForDeviceGate) {
        warnedNoEmailForDeviceGate = true;
        console.warn("New-device approval is standing down: no email provider is configured, so the approval email could not be sent.");
      }
      return { kind: "trusted" };
    }
    const deviceId = requestDeviceId(req);
    if (deviceId) {
      const known = await findTrustedDevice(user.id, deviceId);
      if (known) {
        await touchTrustedDevice(known.id);
        return { kind: "trusted" };
      }
    }
    const meta = deviceMeta(req);
    // A device that sent no id at all is still a device somebody is holding;
    // it can be approved, it just can never become trusted (there is nothing
    // to trust). Hashing a placeholder keeps the row shape uniform.
    const { approval, actionToken, pollToken } = await createDeviceApproval(user.id, deviceId ?? `anonymous:${approvalNonce()}`, meta);
    // Location is best-effort and must not sit in the login path -- but the
    // email is the whole point here, so it waits on a bounded lookup rather
    // than always saying "Unknown". resolveLocation caps itself at 3s.
    const location = await resolveLocation(meta.ipAddress);
    if (location) await setApprovalLocation(approval.id, location).catch(() => {});
    const sent = await sendDeviceApprovalEmail(req, user, { ...approval, location }, actionToken);
    if (!sent) return { kind: "unavailable" };
    return { kind: "approval", pollToken };
  }

  function completeLogin(req: any, res: any, next: any, user: any) {
    loginWithFreshSession(req, user, async (err2: any) => {
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
      (async () => {
        const gate = await deviceGate(req, user);
        if (gate.kind === "unavailable") {
          return res.status(503).json({
            message: "We couldn't send the email needed to confirm this device. Please try again in a few minutes.",
          });
        }
        if (gate.kind === "approval") {
          return res.json({ deviceApprovalRequired: true, pollToken: gate.pollToken, emailHint: maskEmail(user.email) });
        }
        if (user.mfaEnabled) {
          return res.json({ mfaRequired: true, mfaToken: signMfaPendingToken(user.id) });
        }
        completeLogin(req, res, next, user);
      })().catch(next);
    })(req, res, next);
  });

  // ---------- New-device approval ----------
  // See server/trusted-devices.ts. The waiting device holds a poll token and
  // can only ask and, once approved, claim. The email holds an action token
  // and can only decide. Nothing here needs a session, because the whole
  // point is that there is not one yet.

  app.get("/api/auth/device-approval/status", deviceApprovalPollLimiter, async (req, res) => {
    const pollToken = typeof req.query.pollToken === "string" ? req.query.pollToken : "";
    const row = pollToken ? await findApprovalByPollToken(pollToken) : null;
    if (!row) return res.status(404).json({ message: "That sign-in attempt was not found." });
    res.json({ status: approvalState(row) });
  });

  app.post("/api/auth/device-approval/resend", deviceApprovalLimiter, async (req, res, next) => {
    try {
      const pollToken = typeof req.body?.pollToken === "string" ? req.body.pollToken : "";
      const row = pollToken ? await findApprovalByPollToken(pollToken) : null;
      if (!row || approvalState(row) !== "pending") {
        return res.status(400).json({ message: "That sign-in attempt is no longer waiting." });
      }
      // A fresh row, not the old one re-mailed: the action token was only
      // ever known in the clear at creation, so a resend has to be a new
      // approval. The old row stays pending until it expires and is harmless.
      const user = await storage.getUser(row.userId);
      if (!user) return res.status(400).json({ message: "Account not found" });
      const meta = deviceMeta(req);
      const deviceId = requestDeviceId(req) ?? `anonymous:${approvalNonce()}`;
      const fresh = await createDeviceApproval(user.id, deviceId, { ...meta, location: row.location });
      const sent = await sendDeviceApprovalEmail(req, user, fresh.approval, fresh.actionToken);
      if (!sent) return res.status(503).json({ message: "We couldn't send the email. Please try again in a few minutes." });
      res.json({ pollToken: fresh.pollToken });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/device-approval/complete", deviceApprovalLimiter, async (req, res, next) => {
    try {
      const pollToken = typeof req.body?.pollToken === "string" ? req.body.pollToken : "";
      const row = pollToken ? await findApprovalByPollToken(pollToken) : null;
      if (!row) return res.status(404).json({ message: "That sign-in attempt was not found." });
      const state = approvalState(row);
      if (state !== "approved") {
        return res.status(state === "denied" ? 403 : 409).json({ message: `This sign-in was ${state}.`, status: state });
      }
      const consumed = await consumeApproval(row.id);
      if (!consumed) return res.status(409).json({ message: "This approval has already been used." });
      const user = await storage.getUser(row.userId);
      if (!user) return res.status(401).json({ message: "Account not found" });
      // Only a device that can identify itself becomes trusted; the claim
      // has to come from the device that started the attempt, which is what
      // matching the hash asserts.
      const deviceId = requestDeviceId(req);
      if (deviceId && hashDeviceId(deviceId) === row.deviceIdHash) {
        await trustDevice(user.id, deviceId, { deviceLabel: row.deviceLabel, ipAddress: row.ipAddress, location: row.location });
      }
      if (user.mfaEnabled) {
        return res.json({ mfaRequired: true, mfaToken: signMfaPendingToken(user.id) });
      }
      completeLogin(req, res, next, user);
    } catch (err) {
      next(err);
    }
  });

  // What the email link lands on. A GET shows; only the POST below acts --
  // see device-approval-email.ts for why a link must never approve.
  app.get("/api/auth/device-approval/review", deviceApprovalLimiter, async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const row = token ? await findApprovalByActionToken(token) : null;
    if (!row) return res.status(404).json({ message: "This link is invalid." });
    res.json({
      status: approvalState(row),
      deviceLabel: row.deviceLabel ?? "Unknown device",
      location: row.location,
      createdAt: row.createdAt,
    });
  });

  app.post("/api/auth/device-approval/decide", deviceApprovalLimiter, async (req, res, next) => {
    try {
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      const decision = req.body?.decision === "approve" ? "approved" : req.body?.decision === "deny" ? "denied" : null;
      if (!decision) return res.status(400).json({ message: "Choose approve or deny." });
      const row = token ? await findApprovalByActionToken(token) : null;
      if (!row) return res.status(404).json({ message: "This link is invalid." });
      const decided = await decideApproval(row.id, decision);
      if (!decided) {
        return res.status(409).json({ message: `This sign-in was already ${approvalState(row)}.`, status: approvalState(row) });
      }
      if (decision === "approved") return res.json({ decision });
      // Denied: somebody else has the password. Every session and every
      // trusted device goes, and the person is handed straight to a new
      // password rather than told to go and find the forgot-password page.
      await forgetAllDevices(row.userId);
      const revoked = await storage.revokeAllOtherSessions(row.userId, null);
      if (revoked.webSessionIds.length > 0) {
        await pool.query('DELETE FROM "session" WHERE sid = ANY($1)', [revoked.webSessionIds]);
      }
      const resetToken = await storage.createPasswordResetToken(row.userId);
      res.json({ decision, resetToken });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/auth/trusted-devices", requireAuth, async (req, res) => {
    const user = req.user as any;
    const deviceId = requestDeviceId(req);
    const currentHash = deviceId ? hashDeviceId(deviceId) : null;
    const rows = await listTrustedDevices(user.id);
    res.json(
      rows.map(({ deviceIdHash, ...d }) => ({ ...d, isCurrent: currentHash !== null && deviceIdHash === currentHash })),
    );
  });

  app.post("/api/auth/trusted-devices/:id/forget", requireAuth, async (req, res) => {
    const user = req.user as any;
    const ok = await forgetDeviceById(user.id, Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Device not found" });
    res.json({ ok: true });
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

  // Destroying the cookie session used to be the whole of this, which
  // logged out a browser and nothing else. A native client authenticates
  // with a bearer token, not a cookie, so there was no cookie session to
  // destroy and the token stayed valid server-side for the rest of its
  // 30-day life -- the app cleared it locally, which is the only reason
  // signing out appeared to work. Anyone holding a copy of that token kept
  // access to the account after its owner had deliberately signed out, and
  // the device went on showing as an active session on the security screen.
  //
  // Revoking the session record is what actually ends it: isNativeSessionValid
  // checks revokedAt on every request. Awaited before the response, for the
  // same reason the reset flow awaits its revoke -- this is the security
  // effect being asked for, not a courtesy afterward.
  app.post("/api/auth/logout", async (req, res, next) => {
    try {
      const user = req.user as { id: number } | undefined;
      const sessionRecordId = currentSessionRecordId(req);
      // Signing out is the one gesture that means "this device is not mine to
      // keep" -- a shared computer, a phone being handed on. The next sign-in
      // here goes through the email again.
      const deviceId = user ? requestDeviceId(req) : null;
      if (user && deviceId) await forgetDevice(user.id, deviceId);
      if (user && sessionRecordId !== null) {
        const revoked = await storage.revokeSession(user.id, sessionRecordId);
        if (revoked?.webSessionId) {
          await pool.query('DELETE FROM "session" WHERE sid = $1', [revoked.webSessionId]);
        }
      }
    } catch (err) {
      return next(err);
    }
    req.logout((err) => {
      if (err) return next(err);
      // A native request has no cookie session of its own; destroy() on the
      // empty one it was given is harmless, and the clearCookie is a no-op
      // for a client that never sent one.
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

  app.post("/api/auth/reset-password", passwordResetCompleteLimiter, async (req, res, next) => {
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
      await forgetAllDevices(record.userId);
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
      // Same shape as the sessions: everything else is dropped, the device in
      // hand stays, since it just proved the current password.
      const keep = requestDeviceId(req);
      await forgetAllDevices(user.id);
      if (keep) await trustDevice(user.id, keep, deviceMeta(req));
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
  // Agreeing to the biometric release after the fact.
  //
  // Every athlete who signed up before the release was wired into signup has nothing on file, and
  // there is no way to ask them at a signup they already passed. Until they agree, the capture
  // gate in submitWorkoutLog refuses to store new skeleton frames or path traces for them.
  //
  // No body: this is one affirmative act with one meaning, and there is nothing to configure. The
  // request IS the agreement, which is why it is a POST and not a PUT of a boolean -- a flag that
  // can be set false would invite "unagreeing" here, and withdrawal is a different act with
  // different consequences that belongs with the guardian flow.
  // The athlete's own acknowledgment of the risk terms. Not a waiver they are giving -- for a
  // minor that came from their guardian, and the document's own section 8 says a guardian cannot
  // give up the child's claim. This records that THEY read it.
  app.post("/api/account/assumption-of-risk", requireAuth, async (req, res) => {
    const user = req.user as any;
    if (user.role !== "athlete") {
      return res.status(400).json({ message: "Only an athlete acknowledges this." });
    }
    const ok = await storage.recordAssumptionOfRiskAcknowledgment(user.id, {
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    if (!ok) {
      // No document configured. Better a visible failure than a consent record pointing at
      // nothing, which is what the biometric release used to do before it was rewritten.
      return res.status(503).json({ message: "That document isn't available right now." });
    }
    res.json(await toPublicUserWithSections(await storage.getUser(user.id)));
  });

  app.post("/api/account/biometric-release", requireAuth, async (req, res, next) => {
    try {
      const user = req.user as any;
      const result = await storage.recordBiometricRelease(user.id, {
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      });
      if (!result.ok) return res.status(400).json({ message: result.error });
      res.json(await toPublicUserWithSections(await storage.getUser(user.id)));
    } catch (err) {
      next(err);
    }
  });

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

  // RE-ACCEPTANCE OF THE TERMS AFTER A MATERIAL CHANGE.
  //
  // Counsel: an update binds an existing user only if they were given actual notice and an
  // opportunity to accept or reject. These two routes are the whole server side of that -- they
  // REPORT and they RECORD. Neither blocks anything: the adult acceptance screen is a client
  // decision, and a minor whose guardian has not answered keeps using the app (Scott: locking a
  // child out for a parent's inaction is the wrong trade). Nothing here touches sign-in, the
  // device gate, or any other route's authorization.
  app.get("/api/auth/terms-status", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    res.json(await storage.getTermsAcceptanceStatus((req.user as any).id));
  });

  app.post("/api/auth/accept-terms", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const parsed = z.object({ agreed: z.literal(true) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "You must agree to the terms to continue." });
    }
    const user = req.user as any;
    const status = await storage.getTermsAcceptanceStatus(user.id);
    // A minor cannot accept for themselves -- their agreement is their guardian's to give, the
    // same rule that governs the research consent and the biometric release.
    if (status.guardianDecides) {
      return res.status(403).json({
        message: "A parent or guardian has to accept these terms for you.",
        guardianDecides: true,
      });
    }
    const { acceptedAt } = await storage.acceptCurrentTerms({
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    res.json({ acceptedAt });
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

/**
 * Guardian access, driven by the LINK rather than the role.
 *
 * Guardianship is a relationship, and it already lives in guardian_links.
 * The role column was pretending it was an identity, and that had two
 * consequences nobody wanted: a parent who bought their own Free Agent
 * account became an athlete and lost guardian view entirely, and a coach
 * who happens to be a parent of an athlete on someone else's roster could
 * not be a guardian at all.
 *
 * So this asks "does this account have any guardian link" instead of "is
 * this account of type guardian". Per-athlete authorization is unchanged
 * and still goes through getAthleteForGuardianScoped, which has always been
 * link-based -- this only replaces the outer gate.
 *
 * Role "guardian" still exists and still means an account created solely to
 * be a guardian. It is now one way to have links, not the only way.
 */
export const requireGuardianAccess: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const { storage } = await import("./storage");
  const linked = await storage.getAthletesForGuardian((req.user as any).id);
  if (linked.length === 0) {
    return res.status(403).json({ message: "No athlete is linked to this account." });
  }
  next();
};

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
