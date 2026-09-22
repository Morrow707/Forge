import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source-scanned, same as the other consent-prompt tests in this directory: what matters here is
// the WIRING -- that there is no route around the gate, that a minor is not caught by it, and
// that the one thing being agreed to cannot be agreed to by accident. None of that needs a DOM.
const app = readFileSync(join(__dirname, "..", "App.tsx"), "utf8");
const gate = readFileSync(
  join(__dirname, "..", "components", "terms-reacceptance-gate.tsx"),
  "utf8",
);
const guardian = readFileSync(join(__dirname, "..", "pages", "guardian-dashboard.tsx"), "utf8");

// Section 16 of the signup Terms of Use promises an existing user is shown a material change and
// accepts it in the app before continuing. A promise a screen does not keep is worse than one
// that was never made.
describe("the terms re-acceptance gate", () => {
  it("is mounted app-wide, not on one screen", () => {
    expect(app).toContain('import { TermsReacceptanceGate } from "@/components/terms-reacceptance-gate"');
    // Beside the router, inside the auth provider -- so every signed-in route is behind it.
    expect(app).toContain("<TermsReacceptanceGate />");
    const shell = app.slice(app.indexOf("<AuthProvider>"), app.indexOf("</AuthProvider>"));
    expect(shell).toContain("<TermsReacceptanceGate />");
  });

  it("only asks when the server says this user has to answer", () => {
    expect(gate).toContain("user?.needsTermsAcceptance === true");
    expect(gate).toContain('queryKey: ["/api/auth/terms-status"]');
    expect(gate).toContain("if (!needs) return null;");
  });

  it("renders NOTHING for a minor -- the guardian is asked and the athlete keeps training", () => {
    expect(gate).toContain("if (status?.guardianDecides) return null;");
    // ...and the null comes BEFORE the dialog is built, so a minor never sees it flash.
    expect(gate.indexOf("guardianDecides) return null")).toBeLessThan(gate.indexOf("<Dialog"));
  });

  it("cannot be dismissed", () => {
    expect(gate).toContain("onOpenChange={() => {}}");
    expect(gate).toContain("hideClose");
    expect(gate).toContain("onEscapeKeyDown={(e) => e.preventDefault()}");
    expect(gate).toContain("onPointerDownOutside={(e) => e.preventDefault()}");
    // Signing out is the one other way past it, and it goes through the existing logout.
    expect(gate).toContain("Sign out instead");
    expect(gate).toContain("logoutMutation.mutate()");
  });

  it("gates Accept on the checkbox, and says exactly what is being agreed to", () => {
    expect(gate).toContain("I have read the updated Terms of Use and agree to them");
    // THREE THINGS NOW GATE ACCEPT, NOT ONE. The checkbox was the whole gate, and a tick plus
    // a tap cleared a contract with the document still on its first screen. Reaching the end of
    // the text and typing initials were added 2026-09-22 -- "make them read the whole document,
    // not just click through without reading", "make them sign their initials".
    expect(gate).toContain("const canAccept = reachedEnd && agreed && initialsLookValid(initials);");
    expect(gate).toContain("disabled={!canAccept || accept.isPending}");
    // Hidden behind the scroll, not merely disabled behind it -- a greyed-out Accept under an
    // unread document still says the transaction is one tap away.
    expect(gate).toContain("{!reachedEnd ? (");
    expect(gate).toContain("Forge's Terms of Use have changed");
    expect(gate).toContain("Please read the updated terms and accept them to keep using Forge.");
  });

  it("posts the agreement and clears the flag it was gated on", () => {
    expect(gate).toContain('apiRequest("POST", "/api/auth/accept-terms", {');
    // The typed initials go with the agreement -- the server records them on the front of the
    // snapshotted document, which is the evidentiary record this consent already keeps.
    expect(gate).toContain("initials: initials.trim().toUpperCase(),");
    expect(gate).toContain('qc.invalidateQueries({ queryKey: ["/api/auth/me"] })');
  });

  it("says a failed read failed, instead of spinning forever", () => {
    // The hydrate-in-an-effect trap, in its blocking-overlay form: a status read that never lands
    // would otherwise leave somebody locked behind an empty dialog.
    expect(gate).toContain("<ReadFailed");
    expect(gate).toContain("onRetry={() => void refetch()}");
  });
});

describe("the guardian's copy of the question", () => {
  it("lists each athlete waiting, and nothing when none are", () => {
    expect(guardian).toContain("function TermsReacceptanceRequests()");
    expect(guardian).toContain('queryKey: ["/api/guardian/terms-reacceptance"]');
    expect(guardian).toContain("if (pending.length === 0) return null;");
    expect(guardian).toContain("<TermsReacceptanceRequests />");
    expect(guardian).toContain("Updated Terms of Use");
  });

  it("lets the guardian read the terms before accepting them", () => {
    expect(guardian).toContain("Read the terms");
    expect(guardian).toContain('queryKey: ["/api/auth/terms-status"]');
    expect(guardian).toContain("enabled: readingFor != null");
  });

  it("accepts for a named athlete and re-reads the list", () => {
    expect(guardian).toContain(
      'apiRequest("POST", "/api/guardian/terms-reacceptance", { athleteId, agreed: true })',
    );
    expect(guardian).toContain("Accept for {p.athleteName}");
    expect(guardian).toContain(
      'qc.invalidateQueries({ queryKey: ["/api/guardian/terms-reacceptance"] })',
    );
  });
});
