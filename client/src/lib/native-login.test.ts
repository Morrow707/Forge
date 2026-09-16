import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const nativeAuth = read("client/src/lib/native-auth.ts");
const loginPage = read("client/src/pages/login.tsx");
const plugin = read("ios/App/App/PasswordPickerPlugin.swift");
const indexCss = read("client/src/index.css");

/** The native login screen exists for exactly two lines of Swift, and is otherwise a duplicate of
 * a screen that already works. These pin the parts that make that trade worth making -- lose any
 * of them and what is left is a second login screen for nothing. */
describe("the native login screen", () => {
  it("marks its fields as a sign-in form, which is the whole reason it exists", () => {
    // iOS AutoFill fills from Apple Passwords, and offers to save, only for real text fields
    // carrying these content types. The webview form cannot be filled however it is marked up:
    // AutoFill matches on page origin and the bundle is served from capacitor://localhost.
    expect(plugin).toMatch(/usernameField\.textContentType = \.username/);
    expect(plugin).toMatch(/passwordField\.textContentType = \.password/);
  });

  it("dismisses itself before reporting an outcome, which is what triggers the save prompt", () => {
    // No API asks iOS for "Save Password?". Dismissing the view controller after a sign-in is
    // the only signal there is, so the outcome has to be delivered from the dismiss completion.
    expect(plugin).toMatch(/dismiss\(animated: true\) \{ \[onOutcome\] in onOutcome\(outcome\) \}/);
  });

  it("guards against resolving the plugin call twice", () => {
    // Submit, a link tap and a swipe-away all land in finish(); resolving a CAPPluginCall twice
    // is a crash, not an error.
    expect(plugin).toMatch(/private var finished = false/);
    expect(plugin).toMatch(/guard !finished else \{ return \}/);
  });

  it("does not authenticate -- it hands credentials back to the one existing auth path", () => {
    // Two login implementations would be two sets of rules about lockout, MFA and consent.
    expect(plugin).not.toMatch(/URLSession|api\/auth\/login/);
    expect(loginPage).toMatch(/loginMutation\.mutate\(\{ email: outcome\.username/);
  });

  it("is offered on iOS only", () => {
    // Android autofill already works against the webview form, so there is nothing to fix there
    // and no reason to maintain a second screen for it.
    expect(nativeAuth).toMatch(/getPlatform\(\) === "ios"/);
  });

  it("falls back to the web form when the native screen is unavailable or dismissed", () => {
    expect(nativeAuth).toMatch(/if \(!isNativeLoginAvailable\(\)\) return null;/);
    expect(loginPage).toMatch(/outcome\.action === "dismissed"[\s\S]{0,80}setNativeShowing\(false\)/);
  });

  it("never draws the web form underneath the native one", () => {
    // The previous attempt rendered the branded web screen and then covered it with an unstyled
    // system sheet, which read as a bug. The decision is made before the first render.
    expect(loginPage).toMatch(/useState\(isNativeLoginAvailable\)/);
  });

  it("uses the same colour tokens as the web screen rather than hand-picked values", () => {
    // Converted from HSL in Swift so the two cannot drift: if the stylesheet changes, this fails.
    for (const [token, swift] of [
      ["--neutral-hue", /neutralHue: CGFloat = 222/],
      ["--primary", /primary = hsl\(14, 85, 42\)/],
      ["--radius", /radius: CGFloat = 9\.6/],
    ] as Array<[string, RegExp]>) {
      expect(indexCss, token).toContain(token);
      expect(plugin, token).toMatch(swift);
    }
    expect(indexCss).toMatch(/--neutral-hue:\s*222/);
    expect(indexCss).toMatch(/--primary:\s*14 85% 42%/);
    expect(indexCss).toMatch(/--radius:\s*0\.6rem/);
  });
});
