import { describe, it, expect, vi, beforeEach } from "vitest";

// notify.ts pulls in storage.ts -> db.ts, which throws at import time with
// no DATABASE_URL -- same reason billing.test.ts mocks ./storage before
// importing the module under test.
const createNotification = vi.fn().mockResolvedValue(undefined);
const getUnreadNotificationCount = vi.fn().mockResolvedValue(0);
const getUser = vi.fn().mockResolvedValue({
  id: 1,
  email: "athlete@example.com",
  notifyEmail: false,
  pushNotificationCategoryPrefs: null,
});

vi.mock("./storage", () => ({
  storage: { createNotification, getUnreadNotificationCount, getUser },
}));

const sendPushToUser = vi.fn();
let pushEnabled = true;
vi.mock("./push", () => ({
  sendPushToUser: (...args: unknown[]) => sendPushToUser(...args),
  get pushEnabled() {
    return pushEnabled;
  },
}));

let apnsEnabled = true;
vi.mock("./apns", () => ({
  get apnsEnabled() {
    return apnsEnabled;
  },
}));

const sendEmail = vi.fn();
vi.mock("./email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  escapeHtml: (s: string) => s,
  emailEnabled: false,
}));

const recordDeliveryAttempt = vi.fn();
vi.mock("./health-probes", () => ({
  recordDeliveryAttempt: (...args: unknown[]) => recordDeliveryAttempt(...args),
}));

const { notifyUser } = await import("./notify");

// A deployment that only configured native push (no VAPID keys) is the
// scenario that was mis-diagnosing itself: every native send -- successful
// or not -- used to get folded into recordDeliveryAttempt("push", ...) and
// judged under the Web Push badge, because sendPushToUser only ever
// returned one combined boolean. Web Push and APNs must each be counted,
// and judged, against their own channel.
describe("notifyUser attributes push delivery to the transport that actually ran", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNotification.mockResolvedValue(undefined);
    getUnreadNotificationCount.mockResolvedValue(0);
    getUser.mockResolvedValue({
      id: 1,
      email: "athlete@example.com",
      notifyEmail: false,
      pushNotificationCategoryPrefs: null,
    });
    pushEnabled = true;
    apnsEnabled = true;
  });

  it("records web and native results as separate channels, not one folded 'push'", async () => {
    sendPushToUser.mockResolvedValue({ web: true, apns: false });
    await notifyUser(1, "comment", "title", "body", "/link");

    expect(recordDeliveryAttempt).toHaveBeenCalledWith("push", true);
    expect(recordDeliveryAttempt).toHaveBeenCalledWith("apns", false);
    for (const call of recordDeliveryAttempt.mock.calls) {
      expect(["push", "apns", "email"]).toContain(call[0]);
    }
    expect(recordDeliveryAttempt).toHaveBeenCalledTimes(2);
  });

  it("never counts a native failure against the web push channel when web push isn't configured", async () => {
    // VAPID keys unset: web push is off. Only APNs is configured, and its
    // token has gone stale, so every send fails.
    pushEnabled = false;
    apnsEnabled = true;
    sendPushToUser.mockResolvedValue({ web: false, apns: false });

    await notifyUser(1, "comment", "title", "body", "/link");

    // The failure belongs to apns; "push" (web) was never configured and
    // must not be counted at all -- an unconfigured channel is not a
    // failing one.
    expect(recordDeliveryAttempt).toHaveBeenCalledWith("apns", false);
    expect(recordDeliveryAttempt).not.toHaveBeenCalledWith("push", expect.anything());
  });

  it("does not count either transport when neither is configured", async () => {
    pushEnabled = false;
    apnsEnabled = false;
    sendPushToUser.mockResolvedValue({ web: false, apns: false });

    await notifyUser(1, "comment", "title", "body", "/link");

    expect(recordDeliveryAttempt).not.toHaveBeenCalled();
  });
});
