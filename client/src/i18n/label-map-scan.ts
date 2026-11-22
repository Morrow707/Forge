// THE SCANNER BEHIND THE LABEL-MAP RATCHET (2026-11-22). Never imported by the app.
//
// The untranslated-text scanner (./untranslated-scan.ts) counts English LITERALS. It cannot see
// English that lives in a label map and is drawn by lookup -- `{EXERCISE_PURPOSE_LABEL[p]}` holds
// no string at the draw site, so a page could be "fully converted" and still draw "Warm-up" and
// "Off-season" on the Spanish program builder. That is what this finds.
//
// A LABEL MAP is any identifier whose name ends in LABEL or LABELS that a client file either
// imports (from anywhere: @shared, a lib, a sibling component) or declares at module level. The
// names are read from the file's own imports and declarations, never a hand list, so a new map is
// held to the rule the first time it is drawn.
//
// THE RULE: every reference to a label map sits inside the FIRST argument of t(...), translate(...)
// or msg(...), or is t.term()'s word -- `t(EXERCISE_PURPOSE_LABEL[p])`, `t(LABEL[k] ?? k)`,
// `t.term("joint", EXERCISE_JOINT_LABEL[j])`, and `{ label: msg(X.a) }` for a
// value stored in a list that is translated where it is drawn -- or is the argument of
// Object.keys(...) (keys are not shown). Anything else is a finding, including handing the whole
// map to a component (`labels={X_LABEL}`), which moves the lookup somewhere this cannot follow:
// the component is the one that has to translate, so the map is passed as data under another name
// or translated before it is handed over.
//
// It works on the syntax tree, so a comment is never read (CLAUDE.md's comment-strip rule, met by
// construction and proven by a case in the test).

import ts from "typescript";

export type LabelMapFinding = { line: number; name: string; text: string };

// A label map's name. Matches "EXERCISE_PURPOSE_LABEL", "STAFF_KIND_LABELS", "LABELS"; rejects
// "LABELED", "labelFor", "POWERED_BY_FORGE_LABEL_X".
// https://regex101.com/?regex=%5E(%5BA-Z%5D%5BA-Z0-9_%5D*_)%3FLABELS%3F%24&testString=EXERCISE_PURPOSE_LABEL
export const LABEL_MAP_NAME = /^([A-Z][A-Z0-9_]*_)?LABELS?$/;

/** t() and translate() translate here; msg() marks a value stored for a later t() at its draw site. */
const TRANSLATING_CALLS = new Set(["t", "translate", "msg"]);

function calleeName(call: ts.CallExpression): string | null {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) return `${e.expression.text}.${e.name.text}`;
  return null;
}

function namesFromStatement(st: ts.Statement): string[] {
  if (ts.isImportDeclaration(st)) {
    const bindings = st.importClause?.namedBindings;
    return bindings && ts.isNamedImports(bindings) ? bindings.elements.map((el) => el.name.text) : [];
  }
  if (ts.isVariableStatement(st)) {
    return st.declarationList.declarations.flatMap((d) => (ts.isIdentifier(d.name) ? [d.name.text] : []));
  }
  return [];
}

/** The label-map names a file imports or declares at module level. */
export function labelMapNamesIn(source: ts.SourceFile): Set<string> {
  return new Set(source.statements.flatMap(namesFromStatement).filter((n) => LABEL_MAP_NAME.test(n)));
}

/** True when `child` is (inside) the first argument of a translating call, or the argument of
 *  Object.keys. The walk stops at a statement block, a JSX attribute or a JSX expression: past
 *  those the text has already been drawn or handed on untranslated. */
function isTranslatedOrKeysOnly(child: ts.Node): boolean {
  const parent = child.parent;
  if (!parent || ts.isSourceFile(parent)) return false;
  if (ts.isCallExpression(parent) && parent.arguments[0] === child) {
    const name = calleeName(parent);
    if (name && (TRANSLATING_CALLS.has(name) || name === "Object.keys")) return true;
  }
  // t.term(kind, word): the word is the SECOND argument.
  if (ts.isCallExpression(parent) && parent.arguments[1] === child && calleeName(parent) === "t.term") return true;
  if (ts.isBlock(parent) || ts.isJsxAttribute(parent) || ts.isJsxExpression(parent)) return false;
  return isTranslatedOrKeysOnly(parent);
}

