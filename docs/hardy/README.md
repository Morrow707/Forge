# Hardy the Hammer: the in-app assistant

Status 2026-11-11: BUILT, first version (server/hardy.ts, client/src/components/hardy-*.tsx,
client/src/pages/admin/hardy-usage.tsx). What shipped and what did not is listed under "What the
first version is" below. `prototype.html` is the tested prototype (invented sample data, a
stand-in for Forge's screens); the published copy is https://claude.ai/artifact/C8ycjQZzAvxvpX4iMDa4XB.

## Decided by Scott
- **The mascot is the Forge mark: a black-to-red hammer with sparks, no face** (2026-11-11). Five
  character versions were drawn (classic mallet, sledge, ball-peen, blacksmith, on the anvil) and
  turned down. On a dark header it sits on a light circle so it stays visible.
- A hammer in the corner of every page, tap to open; hidden while the camera records or the rep
  keypad is open; can be turned off or moved to the left corner in Settings.
- Hardy finds anything logged (days, sets, foods, check-ins, notes), takes the person to the page,
  makes changes only through a confirm card, builds reports (PDF, send to coach), and answers deep
  questions (heaviest lift, diet before it, weekly volume, time between PRs, the program block).

## Rules the prototype already follows (keep them when it is built)
- Plans: Basic gets find, search, "take me there" and app help. AI Coach ($9.99) adds advice,
  changes, reports and program building. A coached athlete gets find, changes and reports but no
  advice and no program building (Forge's rule: coached athletes get no AI coaching). Coaches see
  their roster; an assistant coach sees only their assigned team.
- No medical answers: pain or injury goes to "see a doctor or athletic trainer".
- Never changes a password, deletes an account or removes a coach; an email change waits for the
  link sent to the new address.
- No athlete-to-athlete messages (zero contact between athletes).
- Camera speeds carry the accuracy caveat. Patterns are stated as observations, never causes.
- 50 questions a day per account, counted on the server (`takeHardyAsk`, enforced since 2026-11-12;
  search is not counted). Chats are not saved; reports are, because the person chose to save them.
- **For counsel before launch:** Hardy reads a minor's whole history and sends parts of it to the
  AI provider.

## The admin report: "What people ask Hardy"
- Recorded per question: its kind (Training, Nutrition, Progress, Changes, Reports, Programs, App
  help, Other), which of FORGE'S OWN WORDS it matched (a fixed list of lift names, foods, pages and
  features), how Hardy did (answered, couldn't answer, not on their plan, their coach's call, sent
  to a doctor or trainer), the person's group and the day.
- Never recorded: what was typed or who asked. Because only fixed-list words are counted, a name,
  a school or anything personal cannot reach the report.
- A word, kind or line shows only when 10 or more different people are behind it.
- Shows: totals and answered rate, kinds with trend, top 20 words, where Hardy came up short,
  what Basic users ask for that is on AI Coach (the upgrade signal), plain-sentence suggestions,
  7 or 28 days, by group, CSV download.

## Also queued from the same conversation (a discus thrower's list)
1. Search across your history (dates, exercises, foods, notes). Hardy's finder covers this.
2. Velocity targets per lift, with the camera accuracy caveat.
3. Fuller micronutrients (iron, calcium, magnesium, potassium), after asking which ones matter.

## What the first version is (2026-11-11)
- **Search, for everyone the app shell serves** (athlete, coach, admin): dates ("July 14",
  "2026-07-14", a weekday), lift names, foods and words in a set's note, over the person's own logs;
  a coach also searches their roster (naming an athlete narrows to them). Each hit opens its page.
- **Ask in a sentence, adults only, where Forge already allows AI help**: a coach or admin, or a
  Free Agent on an AI plan. Never a coached athlete (Scott: coached by the staff) and never a
  minor -- the counsel question above stands, so it is adults-only until counsel answers. Claude
  answers from the person's last 180 days of sets, 60 days of food and check-ins, names its dates,
  points pain at a doctor or trainer, and offers "Take me there" to the day.
- **Not saved**: the conversation lives in the panel. Each question is recorded for the admin
  report as kind + Forge's words + outcome + group + day, with a keyed hash in place of the account
  so the report can count different people (`hardy_question_events`).
- **Admin: More -> What People Ask Hardy** -- 7 or 28 days, by group, kinds with trend, top 20
  words, where he came up short, the plan line, plain-sentence suggestions; every row behind the
  floor of 10 different people.
- **Hidden on the workout day screen**, which is too busy for a floating button.
- **NOT in this version** (the prototype has them): changes by confirm card, reports and PDFs, the
  Hardy tab, goals, reminders, meet mode, program drafting, photo logging, the weekly recap. Each is
  its own build; the prototype is the spec.
