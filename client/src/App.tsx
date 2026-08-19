import { Switch, Route, Redirect, useLocation } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider, useAuth } from "@/hooks/use-auth";

// Auth pages are small and needed on the very first, unauthenticated
// request, so they stay in the main bundle rather than costing an extra
// chunk round-trip before anyone can even log in. Every role-specific page
// below is lazy -- an athlete's phone shouldn't have to download the coach
// program builder, analytics charts, or the CV bar-tracking pipeline just
// to see their calendar.
import LoginPage from "@/pages/login";
import AdminLoginPage from "@/pages/admin-login";
import SignupPage from "@/pages/signup";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import NotFound from "@/pages/not-found";

const CoachDashboard = lazy(() => import("@/pages/coach/dashboard"));
const CoachExercises = lazy(() => import("@/pages/coach/exercises"));
const CoachExerciseDetail = lazy(() => import("@/pages/coach/exercise-detail"));
const CoachPrograms = lazy(() => import("@/pages/coach/programs"));
const CoachProgramBuilder = lazy(() => import("@/pages/coach/program-builder"));
const CoachRoster = lazy(() => import("@/pages/coach/roster"));
const CoachNutrition = lazy(() => import("@/pages/coach/nutrition"));
const CoachCalendar = lazy(() => import("@/pages/coach/calendar"));
const CoachAnalytics = lazy(() => import("@/pages/coach/analytics"));
const CoachLeaderboard = lazy(() => import("@/pages/coach/leaderboard"));
const CoachTeamBoard = lazy(() => import("@/pages/coach/team-board"));
const AthleteDashboard = lazy(() => import("@/pages/athlete/dashboard"));
const AthleteProgress = lazy(() => import("@/pages/athlete/progress"));
const AthleteTeamBoard = lazy(() => import("@/pages/athlete/team-board"));
const AthleteWorkout = lazy(() => import("@/pages/athlete/workout"));
const AthleteChat = lazy(() => import("@/pages/athlete/chat"));
const AthleteNutrition = lazy(() => import("@/pages/athlete/nutrition"));
const AthletePrograms = lazy(() => import("@/pages/athlete/programs"));
const AthleteProgramBuilder = lazy(() => import("@/pages/athlete/program-builder"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminExercises = lazy(() => import("@/pages/admin/exercises"));
const AdminExerciseDetail = lazy(() => import("@/pages/admin/exercise-detail"));
const AdminPrograms = lazy(() => import("@/pages/admin/programs"));
const AdminProgramBuilder = lazy(() => import("@/pages/admin/program-builder"));
const AdminReviewQueue = lazy(() => import("@/pages/admin/review-queue"));
const AdminAiKnowledge = lazy(() => import("@/pages/admin/ai-knowledge"));
const AdminNutritionKnowledge = lazy(() => import("@/pages/admin/nutrition-knowledge"));
const AdminMyCalendar = lazy(() => import("@/pages/admin/my-calendar"));
const AdminMyWorkout = lazy(() => import("@/pages/admin/my-workout"));
const AdminPlatformTrends = lazy(() => import("@/pages/admin/platform-trends"));

function FullScreenSpinner() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}

function homeFor(role: "coach" | "athlete" | "admin") {
  if (role === "coach") return "/coach";
  if (role === "admin") return "/admin";
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
  role: "coach" | "athlete" | "admin";
  component: ComponentType;
}) {
  const { user, isLoading, isError } = useAuth();

  if (isLoading) return <FullScreenSpinner />;
  // isError means the check itself failed to complete (network/server
  // blip) after retrying -- NOT a confirmed "you're logged out." Only a
  // completed check that actually came back with no user (user === null)
  // is a real logout; anything else keeps the athlete on their page rather
  // than guessing and unmounting it.
  if (isError && user === undefined) return <ConnectionProblem />;
  if (!user) return <Redirect to="/login" />;
  if (user.role !== role) {
    return <Redirect to={homeFor(user.role)} />;
  }
  return <Component />;
}

function HomeRedirect() {
  const { user, isLoading, isError } = useAuth();
  if (isLoading) return <FullScreenSpinner />;
  if (isError && user === undefined) return <ConnectionProblem />;
  if (!user) return <Redirect to="/login" />;
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
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/login" component={LoginPage} />
        <Route path="/admin/login" component={AdminLoginPage} />
        <Route path="/signup" component={SignupPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/coach">
          <ProtectedRoute role="coach" component={CoachDashboard} />
        </Route>
        <Route path="/coach/calendar">
          <ProtectedRoute role="coach" component={CoachCalendar} />
        </Route>
        <Route path="/coach/exercises/:id">
          <ProtectedRoute role="coach" component={CoachExerciseDetail} />
        </Route>
        <Route path="/coach/exercises">
          <ProtectedRoute role="coach" component={CoachExercises} />
        </Route>
        <Route path="/coach/programs/:id">
          <ProtectedRoute role="coach" component={CoachProgramBuilder} />
        </Route>
        <Route path="/coach/programs">
          <ProtectedRoute role="coach" component={CoachPrograms} />
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
        <Route path="/athlete">
          <ProtectedRoute role="athlete" component={AthleteDashboard} />
        </Route>
        <Route path="/athlete/progress">
          <ProtectedRoute role="athlete" component={AthleteProgress} />
        </Route>
        <Route path="/athlete/nutrition">
          <ProtectedRoute role="athlete" component={AthleteNutrition} />
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
        <Route path="/athlete/day/:assignmentId/:programDayId/:date">
          <ProtectedRoute role="athlete" component={AthleteWorkout} />
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
        <Route path="/admin/programs/:id">
          <ProtectedRoute role="admin" component={AdminProgramBuilder} />
        </Route>
        <Route path="/admin/programs">
          <ProtectedRoute role="admin" component={AdminPrograms} />
        </Route>
        <Route path="/admin/review">
          <ProtectedRoute role="admin" component={AdminReviewQueue} />
        </Route>
        <Route path="/admin/ai-knowledge">
          <ProtectedRoute role="admin" component={AdminAiKnowledge} />
        </Route>
        <Route path="/admin/nutrition-knowledge">
          <ProtectedRoute role="admin" component={AdminNutritionKnowledge} />
        </Route>
        <Route path="/admin/platform-trends">
          <ProtectedRoute role="admin" component={AdminPlatformTrends} />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster theme="dark" position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
