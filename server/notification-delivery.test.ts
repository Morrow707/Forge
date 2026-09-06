import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const notify = readFileSync(join(__dirname, "notify.ts"), "utf8");
const push = readFileSync(join(__dirname, "push.ts"), "utf8");
const apns = readFileSync(join(__dirname, "apns.ts"), "utf8");
const videoJob = readFileSync(join(__dirname, "video-retention-job.ts"), "utf8");
const auth = readFileSync(join(__dirname, "auth.ts"), "utf8");
const routes = readFileSync(join(__dirname, "routes.ts"), "utf8");

// One rule underneath all of these: a send that reached nobody must not be
// indistinguishable from a delivered one. Neither transport throws on
// failure, so anything that acts on "we notified them" has to read a value.

describe("notifyUser reports delivery", () => {
  it("returns a delivered flag rather than void", () => {
    expect(notify).toContain("return { delivered:");
  });

  it("does not count the in-app row as reaching anyone", () => {
    // createNotification always succeeds; counting it would make the flag
    // meaningless for exactly the dormant accounts the sweeps target.
    const returnLine = notify.slice(notify.indexOf("return { delivered:"));
    expect(returnLine.slice(0, returnLine.indexOf("\n"))).not.toContain("createNotification");
  });

  it("reads the email result instead of discarding it", () => {
    expect(notify).toContain("emailDelivered = result.sent");
  });
});

describe("both push transports report whether anything landed", () => {
  it("web push returns true only when a subscription accepted it", () => {
    expect(push).toContain("Promise<boolean>");
    expect(push).toContain("results.some(Boolean)");
  });

  it("apns counts a token it was told to remove as undelivered", () => {
    const removal = apns.slice(apns.indexOf("if (shouldRemove)"));
    expect(removal.slice(0, removal.indexOf("return true"))).toContain("return false");
  });
});

describe("the retention grace clock starts only on delivery", () => {
  it("gates both sweeps on delivery AND on whether a channel was even tried", () => {
    expect(videoJob.match(/const \{ delivered, attempted \} = await notifyUser\(/g)?.length).toBe(2);
    // Holding the clock on !delivered alone disabled the sweep outright
    // wherever no channel is configured, and re-warned the same video every
    // night forever, because the in-app row is written before any send is
    // attempted. Only a channel that was tried and failed is worth retrying.
    expect(videoJob.match(/if \(!delivered && attempted\) \{/g)?.length).toBe(2);
  });

  it("skips the item instead of aborting the whole sweep", () => {
    // A return here would end the run and leave every later athlete
    // unwarned for the day.
    const guards = videoJob.split("not starting the grace clock");
    expect(guards.length).toBe(3);
    for (const after of guards.slice(1)) {
      // Bounded by lines, not by a brace -- the warning text interpolates
      // template expressions whose own braces would end the slice early.
      expect(after.split("\n").slice(0, 3).join("\n")).toContain("continue;");
    }
  });

  it("marks pending deletion only after the guard", () => {
    for (const marker of ["markVideoPendingDeletion", "markStaleAccountVideoPendingDeletion"]) {
      expect(videoJob.indexOf("not starting the grace clock")).toBeLessThan(
        videoJob.indexOf(`storage.${marker}(`),
      );
    }
  });
});

describe("a guardian invite records whether it was delivered", () => {
  it("reads the send result rather than relying on a throw", () => {
    expect(auth).toContain("storage.recordGuardianInviteDelivery(");
    expect(auth).toContain("result.sent ? { sent: true }");
  });

  it("reports a failed invite, since the athlete stays locked out", () => {
    const block = auth.slice(auth.indexOf("recordGuardianInviteDelivery("));
    expect(block).toContain('reportJobFailure("guardian-invite-email"');
  });
});

describe("every route that writes to the uploads disk checks free space", () => {
  it("guards all of them, not just the video ones", () => {
    // One definition plus one per writing route.
    expect(routes.match(/requireDiskSpace/g)?.length).toBe(8);
  });
});

describe("the annotation route bounds the request before decoding it", () => {
  const route = routes.slice(routes.indexOf('app.post("/api/coach/annotations"'));

  it("checks the encoded length first", () => {
    expect(route.indexOf("base64.length >")).toBeLessThan(route.indexOf('Buffer.from(base64, "base64")'));
  });

  it("does not block the event loop writing the file", () => {
    expect(route.slice(0, route.indexOf("res.status(201)"))).toContain("fsPromises.writeFile");
  });
});
