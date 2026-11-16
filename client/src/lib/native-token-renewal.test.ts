import { describe, expect, it } from "vitest";
import { nativeTokenMsLeft, nativeTokenWantsRenewal, RENEW_WHEN_OLDER_THAN_MS } from "./native-token-renewal";

const DAY = 24 * 60 * 60 * 1000;
const tokenExpiringIn = (ms: number, now: number) => `7.42.${now + ms}.abcdef`;

describe("the phone renews its sign-in once it is more than a day old", () => {
  const now = 1_800_000_000_000;
  it("a token signed just now is left alone", () => {
    expect(nativeTokenWantsRenewal(tokenExpiringIn(30 * DAY, now), now)).toBe(false);
  });
  it("a token held more than a day is renewed", () => {
    expect(nativeTokenWantsRenewal(tokenExpiringIn(30 * DAY - RENEW_WHEN_OLDER_THAN_MS - 1000, now), now)).toBe(true);
    expect(nativeTokenWantsRenewal(tokenExpiringIn(2 * DAY, now), now)).toBe(true);
  });
  it("an expired, missing or unreadable token asks nothing", () => {
    expect(nativeTokenWantsRenewal(tokenExpiringIn(-1, now), now)).toBe(false);
    expect(nativeTokenWantsRenewal(null, now)).toBe(false);
    expect(nativeTokenWantsRenewal("not-a-token", now)).toBe(false);
    expect(nativeTokenMsLeft("a.b.c", now)).toBeNull();
  });
});
