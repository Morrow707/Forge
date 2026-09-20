import { Switch, Route, Redirect, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Toaster } from "sonner";
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { PUBLIC_ROUTES, isIndexable } from "@shared/public-routes";
import { SITE_NAME, usePageMeta } from "@/lib/page-meta";
import { trackPageView } from "@/lib/analytics";
import { Capacitor } from "@capacitor/core";
import { queryClient, persistOptions } from "@/lib/queryClient";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { BiometricLockGate } from "@/components/biometric-lock-gate";
import { TermsReacceptanceGate } from "@/components/terms-reacceptance-gate";
import { FirstRunDialogProvider } from "@/hooks/use-first-run-dialogs";
import { RATE_LIMITED_MESSAGE, isRateLimited } from "@/lib/rate-limit-message";
import { watchAppleIapTransactionUpdates } from "@/lib/apple-iap";
import { DebugConsole } from "@/components/debug-console";
import { withLoadTimeout } from "@/lib/lazy-load-recovery";

// Auth pages are small and needed on the very first, unauthenticated
// request, so they stay in the main bundle rather than costing an extra
// chunk round-trip before anyone can even log in. Every role-specific page
// below is lazy -- an athlete's phone shouldn't have to download the coach
// program builder, analytics charts, or the CV bar-tracking pipeline just
// to see their calendar.
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import AdminLoginPage from "@/pages/admin-login";
import SignupPage from "@/pages/signup";
import PricingPage from "@/pages/pricing";
import ClaimPage from "@/pages/claim";
import PublicTeamPage from "@/pages/public-team";
import GuardianClaimPage from "@/pages/guardian-claim";
import GuardianPendingPage from "@/pages/guardian-pending";
import DateOfBirthRequiredPage from "@/pages/date-of-birth-required";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import DeviceApprovalPage from "@/pages/device-approval";
import VerifyEmailPage from "@/pages/verify-email";
import LegalPage from "@/pages/legal";
import {
  TermsOfServicePage,
  PrivacyPolicyPage,
  EulaPage,
  BiometricReleasePage,
  AssumptionOfRiskPage,
  AiTermsOfUsePage,
} from "@/pages/legal-document";
import DeleteAccountPage from "@/pages/delete-account";
import NotFound from "@/pages/not-found";
const ForHighSchoolsPage = lazy(withLoadTimeout(() => import("@/pages/for-high-schools")));
const ForAthletesPage = lazy(withLoadTimeout(() => import("@/pages/for-athletes")));
const CameraValidationPage = lazy(withLoadTimeout(() => import("@/pages/camera-validation")));
const MovementIndexPage = lazy(withLoadTimeout(() => import("@/pages/movement").then((m) => ({ default: m.MovementIndexPage }))));
const MovementPage = lazy(withLoadTimeout(() => import("@/pages/movement")));
const AvPreviewTestPage = lazy(withLoadTimeout(() => import("@/pages/dev/av-preview-test")));

