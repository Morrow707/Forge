import { Switch, Route, Redirect, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Toaster } from "sonner";
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { Capacitor } from "@capacitor/core";
import { queryClient, persistOptions } from "@/lib/queryClient";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { BiometricLockGate } from "@/components/biometric-lock-gate";
import { DebugConsole } from "@/components/debug-console";

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
import GuardianClaimPage from "@/pages/guardian-claim";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import VerifyEmailPage from "@/pages/verify-email";
import LegalPage from "@/pages/legal";
import { TermsOfServicePage, PrivacyPolicyPage } from "@/pages/legal-document";
import DeleteAccountPage from "@/pages/delete-account";
import NotFound from "@/pages/not-found";
const ArPreviewTestPage = lazy(() => import("@/pages/dev/ar-preview-test"));
const AvPreviewTestPage = lazy(() => import("@/pages/dev/av-preview-test"));

const CoachDashboard = lazy(() => import("@/pages/coach/dashboard"));
const CoachExercises = lazy(() => import("@/pages/coach/exercises"));
const CoachExerciseDetail = lazy(() => import("@/pages/coach/exercise-detail"));
const CoachSkills = lazy(() => import("@/pages/coach/skills"));
const CoachSkillDetail = lazy(() => import("@/pages/coach/skill-detail"));
const CoachSkillPrograms = lazy(() => import("@/pages/coach/skill-programs"));
const CoachSkillProgramBuilder = lazy(() => import("@/pages/coach/skill-program-builder"));
const CoachPrograms = lazy(() => import("@/pages/coach/programs"));
const CoachProgramBuilder = lazy(() => import("@/pages/coach/program-builder"));
const CoachClasses = lazy(() => import("@/pages/coach/classes"));
const CoachClassBuilder = lazy(() => import("@/pages/coach/class-builder"));
const CoachCoachesCorner = lazy(() => import("@/pages/coach/coaches-corner"));
const CoachRoster = lazy(() => import("@/pages/coach/roster"));
const CoachAthleteDetail = lazy(() => import("@/pages/coach/athlete-detail"));
const CoachMovementScreens = lazy(() => import("@/pages/coach/movement-screens"));
const CoachNutrition = lazy(() => import("@/pages/coach/nutrition"));
const CoachCalendar = lazy(() => import("@/pages/coach/calendar"));
const CoachMyWorkout = lazy(() => import("@/pages/coach/my-workout"));
const CoachAnalytics = lazy(() => import("@/pages/coach/analytics"));
const CoachLeaderboard = lazy(() => import("@/pages/coach/leaderboard"));
const CoachTeamBoard = lazy(() => import("@/pages/coach/team-board"));
const CoachMyCalendar = lazy(() => import("@/pages/coach/my-calendar"));
const TeamAboutPage = lazy(() => import("@/pages/team-about"));
const AthleteDashboard = lazy(() => import("@/pages/athlete/dashboard"));
const GuardianDashboard = lazy(() => import("@/pages/guardian-dashboard"));
const AthleteCalendar = lazy(() => import("@/pages/athlete/calendar"));
const AthleteProgress = lazy(() => import("@/pages/athlete/progress"));
const AthleteLiftHistory = lazy(() => import("@/pages/athlete/lift-history"));
const AthleteRecovery = lazy(() => import("@/pages/athlete/recovery"));
const AthleteVideoBank = lazy(() => import("@/pages/athlete/video-bank"));
const AthleteTeamBoard = lazy(() => import("@/pages/athlete/team-board"));
const AthleteWorkout = lazy(() => import("@/pages/athlete/workout"));
const AthleteChat = lazy(() => import("@/pages/athlete/chat"));
const AthleteNutrition = lazy(() => import("@/pages/athlete/nutrition"));
const AthleteLeaderboard = lazy(() => import("@/pages/athlete/leaderboard"));
const AthletePrograms = lazy(() => import("@/pages/athlete/programs"));
const AthleteProgramBuilder = lazy(() => import("@/pages/athlete/program-builder"));
const AthleteExercises = lazy(() => import("@/pages/athlete/exercises"));
const AthleteExerciseDetail = lazy(() => import("@/pages/athlete/exercise-detail"));
const AthleteSkills = lazy(() => import("@/pages/athlete/skills"));
const AthleteSkillDetail = lazy(() => import("@/pages/athlete/skill-detail"));
const AthleteSkillPrograms = lazy(() => import("@/pages/athlete/skill-programs"));
const AthleteSkillProgramBuilder = lazy(() => import("@/pages/athlete/skill-program-builder"));
const AthleteClasses = lazy(() => import("@/pages/athlete/classes"));
const AthleteClassDetail = lazy(() => import("@/pages/athlete/class-detail"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminExercises = lazy(() => import("@/pages/admin/exercises"));
const AdminExerciseDetail = lazy(() => import("@/pages/admin/exercise-detail"));
const AdminSkills = lazy(() => import("@/pages/admin/skills"));
const AdminSkillDetail = lazy(() => import("@/pages/admin/skill-detail"));
const AdminPrograms = lazy(() => import("@/pages/admin/programs"));
const AdminProgramBuilder = lazy(() => import("@/pages/admin/program-builder"));
const AdminSkillPrograms = lazy(() => import("@/pages/admin/skill-programs"));
const AdminSkillProgramBuilder = lazy(() => import("@/pages/admin/skill-program-builder"));
const AdminReports = lazy(() => import("@/pages/admin/reports"));
const AdminTeachAi = lazy(() => import("@/pages/admin/teach-ai"));
const AdminTrackingReport = lazy(() => import("@/pages/admin/tracking-report"));
const AdminDocuments = lazy(() => import("@/pages/admin/documents"));
const AdminMyCalendar = lazy(() => import("@/pages/admin/my-calendar"));
const AdminMyWorkout = lazy(() => import("@/pages/admin/my-workout"));
const AdminPlatformTrends = lazy(() => import("@/pages/admin/platform-trends"));
const AdminBilling = lazy(() => import("@/pages/admin/billing"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminVideos = lazy(() => import("@/pages/admin/videos"));
const AdminClasses = lazy(() => import("@/pages/admin/classes"));
const AdminClassesAnalytics = lazy(() => import("@/pages/admin/classes-analytics"));
const AdminClassBuilder = lazy(() => import("@/pages/admin/class-builder"));
const AdminCoachesCorner = lazy(() => import("@/pages/admin/coaches-corner"));
const AdminAcademyTrackBuilder = lazy(() => import("@/pages/admin/academy-track-builder"));

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
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="text-sm text-muted-foreground">
        Having trouble reaching Forge. Your session is still fine -- check your connection and
        try again.
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
  if (user.role !== role) {
    return <Redirect to={homeFor(user.role)} />;
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

  return (
    <Suspense fallback={<FullScreenSpinner />}>
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
        <Route path="/claim/:code" component={ClaimPage} />
        <Route path="/guardian/claim" component={GuardianClaimPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/legal" component={LegalPage} />
        <Route path="/terms" component={TermsOfServicePage} />
        <Route path="/privacy" component={PrivacyPolicyPage} />
        <Route path="/delete-account" component={DeleteAccountPage} />
        <Route path="/dev/ar-preview-test" component={ArPreviewTestPage} />
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
        <Route path="/admin/teach-ai">
          <ProtectedRoute role="admin" component={AdminTeachAi} />
        </Route>
        <Route path="/admin/documents">
          <ProtectedRoute role="admin" component={AdminDocuments} />
        </Route>
        <Route path="/admin/tracking-report">
          <ProtectedRoute role="admin" component={AdminTrackingReport} />
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
        <Route path="/admin/videos">
          <ProtectedRoute role="admin" component={AdminVideos} />
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
        <BiometricLockGate>
          <Router />
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
          {/* Not mounted -- the login issue this was built to diagnose
              turned out to be transient, not a real bug (confirmed once
              the site was working normally again). Left commented out
              rather than deleted: debug-console.tsx, lib/debug-console.ts,
              and the logDebug() calls in login.tsx/use-auth.tsx all still
              capture AUTH/NAV events into the in-memory buffer exactly as
              before -- only the on-screen bug-icon toggle and its panel
              are off. Uncomment this one line to bring the console back
              for a future login/session issue. */}
          {/* <DebugConsole /> */}
        </BiometricLockGate>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
