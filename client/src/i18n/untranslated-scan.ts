// THE SCANNER BEHIND THE TRANSLATION RATCHET (2026-11-22). Never imported by the app: it reads
// source files with the TypeScript compiler's parser, for client/src/i18n/every-page-is-
// translated.test.ts and the two scripts (scripts/i18n-baseline.ts, scripts/i18n-missing.ts).
//
// It works on the syntax tree, not on text, so a comment is never read as a string -- the
// "a negative source assertion must strip comments first" rule in CLAUDE.md, met by construction
// (a comment is not a node), and proven by a case in the test.
//
// WHAT COUNTS AS UNTRANSLATED ENGLISH (one finding each):
//   - JSX text with a word in it:            <p>No messages yet.</p>
//   - a string on a reader-facing attribute: placeholder="Search", aria-label="Close", title=, alt=,
//     label=, description=, what= ... (USER_FACING_ATTRIBUTES), as "..." or {"..."} or {`...`}
//   - a string or template literal drawn as a JSX child, including either branch of a ?: and the
//     right side of && / || / ??:  {done ? "Done" : "Not yet"}
//   - the text of a toast:  toast("Saved"), toast.error("..."), and title:/description: inside it.
// WHAT IS IGNORED: className, data-testid, key, id, href, src, type, role, name and every other
// attribute not on the list; numbers; punctuation; a single letter; the brand name "Forge";
// anything already inside t(...), translate(...), plural(...) or msg(...).

import ts from "typescript";

export const USER_FACING_ATTRIBUTES = new Set([
  "placeholder",
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "title",
  "alt",
  "label",
  "description",
  "what",
  "heading",
  "subtitle",
  "message",
  "emptyMessage",
  "emptyText",
  "confirmLabel",
  "cancelLabel",
  "actionLabel",
  "submitLabel",
  "buttonLabel",
  "tooltip",
  "helperText",
  "hint",
  "caption",
  "tagline",
]);

/** Words that are the same in every language Forge shows. */
const SAME_IN_EVERY_LANGUAGE = new Set(["Forge"]);

/** The calls whose first string argument(s) are catalog keys. */
const KEY_CALLS = new Set(["t", "translate", "msg"]);
const PLURAL_CALLS = new Set(["plural"]);
const TOAST_METHODS = new Set(["success", "error", "info", "warning", "message", "loading"]);
const TOAST_OPTION_KEYS = new Set(["title", "description"]);

export type Finding = { line: number; kind: "jsx-text" | "attribute" | "jsx-expression" | "toast"; text: string };

// Reader-facing prose has two letters in a row somewhere. Matches "Save", "OK"; rejects "x", "3",
// "—", "·". https://regex101.com/?regex=%5BA-Za-z%5D%7B2%2C%7D&testString=Save%203x
const HAS_A_WORD = /[A-Za-z]{2,}/;

// Any run of whitespace, collapsed to one space. Matches "\n   "; rejects "a".
// https://regex101.com/?regex=%5Cs%2B&testString=No%20%0A%20messages
const WHITESPACE_RUN = /\s+/g;
const collapse = (text: string) => text.replace(WHITESPACE_RUN, " ").trim();

export function isProse(text: string): boolean {
  const trimmed = collapse(text);
  if (!trimmed || SAME_IN_EVERY_LANGUAGE.has(trimmed)) return false;
  return HAS_A_WORD.test(trimmed);
}

function staticText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" ");
  }
  return null;
}

/** The string literals an expression can evaluate to directly: itself, both arms of a ?:, the
 *  right side of && || ??, and inside parentheses. A call (t("..."), anything else) is not one. */
function proseBranches(node: ts.Expression): ts.Node[] {
  if (ts.isParenthesizedExpression(node)) return proseBranches(node.expression);
  if (ts.isConditionalExpression(node)) return [...proseBranches(node.whenTrue), ...proseBranches(node.whenFalse)];
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return proseBranches(node.right);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      return [...proseBranches(node.left), ...proseBranches(node.right)];
    }
    return [];
  }
  return staticText(node) != null ? [node] : [];
}

