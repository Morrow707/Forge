import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export type SkillsAccessReason =
  | "coach_or_admin"
  | "coached_athlete"
  | "entitled"
  | "tier_excludes_skills";

export type SkillsAccess = { allowed: boolean; reason: SkillsAccessReason };

/** What a caller gets back. `allowed` is undefined until the server answers AND after a failed
 * read, so `?.allowed === true` stays the only way to draw a skills control. `failed` is the
 * part that used to be missing: without it a failed read was indistinguishable from a slow one,
 * and the skills gate spun forever with no retry. */
export type SkillsAccessState = {
  allowed: boolean | undefined;
  reason: SkillsAccessReason | undefined;
  failed: boolean;
  retry: () => void;
};

/**
 * Whether this person may use the skills side -- skill programs, the Skill Bank, skill sessions.
 *
 * Sibling of useCameraAccess, deliberately, down to the "allowed is undefined until answered and
 * every caller requires an explicit true" convention. Skills moved onto the camera tier because
 * a skill drill IS a camera measurement (sprint timing, mechanics scoring), so the two questions
 * travel together even though they stay separate functions.
 *
 * Asked of the server rather than derived here, for the same reason: the rule has three branches
 * (coach or admin, coached athlete, Free Agent tier) and two copies of it disagree silently.
 *
 * A FAILED READ IS SAID, NOT SPUN THROUGH. The query client does not retry, so one failed request
 * is the final answer until somebody asks again. Leaving `allowed` undefined on error was the
 * "invisible" shape CLAUDE.md warns about: the gate guards on undefined, undefined never resolves,
 * and a flaky network on the skills tab became a spinner nobody could get out of. `failed` and
 * `retry` exist so the gate can say what happened and offer the one action that helps.
 *
 * NOT A PERMISSION CHECK. Hiding a tab is presentation; the skill routes keep their own gates.
 */
export function useSkillsAccess(): SkillsAccessState {
  const { user } = useAuth();
  const eligible = !!user && ["athlete", "coach", "admin"].includes(user.role);
  const { data, isError, refetch } = useQuery<SkillsAccess>({
    queryKey: ["/api/athlete/skills-access"],
    enabled: eligible,
    staleTime: 5 * 60 * 1000,
  });
  if (!eligible) {
    return { allowed: false, reason: "tier_excludes_skills", failed: false, retry: () => {} };
  }
  return {
    allowed: data?.allowed,
    reason: data?.reason,
    failed: isError,
    retry: () => void refetch(),
  };
}
