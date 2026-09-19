import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export type SkillsAccessReason =
  | "coach_or_admin"
  | "coached_athlete"
  | "entitled"
  | "tier_excludes_skills";

export type SkillsAccess = { allowed: boolean; reason: SkillsAccessReason };

/**
 * Whether this person may use the skills side -- skill programs, the Skill Bank, skill sessions.
 *
 * Sibling of useCameraAccess, deliberately, down to the "undefined until answered and every
 * caller requires an explicit true" convention. Skills moved onto the camera tier because a skill
 * drill IS a camera measurement (sprint timing, mechanics scoring), so the two questions travel
 * together even though they stay separate functions.
 *
 * Asked of the server rather than derived here, for the same reason: the rule has three branches
 * (coach or admin, coached athlete, Free Agent tier) and two copies of it disagree silently.
 *
 * NOT A PERMISSION CHECK. Hiding a tab is presentation; the skill routes keep their own gates.
 */
export function useSkillsAccess(): SkillsAccess | undefined {
  const { user } = useAuth();
  const { data } = useQuery<SkillsAccess>({
    queryKey: ["/api/athlete/skills-access"],
    enabled: !!user && ["athlete", "coach", "admin"].includes(user.role),
    staleTime: 5 * 60 * 1000,
  });
  if (!user || !["athlete", "coach", "admin"].includes(user.role)) {
    return { allowed: false, reason: "tier_excludes_skills" };
  }
  return data;
}
