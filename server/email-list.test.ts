import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderCampaignBody, buildCampaignEmail } from "./email-list-render";

/** The parts of the launch email list that need no database: how a typed message becomes HTML,
 * and that the unsubscribe link is a page, not an action. */
describe("renderCampaignBody", () => {
  it("escapes, paragraphs on blank lines, breaks on single newlines, links bare URLs", () => {
    const html = renderCampaignBody("Line one\nLine two <script>x</script>\n\nSee https://forgeperformancesystems.com/pricing.");
    expect(html).toContain("Line one<br>Line two &lt;script&gt;x&lt;/script&gt;");
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain('<a href="https://forgeperformancesystems.com/pricing"');
    // The trailing full stop is punctuation, not part of the link.
    expect(html).toContain("</a>.");
  });
  it("cannot be made to emit an attribute from the text", () => {
    const html = renderCampaignBody('x" onmouseover="alert(1)');
    expect(html).not.toContain('onmouseover="');
  });
});

describe("the unsubscribe link", () => {
  it("opens a page and the page's POST acts; no GET route unsubscribes", () => {
    const src = readFileSync(join(__dirname, "email-list.ts"), "utf8");
    expect(src).not.toMatch(/app\.get\(\s*["']\/api\/public\/email-list\/unsubscribe/);
    expect(src).toMatch(/app\.post\(\s*["']\/api\/public\/email-list\/unsubscribe/);
    const html = buildCampaignEmail({ body: "hi", unsubscribeUrl: "https://x.test/unsubscribe?token=abc" });
    expect(html).toContain('href="https://x.test/unsubscribe?token=abc"');
    expect(html).not.toContain("/api/");
  });

  it("is on every campaign email there is, because there is no other footer", () => {
    // Until 2026-10-11 this renderer had a second footer for a null unsubscribeUrl -- the
    // Coaches Corner monthly digest, whose way out was turning off notifications in the app.
    // That feature is deleted and the only mailing left is the PUBLIC launch list, where a
    // message with no unsubscribe link is not a style choice. The type now requires the link;
    // this asserts the rendered HTML carries it, which the type cannot.
    // On the source for the shape (a nullable link is the state that allowed the second
    // footer) and on the OUTPUT for what a reader actually gets. The file still NAMES Coaches
    // Corner, in the comment recording why that footer went -- which is why this reads the
    // rendered HTML for the sentence rather than grepping the source for the words.
    const src = readFileSync(join(__dirname, "email-list-render.ts"), "utf8");
    expect(src).not.toMatch(/unsubscribeUrl: string \| null/);
    for (const body of ["hi", "", "line\n\nline", "Coaches Corner is great"]) {
      const html = buildCampaignEmail({ body, unsubscribeUrl: "https://x.test/u?token=t" });
      expect(html).toContain(">Unsubscribe</a>");
      expect(html).not.toContain("your Forge account has Coaches Corner");
      expect(html).not.toContain("notification settings to stop these");
    }
  });
});