const CoachDashboard = lazy(withLoadTimeout(() => import("@/pages/coach/dashboard")));
const CoachExercises = lazy(withLoadTimeout(() => import("@/pages/coach/exercises")));
const CoachExerciseDetail = lazy(withLoadTimeout(() => import("@/pages/coach/exercise-detail")));
const CoachSkills = lazy(withLoadTimeout(() => import("@/pages/coach/skills")));
const CoachSkillDetail = lazy(withLoadTimeout(() => import("@/pages/coach/skill-detail")));
const CoachSkillPrograms = lazy(withLoadTimeout(() => import("@/pages/coach/skill-programs")));
const CoachSkillProgramBuilder = lazy(withLoadTimeout(() => import("@/pages/coach/skill-program-builder")));
const CoachPrograms = lazy(withLoadTimeout(() => import("@/pages/coach/programs")));
const CoachProgramBuilder = lazy(withLoadTimeout(() => import("@/pages/coach/program-builder")));
const CoachBilling = lazy(withLoadTimeout(() => import("@/pages/coach/billing")));
const CoachClasses = lazy(withLoadTimeout(() => import("@/pages/coach/classes")));
const CoachClassBuilder = lazy(withLoadTimeout(() => import("@/pages/coach/class-builder")));
const CoachCoachesCorner = lazy(withLoadTimeout(() => import("@/pages/coach/coaches-corner")));
const CoachRoster = lazy(withLoadTimeout(() => import("@/pages/coach/roster")));
const CoachAthleteDetail = lazy(withLoadTimeout(() => import("@/pages/coach/athlete-detail")));
const CoachMovementScreens = lazy(withLoadTimeout(() => import("@/pages/coach/movement-screens")));
const CoachNutrition = lazy(withLoadTimeout(() => import("@/pages/coach/nutrition")));
const CoachCalendar = lazy(withLoadTimeout(() => import("@/pages/coach/calendar")));
const CoachMyWorkout = lazy(withLoadTimeout(() => import("@/pages/coach/my-workout")));
const CoachAnalytics = lazy(withLoadTimeout(() => import("@/pages/coach/analytics")));
const CoachLeaderboard = lazy(withLoadTimeout(() => import("@/pages/coach/leaderboard")));
const CoachTeamBoard = lazy(withLoadTimeout(() => import("@/pages/coach/team-board")));
const CoachMyCalendar = lazy(withLoadTimeout(() => import("@/pages/coach/my-calendar")));
const TeamAboutPage = lazy(withLoadTimeout(() => import("@/pages/team-about")));
const AthleteDashboard = lazy(withLoadTimeout(() => import("@/pages/athlete/dashboard")));
const GuardianDashboard = lazy(withLoadTimeout(() => import("@/pages/guardian-dashboard")));
const AthleteCalendar = lazy(withLoadTimeout(() => import("@/pages/athlete/calendar")));
const AthleteProgress = lazy(withLoadTimeout(() => import("@/pages/athlete/progress")));
const AthleteLiftHistory = lazy(withLoadTimeout(() => import("@/pages/athlete/lift-history")));
const AthleteRecovery = lazy(withLoadTimeout(() => import("@/pages/athlete/recovery")));
const AthleteVideoBank = lazy(withLoadTimeout(() => import("@/pages/athlete/video-bank")));
const AthleteTeamBoard = lazy(withLoadTimeout(() => import("@/pages/athlete/team-board")));
const AthleteWorkout = lazy(withLoadTimeout(() => import("@/pages/athlete/workout")));
const AthleteSkillWorkout = lazy(withLoadTimeout(() => import("@/pages/skill-workout")));
const AthleteChat = lazy(withLoadTimeout(() => import("@/pages/athlete/chat")));
const AthleteSportCoach = lazy(withLoadTimeout(() => import("@/pages/athlete/sport-coach")));
const AthleteSportCoaches = lazy(withLoadTimeout(() => import("@/pages/athlete/sport-coaches")));
const AthleteUpgrade = lazy(withLoadTimeout(() => import("@/pages/athlete/upgrade")));
const AthleteNutrition = lazy(withLoadTimeout(() => import("@/pages/athlete/nutrition")));
const AthleteLeaderboard = lazy(withLoadTimeout(() => import("@/pages/athlete/leaderboard")));
const AthletePrograms = lazy(withLoadTimeout(() => import("@/pages/athlete/programs")));
const AthleteProgramBuilder = lazy(withLoadTimeout(() => import("@/pages/athlete/program-builder")));
const AthleteExercises = lazy(withLoadTimeout(() => import("@/pages/athlete/exercises")));
const AthleteExerciseDetail = lazy(withLoadTimeout(() => import("@/pages/athlete/exercise-detail")));
const AthleteSkills = lazy(withLoadTimeout(() => import("@/pages/athlete/skills")));
const AthleteSkillDetail = lazy(withLoadTimeout(() => import("@/pages/athlete/skill-detail")));
const AthleteSkillPrograms = lazy(withLoadTimeout(() => import("@/pages/athlete/skill-programs")));
const AthleteSkillProgramBuilder = lazy(withLoadTimeout(() => import("@/pages/athlete/skill-program-builder")));
const AthleteClasses = lazy(withLoadTimeout(() => import("@/pages/athlete/classes")));
const AthleteClassDetail = lazy(withLoadTimeout(() => import("@/pages/athlete/class-detail")));
const AdminDashboard = lazy(withLoadTimeout(() => import("@/pages/admin/dashboard")));
const AdminExercises = lazy(withLoadTimeout(() => import("@/pages/admin/exercises")));
const AdminCoachExercises = lazy(withLoadTimeout(() => import("@/pages/admin/coach-exercises")));
const AdminRemovalRequests = lazy(withLoadTimeout(() => import("@/pages/admin/removal-requests")));
const AdminWaivers = lazy(withLoadTimeout(() => import("@/pages/admin/waivers")));
const CoachAthleteDocuments = lazy(withLoadTimeout(() => import("@/pages/coach/athlete-documents")));
// One page for every role -- the upload mechanics are shared and the checklist is not.
// See shared/required-documents.ts.
const DocumentsPage = lazy(withLoadTimeout(() => import("@/pages/documents")));
const AdminDiagnostics = lazy(withLoadTimeout(() => import("@/pages/admin/diagnostics")));
const AdminQueryEngine = lazy(withLoadTimeout(() => import("@/pages/admin/query-engine")));
const AdminBlockedAthletes = lazy(withLoadTimeout(() => import("@/pages/admin/blocked-athletes")));
const AdminExerciseDetail = lazy(withLoadTimeout(() => import("@/pages/admin/exercise-detail")));
const AdminSkills = lazy(withLoadTimeout(() => import("@/pages/admin/skills")));
const AdminSkillDetail = lazy(withLoadTimeout(() => import("@/pages/admin/skill-detail")));
const AdminPrograms = lazy(withLoadTimeout(() => import("@/pages/admin/programs")));
const AdminProgramBuilder = lazy(withLoadTimeout(() => import("@/pages/admin/program-builder")));
const AdminSkillPrograms = lazy(withLoadTimeout(() => import("@/pages/admin/skill-programs")));
const AdminSkillProgramBuilder = lazy(withLoadTimeout(() => import("@/pages/admin/skill-program-builder")));
const AdminReports = lazy(withLoadTimeout(() => import("@/pages/admin/reports")));
const AdminTeachAi = lazy(withLoadTimeout(() => import("@/pages/admin/teach-ai")));
const AdminCameraAi = lazy(withLoadTimeout(() => import("@/pages/admin/camera-ai")));
const AdminTrackingReport = lazy(withLoadTimeout(() => import("@/pages/admin/tracking-report")));
const AdminDocuments = lazy(withLoadTimeout(() => import("@/pages/admin/documents")));
const AdminMyCalendar = lazy(withLoadTimeout(() => import("@/pages/admin/my-calendar")));
const AdminMyWorkout = lazy(withLoadTimeout(() => import("@/pages/admin/my-workout")));
const AdminPlatformTrends = lazy(withLoadTimeout(() => import("@/pages/admin/platform-trends")));
const AdminKnowledgeBase = lazy(withLoadTimeout(() => import("@/pages/admin/knowledge-base")));
const AdminAiSpend = lazy(withLoadTimeout(() => import("@/pages/admin/ai-spend")));
const AdminBilling = lazy(withLoadTimeout(() => import("@/pages/admin/billing")));
const AdminUsers = lazy(withLoadTimeout(() => import("@/pages/admin/users")));
const AdminClasses = lazy(withLoadTimeout(() => import("@/pages/admin/classes")));
const AdminClassesAnalytics = lazy(withLoadTimeout(() => import("@/pages/admin/classes-analytics")));
const AdminClassBuilder = lazy(withLoadTimeout(() => import("@/pages/admin/class-builder")));
const AdminCoachesCorner = lazy(withLoadTimeout(() => import("@/pages/admin/coaches-corner")));
const AdminAcademyTrackBuilder = lazy(withLoadTimeout(() => import("@/pages/admin/academy-track-builder")));

