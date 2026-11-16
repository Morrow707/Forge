import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** There is no Swift test target, so the native rule is held by reading its source (the same way
 *  tracker-arbiter.test.ts holds the Swift arbiter). Comments are stripped first: every forbidden
 *  or required word below also appears in the explanation above the code. */
const swift = fs
  .readFileSync(path.resolve(__dirname, "../../../ios/App/App/PasswordPickerPlugin.swift"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

function body(name: string): string {
  const at = swift.indexOf(`func ${name}(`);
  expect(at, `${name} exists`).toBeGreaterThan(-1);
  const open = swift.indexOf("{", swift.indexOf(")", at));
  let depth = 0;
  for (let i = open; i < swift.length; i++) {
    if (swift[i] === "{") depth++;
    else if (swift[i] === "}" && --depth === 0) return swift.slice(open, i + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

describe("a saved password signs in by itself", () => {
  it("the password field reports every edit to passwordChanged", () => {
    expect(swift).toMatch(/passwordField\.addTarget\(self, action: #selector\(passwordChanged\), for: \.editingChanged\)/);
  });

  it("only a whole password arriving in an empty field, with the email present, submits", () => {
    const b = body("passwordChanged");
    expect(b).toMatch(/passwordLengthBefore == 0/);
    expect(b).toMatch(/autoSubmitMinimumPasswordLength/);
    expect(b).toMatch(/!username\.isEmpty/);
    expect(b).toMatch(/self\.submit\(\)/);
  });

  it("a changed field cancels it, and it goes through the same submit as the button", () => {
    const b = body("passwordChanged");
    expect(b).toMatch(/\(self\.passwordField\.text\?\.count \?\? 0\) == now/);
    expect(b).not.toMatch(/finish\(/);
  });
});
