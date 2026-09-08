/**
 * Letting an assistant ask instead of guess.
 *
 * Almost every AI call in Forge is one shot: a question goes in, a
 * structured answer comes out, and there is no shape in the response that
 * means "I need to know something before I can answer this". So when a
 * question is genuinely ambiguous the model does the only thing available to
 * it, which is pick an interpretation and answer confidently.
 *
 * WHY A SHARED SHAPE RATHER THAN A PROMPT INSTRUCTION
 *
 * Telling a model in prose to "ask if unsure" produces a question buried in
 * an answer, which the caller then renders as an answer. The client cannot
 * tell the two apart, so the athlete reads a question as advice. The
 * difference has to be structural: a response is either an answer or a
 * question, the client renders each differently, and a reply carries the
 * original question back so the second turn has the context of the first.
 *
 * WHEN AN ASSISTANT SHOULD ASK
 *
 * Rarely, and the guidance says so. An assistant that asks a clarifying
 * question before every answer is worse than one that guesses: people stop
 * reading and start clicking through. The bar is that a wrong guess would
 * produce materially different advice -- not that more detail would be nice.
 */

export type ClarifyingQuestion = {
  /** What to ask, in one sentence. */
  question: string;
  /**
   * Two to four concrete options. Free text is always allowed as well; these
   * exist so the common answers are one tap rather than typing.
   */
  options: string[];
  /** Why the answer changes the advice, in one line, shown under the question. */
  because: string;
};

export type AssistantReply<T> =
  | { kind: "answer"; answer: T }
  | { kind: "question"; question: ClarifyingQuestion };

/**
 * The instruction block that gives an assistant permission to ask.
 *
 * Deliberately spends most of its words on when NOT to ask. Permission to
 * ask is easy; restraint is the part that has to be taught.
 */
export const ASK_INSTEAD_OF_GUESSING = [
  "If a question is genuinely ambiguous in a way that changes your answer, ask",
  "one clarifying question instead of guessing. Use the question shape you were",
  "given rather than writing a question into an answer.",
  "",
  "Ask only when a wrong guess would produce materially DIFFERENT advice, not",
  "merely less specific advice. Do not ask for detail that would only make a",
  "good answer slightly better, and never ask more than one question at a time.",
  "If you can give a useful answer that covers both readings, do that instead --",
  "it is almost always the better turn.",
  "",
  "Never ask a clarifying question in order to avoid answering something you are",
  "not willing to answer. Decline that plainly, as you would otherwise.",
].join("\n");

/** The tool an assistant calls to ask rather than answer. */
export const ASK_CLARIFYING_QUESTION_TOOL = {
  name: "ask_clarifying_question",
  description:
    "Ask the person one clarifying question instead of answering, when a wrong assumption would change your advice.",
  input_schema: {
    type: "object" as const,
    properties: {
      question: { type: "string", description: "One sentence, in plain language." },
      options: {
        type: "array",
        items: { type: "string" },
        description: "Two to four short, concrete options the person can pick from.",
      },
      because: {
        type: "string",
        description: "One line on why the answer changes your advice. Shown under the question.",
      },
    },
    required: ["question", "options", "because"],
  },
};

/** Validates and trims a question the model proposed, or null if unusable. */
export function parseClarifyingQuestion(input: unknown): ClarifyingQuestion | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const question = typeof raw.question === "string" ? raw.question.trim() : "";
  const because = typeof raw.because === "string" ? raw.because.trim() : "";
  const options = Array.isArray(raw.options)
    ? raw.options.filter((o): o is string => typeof o === "string" && o.trim().length > 0).map((o) => o.trim().slice(0, 80))
    : [];

  // A question with one option is not a question, and one with a dozen is a
  // form. Both are worse than an answer that guessed.
  if (!question || options.length < 2 || options.length > 4) return null;

  return { question: question.slice(0, 300), options, because: because.slice(0, 200) };
}
