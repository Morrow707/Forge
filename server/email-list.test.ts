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
});
