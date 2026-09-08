/**
 * How a person wants to be spoken to.
 *
 * Nothing in Forge stored this before. Every assistant answered every reader
 * the same way, so a strength coach with a masters degree and a fifteen year
 * old on their first program got identical prose.
 *
 * Two axes, deliberately, because they are independent: a coach may want
 * technical language in two sentences, and an athlete plain language at
 * length. Collapsing them into one "expertise" slider forces a choice
 * neither reader made.
 *
 * The default on both is the middle. An assistant that changes its voice
 * before anyone asks it to is worse than one that never does.
 */

export const ANSWER_REGISTERS = [
  {
    key: "plain",
    label: "Plain English",
    instruction:
      "Write in plain, everyday language. Avoid technical terms; where one is unavoidable, explain it in the same sentence. Do not use jargon as shorthand.",
  },
  {
    key: "standard",
    label: "Standard",
    instruction: "",
  },
  {
    key: "technical",
    label: "Technical",
    instruction:
      "Use the field's proper terminology without stopping to define it. Assume the reader knows what velocity loss, ACWR, eccentric overload and RED-S mean. Cite mechanisms rather than analogies.",
  },
] as const;

export const ANSWER_LENGTHS = [
  {
    key: "brief",
    label: "Brief",
    instruction: "Answer in at most three sentences. Lead with the answer. Leave things out rather than compressing them.",
  },
  { key: "standard", label: "Standard", instruction: "" },
  {
    key: "thorough",
    label: "Thorough",
    instruction:
      "Give the reasoning as well as the answer, including what would change it. Still no padding: every sentence earns its place.",
  },
] as const;

export type AnswerRegister = (typeof ANSWER_REGISTERS)[number]["key"];
export type AnswerLength = (typeof ANSWER_LENGTHS)[number]["key"];

export const DEFAULT_ANSWER_REGISTER: AnswerRegister = "standard";
export const DEFAULT_ANSWER_LENGTH: AnswerLength = "standard";

export function isAnswerRegister(v: string): v is AnswerRegister {
  return ANSWER_REGISTERS.some((r) => r.key === v);
}
export function isAnswerLength(v: string): v is AnswerLength {
  return ANSWER_LENGTHS.some((l) => l.key === v);
}

/**
 * The instruction block for a reader's preferences, or "" for the defaults.
 *
 * Returns empty rather than a paragraph saying "be normal", so a reader who
 * has never touched the setting costs nothing in prompt tokens and gets
 * exactly the behaviour they had before this existed.
 *
 * This is a STYLE instruction and says so, because the failure mode is a
 * model reading "be brief" as permission to drop a safety caveat. The
 * wording makes the boundary explicit rather than hoping.
 */
export function answerStyleInstruction(
  register: string | null | undefined,
  length: string | null | undefined,
): string {
  const parts = [
    ANSWER_REGISTERS.find((r) => r.key === register)?.instruction,
    ANSWER_LENGTHS.find((l) => l.key === length)?.instruction,
  ].filter((v): v is NonNullable<typeof v> => !!v);

  if (parts.length === 0) return "";

  return [
    "How this reader wants to be written to. This governs STYLE ONLY -- never",
    "what you are willing to say. A brevity or plain-language preference is",
    "never a reason to drop a caution, a referral, or a rule you are bound by;",
    "shorten the explanation around it instead.",
    "",
    ...parts.map((p) => `- ${p}`),
  ].join("\n");
}