function FullScreenSpinner() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}

function homeFor(role: "coach" | "athlete" | "admin" | "guardian") {
  if (role === "coach") return "/coach";
  if (role === "admin") return "/admin";
  if (role === "guardian") return "/guardian";
  return "/athlete";
}

// Shown instead of a hard redirect-to-login when the "who am I" check
// itself couldn't complete (dropped connection, server hiccup) -- as
// opposed to completing and confirming no one is logged in. The
// distinction matters: booting someone to /login on a plain network blip
// unmounts whatever page they're mid-task on (e.g. an in-progress workout
// log) for no real reason, since their session is almost certainly still
// valid the moment the connection recovers. This keeps them in place and
// lets them retry instead.
function ConnectionProblem() {
  const qc = useQueryClient();
  const { error } = useAuth();
  // A 429 is the server answering, not a connection failing, and "check your connection" sends
  // somebody to a fix that cannot work -- worse, it invites the hammering that made it fire.
  // Only a real HTTP response reaches this branch: a transport failure is a NetworkError, which
  // is deliberately not an ApiError (see CLAUDE.md), so it still gets the sentence above.
  const rateLimited = isRateLimited(error);
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="text-sm text-muted-foreground">
        {rateLimited
          ? RATE_LIMITED_MESSAGE
          : "Having trouble reaching Forge. Your session is still fine -- check your connection and try again."}
      </p>
      <button
        type="button"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        onClick={() => qc.refetchQueries({ queryKey: ["/api/auth/me"] })}
      >
        Retry
      </button>
    </div>
  );
}

/** Signed in, any role.
 *
 * ProtectedRoute below takes exactly one role, which is right for every screen that belongs to
 * one. /documents belongs to all of them: an athlete, a coach and a free agent upload different
 * paperwork through the same page, and listing the page three times under three roles would be
 * three places for the route to drift. Same isError-before-!user ordering as ProtectedRoute --
 * a failed check is not a logged-out user.
 */
