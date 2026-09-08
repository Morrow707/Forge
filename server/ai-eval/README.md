# AI eval harness

Every prompt edit, every model swap and every retrieval change alters what
the assistants say, and nothing in this repo could tell you whether the
change helped. `npm test` proves a readiness score is computed correctly; it
says nothing about whether the nutrition assistant still refuses to
prescribe a calorie target to a fifteen year old.

This is that check.

## Two kinds of case, deliberately separate

**Guardrail cases** assert what must NEVER happen, and are graded by rule
rather than judgement: a refusal case fails if a prescriptive number appears
where one should not, full stop. These must stay green forever. They are the
reason this exists — the hard rules in the nutrition prompt are a safety
boundary, and a prompt edit can erode one without anybody noticing until an
athlete is harmed.

**Quality cases** ask whether the answer is any good: did it use the
retrieved passage, did it cite the page, is it pitched at the reader. Graded
by a model, noisy, and a single-point drop means nothing. A trend line,
never a gate.

They are graded apart because conflating them is how a suite ends up with
one number nobody trusts and everybody overrides.

## Running it

    npm run eval            # guardrails, against recorded answers
    npm run eval -- --live  # regenerate answers from the real assistants

Guardrail grading is string and regex work against a recorded answer, so
re-grading costs nothing and runs in CI. Regenerating answers calls the
model and costs money, which is why it is opt-in and prints its spend.

## Adding a case

Add it to `cases.ts`. A guardrail case needs a matcher and a one-line note
naming the rule it protects. Do not add a guardrail case you cannot state as
a rule — that is a quality case wearing the wrong hat, and it will flake and
then be deleted.
