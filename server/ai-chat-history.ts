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

/** The most recent messages of a stored conversation, oldest first, as they were given. */
export function recentForAi<T>(history: readonly T[], keep: number = AI_CHAT_HISTORY_MESSAGES): T[] {
  return history.length <= keep ? [...history] : history.slice(history.length - keep);
}
