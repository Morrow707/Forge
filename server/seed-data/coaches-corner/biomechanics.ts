import { q, type SeedAcademyTrack } from "./types";

export const BIOMECHANICS_TRACK: SeedAcademyTrack = {
  title: "Biomechanics for the Weight Room",
  description:
    "Levers, moment arms, bar paths and ground reaction: the handful of physics ideas that explain why a lift feels the way it does, why technique cues work, and where injuries come from.",
  keyPrinciplesForAi:
    "Every lift is a set of levers turning about joints, and what the muscle fights is not the weight but the weight times its horizontal distance from the joint; that distance is the moment arm. Keeping the load close to the joints doing the work is the physics behind most technique cues: bar over midfoot, chest up, elbows in. A joint's strength changes through its range, so the sticking point of a lift is the position where the moment arm is longest and the muscle is at its weakest length, and that is where technique breaks first. Ground reaction force is what an athlete pushes against and what force plates measure and the camera estimates; rate of force development matters more than peak force in sport, and it is trained by intent. Impulse, force applied over time, is what moves an athlete, so a longer, well-directed push beats a short hard one. Levers differ by body, so the same lift looks different on a long-femured athlete and a short one, and the cue should fit the body, not a photograph.",
  lessons: [
    {
      lessonNumber: 1,
      title: "Levers, Moment Arms and Why Position Matters",
      estMinutes: 7,
      content:
        "A joint is a pivot and the bones around it are levers. The muscles that cross the joint pull on those levers, and the load the athlete holds pulls back. What decides how hard the muscle has to work is not the load alone but the load multiplied by its horizontal distance from the joint. That distance is the moment arm, and the product is the turning force the muscle has to match. Hold a bar at the shoulder and the shoulder's moment arm is small; hold the same bar at arm's length in front and the moment arm is long, and the bar feels several times heavier to the shoulder even though the plates have not changed.\n\nThis is the physics behind almost every technique cue a coach gives. Bar over the middle of the foot in a squat keeps the load's moment arm at the hip and knee as short as the athlete's body allows. Chest up in a deadlift keeps the bar close to the hips. Elbows tucked in a press keeps the load near the shoulder. A cue is a way of shortening a moment arm, and when a cue does not seem to work it is usually because it is lengthening a moment arm somewhere else.\n\nMoment arms also decide where the strain goes. A squat in which the hips shoot back and the chest drops moves the load away from the knees and toward the hips and lower back. That is not wrong in itself, since the hips are strong, but it changes which structures carry the load, and an athlete whose back is the weak link will feel it there. Watching where the bar drifts relative to the joints tells a coach which muscle group is being asked to do the work, before any number is recorded.\n\nThe body's own levers vary between athletes. A long femur with a short torso makes an upright squat mechanically harder; the hips have to travel further back to keep the bar over the foot. That athlete's correct squat looks more folded than a short-femured teammate's, and coaching them toward the teammate's picture will produce a worse lift. The rule is to cue the moment arm, bar close to the working joints, and let the shape follow from the body in front of you.",
    },
    {
      lessonNumber: 2,
      title: "Sticking Points and the Strength Curve",
      estMinutes: 6,
      content:
        "A muscle does not produce the same force through its whole range. It is strongest somewhere near its middle length and weaker when very short or very long. At the same time, the moment arm of the load changes through a lift as the joint angles change. Put those two together and every lift has a position where the muscle is at a weak length and the load's moment arm is near its longest. That is the sticking point, and it is where a heavy rep slows down, where technique breaks, and where a miss happens.\n\nIn a squat it is usually just above parallel on the way up; in a bench press a few inches off the chest; in a deadlift around the knee. Knowing where it is changes how a coach watches a set. The rep that grinds at the sticking point is at its true limit; the rep that grinds at lockout is a technique or bracing problem rather than a strength one. Those get different fixes.\n\nThe sticking point is also where the body cheats. When the prime mover is at its weakest, the athlete recruits whatever else can help: the back rounds to shorten the deadlift's moment arm, the hips rise early in a squat to hand the load to the back, the elbows flare in a bench to involve the shoulders. Each of those is a solution to a mechanical problem, and each shifts load onto a structure that was not supposed to carry it. The coach's job is to strengthen the weak position rather than to let the body route around it. Pauses in the weak position, partial lifts through it, and tempo work that slows the athlete down there all do that.\n\nAccommodating resistance, bands and chains, exists because of the strength curve. By adding load where the lift is strongest and removing it where it is weakest, they let the athlete train hard through the whole range. That is a tool for an athlete who already owns the lift, not a shortcut for a novice who has not yet found where their own sticking point lives.",
    },
    {
      lessonNumber: 3,
      title: "Ground Reaction, Impulse and Rate of Force",
      estMinutes: 7,
      content:
        "Every jump, sprint and change of direction is the athlete pushing on the ground and the ground pushing back equally. That push-back is ground reaction force, and it is what force plates measure and what a camera estimates when it tracks an athlete's movement. An athlete cannot pull themselves upward; they can only push down harder and longer, and the ground does the rest.\n\nTwo quantities decide what happens. Impulse is force applied over time, and it is impulse that changes an athlete's velocity. A big force applied for a very short time and a modest force applied for longer can produce the same jump. That is why a countermovement, the dip before a jump, helps: it lengthens the time the athlete can apply force and lets the muscles produce more of it on the way back up. It is also why a long, well-directed push in a sprint start beats a short stab at the ground.\n\nRate of force development is how quickly force rises once the push starts. In sport, the time available to push is often a fraction of a second, shorter than the time it takes a muscle to reach its peak force. An athlete with a huge peak force who develops it slowly will not express it in a cut or a jump. Rate is trained by intent, by moving light and moderate loads as fast as possible, by jumps and throws, and by the explosive lifts. It is the quality that separates a strong athlete from an explosive one, and it is the one that most sports reward.\n\nDirection matters as much as size. The ground pushes back along the line the athlete pushes, so a sprinter who pushes straight down bounces rather than accelerates, and a jumper who pushes forward travels instead of rising. Acceleration asks for a push backward and down at a low angle; a vertical jump asks for a push straight down. A great deal of technique coaching in speed and jumping is about directing force, which is why a stronger athlete is not automatically a faster one.",
    },
    {
      lessonNumber: 4,
      title: "Where Injuries Come From",
      estMinutes: 6,
      content:
        "Tissue fails when the load on it exceeds what it can bear, either once in a single event or repeatedly at a level it never gets to recover from. Biomechanics is the study of where that load goes, so it is also the study of where injuries come from, and a coach who can read moment arms and force direction can see many of them coming.\n\nThe first pattern is load migrating to a structure that is not built for it. A rounded back in a deadlift moves the load from the hip extensors to the spinal ligaments and discs. A knee collapsing inward on a landing moves the load from the muscles that should absorb it to the ligament on the inside of the knee. A bench press with the elbows flared moves load to the front of the shoulder. In each case the technique fault is a lever change, and the fix is the cue that puts the load back where the strong tissue is.\n\nThe second pattern is rate. Tissue tolerates a load applied gradually far better than the same load applied suddenly. Landings, decelerations and the catch of an explosive lift are all sudden, which is why eccentric strength and landing mechanics are protective and why the plyometric progression starts with learning to land before learning to jump. A tendon's capacity grows slowly, over months, and is the most common limit when an athlete's power increases faster than their tissue, which is the usual story behind a jumper's knee in a teenager who just got strong.\n\nThe third pattern is repetition without recovery. Tissue adapts to load by being loaded and then given time, and the same load without the time wears it down. The acute-to-chronic workload idea in Forge's own analytics is a way of watching this: a sudden jump in weekly load relative to what the athlete has been doing is the classic setup for an overuse injury. The physics does not change; what changes is whether the tissue was ready.\n\nNone of this makes a coach a clinician. When something hurts in a way that is sharp, localized or persistent, the athlete goes to somebody qualified to examine it. What biomechanics gives the coach is the ability to prevent the loads that get athletes there, and to describe to the clinician exactly what the athlete was doing when it happened.",
    },
  ],
  quizQuestions: [
    q(0, "What decides how hard a muscle must work to hold a load, according to the lever model?", [
      ["The load multiplied by its horizontal distance from the joint", "Correct. That product is the turning force on the joint; the distance in it is the moment arm, and shortening it is what most technique cues do."],
      ["The load alone", "The same load feels very different at the shoulder and at arm's length."],
      ["The athlete's bodyweight", "Bodyweight is part of the load in some lifts, but the moment arm is what matters."],
      ["The speed of the lift only", "Speed changes force demands, but position decides the lever."],
    ], 0),
    q(1, "Why does a long-femured athlete's correct squat look more folded forward than a teammate's?", [
      ["The hips must travel further back to keep the bar over the foot", "Correct. Cue the moment arm, not a photograph; the shape follows from the body."],
      ["They have weak quads", "Lever length, not weakness, explains the shape."],
      ["They are doing it wrong", "A more folded squat can be correct for that body."],
      ["Long femurs make squatting impossible", "They make it different, not impossible."],
    ], 0),
    q(2, "Where is the sticking point of a lift?", [
      ["Where the muscle is at a weak length and the load's moment arm is near its longest", "Correct. It is where a heavy rep slows, technique breaks, and misses happen."],
      ["Always at lockout", "A grind at lockout is usually a bracing or technique issue, not the true sticking point."],
      ["At the very start of every lift", "It depends on the lift; in a squat it is typically just above parallel."],
      ["There is no such thing", "Every lift has one, and knowing it changes how a coach watches a set."],
    ], 0),
    q(3, "An athlete's hips rise early in a squat so the back finishes the lift. What is happening mechanically?", [
      ["The body is routing load around a weak position onto a different structure", "Correct. The fix is to strengthen the weak position, not to let the body cheat through it."],
      ["Perfect technique", "It is a compensation that shifts load to the back."],
      ["The bar is too light", "Early hip rise is typical when the load is near the limit, not light."],
      ["Nothing; hips should always rise first", "Hips and chest should rise together to keep the load on the intended muscles."],
    ], 0),
    q(4, "Why does the dip before a vertical jump help?", [
      ["It lengthens the time force can be applied and lets the muscles produce more on the way up", "Correct. Impulse is force over time, and the countermovement extends both."],
      ["It makes the athlete lighter", "No; it changes impulse, not mass."],
      ["It rests the legs", "The dip is active loading, not rest."],
      ["It does not help; jumps from a dead stop are always higher", "The countermovement jump is almost always higher for this reason."],
    ], 0),
    q(5, "Which quality separates a strong athlete from an explosive one?", [
      ["Rate of force development", "Correct. Sport rarely allows time to reach peak force; how fast force rises is what gets expressed."],
      ["Peak force alone", "Peak force matters, but if it develops slowly it is not expressed in a cut or jump."],
      ["Flexibility", "Mobility is useful, but it does not determine explosiveness."],
      ["Bodyweight", "Lighter is not automatically more explosive."],
    ], 0),
    q(6, "A sprinter pushes straight down at the start. What happens?", [
      ["They bounce upward rather than accelerate forward", "Correct. The ground pushes back along the line of the push; acceleration needs a backward-and-down push at a low angle."],
      ["They accelerate faster", "Direction of force decides direction of motion; straight down does not drive forward."],
      ["Nothing changes", "Force direction is a large part of sprint technique."],
      ["They slip", "Slipping is a traction issue; the direction problem is about where the force goes."],
    ], 0),
    q(7, "A teenager's power jumped quickly over a few months and now has knee pain at the tendon. What is the most likely mechanism?", [
      ["Tissue capacity grows slower than power did, and the tendon was not ready for the new load", "Correct. Tendons adapt over months; a fast rise in power outpaces them. The athlete sees a clinician."],
      ["The shoes", "Equipment rarely explains a load-capacity mismatch of this kind."],
      ["Too much stretching", "Stretching is not the usual cause of tendon pain in a rapidly strengthening athlete."],
      ["Bad luck with no mechanism", "There is a mechanism, and watching load progression can prevent it."],
    ], 0),
  ],
};
