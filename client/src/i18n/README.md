# Forge in more than one language

Added 2026-11-22. Scott: "can we have the athlete select which language they want, and the app
automatically translates? and they can go back and forth?" and "make sure every single page hits
this, it won't be translated perfectly yet as we aren't native spanish speakers."

## How it works

- **Each person picks a language** in Account Settings (English or Español), every role, guardians
  included. It is `users.language` (`"en"`, `"es"`, null = English), saved by
  `PUT /api/account/language`, carried on `/api/auth/me`, and put on screen by `LanguageSync`
  (mounted in `App.tsx`). `<html lang>` follows the language on screen.
- **The top-bar flip** (`LanguageFlipButton`, in `AppShell`, the guardian dashboard's header, login
  and signup) shows the other language with one tap and comes back with a second. It is for showing
  an English-only teammate the screen. It changes this device's screen until the app is closed
  (sessionStorage) and **never** the saved choice.
- **Before sign-in**, the device's last language or the browser's (`navigator.language` starting
  with `es`) picks the screen.
- **The app's own words** come from catalogs translated once, by people: `es.json` maps the exact
  English text to Spanish. **English is the key and the fallback**: a string missing from the
  catalog is shown in English, silently in production and collected in `missingKeys` in development.
  The Spanish catalog is a lazy chunk, loaded only when Spanish is on screen; an English reader
  never downloads it (`client/src/lib/bundle-budget.test.ts`).
- **Forge library exercise and skill drill names** come from `exercise-es.json`, keyed by the exact
  English name. `t.exercise(name)` translates a library name and returns any other name (a coach's
  own exercise) exactly as written. Instructions and cues have **no catalog yet**: they show in
  English. The hook to add one is `LIBRARY_CATALOG_LOADERS` in `catalogs.ts`.
