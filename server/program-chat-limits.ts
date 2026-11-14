/** The output cap for the AI Program Builder and AI Skill Builder chat turns. A whole
 * multi-day program is one tool call and a truncated one is discarded whole (callAnthropic
 * refuses a `max_tokens` stop), so this has to fit the largest program somebody asks for in one
 * sentence. 8192 did not: three of four real 4-day requests on 2026-11-14 hit it. */
export const PROGRAM_CHAT_MAX_TOKENS = 16000;
