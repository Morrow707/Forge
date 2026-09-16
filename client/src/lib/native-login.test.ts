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

  it("cannot be scrolled at all", () => {
    // A login screen that rubber-bands under a thumb reads as a page in a browser. There is no
    // scroll view: the screen is centred, and the keyboard is handled by moving it.
    expect(plugin).not.toMatch(/UIScrollView/);
    expect(plugin).toMatch(/pageCenterY\.constant =/);
  });

  it("puts the keyboard away without covering the Passwords suggestion", () => {
    // The dismiss control is app content pinned above the keyboard, NOT an inputAccessoryView:
    // an accessory view sits inside the keyboard's own stack, where iOS draws the AutoFill
    // suggestion -- the one thing this screen exists to surface.
    expect(plugin).not.toMatch(/\.inputAccessoryView\s*=/);
    expect(plugin).toMatch(/keyboardBarBottom\.constant = -overlap/);
    expect(plugin).toMatch(/UITapGestureRecognizer\(target: self, action: #selector\(dismissKeyboard\)\)/);
    expect(plugin).toMatch(/dismissTap\.cancelsTouchesInView = false/);
  });

  it("says the same thing as the web screen", () => {
    // The two are meant to be one screen. Copy drifting apart is how that claim quietly stops
    // being true, so the heading is asserted on both sides.
    expect(plugin).toMatch(/Self\.label\("Welcome back"/);
    expect(loginPage).toMatch(/<CardTitle>Welcome back<\/CardTitle>/);
    expect(loginPage).not.toMatch(/Enter your credentials to continue/);
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

  it("never lets a label be what gives way when the keyboard is up", () => {
    // WHAT THIS PINS. With the keyboard up the page carried two REQUIRED constraints that could
    // not both hold -- centred in the safe area, and no higher than 12pt below its top. Auto
    // Layout resolved the conflict by crushing whatever had the weakest say, and in a stack of
    // labels and fields that is every label: "Email" disappeared outright, "Password" drew
    // clipped through the field beneath it, "Welcome back" went, and both footer links vanished
    // while the plain-text half of the same sentence stayed. The fields kept their shape only
    // because they carry required height constraints of their own.
    //
    // Two halves, and both matter. Labels refuse to compress, and centring is allowed to lose.
    // Raising the labels alone would have left the conflict unresolved somewhere else.
    expect(plugin).toMatch(
      /l\.setContentCompressionResistancePriority\(\.required, for: \.vertical\)/,
    );
    expect(plugin).toMatch(
      /b\.setContentCompressionResistancePriority\(\.required, for: \.vertical\)/,
    );
    expect(plugin).toMatch(/pageCenterY\.priority = \.defaultHigh - 1/);
    // The top margin stays required -- it is what keeps the card out from under the status bar,
    // and it is the constraint centring is supposed to yield to.
    expect(plugin).toMatch(/page\.topAnchor\.constraint\(greaterThanOrEqualTo/);
  });
});