- **What a person TYPED** -- a coach's note, a message -- is translated on the fly by the AI
  (`POST /api/translate`, `server/translation.ts`, the fast model), shown by
  `<TranslatableText text={...} />` with a "Translated · Show original" line. In English mode it
  shows the original and asks nothing. The server keeps translations in memory only (a stored copy
  of someone's message would outlive the message).
- **Legal documents stay in English.** `LegalPageChrome` shows one sentence in the reader's
  language above the English text. Never pass a legal document through `t()` or
  `TranslatableText`. Counsel question 30 (`docs/legal-open-questions.md`) asks whether that may
  change.
- **Emails** go out in the recipient's language where a builder has its words in both: the weekly
  parent summary does (`server/parent-weekly-summary-email.ts`, `WORDS`). Other emails are English
  until their builder gets the same treatment.

## The API

```tsx
import { msg, useT } from "@/i18n";

export function Example({ athlete, sets }: Props) {
  const t = useT();                                   // redraws this component on a language change
  return (
    <div>
      <h2>{t("Today's session")}</h2>                                        {/* JSX text */}
      <input placeholder={t("Search exercises")} aria-label={t("Search")} /> {/* attributes */}
      <p>{t("{name} logged {count} sets", { name: athlete.name, count: sets.length })}</p>
      <p>{t.plural(sets.length, "{count} set", "{count} sets")}</p>         {/* one / other */}
      <p>{t.exercise("Back Squat")}</p>                                      {/* library names */}
      <p>{t.date(log.date, { month: "short", day: "numeric" })}</p>         {/* Intl, active locale */}
      <p>{t.number(1234.5, { maximumFractionDigits: 1 })}</p>
      <ReadFailed what={t("this athlete's injury history")} onRetry={refetch} />
      <TranslatableText text={coachNote} />                                  {/* typed by a person */}
    </div>
  );
}

// Text DEFINED somewhere other than where it is drawn (a nav list, a constant, a label map):
const TABS = [{ href: "/x", label: msg("Progress") }];   // msg() marks it; returns it unchanged
// ...and where it is drawn:  {t(tab.label)}

// Outside a component (a toast fired from a mutation callback, a helper):
import { translate } from "@/i18n";
toast.success(translate("Saved"));
toast.error(err.message ? translate(err.message) : translate("Couldn't save that"));  // server text: known sentences translate, others fall back to English
```

## Rules for keys

1. **The whole sentence is one key.** Never `t("You're joining") + " " + team`; write
   `t("You're joining {team}", { team })`. Spanish word order is not English word order, and a
   fragment cannot be translated well. A `<strong>` in the middle of a sentence is usually not worth
   splitting the sentence for: drop it or move it.
2. **Placeholders are `{word}`** and every Spanish value must carry exactly the placeholders of its
   key (the test checks it).
3. **Same English, same key.** "Save" is translated once. When the same English needs two
   translations (a noun and a verb), make the English say which: "Save (button)" is worse than
   choosing different English.
4. **Plural:** `t.plural(count, "{count} athlete", "{count} athletes")` -- both forms are keys, and
   `count` is filled in for you.
5. **Dates and numbers:** `t.date(...)` and `t.number(...)` (Intl with the active locale), never a
   hard-coded English month name. `date-fns` `format(...)` prints English, and so does
   `formatDistanceToNow`: use `t.relative(date)` ("hace 3 minutos").
6. **Keys must be string literals** so the scripts can see them. A key that is only ever computed
   (from a shared constant, the server) works at runtime but `i18n-missing` cannot list it: add it
   to `es.json` by hand (the answer-style labels in `shared/answer-style.ts` are the example).
7. **A label map is drawn through t().** `{EXERCISE_PURPOSE_LABEL[p]}` holds no string at the draw
   site, so the page ratchet cannot see it: write `{t(EXERCISE_PURPOSE_LABEL[p])}`, or
   `msg(X.a)` where the value is stored in a list that is translated where it is drawn.
   `every-label-map-is-translated.test.ts` holds every name ending in LABEL/LABELS to it.
8. **A word from Forge's library vocabulary** (category, family, movement type, body region, plane,
   complexity, muscle group, equipment, laterality, skill type, skill equipment, skill target,
   sport, class category, joint) is drawn with `t.term(kind, value)`. It reads the catalog key
   `"{value} ({kind})"` first, so a word whose plain key means something else gets its own
   ("Back (muscle group)": "Espalda", where "Back" is the button), then the plain word, then the
   stored word unchanged (a coach's own free text). Option chips take `optionLabel={(v) =>
   t.term("muscle group", v)}` (`FilterChipGroup`, `RadioChipGroup`). The ratchet checks every
   value of these vocabularies (read from `shared/` and the seed) is in `es.json`.

## What NOT to translate

- **User content**: names, anything typed by a person (use `TranslatableText` for a coach's note
  or message), uploaded file names.
- **Exercise and drill names**: through `t.exercise(name)`, never `t(name)`.
- **Legal documents**: never. See above.
- **The brand name "Forge"** (the scanner ignores it).
- **A program's own wording from Branding** (`applyBrandTerms`, a coach's renamed nav tab): it is
  the program's words and is shown as typed. `AppShell`'s `translatedOrProgramWord` is the model.
- **Numbers, units, codes, emails** (`placeholder="you@example.com"` was translated as an example
  address; a real address never is).

## Converting a page (wave 2)

1. `npx tsx scripts/i18n-wrap.ts client/src/pages/<file>.tsx` -- wraps the simple cases (JSX text
   alone between tags, `placeholder="..."` style attributes, plain quoted strings) and prints what it
   left. It never adds `const t = useT();`: `npx tsc --noEmit` lists the components that need it.
2. Do the rest by hand: sentences that run into `{expressions}` become one key with placeholders;
   template literals become `t("...{x}...", { x })`; labels in constants get `msg(...)`.
3. `npx tsx scripts/i18n-missing.ts --json` lists every key not yet in `es.json`. Translate each into
   natural Latin American Spanish (tú for athletes), keep the placeholders, and add it to `es.json`
   (sorted, one key per line). Never paste the English in as the Spanish to turn the test green.
4. `npx tsx scripts/i18n-baseline.ts` rewrites `untranslated-baseline.json` (its counts only go
   down). `npx tsx scripts/i18n-baseline.ts --file <path>` lists what is left in one file;
   `--top 20` shows the biggest files.
5. Look at it: flip to ES in the top bar.

## The ratchet

`every-page-is-translated.test.ts`:
- **The baseline.** `untranslated-scan.ts` reads every file under `client/src/pages` and
  `client/src/components` with the TypeScript parser and counts the English a reader can see that is
  not inside `t()`: JSX text with a word in it; reader-facing attributes (`placeholder`, `aria-label`,
  `title`, `alt`, `label`, `description`, `what`, `tagline` ... see `USER_FACING_ATTRIBUTES`) as
  `"..."`, `{"..."}` or a template; a string drawn as a JSX child, including both arms of `?:` and
  the right side of `&&`/`||`/`??`; and the text of a toast (`toast(...)`, `toast.error(...)`,
  `title:`/`description:` in its options). It ignores `className`, `data-testid`, `key`, `id`, `href`,
  `src`, `type`, `role`, `name` and every attribute not on the list, numbers, punctuation, a single
  letter and "Forge". It works on the syntax tree, so **a comment is never counted** (CLAUDE.md's
  comment-strip rule, met by construction and proven by a case). A file's count may only fall.
- **Every literal key is in es.json** (`t`, `translate`, `msg`, `plural`, `t.plural`).
- **Every Spanish value keeps its key's placeholders** and is not empty.
- **The converted shell stays converted** (the files named in the last case hold zero).

`every-library-name-is-translated.test.ts` reads the visible library from the seed sources
(`library-names.ts`) and requires a Spanish name for each; `npx tsx scripts/i18n-library-names.ts
--missing` lists a new one.

## Adding a third language

One code in `shared/languages.ts` (`LANGUAGES`, its native name, short label and locale), one line
in each map in `catalogs.ts`, and its `<code>.json` / `exercise-<code>.json`. The flip goes between
the saved language and English. The parent email needs its `WORDS` entry. The tests read Spanish
today; generalise them to every catalog when a third arrives.
