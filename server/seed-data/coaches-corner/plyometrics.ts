import { q, type SeedAcademyTrack } from "./types";

export const PLYOMETRICS_TRACK: SeedAcademyTrack = {
  title: "Plyometrics & Power Development",
  description:
    "A progression for jump training that starts with landing, builds to true reactive work, and counts contacts instead of guessing: how to add power to a roster without adding knee injuries.",
  keyPrinciplesForAi:
    "Plyometric training develops power by using the stretch-shortening cycle, and it is a progression, never a drill list. Teach the landing before the jump: quiet, hips back, knees tracking over the toes, stuck and held. Then jumps in place, then standing jumps for distance and height, then multiple jumps, then bounds, and only then depth and reactive work, with each stage earned by clean mechanics at the previous one. Dose plyometrics by ground contacts, keep low-intensity contacts around sixty to one hundred per session for beginners and more only for advanced athletes, put them early in the session when the athlete is fresh, rest fully between sets, and give forty-eight hours between intense sessions. Pair plyometrics with strength training; an athlete who cannot squat a meaningful load relative to body weight and land cleanly on one leg is not ready for high-intensity reactive work. Youth athletes do plyometrics as play and skill at low intensity, never as high-volume depth jumps.",
  lessons: [
    {
      lessonNumber: 1,
      title: "The Stretch-Shortening Cycle and Why Landing Comes First",
      estMinutes: 6,
      content:
        "A muscle that is stretched quickly and then shortened immediately produces more force than one that simply shortens. That is the stretch-shortening cycle, and it is the whole basis of plyometric training. A countermovement before a jump, the quick dip, loads the tendons and triggers a reflex that adds to the push. The faster and shorter that transition from stretch to shortening, the more the elastic contribution, which is why a good plyometric rep looks springy and a poor one looks like a slow squat followed by a jump.\n\nThe practical consequence is that plyometric quality lives in the ground contact. A long, soft, sinking contact loses the elastic energy; a short, stiff one keeps it. That is also why plyometrics are demanding: the forces at impact can be several times body weight, and the structures taking them are the tendons, the knee and the ankle. An athlete who cannot control a landing is not ready to make it springy, because stiffness without control is how joints get hurt.\n\nSo the first lesson in any plyometric program is landing. The position to teach is hips back, knees bent and tracking over the toes rather than collapsing inward, chest up, weight through the middle of the foot, and quiet. Have the athlete step off a low box, land, and stick it for a count of two. Then drop from a standing jump and stick it. Then do it on one leg, from a lower height, with the same rules. The sound is the simplest coaching tool you have: a loud landing is a hard landing, and a hard landing is a landing the athlete has not learned to absorb.\n\nUntil the roster can land quietly and hold the position on two legs and on one, the plyometric program is landing practice. That is not a delay. It is the part of the program that keeps the rest of it safe, and it builds the eccentric strength that makes the later jumping better.",
    },
    {
      lessonNumber: 2,
      title: "The Progression: Earn Each Stage",
      estMinutes: 7,
      content:
        "Plyometric exercises range from almost nothing to very demanding, and a program is a ladder through them. The order is roughly: jumps in place, such as pogo hops and tuck jumps with a reset between reps; standing jumps for height and distance with a full stick on every landing; multiple jumps in a row, such as consecutive broad jumps or hurdle hops, where the landing of one is the takeoff of the next; bounding, which is exaggerated running with long, powerful strides; box jumps and jumps down from boxes, where the height sets the intensity; and finally depth jumps, stepping off a box and jumping immediately on landing, which are the most intense and reactive form.\n\nEach stage is earned by clean mechanics at the previous one. The signs that an athlete is ready to move up are quiet landings, knees that stay out over the toes, a torso that stays upright rather than folding, and a ground contact that is getting shorter without getting sloppier. The signs that they are not: knees caving in, heels slamming, a visible pause at the bottom, or an athlete who is clearly bracing for impact rather than using it.\n\nTwo misunderstandings to avoid. First, a box jump is not a high-intensity plyometric. The jump up is a standing jump, and the box simply shortens the landing; a high box tests how far an athlete can tuck their knees, not how high they can jump. A box jump with a step down is a sensible early-stage exercise. Jumping down from the box and landing is where the intensity is, and that is the part to progress carefully. Second, depth jumps are a tool for strong, experienced athletes, used sparingly. The intensity comes from the height of the drop, and a modest box is plenty; a drop that produces a long, sinking contact is too high for that athlete, whatever the chart says.\n\nFor single-leg work, start a stage lower than the athlete is on two legs. Single-leg hops, bounds and especially single-leg landings are much more demanding than their two-leg versions, and the lateral and rotational control they require is exactly what most team-sport athletes lack.",
    },
    {
      lessonNumber: 3,
      title: "Dosing by Contacts, and Where It Goes in the Week",
      estMinutes: 5,
      content:
        "The unit of plyometric volume is the ground contact, not the set or the minute. Count every landing. A session of low-intensity jumps for a beginner might sit around sixty to one hundred contacts; an experienced athlete doing moderate work might take more; a session built around depth jumps should take far fewer, because each contact is worth much more. Writing contacts on the program forces the coach to see the real dose, and it is the number that goes up when an athlete starts complaining of shin or knee pain.\n\nIntensity and volume trade against each other. Low-intensity work such as pogos and skips can be done often and in reasonable volume, and it fits well into a warm-up. High-intensity work such as depth jumps and single-leg bounds needs low volume, long rests between sets, and at least forty-eight hours before the next intense session. Two plyometric sessions a week is a sensible ceiling for most rosters once intensity rises, and the low-intensity warm-up work does not count against that.\n\nPlacement in the session is the same as speed work: early, after a thorough warm-up, before the lifting, when the athlete is fresh. Reactive quality disappears with fatigue, and a tired athlete doing plyometrics is practicing slow contacts with a tired landing pattern. Pairing a plyometric with a strength exercise, such as a few box jumps before heavy squats, is a legitimate way to use the two together, provided the jump volume stays small.\n\nIn-season, keep a small dose of low- to moderate-intensity plyometric work in the program. It maintains the reactive quality the game needs and costs little if the volume is honest. What comes out in-season is the high-intensity, high-contact work, which the game is already supplying in a less controlled form.",
    },
    {
      lessonNumber: 4,
      title: "Strength Prerequisites, Youth Athletes and Surfaces",
      estMinutes: 5,
      content:
        "Plyometrics express strength; they do not replace it. An athlete who cannot produce and absorb force under load in the weight room will not get much from reactive work and will be exposed by it. A reasonable gate before high-intensity plyometrics, and especially before depth jumps, is a squat at a meaningful multiple of body weight with good form, the ability to land cleanly from a standing jump on one leg, and a track record of pain-free low-intensity jumping. For most high-school rosters, that means the strength program and the landing program run together for a season before the heavy plyometric work is on the menu at all.\n\nYouth athletes are a special case, and the right answer is not to exclude them but to change the dose. Children jump, hop and skip as play, and that is plyometric training at exactly the right intensity. A youth program uses games, low hurdles, hopscotch patterns, skipping and jumping onto low boxes, with the emphasis on landing quietly and on fun. What it does not use is depth jumps, high boxes, high-contact sessions or anything that treats a growing body like a trained adult's. The growth plates and the tendons of an adolescent are more vulnerable to repeated high impact, and the gains from intensity are not worth the risk at that age.\n\nSurface and footwear matter more in plyometrics than in most training. A sprung floor, a quality turf, a rubber track or firm grass are good. Concrete and hard tile are not, and the problem compounds with volume. Shoes should be stable with a firm sole; a thick, soft running shoe makes landings unstable, and a bare foot on a hard surface sends every contact straight into the shin. If the facility only has a hard floor, lower the volume and intensity and keep the work on mats or turf strips.\n\nThe last check is the athlete's own report. Shin, patellar tendon and heel soreness that persists between sessions is the plyometric program's warning light. Cut the contacts, stay at a lower intensity, look at the surface and the shoes, and let the tissue catch up. Power is built over months; a tendon problem can cost a season.",
    },
  ],
  quizQuestions: [
    q(0, "What should a beginner's first weeks of plyometric training mostly consist of?", [
      ["Landing practice: stepping off a low box and sticking quiet landings on two legs, then one", "Correct. Control of the landing is the prerequisite for everything else and builds the eccentric strength the later work needs."],
      ["Depth jumps from a high box to build power fast", "Depth jumps are the most intense stage and belong to strong, experienced athletes."],
      ["High-volume box jumps onto the highest box they can reach", "A high box mostly tests how far the athlete can tuck their knees, and the volume is excessive for a beginner."],
      ["No plyometrics; they should only lift", "Low-intensity jumping and landing work is appropriate early and complements the lifting."],
    ], 0),
    q(1, "Why does a loud, heavy landing matter?", [
      ["It shows the athlete has not learned to absorb force, which is both a quality and a safety problem", "Correct. Sound is a simple read on landing control; a hard landing loses elastic energy and loads joints the athlete is not controlling."],
      ["It does not; noise is irrelevant", "Noise is one of the clearest signs of how a landing was absorbed."],
      ["It means the athlete is producing more power", "A hard landing is uncontrolled force, not more power."],
      ["It only matters on hard floors", "The landing quality matters on every surface; hard floors just make the consequences worse."],
    ], 0),
    q(2, "Which part of a box jump carries the real plyometric intensity?", [
      ["Jumping down from the box and landing, which is why that part is progressed carefully", "Correct. The jump up is a standing jump; the drop and landing is where the force is."],
      ["The jump up onto the box", "The jump up is a standing jump; the box only shortens the landing."],
      ["Standing on the box", "Standing on the box is rest between the jump up and the drop; no force is produced or absorbed."],
      ["The height of the box regardless of what the athlete does", "A high box mostly measures hip and knee tuck, not jump height or landing intensity."],
    ], 0),
    q(3, "What is the unit for prescribing plyometric volume?", [
      ["Ground contacts", "Correct. Counting every landing shows the real dose and is the number to cut when soreness appears."],
      ["Minutes", "Time says nothing about how many landings happened or how hard they were."],
      ["Sets", "Sets hide the contact count; three sets of ten and three sets of three are very different doses."],
      ["Calories burned", "Energy cost is not what loads the tendons and joints."],
    ], 0),
    q(4, "Where in a training session should plyometrics go?", [
      ["Early, after a thorough warm-up, before lifting, while the athlete is fresh", "Correct. Reactive quality disappears with fatigue, and a tired athlete practices slow, poor landings."],
      ["At the end, as a finisher", "Fatigued plyometrics train slow contacts and raise injury risk."],
      ["In the middle of heavy squats to make them harder", "A few jumps before a heavy set is a legitimate pairing; piling jumps into the middle of a fatiguing lift is not."],
      ["Immediately after conditioning", "Conditioning leaves the athlete fatigued, which is the wrong state for reactive work."],
    ], 0),
    q(5, "How much recovery should separate two high-intensity plyometric sessions?", [
      ["At least forty-eight hours", "Correct. Intense plyometric sessions need recovery time; low-intensity warm-up jumping does not count against it."],
      ["None; daily sessions are fine", "Daily high-intensity sessions do not allow tendon recovery and lead to overuse problems."],
      ["A full week", "A week is more than needed and would limit the program's progress; two sessions a week with recovery between is a sensible ceiling."],
      ["It depends only on how the athlete feels", "Athlete feel matters, but tendon adaptation lags behind how fresh the legs feel."],
    ], 0),
    q(6, "Which is an appropriate plyometric program for a twelve-year-old?", [
      ["Low-intensity jumping, hopping and skipping as play, with quiet landings as the goal", "Correct. Children jump as play; the program changes the dose, not the inclusion."],
      ["Depth jumps from a moderate box twice a week", "Depth jumps are too intense for a growing body and offer little at that age."],
      ["The same program as the varsity roster at reduced weight", "Plyometrics have no weight to reduce; the intensity and contact volume are the problem."],
      ["No jumping of any kind until sixteen", "Low-intensity jumping is developmentally appropriate and beneficial."],
    ], 0),
    q(7, "Shin and patellar tendon soreness is persisting between plyometric sessions. What is the right response?", [
      ["Cut the contacts, drop the intensity, check the surface and shoes, and let the tissue catch up", "Correct. Persistent tendon soreness is the program's warning light and the dose is the fix."],
      ["Push through; soreness is normal adaptation", "Persistent tendon soreness is overuse, not adaptation, and ignoring it can cost a season."],
      ["Switch to harder surfaces to toughen the legs", "Harder surfaces increase the load on the shins and make the problem worse."],
      ["Add more plyometrics to speed up adaptation", "More volume on an irritated tendon is the opposite of what is needed."],
    ], 0),
  ],
};