function calleeName(node: ts.CallExpression): { base: string | null; method: string | null } {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return { base: callee.text, method: null };
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    return { base: callee.expression.text, method: callee.name.text };
  }
  return { base: null, method: null };
}

function parse(fileName: string, source: string): ts.SourceFile {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
}

function walk(node: ts.Node, visit: (n: ts.Node) => void) {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/** Every untranslated English string a reader would see, in one source file. */
export function findUntranslated(fileName: string, source: string): Finding[] {
  const file = parse(fileName, source);
  const found: Finding[] = [];
  const lineOf = (n: ts.Node) => file.getLineAndCharacterOfPosition(n.getStart(file)).line + 1;
  const add = (kind: Finding["kind"], n: ts.Node, text: string) => {
    if (isProse(text)) found.push({ line: lineOf(n), kind, text: collapse(text) });
  };
  walk(file, (node) => {
    if (ts.isJsxText(node)) {
      add("jsx-text", node, node.text);
      return;
    }
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(file);
      if (!USER_FACING_ATTRIBUTES.has(name) || !node.initializer) return;
      if (ts.isStringLiteral(node.initializer)) add("attribute", node.initializer, node.initializer.text);
      else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        proseBranches(node.initializer.expression).forEach((b) => add("attribute", b, staticText(b) ?? ""));
      }
      return;
    }
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      proseBranches(node.expression).forEach((b) => add("jsx-expression", b, staticText(b) ?? ""));
      return;
    }
    if (ts.isCallExpression(node)) {
      const { base, method } = calleeName(node);
      const isToast = base === "toast" && (method === null || TOAST_METHODS.has(method));
      if (!isToast) return;
      node.arguments.forEach((arg) => {
        proseBranches(arg).forEach((b) => add("toast", b, staticText(b) ?? ""));
        if (ts.isObjectLiteralExpression(arg)) {
          arg.properties.forEach((p) => {
            if (ts.isPropertyAssignment(p) && TOAST_OPTION_KEYS.has(p.name.getText(file))) {
              proseBranches(p.initializer).forEach((b) => add("toast", b, staticText(b) ?? ""));
            }
          });
        }
      });
    }
  });
  return found;
}

/** Every literal catalog key the file asks for: t("..."), translate("..."), msg("..."),
 *  t.plural(n, "...", "...") and plural(n, "...", "..."). */
export function findTranslationKeys(fileName: string, source: string): { line: number; key: string }[] {
  const file = parse(fileName, source);
  const keys: { line: number; key: string }[] = [];
  const lineOf = (n: ts.Node) => file.getLineAndCharacterOfPosition(n.getStart(file)).line + 1;
  const literal = (n: ts.Node | undefined) =>
    n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null;
  walk(file, (node) => {
    if (!ts.isCallExpression(node)) return;
    const { base, method } = calleeName(node);
    const isKey = (method === null && base != null && KEY_CALLS.has(base));
    const isPlural = (method === null && base != null && PLURAL_CALLS.has(base)) || (base === "t" && method === "plural");
    if (isKey) {
      const key = literal(node.arguments[0]);
      if (key != null) keys.push({ line: lineOf(node), key });
    } else if (isPlural) {
      [node.arguments[1], node.arguments[2]].forEach((a) => {
        const key = literal(a);
        if (key != null) keys.push({ line: lineOf(node), key });
      });
    }
  });
  return keys;
}

/** The placeholders a string carries, sorted: "{count} of {total}" -> ["count", "total"]. */
export function placeholdersOf(text: string): string[] {
  // A placeholder: a word in braces. Matches "{count}"; rejects "{ count }" and "{}".
  // https://regex101.com/?regex=%5C%7B(%5Cw%2B)%5C%7D&testString=%7Bcount%7D%20of%20%7Btotal%7D
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}
