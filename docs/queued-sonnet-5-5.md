# QUEUED: the default model to Claude Sonnet 5.5

Branch `queue/sonnet-5-5`, built 2026-10-08 off `0df68291` (the Haiku 5.5 switch).
Held rather than pushed to `main` because another session was working in the repo.
**Ready to launch — nothing is left to decide.**

## What it does

`defaultModel` goes `claude-sonnet-5` -> `claude-sonnet-5-5`. Same price ($2/$10 per
MTok, cache reads $0.20), same tokenizer, 1M context either way. **Free in money and
not free in work**, which is the whole reason it did not ride along with the Haiku
switch:

**Sonnet 5.5 rejects a forced `tool_choice` with a 400.** `{type: "tool", name}` --
make this exact call -- is how every structured feature in Forge gets reliable JSON,
and all three structured helpers asked for one. On the new generation that is
`tool_choice: type "tool" and "any" are not supported for this model`. Flipping the
model without this change would have 400'd every structured AI feature at once:
goal suggestions, exercise search, roster queries, conflict detection, passage
tagging, the waiver reader, flashcard and quiz drafts.

The replacement is the documented one: `tool_choice: {type: "auto"}`, an instruction
in the prompt naming the tool, and -- because `auto` does not guarantee a call -- a
check that one happened plus one sharper retry when it did not.

**The split is per MODEL, not per call site, and the list is a DENY list.** Guessing
"forced" for an unknown model and being wrong is a 400: loud, immediate, traceable to
one line. Guessing "auto" and being wrong is silent -- and on the fast lane it would
also start emitting thinking blocks into a 200-token cap, which `callAnthropic`
discards as a max_tokens truncation, so the feature returns null and nobody is told.
Haiku 5.5 still accepts forced and keeps it.

The other four changes in that generation were checked against this file rather than
assumed, and all four are no-ops here: `thinking: disabled` is a 400 (nothing sends
`thinking`); thinking blocks are now bound to the model and the conversation, which
only bites a harness that EDITS earlier turns (`askClaudeWithTools` only appends, and
replays the whole `data.content` back unmodified, which is what that check wants);
`computer_20251124` is a 400 (not used); the advisor tool rejects older advisors (not
used). Effort levels are recalibrated but nothing sets `effort`.

Also in the branch: a safety decline (`stop_reason: "refusal"`, new in this
generation) is now recorded as a decline instead of returning an empty answer that
reads like a timeout, and `claude-sonnet-5-5` has a rate on file so the spend page and
the transcription pre-flight quote keep working.

## Files touched — deliberately disjoint

    server/ai.ts                                 the model id, the forced/auto split, refusal
    server/ai-usage.ts                           + claude-sonnet-5-5 rate (claude-sonnet-5 kept)
    server/ai-usage.test.ts                      ratchet extended to defaultModel
    server/forced-tool-choice-is-per-model.test.ts   new

**Not touched: `server/storage.ts`, `shared/schema.ts`, `server/routes.ts`, any
client file, any tool schema at any call site.** No call site changes at all — the
split is decided once, inside `ai.ts`. That is what makes this safe to merge against
concurrent work per CLAUDE.md's file-ownership rule.

## Verified

- `npx tsc --noEmit` clean.
- Whole unit suite green: **341 files, 3715 passed**.
- `forced-tool-choice-is-per-model.test.ts` mutation-tested in both failing
  directions: matching `claude-sonnet-5` instead of `claude-sonnet-5-5` (the prefix
  trap, which would move the entire app onto the auto path while still running the
  old model) turns it red, and forcing on every model turns 5 of 9 red.

## To launch

    git checkout main && git pull
    git merge --no-ff queue/sonnet-5-5
    npx vitest run            # expect 341 files green
    git push origin main

Server-side only — ships on the Render deploy, no TestFlight build, no `verify_build`.

**Then add the CLAUDE.md entry.** It is deliberately NOT in this branch: CLAUDE.md is
edited by every session and a queued edit to it is a guaranteed conflict. Write it
when this lands, next to the Haiku 5.5 entry.

## One thing the code cannot do

`ANTHROPIC_MODEL` is `sync: false` in `render.yaml` (line 156), so its value lives in
the Render dashboard. **If it is pinned to `claude-sonnet-5` there, this change does
nothing in production.** Clear it — the in-code default is now correct — or set it to
`claude-sonnet-5-5`. Same caveat as `ANTHROPIC_FAST_MODEL` on the Haiku switch.

## What to watch on the first day

The one genuinely new failure mode is the auto path declining to call the tool. It is
logged: `Claude answered <feature> in prose instead of calling <tool>; asking again`.
A few are expected and self-heal on the retry. A steady stream from one feature means
that feature's prompt needs the instruction made more explicit, not that the model is
wrong — and the fallback is already safe, since every caller treats null as "no
insight available" and zod-validates before trusting a result.
