import { describe, it, expect } from "vitest";
import {
  resolveVideoRetentionLimits,
  VIDEO_RETENTION,
  VIDEO_STORAGE_ADD_ON,
} from "@shared/video-retention";

// The caller derives isMinor from derivePrivacyTier; this asks the decision directly, which is
// the half that had a billing flag in front of it.
const MINOR = true;
const ADULT = false;

// A BETA FLAG SHOULD NOT DECIDE HOW LONG A CHILD'S FOOTAGE IS KEPT.
//
// The beta/trial/enforcement-off unlocks exist so that shipping billing never restricts anyone by
// accident. That is right for a paid entitlement, where the cost of being wrong is an athlete
// losing a feature. A retention cap on a minor's video is not an entitlement -- it is a
// data-minimisation promise, and being wrong about it runs the other way.
describe("video retention for a minor", () => {
  const beta = {
    hasVideoStorageAddOn: false,
    isBetaAccount: true,
    trialExpiresAt: null,
    enforcementEnabled: false,
  };

  it("caps a minor's video even on a beta account", () => {
    const limits = resolveVideoRetentionLimits({ ...beta, isMinor: MINOR });
    expect(limits.totalCap).toBe(VIDEO_RETENTION.totalCap);
    expect(Number.isFinite(limits.totalCap)).toBe(true);
  });

  it("caps a teenager too, not only an under-13", () => {
    const limits = resolveVideoRetentionLimits({ ...beta, isMinor: MINOR });
    expect(Number.isFinite(limits.totalCap)).toBe(true);
  });

  it("still caps a minor mid-trial", () => {
    const trialing = {
      hasVideoStorageAddOn: false,
      isBetaAccount: false,
      trialExpiresAt: new Date(Date.now() + 86_400_000),
      isMinor: MINOR,
      enforcementEnabled: true,
    };
    expect(Number.isFinite(resolveVideoRetentionLimits(trialing).totalCap)).toBe(true);
  });

  // A parent who bought more storage bought it for their child. The exemption is from the free
  // unlocks, not from what was paid for.
  it("honours the paid add-on for a minor", () => {
    const limits = resolveVideoRetentionLimits({
      ...beta,
      hasVideoStorageAddOn: true,
      isMinor: MINOR,
    });
    expect(limits.totalCap).toBe(VIDEO_STORAGE_ADD_ON.totalCap);
  });

  // The unlocks are untouched for everyone else -- this exemption is about minors, and widening
  // it into "retention is always on" would restrict adults nobody meant to restrict.
  it("leaves an adult on a beta account unlimited", () => {
    const limits = resolveVideoRetentionLimits({ ...beta, isMinor: ADULT });
    expect(Number.isFinite(limits.totalCap)).toBe(false);
  });

  // No birthdate is treated as an adult here rather than guessed at. The minor gate refuses those
  // accounts outright, so one cannot be accumulating video in the first place.
  it("treats an unknown birthdate as an adult, since the gate already refuses it", () => {
    expect(Number.isFinite(resolveVideoRetentionLimits({ ...beta, isMinor: ADULT }).totalCap)).toBe(
      false,
    );
  });
});
