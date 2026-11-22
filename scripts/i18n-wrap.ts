// A first pass at converting one file (client/src/i18n/README.md, "Converting a page").
//
//   npx tsx scripts/i18n-wrap.ts client/src/pages/login.tsx
//
// Wraps what it can do safely and prints what it left for a person:
//   - JSX text that sits alone on its line            ->  {t("...")}
//   - a reader-facing attribute:  placeholder="..."    ->  placeholder={t("...")}
//   - a plain "double-quoted" string a reader sees     ->  t("...")
// It does NOT add `const t = useT();` to each component (tsc says where it is missing), does not
// touch text that spans lines, contains an HTML entity or braces, or a template literal, and does
// not write a single word of Spanish. Read the diff, then run the baseline and missing scripts.
import { readFileSync, writeFileSync } from "node:fs";
import { findUntranslated } from "../client/src/i18n/untranslated-scan";

const ARGS_START = 2;
const path = process.argv[ARGS_START];
if (!path) throw new Error("usage: npx tsx scripts/i18n-wrap.ts <file>");
const source = readFileSync(path, "utf8");
const lines = source.split("\n");
const findings = findUntranslated(path, source);
// A character with a meaning in a regex. Matches "(" and "."; rejects "a".
// https://regex101.com/?regex=%5B.*%2B%3F%5E%24%7B%7D()%7C%5B%5C%5D%5C%5C%5D&testString=a(b).
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;
// Text the wrap leaves alone: an HTML entity or a brace. Matches "&apos;", "{x}"; rejects "Save".
// https://regex101.com/?regex=%5B%26%7B%7D%5D&testString=Don%26apos%3Bt
const NOT_SAFE_TO_WRAP = /[&{}]/;
const escapeForRegex = (s: string) => s.replace(REGEX_SPECIAL, "\\$&");

const left = findings.filter((f) => {
  const i = f.line - 1;
  const line = lines[i];
  const call = `t(${JSON.stringify(f.text)})`;
  if (NOT_SAFE_TO_WRAP.test(f.text)) return true;
  if (f.kind === "jsx-text") {
    // The text, starting the line or after a tag, ending the line or before a tag or {" "}. Text
    // that runs into an {expression} is left for a person: a sentence fragment is not a key.
    // Matches "<b>Save</b>" and 'Sign up{" "}'; rejects 'match "{search}' and "Save as".
    // https://regex101.com/?regex=(%5E%5Cs*%7C%3E)Save(%3F%3D%3C%7C%5C%7B%22%20%22%5C%7D%7C%5Cs*%24)&testString=%3Cb%3ESave%3C%2Fb%3E
    const bounded = new RegExp(`(^\\s*|>)${escapeForRegex(f.text)}(?=<|\\{" "\\}|\\s*$)`);
    if (!bounded.test(line)) return true;
    lines[i] = line.replace(bounded, `$1{${call}}`);
    return false;
  }
  const quoted = `"${f.text}"`;
  if (!line.includes(quoted)) return true;
  if (f.kind === "attribute") {
    // name="the text" on this line. Matches 'placeholder="Search"'; rejects 'placeholder={x}'.
    // https://regex101.com/?regex=(%5B%5Cw-%5D%2B)%3D%22Search%22&testString=placeholder%3D%22Search%22
    const attr = new RegExp(`([\\w-]+)=${escapeForRegex(quoted)}`);
    if (attr.test(line)) {
      lines[i] = line.replace(attr, `$1={${call}}`);
      return false;
    }
  }
  lines[i] = line.replace(quoted, call);
  return false;
});

// Second pass: JSX text that runs over several lines and is the whole content between two tags
// (or a tag and a brace). Its words, separated by any whitespace, must appear exactly once.
const joined = lines.join("\n");
const multiline = left.filter((f) => f.kind === "jsx-text" && !NOT_SAFE_TO_WRAP.test(f.text));
const wrappedSource = multiline.reduce((src, f) => {
  const words = f.text.split(" ").map(escapeForRegex).join("\\s+");
  // The text between a ">" (or a line start) and a "<" or {" "}. Matches ">\n  Two\n  lines\n<";
  // rejects text that runs into an {expression}.
  // https://regex101.com/?regex=(%3E%5Cs*)Two%5Cs%2Blines(%5Cs*)(%3F%3D%3C)&testString=%3E%0A%20Two%0A%20lines%0A%3C
  const pattern = new RegExp(`(>\\s*|\\n\\s*)${words}(\\s*)(?=<|\\{" "\\})`, "g");
  const hits = src.match(pattern);
  if (!hits || hits.length !== 1) return src;
  left.splice(left.indexOf(f), 1);
  return src.replace(pattern, `$1{t(${JSON.stringify(f.text)})}$2`);
}, joined);

writeFileSync(path, wrappedSource);
console.log(`wrapped ${findings.length - left.length} of ${findings.length} in ${path}`);
left.forEach((f) => console.log(`  left for you  ${path}:${f.line}  [${f.kind}]  ${f.text}`));
