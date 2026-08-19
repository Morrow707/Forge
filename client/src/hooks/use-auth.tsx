import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError, setNativeToken } from "@/lib/queryClient";
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
      return (await res.json()) as PublicUser & { nativeToken?: string };
    },
    onSuccess: ({ nativeToken, ...user }) => {
      setNativeToken(nativeToken);
      qc.setQueryData(["/api/auth/me"], user);
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
      return (await res.json()) as PublicUser & { nativeToken?: string };
    },
    onSuccess: ({ nativeToken, ...user }) => {
      setNativeToken(nativeToken);
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
      setNativeToken(null);
      qc.setQueryData(["/api/auth/me"], null);
      qc.clear();
    },
  });
}

// ProtectedRoute unmounts every page in the app -- including a mid-workout
// athlete's only copy of whatever isn't saved yet -- the instant this comes
// back "no user." A phone waking from being backgrounded (screen lock, a
// gym wifi dead zone, the 'online' event firing a beat before the
// connection is actually stable) very often fires this check's first
// attempt before the network is really back, so -- same reasoning as the
// day-detail query in workout.tsx -- a raw failed fetch gets a couple of
// quick retries before being believed. An ApiError means the server itself
// answered; on401 already resolves a real 401 to `null` without throwing,
// so anything that reaches the catch here is either a different ApiError
// (a real problem, rethrown immediately) or the request never completing.
async function fetchCurrentUser(): Promise<PublicUser | null> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await apiRequest("GET", "/api/auth/me");
      return (await res.json()) as PublicUser;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) return null;
        throw err;
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useQuery<PublicUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: fetchCurrentUser,
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
