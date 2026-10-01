/** THE FAQ ON /for-high-schools, and the FAQPage schema behind it.
 *
 * Parked by Scott 2026-09-20 ("flag those 3 needs, we can do those later") and built 2026-10-01
 * for the store launch; Scott reads it before it ships. Every answer is a fact this repo can
 * stand behind, and the numbers are read from the constants that define them so the FAQ cannot
 * drift from the pricing page or the validated-movement list. Written for an athletic director,
 * in words that make no legal conclusion: "FERPA does not apply" is a fact about what Forge
 * receives, "a guardian claims the account" is a description of what the software does.
 *
 * Two words never appear in an answer: "accurate" and "compliant". The first because
 * shared/seo-head.test.ts refuses structured data that makes a measurement claim, and the
 * honest statement of the camera's state lives in shared/camera-accuracy-copy.ts on the page.
 * The second because whether an emailed claim link is verifiable consent is with counsel
 * (docs/legal-open-questions.md, question 5), and this page describes the mechanism instead. */
import { ORG_PER_ATHLETE_CENTS } from "./billing-tiers";
import { MOVEMENTS } from "./movement-library";
import { VIDEO_RETENTION } from "./video-retention";

export type FaqEntry = { question: string; answer: string };

const perAthlete = `$${(ORG_PER_ATHLETE_CENTS / 100).toFixed(0)}`;
const validated = MOVEMENTS.map((m) => m.name.toLowerCase());
const validatedList = `${validated.slice(0, -1).join(", ")} and ${validated[validated.length - 1]}`;

export const HIGH_SCHOOLS_FAQ: FaqEntry[] = [
  {
    question: "What does Forge cost a school?",
    answer: `${perAthlete} per athlete per month, in roster bands, with no per-coach fee. During the beta nothing is charged: a school picks its band at signup by typing how many athletes it expects, and billing is switched on for everyone at the same time, later.`,
  },
  {
    question: "What happens when an athlete under 18 is added to a roster?",
    answer: "The account is created inert. It cannot log a workout, open a program or use the camera until a parent or legal guardian claims a linked account from an email and agrees to the documents on the child's behalf. The coach attests to the guardian relationship when adding the athlete, and the guardian's own claim is what the record shows as the consent.",
  },
  {
    question: "Does Forge handle school records under FERPA?",
    answer: "No. Forge receives a name, gender, age, sport and position, which is directory information, the category schools already disclose about their athletes. It never receives grades, transcripts, discipline or anything from a student information system. A data-processing addendum a particular district requires can be signed; it is procurement paperwork, not a change to what Forge holds.",
  },
  {
    question: "Where does our athletes' data live?",
    answer: "On Render, in the United States: the database and every uploaded video and document. Stripe sees payment details and Apple sees sign-in. The AI provider receives the text of a request at the moment a coaching question is asked and stores nothing. No data is sold and none is used for advertising.",
  },
  {
    question: "Can more than one coach work a team?",
    answer: "Yes. A head coach adds assistant coaches to the staff with an invite code, and can assign coaches to specific teams so an assistant sees only their own athletes. A staff coach with no assignment sees the whole program, which is how most small staffs run.",
  },
  {
    question: "What does the camera actually measure today?",
    answer: `Bar velocity, range of motion and power for a filmed set, and jump height for a jump. ${validatedList} have been checked against a bar sensor; every other movement is unvalidated and the app says so wherever a camera number appears. The video itself records and plays back correctly for form review regardless.`,
  },
  {
    question: "Does the camera tell athletes where to stand?",
    answer: "No. An athlete films from any angle and the app measures what it can; nothing after a take tells anyone their angle was wrong. A number that may be off is shown with a notice, never withheld.",
  },
  {
    question: "How long is video kept?",
    answer: `A team's form-check videos are kept under a per-athlete cap (${VIDEO_RETENTION.totalCap} clips, ${VIDEO_RETENTION.favoritedCap} of them favourited) unless the school adds storage. When a clip is purged the measurements taken from it stay; only the file goes.`,
  },
  {
    question: "What happens when an athlete leaves or deletes their account?",
    answer: "Deleting the account removes the account and everything that cascades from it. The one exception is an athlete who opted in to anonymised research and agreed, in that consent, that the de-identified record survives deletion; withdrawing from research first, then deleting, leaves nothing.",
  },
  {
    question: "Which documents does a school sign?",
    answer: "A primary coach fills in and signs the Service Agreement in the app, or uploads a signed paper copy. Athletes and guardians agree to the Terms of Use, the Assumption of Risk and the Video and Biometric Consent at signup or claim. Every document is on the site to read and download before anyone signs anything.",
  },
];

/** schema.org FAQPage for the route, from the same list the page renders. */
export function highSchoolsFaqJsonLd() {
  return {
    "@type": "FAQPage",
    mainEntity: HIGH_SCHOOLS_FAQ.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}
