import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError, getQueryFn, setNativeToken } from "@/lib/queryClient";
import { savePasswordToKeychain } from "@/lib/native-auth";
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
  // True once the auth check has failed and exhausted its retries without
  // ever getting a real answer (network error, server unreachable) --
  // distinct from user === null, which means the server actively said "no
  // one is logged in." See AuthProvider's own comment on the query above.
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
      return (await res.json()) as PublicUser & { nativeToken?: string };
    },
    onSuccess: ({ nativeToken, ...user }, variables) => {
      setNativeToken(nativeToken);
      qc.setQueryData(["/api/auth/me"], user);
      // Temporary visible surfacing while this is being debugged on-device
      // (see native-auth.ts's own comment) -- a TestFlight tester has no
      // way to see the console.error there, and this has been silently
      // failing, so a toast is the only way to find out why without a
      // Mac/Xcode in hand.
      savePasswordToKeychain(variables.email, variables.password).catch((err) => {
        toast.error(err instanceof Error ? `Couldn't save password: ${err.message}` : "Couldn't save password");
      });
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
    onSuccess: ({ nativeToken, ...user }, variables) => {
      setNativeToken(nativeToken);
      qc.setQueryData(["/api/auth/me"], user);
      // Temporary visible surfacing while this is being debugged on-device
      // (see native-auth.ts's own comment) -- a TestFlight tester has no
      // way to see the console.error there, and this has been silently
      // failing, so a toast is the only way to find out why without a
      // Mac/Xcode in hand.
      savePasswordToKeychain(variables.email, variables.password).catch((err) => {
        toast.error(err instanceof Error ? `Couldn't save password: ${err.message}` : "Couldn't save password");
      });
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

export function AuthProvider({ children }: { children: ReactNode }) {
  // The one query in the app that wants a 401 treated as valid data --
  // "no one is logged in" -- rather than an error (see queryClient.ts).
  // Retries against the global default (retry: false) specifically because
  // this query runs right on app resume from background, exactly the
  // moment a mobile OS's network interface is most likely to still be
  // re-establishing itself -- a transient failure here used to look
  // identical to "not logged in" to every caller (both collapsed to a
  // falsy `user`), bouncing someone with a completely valid session back
  // to the login form over a one-off network blip. isError is exposed
  // below specifically so ProtectedRoute/HomeRedirect can tell "confirmed
  // logged out" (user === null) apart from "couldn't check" (isError, user
  // stays undefined) and stop short of a wrong redirect in the second case.
  const {
    data: user,
    isLoading,
    isError,
  } = useQuery<PublicUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
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