function AuthedRoute({ component: Component }: { component: ComponentType }) {
  const { user, isLoading, isError } = useAuth();
  if (isLoading) return <FullScreenSpinner />;
  if (isError) return <ConnectionProblem />;
  if (!user) return <Redirect to="/login" />;
  return <Component />;
}

function ProtectedRoute({
  role,
  component: Component,
}: {
  role: "coach" | "athlete" | "admin" | "guardian";
  component: ComponentType;
}) {
  const { user, isLoading, isError } = useAuth();

  if (isLoading) return <FullScreenSpinner />;
  // isError (couldn't check) is deliberately handled before the plain
  // `!user` check below -- user is undefined in both that case and the
  // still-loading case, but only a confirmed 401 (user === null) actually
  // means "not logged in." See useAuth's isError comment.
  if (isError) return <ConnectionProblem />;
  if (!user) return <Redirect to="/login" />;
  // Guardian pages are reachable by anyone holding a guardian link, not only
  // by an account whose role is "guardian" -- a parent who trains here as a
  // Free Agent keeps one account and switches into their child's view. Every
  // other role check is unchanged.
  const allowed = role === "guardian" ? user.role === "guardian" || user.hasGuardianLinks : user.role === role;
  if (!allowed) {
    return <Redirect to={homeFor(user.role)} />;
  }
  // A minor athlete with no guardian linked gets one screen and no app. The
  // server refuses every route regardless (see the guardian gate in
  // server/routes.ts); doing it here too is what turns a wall of 403s into a
  // sentence explaining what they're waiting for. One place rather than per
  // page, for the same reason the server check is one middleware.
  // Checked before the guardian hold, because it comes first in fact: until there is a birthdate
  // nobody knows whether a guardian is even required. Filling it in re-evaluates the gate, so a
  // minor falls through to the screen below on the same response.
  if (user.role === "athlete" && user.dateOfBirthRequired) {
    return <DateOfBirthRequiredPage />;
  }
  if (user.role === "athlete" && user.guardianLinkRequired) {
    return <GuardianPendingPage />;
  }
  return <Component />;
}

function HomeRedirect() {
  const { user, isLoading, isError } = useAuth();
  if (isLoading) return <FullScreenSpinner />;
  // Same isError-before-!user ordering as ProtectedRoute, and for the same
  // reason -- a failed check isn't a confirmed "not logged in".
  if (isError) return <ConnectionProblem />;
  // Logged-out visitors land on the marketing page instead of being bounced
  // straight to the login form -- "/" is the front door now, not just a
  // redirect stub. Anyone already signed in still goes straight to their
  // own dashboard, same as before. The native app has no use for the
  // marketing pitch (you already installed it) and no App Store review
  // wants a marketing page as the app's entry point, so it skips straight
  // to login there.
  if (!user) {
    return Capacitor.isNativePlatform() ? <Redirect to="/login" /> : <LandingPage />;
  }
  return <Redirect to={homeFor(user.role)} />;
}

/** THE HEAD FOR WHATEVER ROUTE IS SHOWING.
 *
 * Deliberately one component driven off the route list rather than a usePageMeta call added to
 * each of fifteen page files. Two reasons: the same list already feeds the sitemap and the
 * prerenderer, so the three cannot drift apart; and a page added without metadata gets the
 * indexable-by-default fallback in index.html rather than silently inheriting the title of
 * whatever the visitor looked at last.
 *
 * Anything not in the list -- every signed-in app route, and the token landings -- is marked
 * noindex here. That is the safe default for an app whose public surface is a short list and
 * whose private surface is hundreds of routes: a new coach screen is not accidentally
 * crawlable because nobody remembered to exclude it. */
function RouteMeta() {
  const [location] = useLocation();
  // Counted here because this is the one component that already sees every navigation. Off
  // unless VITE_ANALYTICS_ENDPOINT is set, and it must stay off until the privacy policy names
  // the processor -- see lib/analytics.ts for why that ordering is not optional.
  useEffect(() => {
    trackPageView(location);
  }, [location]);
  const known = PUBLIC_ROUTES.find((r) => r.path === location);
  usePageMeta(
    known
      ? { title: known.title, description: known.description, path: known.path, image: known.image, noindex: !known.index }
      : {
          title: SITE_NAME,
          description:
            "Coaching software for strength and conditioning: build exercise libraries, program training blocks, and keep a whole roster's calendar in one place.",
          path: location,
          noindex: !isIndexable(location),
        },
  );
  return null;
}

