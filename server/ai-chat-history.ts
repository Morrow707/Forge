// HOW MUCH OF A CHAT IS SENT WITH EACH NEW MESSAGE.
//
// The program builder, the skills builder and the four admin teaching chats each sent the WHOLE
// stored conversation with every message, so message one hundred cost a hundred messages of
// input and the bill for a long conversation grew with the square of its length. The athlete
// chat has always sent its last twenty. The builders send more than that because a build is
// worked out over more turns, and each of them also sends the CURRENT program, guidelines or
// profile in full beside the chat -- which is where everything the earlier messages decided
// already lives. Nothing is deleted: the stored conversation and what the screen shows are
// untouched; this is only what rides along to the model.
export const AI_CHAT_HISTORY_MESSAGES = 30;

/** THE ATHLETE-FACING CHATS SEND LESS (2026-11-17, the cost audit at 10,000 athletes). The program and
 * skills builders are where a Free Agent's bill was largest, and every message there already carries
 * the CURRENT program in full, which is where everything earlier turns decided lives -- so twelve
 * recent messages keep the thread of the conversation and the program keeps the rest. The coach chat
 * answers questions rather than building something, so ten messages of it keep a session's context.
 * The four admin teaching chats keep thirty: a handful of people use them and they are where a long
 * correction is worked out. */
export const BUILDER_CHAT_HISTORY_MESSAGES = 12;
export const COACH_CHAT_HISTORY_MESSAGES = 10;

/** The most recent messages of a stored conversation, oldest first, as they were given. */
export function recentForAi<T>(history: readonly T[], keep: number = AI_CHAT_HISTORY_MESSAGES): T[] {
  return history.length <= keep ? [...history] : history.slice(history.length - keep);
}
