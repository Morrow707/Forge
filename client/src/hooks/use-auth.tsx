import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError, getQueryFn } from "@/lib/queryClient";
import { flushPendingLogs } from "@/lib/offline-queue";
import { toast } from "sonner";
import type { PublicUser } from "@shared/schema";

type SignupPayload = {
  email: string;
  password: string;
  name: string;
  role: "coach" | "athlete";
  coachCode?: string;
  phone?: string;
};

type LoginPayload = { email: string; password: string };

type AuthContextValue = {
  user: PublicUser | null | undefined;
  isLoading: boolean;
  // True only when the "who am I" check itself failed to complete (network
  // blip, server hiccup) after retrying -- NOT when it completed and came
  // back confirming no one is logged in. Callers that gate on `user` being
  // falsy (see ProtectedRoute) need this to tell "definitely logged out" apart
  // from "couldn't find out either way," so a flaky connection at the exact
  // moment this check runs can't get misread as a real logout and boot
  // someone off a page mid-task.
  isError: boolean;
  loginMutation: ReturnType<typeof useLoginMutation>;
  signupMutation: ReturnType<typeof useSignupMutation>;
  logoutMutation: ReturnType<typeof useLogoutMutation>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function useLoginMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const res = await apiRequest("POST", "/api/auth/login", payload);
      return (await res.json()) as PublicUser;
    },
    onSuccess: (user) => {
      qc.setQueryData(["/api/auth/me"], user);
      // A stalled session earlier in this browser (see workout.tsx's
      // unmount-flush) may have left a workout log queued locally instead
      // of lost -- replay it now that there's a fresh, confirmed-valid
      // session to save it against, rather than waiting on a full app
      // reload or a network 'online' event that might never fire.
      flushPendingLogs();
    },
    onError: (err: ApiError) => {
      toast.error(err.message || "Login failed");
    },
  });
}

function useSignupMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SignupPayload) => {
      const res = await apiRequest("POST", "/api/auth/signup", payload);
      return (await res.json()) as PublicUser;
    },
    onSuccess: (user) => {
      qc.setQueryData(["/api/auth/me"], user);
    },
    onError: (err: ApiError) => {
      toast.error(err.message || "Signup failed");
    },
  });
}

function useLogoutMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      qc.setQueryData(["/api/auth/me"], null);
      qc.clear();
    },
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // The one query in the app that wants a 401 treated as valid data --
  // "no one is logged in" -- rather than an error (see queryClient.ts).
  //
  // Retries here matter more than on any other query: this is what decides
  // whether ProtectedRoute keeps someone on their page or boots them to
  // /login. The global default is `retry: false`, which is fine for most
  // queries -- but for this one, a single dropped packet (gym wifi, a phone
  // waking from being backgrounded) reads as "not logged in" and unmounts
  // whatever page they were mid-task on. A real 401 doesn't need retrying
  // (getQueryFn already resolves that to `null` without throwing); this
  // retry only covers the connection actually failing to complete, so a
  // momentary blip gets a couple of quick second chances before anything
  // downstream treats it as a confirmed logout.
  const {
    data: user,
    isLoading,
    isError,
  } = useQuery<PublicUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });

  const loginMutation = useLoginMutation();
  const signupMutation = useSignupMutation();
  const logoutMutation = useLogoutMutation();

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isError, loginMutation, signupMutation, logoutMutation }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
