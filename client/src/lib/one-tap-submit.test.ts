import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf-8");

const button = read("client/src/components/ui/button.tsx");
const passwordInput = read("client/src/components/ui/password-input.tsx");

/**
 * Reported on-device: tapping Log In with the keyboard up only dismissed the keyboard, and a
 * second tap was needed. The blur at mousedown reflows the page between mousedown and click,
 * so the click lands somewhere else. Preventing mousedown's default is the fix.
 */
describe("one tap submits", () => {
  it("prevents the focus change on a submit button", () => {
    expect(button).toContain('type === "submit"');
    expect(button).toContain("e.preventDefault()");
  });

  it("lets a caller override it rather than forcing the behaviour", () => {
    expect(button).toContain("onMouseDown ??");
  });

  it("leaves non-submit buttons alone", () => {
    // A plain button has no field to blur and no reason to refuse focus.
    expect(button).toMatch(/type === "submit"\s*\?/);
    expect(button).toContain(": undefined");
  });

  it("applies the same fix to the password toggle", () => {
    // Tapping the eye mid-typing had the same problem: the tap was spent closing the keyboard.
    expect(passwordInput).toContain("onMouseDown={(e) => e.preventDefault()}");
  });
});

/**
 * The icon was twice reported as sitting too close to the field's edge, and the first attempt
 * only made it smaller -- which moves the glyph's EDGE in while leaving its centre where it
 * was, and makes the control harder to hit. The inset has to come from the button's geometry.
 */
describe("the password toggle is inset by geometry, not by shrinking", () => {
  it("gives the toggle a wide, full-height tap target", () => {
    expect(passwordInput).toContain("h-10 w-16");
  });

  it("keeps the field's padding matched to that width", () => {
    // Otherwise a long password runs underneath the icon.
    expect(passwordInput).toContain("pr-16");
  });

  it("does not shrink the glyph to buy the inset", () => {
    // 20px, larger than the 16px it replaced.
    expect(passwordInput).toContain('className="h-5 w-5"');
    expect(passwordInput).not.toContain("h-4 w-4");
  });

  it("draws its own lens rather than lucide's Eye", () => {
    // Usage, not mention -- the comment explains what it replaced and says both names.
    expect(passwordInput).not.toContain("lucide-react");
    expect(passwordInput).not.toMatch(/<(Eye|EyeOff)[\s/>]/);
    expect(passwordInput).toContain("<svg");
  });
});
