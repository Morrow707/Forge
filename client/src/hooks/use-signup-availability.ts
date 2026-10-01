import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";

/** IS SIGN-UP OPEN, and does this visitor hold the invite code.
 *
 * Asks GET /api/public/signup-availability, the same rule POST /api/auth/signup gates on
 * (server/signup-availability.ts). The answer only decides what to DRAW: "Get started" or
 * "Coming soon". The route is the gate.
 *
 * The invite code arrives on the URL (/signup?invite=CODE, the link Scott sends a tester) or is
 * typed on the signup page, and is kept in sessionStorage so the marketing pages open up for
 * that visitor too and the code survives a tap from the landing page to /signup. Session, not
 * local: closing the browser forgets it, which is the right default for a code that is not the
 * visitor's own credential.
 *
 * `canSignUp` is undefined until the server answers, same convention as useCameraAccess: a
 * caller must not read "unknown" as either yes or no. The CTA draws a neutral state until then.
 */
const INVITE_KEY = "forge-signup-invite";

export function readStoredInvite(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("invite");
    if (fromUrl) {
      sessionStorage.setItem(INVITE_KEY, fromUrl.trim());
      return fromUrl.trim();
    }
    return sessionStorage.getItem(INVITE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storeInvite(code: string): void {
  try {
    if (code.trim()) sessionStorage.setItem(INVITE_KEY, code.trim());
    else sessionStorage.removeItem(INVITE_KEY);
  } catch {
    // Storage blocked: the code still works for this page through state.
  }
}

export type SignupAvailability = {
  /** Public sign-up is open to everyone. */
  open: boolean | undefined;
  /** This visitor may sign up: open, or closed with an accepted invite code. */
  canSignUp: boolean | undefined;
  /** The invite the visitor holds, accepted or not. */
  inviteCode: string;
  setInviteCode: (code: string) => void;
  /** Closed, a code was given, and the server did not accept it. */
  inviteRejected: boolean;
};

export function useSignupAvailability(): SignupAvailability {
  const [inviteCode, setInviteCodeState] = useState<string>(() => readStoredInvite());
  const { data } = useQuery<{ open: boolean; inviteAccepted: boolean }>({
    queryKey: ["/api/public/signup-availability", inviteCode],
    queryFn: () =>
      getJson(`/api/public/signup-availability${inviteCode ? `?invite=${encodeURIComponent(inviteCode)}` : ""}`),
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => {
    storeInvite(inviteCode);
  }, [inviteCode]);
  const open = data?.open;
  const canSignUp = data === undefined ? undefined : data.open || data.inviteAccepted;
  return {
    open,
    canSignUp,
    inviteCode,
    setInviteCode: (code) => setInviteCodeState(code.trim()),
    inviteRejected: data !== undefined && !data.open && inviteCode.length > 0 && !data.inviteAccepted,
  };
}
