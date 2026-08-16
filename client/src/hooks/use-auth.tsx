import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError, getQueryFn } from "@/lib/queryClient";
import { toast } from "sonner";
import type { PublicUser } from "@shared/schema";

type SignupPayload = {
  email: string;
  password: string;
  name: string;
  role: "coach" | "athlete";
  coachCode?: string;
  phone?: string;
  agreedToTerms: true;
};

type LoginPayload = { email: string; password: string };

type AuthContextValue = {
  user: PublicUser | null | undefined;
  isLoading: boolean;
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
    },
    onError: (err: ApiError) => {
      // TEMPORARY diagnostic: a raw window.alert() bypasses sonner's toast
      // queue/rendering entirely and can't be missed, unlike the toast
      // below -- narrowing down a login failure on native iOS whose message
      // hasn't changed across multiple otherwise-different app builds,
      // which means something isn't taking effect the way it looks like it
      // should. Remove once that's root-caused.
      alert(
        `name: ${err?.name}\nmessage: ${err?.message}\nstack: ${err?.stack || "(none)"}`,
      );
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
  const { data: user, isLoading } = useQuery<PublicUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useLoginMutation();
  const signupMutation = useSignupMutation();
  const logoutMutation = useLogoutMutation();

  return (
    <AuthContext.Provider
      value={{ user, isLoading, loginMutation, signupMutation, logoutMutation }}
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
