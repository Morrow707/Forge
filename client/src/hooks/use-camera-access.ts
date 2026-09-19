import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export type CameraAccessReason =
  | "coach_or_admin"
  | "coached_athlete"
  | "entitled"
  | "tier_excludes_camera";

export type CameraAccess = { allowed: boolean; reason: CameraAccessReason };

/** What a caller gets back. `allowed` is undefined until the server answers AND after a failed
 * read, so `?.allowed === true` stays the only way to draw a camera control. `failed` is what was
 * missing: a failed read used to look exactly like a slow one, so a coach whose record button
 * never appeared had nothing to act on and no way to tell the two apart. */
export type CameraAccessState = {
  allowed: boolean | undefined;
  reason: CameraAccessReason | undefined;
  failed: boolean;
  retry: () => void;
};

/**
 * Whether this person may use camera tracking at all.
 *
 * ASKED OF THE SERVER, NEVER WORKED OUT HERE. The rule has three branches -- a coach or admin
 * filming their own training always may, a coached athlete always may because their video is
 * bounded by the team's retention cap rather than by a tier, and a Free Agent may only on a tier
 * that includes video form-check. Reimplementing that in the client would mean two copies of a
 * rule whose disagreement is invisible until it strands somebody mid-set, so this asks
 * /api/athlete/camera-access, which is the exact function the upload routes gate on.
 *
 * WHAT THIS FIXES. Nothing client-side asked the question before: the record button was drawn
 * whenever an exercise had a tracking level. A Basic or AI Coach Free Agent saw the button,
 * filmed a set, watched it analyse, and only then hit a 402 when the clip tried to upload -- so
 * they got the numbers on screen and lost the video. That is the worst possible order to
 * discover a paywall in, and it reads as a bug rather than a price.
 *
 * `undefined` while the answer is not known yet, and callers must treat that as "not yet"
 * rather than as "no" OR as "yes". Same convention as useIsFreeAgent, and here it cuts both
 * ways: defaulting to yes flashes a record button at somebody who cannot use it, and defaulting
 * to no flashes its absence at a coach who can.
 *
 * NOT A PERMISSION CHECK. Hiding a button is presentation. The routes that save a clip keep
 * their own gate, which is the one that actually decides.
 */
export function useCameraAccess(): CameraAccessState {
  const { user } = useAuth();
  const eligible = !!user && ["athlete", "coach", "admin"].includes(user.role);
  const { data, isError, refetch } = useQuery<CameraAccess>({
    queryKey: ["/api/athlete/camera-access"],
    enabled: eligible,
    // The answer changes only when somebody's subscription or roster does, neither of which
    // happens mid-workout. Re-asking on every window focus would put a request behind every
    // glance at the screen during a set.
    staleTime: 5 * 60 * 1000,
  });
  if (!eligible) {
    return { allowed: false, reason: "tier_excludes_camera", failed: false, retry: () => {} };
  }
  // A failed read stays "not allowed" for the controls -- undefined is never a yes -- but it is
  // reported as failed so the page can say so and offer a retry, rather than a silent absence.
  return {
    allowed: data?.allowed,
    reason: data?.reason,
    failed: isError,
    retry: () => void refetch(),
  };
}