function Router() {
  const [location] = useLocation();

  // A Dialog that's still "open" the instant its own success handler
  // navigates away (e.g. create-program-then-jump-to-the-builder) can leave
  // Radix's scroll lock -- and its "hide everything else from assistive
  // tech" pass, which also marks the rest of the page inert/unscrollable --
  // stuck on, because the dialog's whole subtree gets torn down by the
  // route change before its own cleanup finishes. Belt-and-suspenders fix:
  // force-clear all of it on every navigation, since nothing in this app
  // ever wants body scroll or interaction to stay locked across a route
  // change (no dialog is legitimately open the instant a new page mounts).
  useEffect(() => {
    document.body.style.removeProperty("overflow");
    document.body.style.removeProperty("padding-right");
    document.body.style.removeProperty("pointer-events");
    document.querySelectorAll("[aria-hidden='true'], [data-aria-hidden]").forEach((el) => {
      el.removeAttribute("aria-hidden");
      el.removeAttribute("data-aria-hidden");
    });
    document.querySelectorAll("[inert]").forEach((el) => el.removeAttribute("inert"));
  }, [location]);

  // Once per app launch, not per navigation -- catches a StoreKit
  // transaction that completes outside any purchase()/restorePurchases()
  // call in this session (Ask to Buy approval, a subscription bought on
  // another device). No-op on every platform but iOS; see
  // watchAppleIapTransactionUpdates' own comment.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) watchAppleIapTransactionUpdates();
  }, []);

  return (
    <Suspense fallback={<FullScreenSpinner />}>
      {/* OUTSIDE the location-keyed wrapper below, so it is not torn down and remounted on every
          navigation -- it reads the location itself and rewrites the head in place. */}
      <RouteMeta />
      {/* Keyed on location so React remounts this wrapper -- not the routes
          inside it -- on every navigation, replaying the fade/slide-in each
          time. motion-safe: (rather than a plain class) makes the animation
          disappear entirely under prefers-reduced-motion instead of just
          running at zero duration. */}
      <div key={location} className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/login" component={LoginPage} />
        <Route path="/admin/login" component={AdminLoginPage} />
        <Route path="/signup" component={SignupPage} />
        <Route path="/pricing" component={PricingPage} />
        {/* The audience pages. Public and indexed -- see shared/public-routes.ts, which is also
            what the sitemap and the prerenderer read. */}
        <Route path="/for-high-schools" component={ForHighSchoolsPage} />
        <Route path="/for-athletes" component={ForAthletesPage} />
        {/* What the camera has actually been validated on. Public deliberately: the value of the
            page is entirely in it being readable before somebody buys. */}
        <Route path="/camera-validation" component={CameraValidationPage} />
        {/* The movement library: four pages, one per validated movement, plus an index. Kept to
            the validated set on purpose -- see shared/movement-library.ts. */}
        <Route path="/movements" component={MovementIndexPage} />
        <Route path="/movements/:slug" component={MovementPage} />
        {/* Public, no account -- the link a coach can put on a flyer. See
            PublicTeamPage: Team Identity sells a public About page and contact email,
            and the only About page Forge had was behind a login. */}
        <Route path="/team/:code" component={PublicTeamPage} />
        <Route path="/claim/:code" component={ClaimPage} />
        <Route path="/guardian/claim" component={GuardianClaimPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/device-approval" component={DeviceApprovalPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/legal" component={LegalPage} />
        <Route path="/terms" component={TermsOfServicePage} />
        <Route path="/privacy" component={PrivacyPolicyPage} />
        {/* The AI features specifically. Platform use is the signup agreement's -- see the
            "Service" definition in the document itself. */}
        <Route path="/ai-terms" component={AiTermsOfUsePage} />
        <Route path="/eula" component={EulaPage} />
        {/* Linked from the capture-time release prompt and from all three guardian-claim
            checkboxes. Public because the claim is reached from an emailed invite, before
            there is a session to authenticate. */}
        <Route path="/biometric-release" component={BiometricReleasePage} />
        <Route path="/assumption-of-risk" component={AssumptionOfRiskPage} />
        <Route path="/delete-account" component={DeleteAccountPage} />
        <Route path="/dev/av-preview-test">
          <ProtectedRoute role="admin" component={AvPreviewTestPage} />
        </Route>
        <Route path="/coach">
          <ProtectedRoute role="coach" component={CoachDashboard} />
        </Route>
        <Route path="/coach/calendar">
          <ProtectedRoute role="coach" component={CoachCalendar} />
        </Route>
        <Route path="/coach/my/day/:assignmentId/:programDayId/:date">
          <ProtectedRoute role="coach" component={CoachMyWorkout} />
        </Route>
        <Route path="/coach/exercises/:id">
          <ProtectedRoute role="coach" component={CoachExerciseDetail} />
        </Route>
        <Route path="/coach/exercises">
          <ProtectedRoute role="coach" component={CoachExercises} />
        </Route>
        <Route path="/coach/skills/:id">
          <ProtectedRoute role="coach" component={CoachSkillDetail} />
        </Route>
        <Route path="/coach/skills">
          <ProtectedRoute role="coach" component={CoachSkills} />
        </Route>
        <Route path="/coach/skill-programs/:id">
          <ProtectedRoute role="coach" component={CoachSkillProgramBuilder} />
        </Route>
        <Route path="/coach/skill-programs">
          <ProtectedRoute role="coach" component={CoachSkillPrograms} />
        </Route>
        <Route path="/coach/programs/:id">
          <ProtectedRoute role="coach" component={CoachProgramBuilder} />
        </Route>
        <Route path="/coach/programs">
          <ProtectedRoute role="coach" component={CoachPrograms} />
        </Route>
        <Route path="/coach/classes/:id">
          <ProtectedRoute role="coach" component={CoachClassBuilder} />
        </Route>
        <Route path="/coach/classes">
          <ProtectedRoute role="coach" component={CoachClasses} />
        </Route>
        <Route path="/coach/coaches-corner">
          <ProtectedRoute role="coach" component={CoachCoachesCorner} />
        </Route>
        <Route path="/coach/roster/:athleteId">
          <ProtectedRoute role="coach" component={CoachAthleteDetail} />
        </Route>
        <Route path="/coach/movement-screens">
          <ProtectedRoute role="coach" component={CoachMovementScreens} />
        </Route>
        <Route path="/coach/billing">
          <ProtectedRoute role="coach" component={CoachBilling} />
        </Route>
        <Route path="/coach/roster">
          <ProtectedRoute role="coach" component={CoachRoster} />
        </Route>
        <Route path="/coach/nutrition">
          <ProtectedRoute role="coach" component={CoachNutrition} />
        </Route>
        <Route path="/coach/analytics">
          <ProtectedRoute role="coach" component={CoachAnalytics} />
        </Route>
        <Route path="/coach/leaderboard">
          <ProtectedRoute role="coach" component={CoachLeaderboard} />
        </Route>
        <Route path="/coach/team-board">
          <ProtectedRoute role="coach" component={CoachTeamBoard} />
        </Route>
        <Route path="/coach/my">
          <ProtectedRoute role="coach" component={CoachMyCalendar} />
        </Route>
        <Route path="/coach/about">
          <ProtectedRoute role="coach" component={TeamAboutPage} />
        </Route>
        <Route path="/athlete">
          <ProtectedRoute role="athlete" component={AthleteDashboard} />
        </Route>
        <Route path="/guardian">
          <ProtectedRoute role="guardian" component={GuardianDashboard} />
        </Route>
        <Route path="/athlete/calendar">
          <ProtectedRoute role="athlete" component={AthleteCalendar} />
        </Route>
        <Route path="/athlete/progress">
          <ProtectedRoute role="athlete" component={AthleteProgress} />
        </Route>
        <Route path="/athlete/lift-history">
          <ProtectedRoute role="athlete" component={AthleteLiftHistory} />
        </Route>
        <Route path="/athlete/recovery">
          <ProtectedRoute role="athlete" component={AthleteRecovery} />
        </Route>
        <Route path="/athlete/video-bank">
          <ProtectedRoute role="athlete" component={AthleteVideoBank} />
        </Route>
        {/* A coach or admin filming their own training queues clips through the same
            store, so they need the same page to link an orphaned one. The page asks
            /api/athlete/unattached-videos, which scopes by the caller's own id. */}
        <Route path="/coach/video-bank">
          <ProtectedRoute role="coach" component={AthleteVideoBank} />
        </Route>
        <Route path="/admin/video-bank">
          <ProtectedRoute role="admin" component={AthleteVideoBank} />
        </Route>
        <Route path="/athlete/nutrition">
          <ProtectedRoute role="athlete" component={AthleteNutrition} />
        </Route>
        <Route path="/athlete/leaderboard">
          <ProtectedRoute role="athlete" component={AthleteLeaderboard} />
        </Route>
        <Route path="/athlete/team-board">
          <ProtectedRoute role="athlete" component={AthleteTeamBoard} />
        </Route>
        <Route path="/athlete/chat">
          <ProtectedRoute role="athlete" component={AthleteChat} />
        </Route>
        <Route path="/athlete/coaches">
          <ProtectedRoute role="athlete" component={AthleteSportCoaches} />
        </Route>
        <Route path="/athlete/upgrade">
          <ProtectedRoute role="athlete" component={AthleteUpgrade} />
        </Route>
        <Route path="/athlete/coach/:addOnId">
          <ProtectedRoute role="athlete" component={AthleteSportCoach} />
        </Route>
        <Route path="/athlete/programs/:id">
          <ProtectedRoute role="athlete" component={AthleteProgramBuilder} />
        </Route>
        <Route path="/athlete/programs">
          <ProtectedRoute role="athlete" component={AthletePrograms} />
        </Route>
        <Route path="/athlete/exercises/:id">
          <ProtectedRoute role="athlete" component={AthleteExerciseDetail} />
        </Route>
        <Route path="/athlete/exercises">
          <ProtectedRoute role="athlete" component={AthleteExercises} />
        </Route>
        <Route path="/athlete/skill-programs/:id">
          <ProtectedRoute role="athlete" component={AthleteSkillProgramBuilder} />
        </Route>
        <Route path="/athlete/skill-programs">
          <ProtectedRoute role="athlete" component={AthleteSkillPrograms} />
        </Route>
        <Route path="/athlete/skills/:id">
          <ProtectedRoute role="athlete" component={AthleteSkillDetail} />
        </Route>
        <Route path="/athlete/skills">
          <ProtectedRoute role="athlete" component={AthleteSkills} />
        </Route>
        <Route path="/athlete/classes/:id">
          <ProtectedRoute role="athlete" component={AthleteClassDetail} />
        </Route>
        <Route path="/athlete/classes">
          <ProtectedRoute role="athlete" component={AthleteClasses} />
        </Route>
        <Route path="/athlete/day/:assignmentId/:programDayId/:date">
          <ProtectedRoute role="athlete" component={AthleteWorkout} />
        </Route>
        <Route path="/athlete/skill-day/:skillAssignmentId/:skillProgramDayId/:date">
          <ProtectedRoute role="athlete" component={AthleteSkillWorkout} />
        </Route>
        <Route path="/athlete/about">
          <ProtectedRoute role="athlete" component={TeamAboutPage} />
        </Route>
        <Route path="/admin">
          <ProtectedRoute role="admin" component={AdminDashboard} />
        </Route>
        <Route path="/admin/my">
          <ProtectedRoute role="admin" component={AdminMyCalendar} />
        </Route>
        <Route path="/admin/my/day/:assignmentId/:programDayId/:date">
          <ProtectedRoute role="admin" component={AdminMyWorkout} />
        </Route>
        <Route path="/admin/coach-exercises">
          <ProtectedRoute role="admin" component={AdminCoachExercises} />
        </Route>
        <Route path="/admin/removal-requests">
          <ProtectedRoute role="admin" component={AdminRemovalRequests} />
        </Route>
        <Route path="/admin/waivers">
          <ProtectedRoute role="admin" component={AdminWaivers} />
        </Route>
        <Route path="/documents">
          <AuthedRoute component={DocumentsPage} />
        </Route>
        {/* The same page, filing for somebody else. A coach reaches it from the chase screen;
            the server checks the relationship on both the read and the upload, so the route
            itself does not need a role. */}
        <Route path="/documents/:athleteId">
          <AuthedRoute component={DocumentsPage} />
        </Route>
        {/* The coach's view of everyone ELSE's documents. /documents above is their own. */}
        <Route path="/coach/athlete-documents">
          <ProtectedRoute role="coach" component={CoachAthleteDocuments} />
        </Route>
        <Route path="/admin/query-engine">
          <ProtectedRoute role="admin" component={AdminQueryEngine} />
        </Route>
        <Route path="/admin/diagnostics">
          <ProtectedRoute role="admin" component={AdminDiagnostics} />
        </Route>
        <Route path="/admin/blocked-athletes">
          <ProtectedRoute role="admin" component={AdminBlockedAthletes} />
        </Route>
        <Route path="/admin/exercises/:id">
          <ProtectedRoute role="admin" component={AdminExerciseDetail} />
        </Route>
        <Route path="/admin/exercises">
          <ProtectedRoute role="admin" component={AdminExercises} />
        </Route>
        <Route path="/admin/skills/:id">
          <ProtectedRoute role="admin" component={AdminSkillDetail} />
        </Route>
        <Route path="/admin/skills">
          <ProtectedRoute role="admin" component={AdminSkills} />
        </Route>
        <Route path="/admin/programs/:id">
          <ProtectedRoute role="admin" component={AdminProgramBuilder} />
        </Route>
        <Route path="/admin/programs">
          <ProtectedRoute role="admin" component={AdminPrograms} />
        </Route>
        <Route path="/admin/skill-programs/:id">
          <ProtectedRoute role="admin" component={AdminSkillProgramBuilder} />
        </Route>
        <Route path="/admin/skill-programs">
          <ProtectedRoute role="admin" component={AdminSkillPrograms} />
        </Route>
        <Route path="/admin/classes/:id">
          <ProtectedRoute role="admin" component={AdminClassBuilder} />
        </Route>
        <Route path="/admin/classes">
          <ProtectedRoute role="admin" component={AdminClasses} />
        </Route>
        <Route path="/admin/classes-analytics">
          <ProtectedRoute role="admin" component={AdminClassesAnalytics} />
        </Route>
        <Route path="/admin/coaches-corner">
          <ProtectedRoute role="admin" component={AdminCoachesCorner} />
        </Route>
        <Route path="/admin/academy-tracks/:id">
          <ProtectedRoute role="admin" component={AdminAcademyTrackBuilder} />
        </Route>
        <Route path="/admin/review">
          <ProtectedRoute role="admin" component={AdminReports} />
        </Route>
        <Route path="/admin/camera-ai">
          <ProtectedRoute role="admin" component={AdminCameraAi} />
        </Route>
        <Route path="/admin/teach-ai">
          <ProtectedRoute role="admin" component={AdminTeachAi} />
        </Route>
        <Route path="/admin/documents">
          <ProtectedRoute role="admin" component={AdminDocuments} />
        </Route>
        <Route path="/admin/tracking-report">
          <ProtectedRoute role="admin" component={AdminTrackingReport} />
        </Route>
        <Route path="/admin/knowledge-base">
          <ProtectedRoute role="admin" component={AdminKnowledgeBase} />
        </Route>
        <Route path="/admin/ai-spend">
          <ProtectedRoute role="admin" component={AdminAiSpend} />
        </Route>
        {/* Dataset Extracts is a section of Cohort Explorer now, not its own screen -- an old
            link lands on the page that contains it. */}
        <Route path="/admin/research-exports">
          <Redirect to="/admin/platform-trends" />
        </Route>
        <Route path="/admin/platform-trends">
          <ProtectedRoute role="admin" component={AdminPlatformTrends} />
        </Route>
        <Route path="/admin/billing">
          <ProtectedRoute role="admin" component={AdminBilling} />
        </Route>
        <Route path="/admin/users">
          <ProtectedRoute role="admin" component={AdminUsers} />
        </Route>
        <Route component={NotFound} />
      </Switch>
      </div>
    </Suspense>
  );
}

