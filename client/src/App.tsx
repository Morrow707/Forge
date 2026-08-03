import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { lazy, Suspense, type ComponentType } from "react";
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
const CoachCalendar = lazy(() => import("@/pages/coach/calendar"));
const CoachAnalytics = lazy(() => import("@/pages/coach/analytics"));
const CoachLeaderboard = lazy(() => import("@/pages/coach/leaderboard"));
const CoachTeamBoard = lazy(() => import("@/pages/coach/team-board"));
const AthleteDashboard = lazy(() => import("@/pages/athlete/dashboard"));
const AthleteProgress = lazy(() => import("@/pages/athlete/progress"));
const AthleteTeamBoard = lazy(() => import("@/pages/athlete/team-board"));
const AthleteWorkout = lazy(() => import("@/pages/athlete/workout"));
const AthleteChat = lazy(() => import("@/pages/athlete/chat"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminExercises = lazy(() => import("@/pages/admin/exercises"));
const AdminExerciseDetail = lazy(() => import("@/pages/admin/exercise-detail"));
const AdminPrograms = lazy(() => import("@/pages/admin/programs"));
const AdminProgramBuilder = lazy(() => import("@/pages/admin/program-builder"));
const AdminReviewQueue = lazy(() => import("@/pages/admin/review-queue"));

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

function ProtectedRoute({
  role,
  component: Component,
}: {
  role: "coach" | "athlete" | "admin";
  component: ComponentType;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <FullScreenSpinner />;
  if (!user) return <Redirect to="/login" />;
  if (user.role !== role) {
    return <Redirect to={homeFor(user.role)} />;
  }
  return <Component />;
}

function HomeRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenSpinner />;
  if (!user) return <Redirect to="/login" />;
  return <Redirect to={homeFor(user.role)} />;
}

function Router() {
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
        <Route path="/athlete/team-board">
          <ProtectedRoute role="athlete" component={AthleteTeamBoard} />
        </Route>
        <Route path="/athlete/chat">
          <ProtectedRoute role="athlete" component={AthleteChat} />
        </Route>
        <Route path="/athlete/day/:assignmentId/:programDayId/:date">
          <ProtectedRoute role="athlete" component={AthleteWorkout} />
        </Route>
        <Route path="/admin">
          <ProtectedRoute role="admin" component={AdminDashboard} />
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
