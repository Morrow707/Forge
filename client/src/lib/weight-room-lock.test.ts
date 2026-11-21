import { describe, expect, it } from "vitest";
import { lockedRedirectFor, stationPath } from "./weight-room-lock";

const TEAM = 7;

describe("the weight room station lock", () => {
  it("sends every signed-in screen back to the station while locked", () => {
    expect(lockedRedirectFor("/coach", TEAM)).toBe(stationPath(TEAM));
    expect(lockedRedirectFor("/coach/roster", TEAM)).toBe(stationPath(TEAM));
    expect(lockedRedirectFor("/coach/weight-room", TEAM)).toBe(stationPath(TEAM));
    expect(lockedRedirectFor("/admin/users", TEAM)).toBe(stationPath(TEAM));
    expect(lockedRedirectFor("/", TEAM)).toBe(stationPath(TEAM));
  });
  it("leaves the station itself, sign-in and the TV page alone, so nothing loops", () => {
    expect(lockedRedirectFor(stationPath(TEAM), TEAM)).toBeNull();
    expect(lockedRedirectFor("/login", TEAM)).toBeNull();
    expect(lockedRedirectFor("/tv/abc", TEAM)).toBeNull();
  });
  it("does nothing when no station is open", () => {
    expect(lockedRedirectFor("/coach/roster", null)).toBeNull();
  });
});
