// Counsel's Apple Health disclosure, verbatim from the Privacy Policy (section 7, "How we share
// information"). It is the sentence an athlete has to be able to read BEFORE the phone's Health
// permission sheet opens, on every surface that can open it: the Settings switch, the daily
// check-in's first-time ask, and the check-in's Sync button. The permission sheet itself only
// says what Forge reads; this says where it goes, which is the part counsel asked for and the
// part Apple reads an app for.
//
// One constant so the three surfaces cannot drift from each other or from the policy;
// `client/src/lib/apple-health-disclosure-reads-first.test.ts` pins it against the policy text
// and asserts no surface asks for Health access without rendering it.
export const APPLE_HEALTH_DISCLOSURE =
  "When Apple Health sync is enabled, Forge transmits pre-filled daily check-in metrics (including sleep, heart rate, HRV, VO2 max, respiratory rate, weight, and session heart rate) to our third-party AI provider strictly to generate real-time training recommendations. This data is processed securely, is never sold or used for advertising, and is never retained to train third-party AI models.";
