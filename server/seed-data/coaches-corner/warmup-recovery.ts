import { q, type SeedAcademyTrack } from "./types";

export const WARMUP_RECOVERY_TRACK: SeedAcademyTrack = {
  title: "Warm-Up, Mobility & Recovery",
  description:
    "A warm-up that prepares the session instead of filling fifteen minutes, mobility work that targets what actually limits the athlete, and the recovery habits that move the needle: sleep, food, and not training through the red flags.",
  keyPrinciplesForAi:
    "A warm-up is specific preparation for what follows: raise temperature with general movement, then mobilise the joints the session will use, then activate and rehearse the movement patterns at rising intensity, finishing close to the first working set's speed or load. Static stretching held long before power or strength work can blunt output; save longer holds for after the session or for separate mobility work. Mobility work is targeted at a real limitation found by looking at the athlete move, not applied as a routine to everyone. Recovery is mostly sleep and food; the fancier tools are small on top of those. Fatigue is managed by watching the trend in readiness, sleep, soreness and performance, and by cutting the dose when several of them move together. Pain that changes how an athlete moves is a stop, not a cue to push.",
  lessons: [
    {
      lessonNumber: 1,
      title: "A Warm-Up With a Job",
      estMinutes: 6,
      content:
        "The purpose of a warm-up is to arrive at the first working set ready to do it well. Everything in the warm-up either serves that purpose or is taking time from it. A roster that spends fifteen minutes on the same jog and stretch routine before every session, whether it is a heavy squat day or a speed day, is not warming up; it is waiting.\n\nA warm-up with a job has a shape. First, raise the body's temperature with a few minutes of general movement: a jog, skips, a bike, light calisthenics. Breathing should pick up and a light sweat should start. Second, move the joints the session is going to use through their ranges, actively and under control: hip circles, leg swings, lunges with a reach, shoulder work before pressing. Third, activate what needs to be awake and rehearse the patterns at rising intensity: glute work before squats and sprints, a few jumps before power work, strides that build toward a sprint, empty-bar and light sets that build toward the first real set. By the end of the warm-up the athlete should be moving at close to the session's speed or load, so the first working set is a continuation rather than a shock.\n\nSpecificity is what separates a warm-up from a ritual. A sprint session needs a long ramp of progressively faster strides; a bench session needs the shoulders and the pressing pattern; a practice needs the game's movements. Ten to fifteen minutes is usually enough when the content is right, and a cold gym or an early morning earns a few more.\n\nA note on static stretching. Long holds before the session, the sit-and-reach-and-count-to-thirty kind, can reduce force and power output for a while afterward, which is the opposite of what a strength or speed session wants. Short holds are fine, and an athlete with a genuine restriction may need some targeted work. But as a rule, the warm-up uses movement, and longer static holds live after the session or in separate mobility sessions.",
    },
    {
      lessonNumber: 2,
      title: "Mobility: Find the Limitation, Then Fix That",
      estMinutes: 6,
      content:
        "Mobility work is only useful when it addresses something that is actually limiting the athlete. A hamstring stretch for every athlete every day because hamstrings are tight is a guess; most of the roster does not need it and the ones who do usually need something else. The starting point is to watch the athlete move: an overhead squat, a lunge, a single-leg hinge, a reach overhead. What you see tells you where to look.\n\nThree common limitations in training-age athletes, and what they look like. Ankle restriction shows as heels rising in a squat, knees that cannot track forward, and a squat that stays shallow however strong the athlete is; targeted ankle work and elevating the heels while the ankle improves lets the pattern develop. Hip restriction shows as a pelvis that tucks under at the bottom of a squat, a hinge that rounds through the lower back, and difficulty getting into a lunge with an upright torso; hip flexor and adductor work with active control, and lots of patient practice at the edge of range, is the fix. Shoulder and upper-back restriction shows as an overhead position that only comes with an arched lower back, and a bar that drifts forward on front squats; thoracic extension and rotation work plus shoulder stability help, and front-rack work with straps bridges the gap.\n\nWhat works is active and consistent. Moving into the end of range under control, holding there with tension, and coming back out, teaches the nervous system the range is safe. Loaded mobility, such as a goblet squat held at the bottom or a deep split squat, often does more than any passive stretch because the athlete is strong in the range rather than merely able to reach it. A few minutes daily beats a long session weekly.\n\nTwo cautions. Hypermobile athletes, who are often the flexible ones, do not need more range; they need strength and control through the range they have, and stretching them makes things worse. And a restriction that does not change with several weeks of consistent work, or that comes with pain, is a question for a clinician, not something to stretch harder.",
    },
    {
      lessonNumber: 3,
      title: "Recovery Is Mostly Sleep and Food",
      estMinutes: 5,
      content:
        "The recovery conversation tends to run straight to the tools: ice baths, compression, massage guns, supplements. Those live at the margins. The two things that account for most of an athlete's recovery are how much they sleep and whether they eat enough of the right things, and a coach who gets the roster to fix those has done more than any device would.\n\nSleep is where adaptation happens. The hormones that drive muscle repair and growth peak during deep sleep, and an athlete who is short on it trains hard and adapts little. Teenagers need more than adults, usually in the range of eight to ten hours, and most are getting far less. The practical levers are consistent bed and wake times, a screen cutoff before bed, a dark cool room, and no caffeine late in the day. Early-morning training on top of late nights is a recipe for a roster that is tired, slow and getting hurt; if the schedule cannot move, the lesson for the athletes is that sleep is part of the program.\n\nFood is the raw material. Athletes who do not eat enough to cover training and growth cannot recover, and under-fuelling is common, especially in sports with a lean aesthetic and in athletes who skip breakfast. The simple rules: eat something with protein and carbohydrate within an hour or two of training, spread protein across the day rather than piling it into dinner, and eat enough that body weight is stable or rising for a growing athlete. Hydration matters, but it is usually the easiest of the three to get right. A coach is not a dietitian and an athlete with signs of disordered eating or a sport-specific weight problem needs a professional; what a coach can do is make the expectation clear that fuelling is training.\n\nThe tools come after. Light movement on an off day helps. Cold water after a hard competition can take the edge off soreness, though regularly using it after lifting sessions may blunt some of the adaptation the lifting was for. Massage, foam rolling and compression make athletes feel better, which has value, without much evidence that they speed the physiology. Use them if the roster enjoys them, but never let them stand in for the sleep and the food.",
    },
    {
      lessonNumber: 4,
      title: "Reading Fatigue and Knowing When to Stop",
      estMinutes: 5,
      content:
        "Fatigue is normal and necessary; a program without it produces nothing. The problem is fatigue that accumulates faster than the athlete recovers from it, and the skill is spotting that early, before it turns into a flat month or an injury.\n\nNo single signal is reliable. Resting heart rate, sleep quality, a soreness score, mood, appetite, and performance in the warm-up all move with fatigue, and each one also moves for other reasons. What is reliable is the trend when several move together. An athlete whose readiness check-in has slid for a week, whose sleep has been poor, whose warm-up sets feel heavy and whose jump height is down is telling you something, whatever any one of those numbers says. A quick daily check-in, a few questions about sleep, soreness, energy and mood, costs a minute and makes the trend visible. Forge's readiness score does this arithmetic for you; the coaching is in what you do with it.\n\nWhen the trend says the athlete is under-recovered, the response is to cut the dose, not cancel the session. Lower the volume, keep some intensity so the pattern stays sharp, and watch the next few days. Most athletes bounce back inside a week when the load drops. If they do not, look harder at sleep, food, stress outside training and illness, because training load is not always the cause.\n\nPain is a different category. Soreness after hard work is expected and resolves. Pain that is sharp, that is in a joint rather than a muscle, that changes how an athlete moves, that gets worse through a session, or that persists from one session to the next is not something to coach through. It is a stop and a referral. The athlete who limps through practice to prove something is the athlete who misses the season, and the coach who lets them is the one who could have prevented it. Have a clear rule that the athlete and the staff both know: if it changes how you move, you stop and we get it looked at.",
    },
  ],
  quizQuestions: [
    q(0, "What should the end of a warm-up look like?", [
      ["The athlete moving at close to the session's first working speed or load", "Correct. The warm-up ramps to the session so the first real set is a continuation, not a shock."],
      ["The athlete fully rested and cool", "Cooling down before a session undoes the warm-up's purpose."],
      ["Fifteen minutes of static stretching", "Long static holds before strength or speed work can blunt output."],
      ["The same routine as every other day", "A warm-up is specific to what follows; the same routine every day is a ritual, not preparation."],
    ], 0),
    q(1, "Why is long static stretching a poor choice right before a speed session?", [
      ["It can reduce force and power output for a while afterward", "Correct. Save longer holds for after the session or for separate mobility work."],
      ["It takes too long", "Time is not the main issue; the effect on output is."],
      ["It is dangerous", "It is not dangerous; it is just the wrong tool at that moment."],
      ["It is fine; there is no reason to avoid it", "The temporary drop in output is well documented and matters for power work."],
    ], 0),
    q(2, "An athlete's heels rise and the squat stays shallow no matter the load. Where should the coach look first?", [
      ["Ankle range of motion", "Correct. Those are the classic signs of ankle restriction; targeted ankle work and elevated heels let the pattern develop."],
      ["Core strength", "Core weakness shows differently; heels rising with a shallow squat points at the ankle."],
      ["Hamstring flexibility", "Hamstrings do not limit squat depth in that way."],
      ["Shoulder mobility", "Shoulders affect bar position, not heel rise."],
    ], 0),
    q(3, "Which mobility approach generally works best for a true restriction?", [
      ["Active, controlled movement to the end of range with tension, done consistently, often under light load", "Correct. Strength in the range teaches the nervous system the range is safe; a few minutes daily beats a long weekly session."],
      ["Long passive stretching once a week", "Infrequent passive work changes little and does not build control in the range."],
      ["Stretching the hypermobile athletes most", "Hypermobile athletes need strength and control, not more range."],
      ["Avoiding the range entirely", "Avoidance keeps the restriction in place."],
    ], 0),
    q(4, "What accounts for most of an athlete's recovery?", [
      ["Sleep and adequate food", "Correct. The tools are small on top of those two."],
      ["Ice baths after every session", "Cold water has a place after competition but may blunt adaptation after training and is not the foundation."],
      ["Foam rolling", "It makes athletes feel better, which has value, but it is not where recovery happens."],
      ["Supplements", "Supplements cannot replace sleep and food."],
    ], 0),
    q(5, "Roughly how much sleep does a teenage athlete need?", [
      ["Eight to ten hours", "Correct. Most are getting far less, and consistent bed and wake times are the first lever."],
      ["Five to six hours", "That is well short of what a growing athlete needs to adapt."],
      ["The same as an adult, about seven", "Teenagers need more than adults."],
      ["As little as possible to make time for training", "Training without sleep produces fatigue, not adaptation."],
    ], 0),
    q(6, "Several readiness signals have slid together for a week. What is the right response?", [
      ["Cut the dose, keep some intensity, and watch the next few days", "Correct. The trend across several signals is the reliable read; lowering volume usually brings the athlete back within a week."],
      ["Cancel training for two weeks", "Full rest is rarely needed and costs fitness; reduced load is the usual fix."],
      ["Ignore it; one bad week is normal", "A single bad day is normal; a week-long trend across several signals is a signal."],
      ["Increase training to push through", "Adding load to an under-recovered athlete deepens the hole."],
    ], 0),
    q(7, "Which of these is a stop-and-refer sign rather than normal soreness?", [
      ["Pain that changes how the athlete moves or persists from one session to the next", "Correct. Soreness resolves; pain that alters movement or persists is a clinician's question, not a coaching one."],
      ["Muscle soreness the day after a hard session", "That is normal and resolves on its own."],
      ["Feeling tired at the end of practice", "Fatigue at the end of hard work is expected."],
      ["Mild stiffness that goes away in the warm-up", "Stiffness that clears with movement is routine."],
    ], 0),
  ],
};
