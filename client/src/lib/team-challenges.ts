export type ChallengeMetric = "workouts_completed" | "total_reps" | "total_volume";

export type TeamChallenge = {
  id: number;
  teamId: number;
  teamName: string;
  title: string;
  metric: ChallengeMetric;
  targetValue: number | null;
  startDate: string;
  endDate: string;
  progress: {
    teamTotal: number;
    target: number | null;
    // athleteId is on the COACH's board only. The athlete's Squad Quests card gets teammates as
    // the leaderboard shows them -- first name, last initial, no id (see the route's comment).
    perAthlete: { athleteId?: number; name: string; contribution: number; isYou?: boolean }[];
  };
};

export const CHALLENGE_METRIC_LABEL: Record<ChallengeMetric, string> = {
  workouts_completed: "Workouts Completed",
  total_reps: "Total Reps",
  total_volume: "Total Volume (lbs)",
};