export default function App() {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <AuthProvider>
        {/* THE FIRST-RUN QUEUE. Three modals are due at once on a first sign-in -- this gate and
            the two camera notices in AppShell -- and all three used to open together, each with
            its own blocking layer, so nothing underneath was tappable. This hands the screen to
            one at a time (terms, then the 2D-device notice, then the accuracy notice). It wraps
            both the router and the gate because the two notices are mounted down inside AppShell
            and this one is not. Nothing about what any of them says, or when it is due, changes. */}
        <FirstRunDialogProvider>
        <BiometricLockGate>
          <Router />
          {/* Beside the router, not inside a screen: a change to the signup Terms of Use has to
              be answered before continuing on ANY route, and a minor athlete sees nothing here
              because their guardian answers it for them. Renders null for everybody else. */}
          <TermsReacceptanceGate />
          {/* expand: without it, Sonner collapses multiple toasts into a
              peek-behind-the-front-one stack that only un-collapses on
              hover -- fine on desktop, but there's no hover on a touch
              screen, so a second toast landing before the first was read
              just looked like it silently replaced it. expand keeps every
              toast fully visible, each new one pushing the others down,
              still auto-dismissing on their own default timers. */}
          {/* offset/mobileOffset (sonner switches between them under/over a
              600px viewport, which this app is always under) clear the
              iPhone notch/status bar -- without it every toast (errors,
              success, info alike) rendered flush against the top edge,
              landing right under the camera/clock. */}
          <Toaster
            theme="dark"
            position="top-right"
            richColors
            expand
            offset={{ top: "calc(env(safe-area-inset-top) + 1rem)" }}
            mobileOffset={{ top: "calc(env(safe-area-inset-top) + 1rem)" }}
          />
          {/* Back on for the keychain-save investigation, and NATIVE ONLY.
              
              The save into Apple Passwords fails with no visible moment of its
              own -- iOS shows nothing when SecAddSharedWebCredential is
              declined -- so the on-screen log is the only way to read what it
              actually returned from a TestFlight build, with no Mac in the
              loop. A toast covers the failure path, but a SUCCESS is silent,
              and "resolved but nothing saved" is one of the outcomes we are
              trying to tell apart.

              Gated on the native platform because this is the only place the
              question exists: the browser has no keychain to write to, and a
              floating bug icon on the web app is a debugging tool shipped to
              people who are not debugging. import.meta.env.DEV keeps it for
              local work.

              TEMPORARY. Goes back to commented-out (or deleted outright, along
              with debug-console.tsx and lib/debug-console.ts) once the save is
              diagnosed -- this is a tool, not a feature. */}
          {(Capacitor.isNativePlatform() || import.meta.env.DEV) && <DebugConsole />}
        </BiometricLockGate>
        </FirstRunDialogProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
