import { describe, it, expect } from "vitest";
import {
  skillCameraProfile,
  mechanicsModeFor,
  mechanicsActionLabelFor,
  sprintDefaultsFor,
} from "./skill-camera-profile";

describe("mechanicsModeFor", () => {
  // The bug this table replaces: "Throwing, Pitching and Shooting are a throw, everything else
  // is a swing" sent four overhead throwing patterns through swing analysis.
  it.each(["QB Mechanics", "Serve", "Serving"])(
    "routes %s to throw analysis, not swing",
    (skillType) => {
      expect(mechanicsModeFor(skillType)).toBe("throw");
    },
  );

  it("keeps the three that were already right", () => {
    expect(mechanicsModeFor("Throwing")).toBe("throw");
    expect(mechanicsModeFor("Pitching")).toBe("throw");
    expect(mechanicsModeFor("Shooting")).toBe("throw");
  });

  it("keeps genuinely rotational patterns on swing", () => {
    expect(mechanicsModeFor("Hitting")).toBe("swing");
    expect(mechanicsModeFor("Full Swing")).toBe("swing");
    expect(mechanicsModeFor("Groundstrokes")).toBe("swing");
    expect(mechanicsModeFor("Takedowns")).toBe("swing");
  });

  // One skillType covering two unrelated actions, which no per-type default can express.
  it("splits Jumps & Throws by drill, since it holds both", () => {
    expect(mechanicsModeFor("Jumps & Throws", "Long Jump Approach and Takeoff")).toBe("swing");
    expect(mechanicsModeFor("Jumps & Throws", "High Jump Approach Curve")).toBe("swing");
    expect(mechanicsModeFor("Jumps & Throws", "Shot Put Glide Technique")).toBe("throw");
    expect(mechanicsModeFor("Jumps & Throws", "Discus Spin Technique")).toBe("throw");
    expect(mechanicsModeFor("Jumps & Throws", "Javelin Approach and Release")).toBe("throw");
  });

  it("falls back to a swing for a skillType a coach invented", () => {
    expect(mechanicsModeFor("Underwater Basket Weaving")).toBe("swing");
    expect(mechanicsModeFor(null)).toBe("swing");
  });
});

describe("skillCameraProfile", () => {
  // "Down the line" is meaningless without naming the line, and it is a different line in every
  // sport. Each profile has to say where to stand in that sport's own terms.
  it("names the reference line in the sport's own terms", () => {
    expect(skillCameraProfile("Full Swing").downTheLine).toContain("target line");
    expect(skillCameraProfile("Hitting").downTheLine).toContain("plate");
    expect(skillCameraProfile("Serve").downTheLine).toContain("service box");
    expect(skillCameraProfile("QB Mechanics").downTheLine).toContain("throwing line");
  });

  it("recommends the angle that sees the drill's primary fault", () => {
    // Weight transfer is the swing fault that costs most and is face-on only.
    expect(skillCameraProfile("Full Swing").preferredAngle).toBe("face_on");
    // Arm slot and separation are the throwing faults, and both are edge-on down the line.
    expect(skillCameraProfile("QB Mechanics").preferredAngle).toBe("down_the_line");
  });

  it("gives every drill an in-frame list and a rep boundary", () => {
    for (const type of ["Hitting", "Pitching", "Shooting", "Full Swing", "Serve", "Serving", "QB Mechanics", "Kicking", "Takedowns", "Sprint Mechanics", "Jumps & Throws", "Groundstrokes", "Fielding", "Catching", "Throwing"]) {
      const p = skillCameraProfile(type);
      expect(p.inFrame.length).toBeGreaterThan(10);
      expect(p.oneRep.length).toBeGreaterThan(10);
    }
  });

  it("lets a drill override its own skillType", () => {
    const shotPut = skillCameraProfile("Jumps & Throws", "Shot Put Glide Technique");
    expect(shotPut.mode).toBe("throw");
    expect(shotPut.oneRep).toContain("release");
  });
});

describe("mechanicsActionLabelFor", () => {
  it("names the attempt what the sport names it", () => {
    expect(mechanicsActionLabelFor("Shooting")).toBe("Shot");
    expect(mechanicsActionLabelFor("Serve")).toBe("Serve");
    expect(mechanicsActionLabelFor("Serving")).toBe("Serve");
    expect(mechanicsActionLabelFor("Kicking")).toBe("Kick");
    expect(mechanicsActionLabelFor("Pitching")).toBe("Throw");
    expect(mechanicsActionLabelFor("Full Swing")).toBe("Swing");
  });
});

describe("sprintDefaultsFor", () => {
  // The tracker opened every drill on the 40-yard preset. Distance is what turns two taps into a
  // speed, so a 20-yard dash left on that default reports every speed at double.
  it("opens a named-distance dash on its own distance", () => {
    expect(sprintDefaultsFor("20-Yard Dash")).toEqual({ presetId: "20yd", distanceYards: 20 });
    expect(sprintDefaultsFor("40-Yard Dash")).toEqual({ presetId: "40yd", distanceYards: 40 });
    expect(sprintDefaultsFor("60-Yard Dash")).toEqual({ distanceYards: 60 });
  });

  // Read as a distance the name suggests 5 yards; the athlete covers 20 over three legs.
  it("routes the pro agility shuttle to its three-leg preset", () => {
    expect(sprintDefaultsFor("5-10-5 Pro Agility Footwork")).toEqual({ presetId: "5-10-5" });
  });

  it("returns null when the distance genuinely varies", () => {
    expect(sprintDefaultsFor("Mirror Drill - Reactive Footwork")).toBeNull();
    expect(sprintDefaultsFor(null)).toBeNull();
  });
});
