/**
 * EVERY PAGE MOVES TOWARD THE READER'S LANGUAGE, AND NONE MOVES BACK (2026-11-22).
 *
 * Scott: "make sure every single page hits this, it won't be translated perfectly yet as we aren't
 * native spanish speakers." The foundation translated the shell; the rest of the app is converted
 * page by page. This file is the ratchet that keeps that one-directional:
 *
 *   1. untranslated-baseline.json holds, per file under client/src/pages and client/src/components,
 *      how many English strings a reader can see that are not wrapped in t(...). A file's count may
 *      fall and never rise, and a file not in the baseline may hold none. After converting a file,
 *      `npx tsx scripts/i18n-baseline.ts` rewrites the baseline.
 *   2. Every literal key the code asks for -- t("..."), translate("..."), msg("..."), plural(...) --
 *      is in es.json, so a converted page cannot ship English in Spanish mode by accident.
 *      `npx tsx scripts/i18n-missing.ts` lists the missing ones.
 *   3. Every Spanish value carries exactly the placeholders of its English key.
 *
 * The scanner (untranslated-scan.ts) reads the TypeScript syntax tree, so a comment is never read as
 * text; one case proves it in the dangerous direction (a comment quoting English must not count).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findTranslationKeys, findUntranslated, isProse, placeholdersOf } from "./untranslated-scan";
import { BASELINE_PATH, SPANISH_CATALOG_PATH, allClientFiles, readRepoFile, scannedFiles } from "./source-files";

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Record<string, number>;
const spanish = JSON.parse(readFileSync(SPANISH_CATALOG_PATH, "utf8")) as Record<string, string>;

describe("the scanner", () => {
  it("finds JSX text, reader-facing attributes, drawn literals and toasts", () => {
    const src = `
      export function X() {
        toast.success("Saved your program");
        toast({ title: "Heads up", description: "Something changed" });
        return (
          <div className="flex gap-2" data-testid="row-one" title="A tooltip">
            <p>No messages yet.</p>
            <input placeholder="Search exercises" aria-label="Search box" type="text" />
            {done ? "Finished" : "Not yet"}
            {ok && "All good"}
            <Thing what="this athlete's injuries" variant="outline" />
          </div>
        );
      }`;
    const texts = findUntranslated("x.tsx", src).map((f) => f.text);
    expect(texts).toEqual(
      expect.arrayContaining([
        "Saved your program",
        "Heads up",
        "Something changed",
        "A tooltip",
        "No messages yet.",
        "Search exercises",
        "Search box",
        "Finished",
        "Not yet",
        "All good",
        "this athlete's injuries",
      ]),
    );
    expect(texts).not.toContain("flex gap-2");
    expect(texts).not.toContain("row-one");
    expect(texts).not.toContain("outline");
    expect(texts).not.toContain("text");
  });

  it("does not count text already inside t(), numbers, punctuation, a single letter, or the brand", () => {
    const src = `
      export function X() {
        return (
          <div title={t("A tooltip")}>
            <p>{t("No messages yet.")}</p>
            <span>12</span><span>·</span><span>x</span><span>Forge</span>
            {cond ? t("Finished") : t("Not yet")}
          </div>
        );
      }`;
    expect(findUntranslated("x.tsx", src)).toEqual([]);
  });

  it("never reads a comment as text, which is the direction that would hide English", () => {
    const src = `
      export function X() {
        // <p>No messages yet.</p> was the old copy
        /* toast.success("Saved"); placeholder="Search" */
        return <div>{/* Coming soon */}</div>;
      }`;
    expect(findUntranslated("x.tsx", src)).toEqual([]);
    // The same English, outside the comment, is found -- so the case above is the comment's doing.
    expect(findUntranslated("x.tsx", `export const Y = () => <p>No messages yet.</p>;`)).toHaveLength(1);
  });

  it("reads the keys the code asks for, from every key-taking call", () => {
    const src = `
      const LABELS = { a: msg("Dashboard") };
      function X() {
        const t = useT();
        toast(translate("Saved {name}", { name }));
        return <p>{t("Welcome back")} {t.plural(n, "{count} athlete", "{count} athletes")} {plural(n, "one set", "{count} sets")}</p>;
      }`;
    expect(findTranslationKeys("x.tsx", src).map((k) => k.key).sort()).toEqual(
      ["Dashboard", "Saved {name}", "Welcome back", "{count} athlete", "{count} athletes", "one set", "{count} sets"].sort(),
    );
  });

  it("calls only text with a word in it prose", () => {
    expect(isProse("  Save  ")).toBe(true);
    expect(isProse("x")).toBe(false);
    expect(isProse("3 · 4")).toBe(false);
    expect(isProse("Forge")).toBe(false);
  });
});

describe("the ratchet", () => {
  it("no page or component holds more untranslated English than its baseline", () => {
    const grown = scannedFiles()
      .map((file) => ({ file, now: findUntranslated(file, readRepoFile(file)).length, was: baseline[file] ?? 0 }))
      .filter((r) => r.now > r.was)
      .map((r) => `${r.file}: ${r.now} untranslated (baseline ${r.was}). Wrap the new text in t(...) -- see client/src/i18n/README.md.`);
    expect(grown).toEqual([]);
  });

  it("every key the code asks for is in es.json", () => {
    const missing = allClientFiles().flatMap((file) =>
      findTranslationKeys(file, readRepoFile(file))
        .filter((k) => !(k.key in spanish))
        .map((k) => `${file}:${k.line} ${JSON.stringify(k.key)}`),
    );
    expect(missing, "run `npx tsx scripts/i18n-missing.ts` and translate each one into es.json").toEqual([]);
  });

  it("every Spanish value keeps its English key's placeholders, and none is left empty", () => {
    const wrong = Object.entries(spanish)
      .filter(([en, es]) => !es.trim() || placeholdersOf(en).join() !== placeholdersOf(es).join())
      .map(([en, es]) => `${JSON.stringify(en)} -> ${JSON.stringify(es)}`);
    expect(wrong).toEqual([]);
  });

  it("the shell is fully converted: the files the foundation translated hold no untranslated English", () => {
    const shell = [
      "client/src/components/app-shell.tsx",
      "client/src/components/account-settings-dialog.tsx",
      "client/src/components/read-failed.tsx",
      "client/src/components/language-flip-button.tsx",
      "client/src/components/language-setting.tsx",
      "client/src/components/translatable-text.tsx",
      "client/src/components/coach-message-thread.tsx",
      "client/src/components/exercise-picker-dialog.tsx",
      "client/src/pages/login.tsx",
      "client/src/pages/signup.tsx",
    ];
    const left = shell.flatMap((file) => findUntranslated(file, readRepoFile(file)).map((f) => `${file}:${f.line} ${f.text}`));
    expect(left).toEqual([]);
  });
});
