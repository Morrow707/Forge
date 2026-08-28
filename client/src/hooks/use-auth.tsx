import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient, useIsRestoring } from "@tanstack/react-query";
import { apiRequest, ApiError, getQueryFn, setNativeToken } from "@/lib/queryClient";
import { savePasswordToKeychain } from "@/lib/native-auth";
import { logDebug } from "@/lib/debug-console";
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
  dateOfBirth: string;
  guardianEmail?: string;
  sport?: string;
  position?: string;
  heightIn?: number;
  bodyWeightLbs?: number;
  agreedToTerms: true;
};

type LoginPayload = { email: string; password: string };
type LoginResult = { mfaRequired: true; mfaToken: string } | (PublicUser & { nativeToken?: string });

type AuthContextValue = {
  user: PublicUser | null | undefined;
  isLoading: boolean;
  // True once the auth check has failed and exhausted its retries without
  // ever getting a real answer (network error, server unreachable) --
  // distinct from user === null, which means the server actively said "no
  // one is logged in." See AuthProvider's own comment on the query above.
  isError: boolean;
  loginMutation: ReturnType<typeof useLoginMutation>;
  mfaVerifyMutation: ReturnType<typeof useMfaVerifyMutation>;
  signupMutation: ReturnType<typeof useSignupMutation>;
  logoutMutation: ReturnType<typeof useLogoutMutation>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Shared by both a plain password-only login and the second step of an
// MFA login (useMfaVerifyMutation below) -- same session-established side
// effects either way, just reached via a different request.
function applyLoginSuccess(
  qc: ReturnType<typeof useQueryClient>,
  nativeToken: string | undefined,
  user: PublicUser,
  credentials: { email: string; password: string },
) {
  logDebug("AUTH", `login succeeded, nativeToken=${nativeToken ? "present" : "absent"}`);
  setNativeToken(nativeToken);
  qc.setQueryData(["/api/auth/me"], user);
  // A stalled session earlier in this browser/app may have left a workout
  // log queued locally instead of lost -- replay it now that there's a
  // fresh, confirmed-valid session to save it against, rather than waiting
  // on a full app reload or a network 'online' event that might never fire
  // again.
  flushPendingLogs();
  logDebug("AUTH", "calling savePasswordToKeychain()...");
  // Temporary visible surfacing while this is being debugged on-device
  // (see native-auth.ts's own comment) -- a TestFlight tester has no way
  // to see the console.error there, and this has been silently failing,
  // so a toast is the only way to find out why without a Mac/Xcode in
  // hand.
  savePasswordToKeychain(credentials.email, credentials.password)
    .then(() => logDebug("AUTH", "savePasswordToKeychain() resolved"))
    .catch((err) => {
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      logDebug("AUTH", `savePasswordToKeychain() rejected: ${detail}`);
      toast.error(err instanceof Error ? `Couldn't save password: ${err.message}` : "Couldn't save password");
    });
}

function useLoginMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LoginPayload) => {
      logDebug("AUTH", `login mutation start (${payload.email})`);
      const res = await apiRequest("POST", "/api/auth/login", payload);
      logDebug("AUTH", `login POST responded ${res.status}`);
      return (await res.json()) as LoginResult;
    },
    onSuccess: (result, variables) => {
      // Password was right, but this account needs a second factor too --
      // the login page reads this off loginMutation.data to switch to the
      // code-entry step. Nothing about a session gets established yet.
      if ("mfaRequired" in result) {
        logDebug("AUTH", "login requires MFA");
        return;
      }
      const { nativeToken, ...user } = result;
      applyLoginSuccess(qc, nativeToken, user, variables);
    },
    onError: (err: ApiError) => {
      logDebug("AUTH", `login failed: ${err.status} ${err.message}`);
      toast.error(err.message || "Login failed");
    },
  });
}

function useMfaVerifyMutation() {
  const qc = useQueryClient();
  return useMutation({
    // email/password ride along purely for applyLoginSuccess's keychain
    // save below -- never sent to the server, which already knows who
    // this is from mfaToken.
    mutationFn: async (payload: { mfaToken: string; code: string; email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/mfa/verify-login", {
        mfaToken: payload.mfaToken,
        code: payload.code,
      });
      return (await res.json()) as PublicUser & { nativeToken?: string };
    },
    onSuccess: ({ nativeToken, ...user }, variables) => {
      applyLoginSuccess(qc, nativeToken, user, variables);
    },
    onError: (err: ApiError) => toast.error(err.message || "Invalid code"),
  });
}

function useSignupMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SignupPayload) => {
      logDebug("AUTH", `signup mutation start (${payload.email})`);
      const res = await apiRequest("POST", "/api/auth/signup", payload);
      logDebug("AUTH", `signup POST responded ${res.status}`);
      return (await res.json()) as PublicUser & { nativeToken?: string };
    },
    onSuccess: ({ nativeToken, ...user }, variables) => {
      logDebug("AUTH", `signup succeeded, nativeToken=${nativeToken ? "present" : "absent"}`);
      applyLoginSuccess(qc, nativeToken, user, variables);
    },
    onError: (err: ApiError) => {
      logDebug("AUTH", `signup failed: ${err.status} ${err.message}`);
      toast.error(err.message || "Signup failed");
    },
  });
}

function useLogoutMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      logDebug("AUTH", "logout mutation start");
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      logDebug("AUTH", "logout succeeded, clearing nativeToken + query cache");
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
    isLoading: isFetching,
    isError,
  } = useQuery<PublicUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
  // PersistQueryClientProvider (App.tsx) restores this query's last-known
  // value from localStorage asynchronously on every fresh page load --
  // useQuery's own isLoading only reflects whether ITS fetch has resolved,
  // not whether that restore has finished, so a hard reload/deep link
  // straight into a protected route had a real window where isLoading was
  // already false with user still undefined. ProtectedRoute saw that as
  // "confirmed logged out," redirected to /login, and login.tsx's own
  // already-logged-in redirect then bounced to the role's default home the
  // instant the real session data arrived a moment later -- losing
  // whatever nested route was actually being loaded. useIsRestoring folded
  // into isLoading closes that window.
  const isRestoring = useIsRestoring();
  const isLoading = isFetching || isRestoring;

  const loginMutation = useLoginMutation();
  const mfaVerifyMutation = useMfaVerifyMutation();
  const signupMutation = useSignupMutation();
  const logoutMutation = useLogoutMutation();

  useEffect(() => {
    if (isLoading) return;
    logDebug("AUTH", isError ? "auth/me check errored" : `auth/me resolved: ${user ? `logged in as ${user.role}` : "logged out"}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isError, user]);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isError, loginMutation, mfaVerifyMutation, signupMutation, logoutMutation }}
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
