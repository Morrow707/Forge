import { describe, it, expect, vi } from "vitest";

vi.mock("./storage", () => ({ storage: {} }));
vi.mock("./email", () => ({ sendEmail: vi.fn() }));

const { buildCoveredByForgeEmail, buildNoLongerCoveredEmail } = await import("./exempt-list-email");

// The two emails the exempt list sends. Neither may carry a link or name a website: the reader
// may be on the iPhone app, which may not be pointed at a web checkout.
const noLinkOrSite = (html: string) => {
  const body = html.slice(html.indexOf("Hi "));
  expect(body).not.toMatch(/href=/i);
  expect(body).not.toMatch(/forgeperformancesystems|https?:\/\//i);
};

describe("the exempt list's emails", () => {
  it("tells a newly covered account it does not need a plan", () => {
    const email = buildCoveredByForgeEmail("Sam", null);
    expect(email.subject).toBe("Your Forge account is covered");
    expect(email.html).toContain("do not need to pick a plan or pay");
    expect(email.html).not.toContain("refunded");
    noLinkOrSite(email.html);
  });

  it("states the refund amount when a card plan was cancelled", () => {
    const email = buildCoveredByForgeEmail("Sam", {
      cancelled: ["sub_1"],
      refunds: [{ subscriptionId: "sub_1", amountCents: 1999, currency: "usd" }],
      failed: [],
      appStoreSubscription: false,
      stripeConfigured: true,
    });
    expect(email.html).toContain("$19.99 has been refunded");
    noLinkOrSite(email.html);
  });

  it("tells an App Store subscriber to cancel with Apple", () => {
    const email = buildCoveredByForgeEmail("Sam", {
      cancelled: [],
      refunds: [],
      failed: [],
      appStoreSubscription: true,
      stripeConfigured: true,
    });
    expect(email.html).toContain("through the App Store");
    expect(email.html).toContain("Subscriptions");
  });

  it("tells a removed account it needs a plan and that nothing was deleted", () => {
    const email = buildNoLongerCoveredEmail("Sam");
    expect(email.subject).toBe("Your Forge account now needs a plan");
    expect(email.html).toContain("needs a plan to keep training");
    expect(email.html).toContain("Nothing has been removed");
    noLinkOrSite(email.html);
  });
});
