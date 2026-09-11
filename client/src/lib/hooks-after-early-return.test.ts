import { describe, it, expect } from "vitest";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * A HOOK BELOW AN EARLY RETURN IS A CRASH, AND IT LOOKS LIKE PERFECTLY ORDINARY CODE.
 *
 * React counts hooks per render. A component that returns a skeleton while its data loads runs N
 * hooks on that render; if a hook sits after the return, the render right after the data arrives
 * runs N+1, and React refuses it. The whole page lands in the error boundary.
 *
 * WorkoutPage had one. Opening a day that was already in the query cache rendered straight to
 * content and never tripped it, so it looked random -- Scott hit "Something went wrong" eight
 * times in a row on a cold day against a server still waking up from a deploy, then it "fixed
 * itself" when the day finally landed in cache.
 *
 * Nothing about the call site shows the problem, which is why it is worth a test rather than a
 * comment. This walks every component in the client and fails on a hook call that sits, at the
 * top level of the body, after a top-level `if` that returns. Hooks inside nested callbacks are
 * ignored -- those are not this component's hooks.
 */

const HOOK_NAME = /^use[A-Z]/;

function isHookCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && HOOK_NAME.test(node.expression.text);
}

function isNestedFunction(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node);
}

function containsReturn(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found || isNestedFunction(n)) return;
    if (ts.isReturnStatement(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function hookCallsIn(stmt: ts.Node): ts.CallExpression[] {
  const hits: ts.CallExpression[] = [];
  const visit = (n: ts.Node) => {
    if (isNestedFunction(n)) return;
    if (isHookCall(n)) hits.push(n);
    ts.forEachChild(n, visit);
  };
  visit(stmt);
  return hits;
}

function violationsIn(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];

  function checkBody(body: ts.Node | undefined, name: string) {
    if (!body || !ts.isBlock(body)) return;
    let earlyReturnLine: number | null = null;
    for (const stmt of body.statements) {
      if (earlyReturnLine != null) {
        for (const hook of hookCallsIn(stmt)) {
          const line = source.getLineAndCharacterOfPosition(hook.getStart()).line + 1;
          found.push(
            `${file}:${line} -- ${name} calls ${(hook.expression as ts.Identifier).text}() after the ` +
              `early return on line ${earlyReturnLine}`,
          );
        }
      } else if (ts.isIfStatement(stmt) && containsReturn(stmt)) {
        earlyReturnLine = source.getLineAndCharacterOfPosition(stmt.getStart()).line + 1;
      }
    }
  }

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) checkBody(node.body, node.name.text);
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isNestedFunction(node.initializer) &&
      ts.isIdentifier(node.name)
    ) {
      checkBody((node.initializer as ts.ArrowFunction).body, node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("no component calls a hook after an early return", () => {
  it("holds across every .tsx file in the client", () => {
    const files = execSync("find client/src -name '*.tsx'", { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(files.length).toBeGreaterThan(50);

    const violations = files.flatMap(violationsIn);
    expect(violations).toEqual([]);
  });

  // The check has to actually be able to see one, or a green run means nothing.
  it("catches the shape it exists to catch", () => {
    const sample = `
      function BrokenPage({ isLoading }: { isLoading: boolean }) {
        const [a, setA] = useState(0);
        if (isLoading) {
          return <div />;
        }
        const mutation = useMutation({});
        return <div>{a}{mutation}</div>;
      }
    `;
    const source = ts.createSourceFile("sample.tsx", sample, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const hooks: string[] = [];
    let sawEarlyReturn = false;
    const fn = source.statements[0] as ts.FunctionDeclaration;
    for (const stmt of fn.body!.statements) {
      if (sawEarlyReturn) {
        for (const hook of hookCallsIn(stmt)) hooks.push((hook.expression as ts.Identifier).text);
      } else if (ts.isIfStatement(stmt) && containsReturn(stmt)) {
        sawEarlyReturn = true;
      }
    }
    expect(hooks).toEqual(["useMutation"]);
  });
});
