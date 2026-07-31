import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import type { ComponentType } from "react";

import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import NotFound from "@/pages/not-found";
import CoachDashboard from "@/pages/coach/dashboard";
import CoachExercises from "@/pages/coach/exercises";
import CoachPrograms from "@/pages/coach/programs";
import CoachProgramBuilder from "@/pages/coach/program-builder";
import CoachRoster from "@/pages/coach/roster";
import CoachCalendar from "@/pages/coach/calendar";
import AthleteDashboard from "@/pages/athlete/dashboard";
import AthleteWorkout from "@/pages/athlete/workout";

function FullScreenSpinner() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}

function ProtectedRoute({
  role,
  component: Component,
}: {
  role: "coach" | "athlete";
  component: ComponentType;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <FullScreenSpinner />;
  if (!user) return <Redirect to="/login" />;
  if (user.role !== role) {
    return <Redirect to={user.role === "coach" ? "/coach" : "/athlete"} />;
  }
  return <Component />;
}

function HomeRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenSpinner />;
  if (!user) return <Redirect to="/login" />;
  return <Redirect to={user.role === "coach" ? "/coach" : "/athlete"} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/coach">
        <ProtectedRoute role="coach" component={CoachDashboard} />
      </Route>
      <Route path="/coach/calendar">
        <ProtectedRoute role="coach" component={CoachCalendar} />
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
      <Route path="/athlete">
        <ProtectedRoute role="athlete" component={AthleteDashboard} />
      </Route>
      <Route path="/athlete/day/:assignmentId/:programDayId/:date">
        <ProtectedRoute role="athlete" component={AthleteWorkout} />
      </Route>
      <Route component={NotFound} />
    </Switch>
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