function isDeclarationSite(id: ts.Identifier): boolean {
  const p = id.parent;
  return (
    ts.isImportSpecifier(p) ||
    (ts.isVariableDeclaration(p) && p.name === id) ||
    (ts.isPropertyAccessExpression(p) && p.name === id) ||
    (ts.isPropertyAssignment(p) && p.name === id) ||
    ts.isExportSpecifier(p) ||
    ts.isTypeQueryNode(p) ||
    ts.isQualifiedName(p)
  );
}

export function findUntranslatedLabelMaps(fileName: string, src: string): LabelMapFinding[] {
  const source = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = labelMapNamesIn(source);
  if (names.size === 0) return [];
  const findings: LabelMapFinding[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && names.has(node.text) && !isDeclarationSite(node) && !isTranslatedOrKeysOnly(node)) {
      // Report the whole lookup expression (`X[k]`, `X.a`), not just the name.
      const p = node.parent;
      const shown = (ts.isElementAccessExpression(p) || ts.isPropertyAccessExpression(p)) && p.expression === node ? p : node;
      findings.push({
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        name: node.text,
        text: shown.getText(source),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

/** Where a file gets each label map it uses: an import (its specifier) or its own declaration (null). */
export function labelMapOrigins(fileName: string, src: string): Map<string, string | null> {
  const source = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imported = source.statements.filter(ts.isImportDeclaration).flatMap((st) => {
    const bindings = st.importClause?.namedBindings;
    const specifier = ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
    return bindings && ts.isNamedImports(bindings) && specifier
      ? bindings.elements.map((el): [string, string | null] => [el.name.text, specifier])
      : [];
  });
  const declared = source.statements
    .filter(ts.isVariableStatement)
    .flatMap(namesFromStatement)
    .map((n): [string, string | null] => [n, null]);
  return new Map([...imported, ...declared].filter(([n]) => LABEL_MAP_NAME.test(n)));
}

/** Property names in a list of options that carry an id, a colour or a key, never text. */
const NOT_TEXT_PROPERTIES = new Set(["id", "key", "value", "color", "colour", "href", "icon", "className"]);

/** Which properties of an object hold the text: every one but the ids, or the named ones only. */
type TextFields = { only: ReadonlySet<string> | null };
const ANY_TEXT_FIELD: TextFields = { only: null };

function textIn(node: ts.Expression, fields: TextFields = ANY_TEXT_FIELD): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "msg") {
    const first = node.arguments[0];
    return first && ts.isStringLiteral(first) ? [first.text] : [];
  }
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    return textIn(node.expression, fields);
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap((e) => textIn(e, fields));
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.flatMap((p) => {
      if (!ts.isPropertyAssignment(p)) return [];
      const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : "";
      if (NOT_TEXT_PROPERTIES.has(key)) return [];
      const isText = fields.only == null || fields.only.has(key);
      const nested = ts.isArrayLiteralExpression(p.initializer) || ts.isObjectLiteralExpression(p.initializer);
      return isText || nested ? textIn(p.initializer, fields) : [];
    });
  }
  return [];
}

/** The English a label map declared in this file holds: string values, msg() values, and the text
 *  fields of a list of options. A value that is another constant is not followed. Null when the
 *  file does not declare it. */
export function labelMapText(fileName: string, src: string, name: string, onlyFields?: readonly string[]): string[] | null {
  const source = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const decl = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((st) => st.declarationList.declarations)
    .find((d) => ts.isIdentifier(d.name) && d.name.text === name);
  const fields: TextFields = { only: onlyFields ? new Set(onlyFields) : null };
  return decl?.initializer ? textIn(decl.initializer, fields) : null;
}
