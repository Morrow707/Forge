import { q, type SeedAcademyTrack } from "./types";

export const TECHNIQUE_SAFETY_TRACK: SeedAcademyTrack = {
  title: "Lifting Technique, Spotting & Weight Room Safety",
  description:
    "Teaching the big lifts so they hold up under load, spotting rules that actually protect the lifter, and running a weight room where the emergency plan is written down before it is needed.",
  keyPrinciplesForAi:
    "Teach a lift from the ground up with the bar empty and earn load by holding the pattern: brace before the lift, keep the bar over the middle of the foot, drive the knees out over the toes, and keep the spine in a neutral, braced position rather than chasing a flat back. The squat, hinge, press and pull each have two or three faults that account for most problems; cue one thing at a time. Spot the bench and the squat with trained spotters and never spot an Olympic lift or a deadlift; the lifter bails. Collars on every loaded bar, a cleared platform, a rack set to the right height, and a coach who can see the lifter. The weight room has a written emergency action plan, a stocked first-aid kit, a working phone and a supervision ratio the staff can actually keep, and every coach knows the plan before the first session.",
  lessons: [
    {
      lessonNumber: 1,
      title: "Teaching a Lift: Empty Bar, Earned Load",
      estMinutes: 6,
      content:
        "Every lift is taught the same way: pattern first, load second, and the load is earned by holding the pattern. A new lifter starts with a dowel or an empty bar, learns the positions, and adds weight only when the movement looks the same at the new weight as it did at the old one. The moment the pattern changes under load, the load is too heavy for today, whatever the program card says.\n\nThe common thread across the big lifts is the brace. Before the bar moves, the athlete takes a breath into the belly, tightens the trunk as if about to be pushed, and holds that pressure through the hardest part of the rep. A braced trunk is what keeps the spine in a stable, roughly neutral position; the cue to force a flat or arched back produces a different problem. Teach the brace standing still, then with an empty bar, then under load.\n\nThe squat: feet about shoulder width with the toes turned out a little, the bar over the middle of the foot throughout, knees pushed out over the toes as the hips descend, chest up, and a depth where the hip crease reaches the top of the knee or lower if the athlete can hold position there. The faults that cover most problems are knees collapsing inward, heels rising, and the hips shooting up out of the bottom so the back takes the load. Each has a cue and a regression: knees out, heels down or an elevated heel while the ankle improves, and a pause at the bottom to teach the drive.\n\nThe hinge: soft knees, hips pushed back as the torso tilts forward, the bar or weight sliding close to the legs, and a return by driving the hips forward. The faults are rounding through the lower back, squatting the hinge by bending the knees too much, and letting the bar drift away from the body. A dowel along the spine for feedback and a hinge to a box or band teach the shape.\n\nThe press and the pull: a stable base, shoulder blades set, the bar moving in a path close to the body, and a full range the athlete controls. For every lift, cue one thing per set. An athlete given four corrections fixes none; an athlete given one fixes it and remembers it.",
    },
    {
      lessonNumber: 2,
      title: "Spotting: Who, How and Never",
      estMinutes: 5,
      content:
        "A spotter exists to help a lifter who fails a rep finish or escape it safely. That job has rules, and the rules differ by lift.\n\nThe bench press is the lift where a spotter is mandatory on every working set. The spotter stands at the head of the bench, hands close to the bar but not on it, and helps with a lift-off if asked, then watches the whole set. If the bar stalls, the spotter helps immediately with both hands, moving the bar up and back to the rack together with the lifter; the spotter never lets go until the bar is racked. The lifter keeps a full grip, thumbs around the bar, because a thumbless grip is how a bar ends up on a chest. Heavy sets in a rack with safety bars set just below chest height are the best protection of all, because they work whether or not the spotter is paying attention.\n\nThe back squat is spotted with the lifter in a rack with the safety bars set correctly, which does most of the work. One spotter behind the lifter, arms under the lifter's armpits around the chest, ready to help the lifter stand if the rep stalls, with heavy sets using two side spotters at the ends of the bar as well. The spotter follows the lifter down and up without touching them unless help is needed. Teaching athletes to bail, to dump the bar backward onto the safeties and step forward, is part of teaching the squat, and it should be practised with an empty bar.\n\nSome lifts are never spotted. The Olympic lifts and their variations are dropped, not caught; a spotter in the way is a spotter who gets hurt, and the platform is cleared so the bar has room to land. The deadlift is set down, never spotted. Overhead presses are bailed by lowering to the front or dropping forward, not caught from behind.\n\nSpotting is a trained skill. An untrained teammate grabbing a bar at the wrong moment has pulled lifters off balance, and a spotter who is too far away is no spotter. Teach it with the same care as the lifts: who spots, where they stand, when they touch the bar, and how they communicate before the set.",
    },
    {
      lessonNumber: 3,
      title: "The Room: Setup, Supervision and Habits",
      estMinutes: 5,
      content:
        "Most weight room injuries are not dramatic failures under heavy load. They are a plate dropped on a foot, a bar rolling off an uncollared end, a trip over a dumbbell left on the floor, a rack pin set at the wrong height, an athlete lifting unsupervised in a corner. The room's habits prevent them.\n\nCollars on every loaded bar, every time, including warm-ups. Plates returned to the tree the moment they come off the bar. Dumbbells returned to the rack between sets, not left where they can be stepped on. Safety bars and rack pins set for each lifter's height before the first rep, and checked by the coach on heavy sets. Platforms and the areas around racks kept clear: no bags, no phones, no water bottles, no spectators inside the lifting space. Shoes with a flat, firm sole; no bare feet, no sandals, no running shoes for heavy squats if it can be avoided.\n\nSupervision means a coach who can see the lifters and reach them. The ratio the staff can keep depends on the experience of the roster and the lifts being done; novices on the bench and the squat need close attention, and a session where one coach is supervising thirty athletes across four racks is a session where someone is unsupervised. If the ratio cannot be kept, change the session: fewer athletes at a time, simpler lifts, or lighter loads that do not need a spotter.\n\nAthletes lift when a coach is present. A locked room outside supervised hours is not an inconvenience; it is the rule that prevents the injury that happens when a group of seniors decide to max out on a Saturday. Make the rule clear, make it the same for every athlete, and enforce it.\n\nFinally, the equipment. Inspect it. Frayed cables, cracked bars, bent collars, loose rack bolts, worn bench upholstery that lets a lifter slide, and benches that wobble are all things a monthly walk-through finds and a busy season misses. Keep a log, pull anything doubtful from service, and do not let a broken machine stay on the floor with a handwritten sign on it.",
    },
    {
      lessonNumber: 4,
      title: "The Emergency Action Plan",
      estMinutes: 5,
      content:
        "An emergency action plan is a short, written document that says what happens when something goes badly wrong in the weight room: a collapse, a serious injury, a cardiac event, a bar on a chest. It is written before it is needed, every coach who supervises the room knows it, and it is practised at least once a season. A plan that lives in a binder nobody has opened is not a plan.\n\nThe plan answers specific questions. Who calls emergency services, from what phone, and what address and entrance do they give; a visiting coach or a student assistant may not know the building's address, so it is written on the plan and posted by the phone. Who goes to meet the ambulance and open the door. Who stays with the athlete. Where the first-aid kit and the automated external defibrillator are, and who is trained to use them; if the room does not have access to a defibrillator within a few minutes' reach, that is a problem to raise with the athletic director this week, because a cardiac arrest is survivable with one and usually fatal without. Who has each athlete's emergency contact and medical information, and where it is kept. How the room is cleared and the other athletes managed while the emergency is handled.\n\nThe coach's own preparation is part of the plan. Current first-aid and CPR certification for every coach who supervises the room, including defibrillator training, is a baseline, and a school that has not required it should. Know the signs of the emergencies most likely in a weight room: a cardiac event, heat illness in a hot room during summer sessions, a head injury from a fall or a dropped bar, and a serious bleed. Know when to stop a session: an athlete who is confused, who has chest pain, who faints, or who has a severe or worsening pain is not finishing the set.\n\nAfter any serious incident, write it down while it is fresh: what happened, who was there, what was done and when. That record protects the athlete, the coach and the program, and it is how the plan gets better.",
    },
  ],
  quizQuestions: [
    q(0, "When should load be added to a new lifter's bar?", [
      ["When the movement looks the same at the new weight as it did at the old one", "Correct. The pattern earns the load; a pattern that changes under weight says the weight is too much today."],
      ["According to the program's percentages regardless of form", "The program card cannot see the lifter; the coach can."],
      ["As fast as possible to build confidence", "Rapid loading on an unstable pattern builds bad habits and injuries."],
      ["Never in the first year", "Load is appropriate once the pattern holds; withholding it for a year wastes training time."],
    ], 0),
    q(1, "What does bracing the trunk do before a lift?", [
      ["Creates pressure that keeps the spine in a stable, roughly neutral position under load", "Correct. The brace, not a forced flat or arched back, is what protects the spine."],
      ["Makes the lifter heavier", "It does not change body weight."],
      ["Forces the back into an arch", "Chasing an arch creates a different problem; the goal is stable and neutral."],
      ["Is only needed on maximal attempts", "Every loaded rep benefits from a brace, and the habit must be built on light loads."],
    ], 0),
    q(2, "A squatter's hips shoot up out of the bottom and the back takes the load. Which cue or regression fits?", [
      ["A pause at the bottom to teach driving up with the legs", "Correct. The pause removes the bounce and teaches the drive from a stable bottom position."],
      ["Add weight to force the pattern", "More load on a pattern that already loads the back makes it worse."],
      ["Tell them to look up at the ceiling", "Looking up changes the neck and often makes the back angle worse."],
      ["Switch to a leg press permanently", "The pattern can be fixed; abandoning the lift loses what it teaches."],
    ], 0),
    q(3, "How should a bench press be spotted?", [
      ["A spotter at the head of the bench watching the whole set, helping immediately if the bar stalls and never letting go until it is racked, with safety bars set in a rack for heavy sets", "Correct. Both the spotter and the rack safeties protect the lifter; the lifter uses a full grip."],
      ["A spotter standing to the side", "A side spotter cannot help a stalled bar effectively."],
      ["No spotter if the lifter is experienced", "The bench is the lift where a spotter is mandatory on every working set."],
      ["A spotter who lifts the bar for most of the set", "A spotter helps on a failed rep; doing the lifting makes the set meaningless."],
    ], 0),
    q(4, "Which lifts should never be spotted?", [
      ["The Olympic lifts and the deadlift; the bar is dropped or set down, never caught", "Correct. A spotter on those lifts is in the way and gets hurt; the platform is cleared instead."],
      ["The back squat", "The squat is spotted, with rack safeties doing most of the work."],
      ["The bench press", "The bench must be spotted on every working set."],
      ["None; every lift should be spotted", "Catching a dropped clean or a deadlift is how spotters get injured."],
    ], 0),
    q(5, "Which of these causes most weight room injuries?", [
      ["Everyday habits: uncollared bars, plates on the floor, wrong pin heights, unsupervised lifting", "Correct. The dramatic heavy-load failure is rare; the room's habits are what prevent the common injuries."],
      ["Lifting heavy weights", "Heavy lifting done well with supervision is safe; the habits around it are the risk."],
      ["Using free weights instead of machines", "Free weights are safe with the right habits and supervision."],
      ["Warming up too long", "A long warm-up is not an injury cause."],
    ], 0),
    q(6, "A coach cannot keep an adequate supervision ratio for a planned session. What should change?", [
      ["The session: fewer athletes at a time, simpler lifts, or loads that do not need a spotter", "Correct. The plan bends to the supervision that can actually be kept, not the other way round."],
      ["Nothing; athletes can supervise each other", "Peer supervision is how an unsupervised corner produces an injury."],
      ["Let the seniors run their own rack", "Experienced athletes still need a coach present for heavy lifts."],
      ["Cancel lifting for the season", "The session can be adjusted; cancelling loses the training."],
    ], 0),
    q(7, "What makes an emergency action plan real rather than a binder?", [
      ["It is written, every supervising coach knows it, it is practised each season, and the address and defibrillator location are posted", "Correct. A plan is only as good as the staff's ability to run it under stress, which practice provides."],
      ["It is long and detailed", "Length does not help in an emergency; clarity and rehearsal do."],
      ["It is kept in the athletic director's office", "A plan nobody in the room can reach or recall is not available when it is needed."],
      ["It exists somewhere on the school website", "The people in the room have to know it, not the website."],
    ], 0),
  ],
};
