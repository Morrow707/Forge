import { q, type SeedAcademyTrack } from "./types";

export const RESISTANCE_PROGRAMMING_TRACK: SeedAcademyTrack = {
  title: "Writing a Resistance Program",
  description:
    "From a blank page to a program you can defend: the needs analysis, choosing and ordering exercises, setting load, sets, reps and rest for the quality you want, and how often to train each thing.",
  keyPrinciplesForAi:
    "A program starts with a needs analysis: what the sport demands, what the athlete has, and the gap between them. Exercises are chosen for the movement patterns the sport uses (squat, hinge, push, pull, carry, rotate, single-leg) and ordered so the most demanding, technical and explosive work comes first while the athlete is fresh. Load, reps, sets and rest are set together for one quality: heavy and few with long rests for strength, moderate and fast with full rests for power, moderate load and more reps with shorter rests for muscle growth, light and many for endurance. Two to three quality sessions a week per major pattern, with at least a day between hard sessions on the same muscles, is the working range for most athletes. Progression is small, planned and written down before the block starts; variation is a tool for the trained athlete, not a weekly habit for the novice. Every program is written for the roster in front of you, for the time and equipment you actually have, and is changed when the athlete's response says so.",
  lessons: [
    {
      lessonNumber: 1,
      title: "The Needs Analysis",
      estMinutes: 6,
      content:
        "A program written without a needs analysis is a program for nobody in particular. The analysis has two halves and the program lives in the gap between them.\n\nThe first half is the sport. What movements does it use, and in what ranges? Which energy systems, in what work-to-rest pattern? What are its common injuries, and what qualities protect against them? A wrestler needs pulling strength, grip, hip and trunk strength through extreme ranges, and the ability to work hard for two minutes; a thrower needs rotational power and a strong, stable base; a distance runner needs single-leg strength and tendon capacity more than a heavy squat. Positions within a sport differ too. Write the sport's demands down in a dozen lines before touching a program.\n\nThe second half is the athlete. Training age, which is years of real training rather than years alive. Current strength, power and movement quality, from the testing track. Injury history and current limitations. Developmental stage for a young athlete. Time available, equipment available, and the rest of the schedule. An athlete with a strong squat and no single-leg control, a history of hamstring strains and two hours a week has a program that looks nothing like a teammate with the opposite profile.\n\nThe gap between the two is the program's purpose, and it should be stated in a sentence. \"Build a base of bilateral strength and teach the hinge\" is a purpose for a novice. \"Raise rate of force development and single-leg stiffness for the pre-season\" is a purpose for an advanced athlete. A block without a stated purpose will drift toward whatever the coach enjoys writing.\n\nThe analysis also sets the constraints that decide the shape before any set is chosen. Two sessions a week and forty minutes each is a different program from four sessions and ninety. A room with four racks and twenty athletes is a different program from a room with twelve. Honesty about constraints at the start saves a program that was beautiful on paper and impossible on Tuesday.",
    },
    {
      lessonNumber: 2,
      title: "Choosing and Ordering Exercises",
      estMinutes: 7,
      content:
        "Exercises are chosen to cover the movement patterns the sport uses, not to fill a muscle checklist. The patterns are a squat, a hinge, a push, a pull, a carry or brace, a rotation or anti-rotation, and single-leg work, and nearly every athlete needs most of them in every block. Within each pattern there is a main lift, usually a barbell movement that can be loaded heavily, and assistance work that supports it, addresses a weakness or trains the pattern in a different range.\n\nSpecificity has limits. The movement in the gym should share something with the sport, joint angles, speed, or the muscles involved, but it does not need to look like the sport, and exercises that mimic a skill under load often teach the skill worse. A pitcher gets more from a solid hinge, a rotational medicine ball throw and shoulder care than from a weighted throwing motion. Train the qualities with the best tools and let the sport practice train the skill.\n\nOrder within a session follows one rule: the most demanding work goes first, while the athlete is fresh and the nervous system is sharp. Power and speed work, jumps and explosive lifts, come first. Heavy main lifts next. Assistance work after. Conditioning or energy-system work last or on another day. An athlete who does their heavy squats after twenty minutes of sled pushes is squatting badly with a tired body, and whatever the sled was for has cost the squat.\n\nWithin the heavy lifts, the most technical goes first. A clean before a squat before a row. Alternating upper and lower, or pairing a main lift with a non-competing assistance exercise, saves time without costing quality and is the normal way to fit a session into an hour.\n\nThe number of exercises is smaller than most new coaches write. A session with two main lifts and three or four assistance exercises, done well, beats one with ten exercises done in a hurry. If a session cannot be completed with quality in the time available, the exercise list is too long, not the time too short.",
    },
    {
      lessonNumber: 3,
      title: "Load, Reps, Sets and Rest, Set Together",
      estMinutes: 7,
      content:
        "The four variables are not set one at a time. They are set together for a quality, because each combination trains something different and a mismatch trains nothing well.\n\nFor maximal strength: heavy loads, roughly eighty-five percent of the best lift and up, for one to five reps, three to six sets, with two to five minutes between sets so each set is done fresh. The rest is part of the prescription; cut it and the quality changes.\n\nFor power: light to moderate loads, moved as fast as possible, for one to five reps, three to six sets, with full rests. The load is lower because the point is velocity; a bar that moves slowly is not training power whatever the coach calls it. Jumps and throws follow the same pattern with bodyweight or a medicine ball.\n\nFor muscle growth: moderate loads, roughly sixty-five to eighty-five percent, for six to twelve reps, three to six sets, with one to two minutes of rest, taken close to the point where another good rep is not possible. Volume across the week is what drives this quality, which is why it needs more sets than strength does.\n\nFor muscular endurance: lighter loads for twelve or more reps with short rests. Useful for some sports and for a general base; not a substitute for the other three in an athlete who needs to be strong or fast.\n\nMost athletes need two of these at once and the block decides which. A common pattern across a block is to start with higher reps and moderate loads to build volume and technique, move to heavier loads and fewer reps for strength, and finish with lighter, faster work for power before the season. The in-season block holds strength and power with low volume at high intensity.\n\nTwo tools make the loads honest. A repetition maximum estimate from a sub-maximal set, from the testing track, sets the percentages without a true max. A simple effort scale, how many more reps the athlete could have done, lets the load move with the day; a set that was supposed to leave two reps in reserve and left none means the next set comes down. Writing the percentage on the sheet and ignoring how the bar moved is the most common programming error in a high-school room.",
    },
    {
      lessonNumber: 4,
      title: "Frequency, Progression and Changing the Plan",
      estMinutes: 6,
      content:
        "How often a quality is trained depends on how long it takes to recover from and how much else is in the week. For most athletes, each major pattern trained hard two to three times a week, with at least a day between hard sessions on the same muscles, is the working range. Novices adapt to less; advanced athletes can tolerate more and need the extra volume. In-season, once or twice a week per pattern holds what was built. A team practicing five days a week has a very different capacity from one practicing three, and the program has to count the practice as training load, because the athlete's body does.\n\nProgression is planned before the block starts, in writing, and it is small. For a novice, adding a little load to a main lift every session or every week is realistic for a while and then is not. For a trained athlete, progression happens across a block: more sets one week, a heavier load the next, a planned lighter week to let the adaptation land, then a new block. A program that progresses by feel, deciding each day whether to add weight, is a program that progresses by mood, and the record will show it.\n\nVariation is a tool, not a virtue. Novices need the main movements to stay stable long enough to learn them, which means a block of several weeks on the same lifts. Trained athletes need periodic change to keep adapting: a different variation of the same pattern, a different rep range, a different implement. Changing everything every week is the most reliable way to make sure nothing improves.\n\nThe plan changes when the athlete's response says so, and the coach has to be watching for that. A lift that stalls for three weeks, a set of signals from the adaptation track pointing to under-recovery, an injury, a schedule change, a growth spurt: each one is a reason to edit the program rather than to push harder through it. The sheet is the hypothesis; the athlete is the data.\n\nFinally, write the program for the room you have. Twenty athletes, four racks and fifty minutes means stations, pairs, and a session built around what can actually be done in that space, not the session a coach would write for one athlete and an empty gym. A realistic program that is executed beats an ideal program that is not.",
    },
  ],
  quizQuestions: [
    q(0, "What are the two halves of a needs analysis?", [
      ["What the sport demands and what the athlete currently has", "Correct. The program's purpose lives in the gap between them."],
      ["What the coach prefers and what the gym owns", "Constraints matter, but the analysis is sport and athlete."],
      ["Last season's record and this season's schedule", "Useful context, not the analysis."],
      ["Strength tests only", "Testing is part of the athlete half; the sport half is the other half."],
    ], 0),
    q(1, "Why should a session start with power and explosive work?", [
      ["Those qualities need a fresh nervous system, and fatigue ruins them", "Correct. The most demanding work goes first; conditioning goes last or on another day."],
      ["Because they warm the athlete up", "They need the athlete already warm; they are not the warm-up."],
      ["Because they are the easiest", "They are the most demanding on the nervous system."],
      ["Order does not matter", "Heavy squats after sled pushes are squats done badly on a tired body."],
    ], 0),
    q(2, "Which set of variables trains maximal strength?", [
      ["Heavy loads, one to five reps, three to six sets, two to five minutes of rest", "Correct. The long rest is part of the prescription."],
      ["Moderate loads, ten reps, one minute of rest", "That trains muscle growth."],
      ["Light loads, fifteen reps, thirty seconds of rest", "That trains muscular endurance."],
      ["Heavy loads with thirty seconds of rest", "Cutting the rest changes the quality being trained."],
    ], 0),
    q(3, "An athlete's power set with a moderate load is moving slowly. What does the track say?", [
      ["It is not training power whatever it is called; lower the load so the bar moves fast", "Correct. Velocity is the point of power work."],
      ["Add weight to make it harder", "More load slows it further."],
      ["It is fine; slow is strength", "The set was programmed for power and is now neither."],
      ["Rest less between sets", "Shorter rests make the bar slower still."],
    ], 0),
    q(4, "Why does muscle growth need more weekly sets than strength?", [
      ["Volume across the week is what drives growth", "Correct. Strength leans on intensity; growth leans on total work near effort."],
      ["Because growth is easier", "It is not easier; it responds to a different variable."],
      ["It does not; growth needs fewer sets", "The track says the opposite."],
      ["Because athletes enjoy higher reps", "Enjoyment is not the mechanism."],
    ], 0),
    q(5, "A set prescribed to leave two reps in reserve left none. What happens to the next set?", [
      ["The load comes down", "Correct. The effort scale lets the load move with the day; the percentage on the sheet is not the final word."],
      ["The load goes up", "The athlete is already past the intended effort."],
      ["The set is repeated at the same load", "Repeating a set that was heavier than intended compounds the error."],
      ["Nothing; the sheet says the percentage", "Ignoring how the bar moved is the most common programming error."],
    ], 0),
    q(6, "Why should a novice keep the same main lifts for a block of several weeks?", [
      ["The movements have to be learned before load can climb, and weekly changes restart the learning", "Correct. Variation is a tool for the trained athlete."],
      ["Novices cannot handle variety", "They can handle it; it just costs them progress at that stage."],
      ["Because the coach has not written more", "The reason is specificity of learning, not laziness."],
      ["They should change lifts every session", "That is the most reliable way to make sure nothing improves."],
    ], 0),
    q(7, "Twenty athletes, four racks, fifty minutes. What does the track say?", [
      ["Write the program for that room: stations, pairs, and a session that can actually be done", "Correct. A realistic program that is executed beats an ideal one that is not."],
      ["Write the ideal program and let the athletes figure it out", "That program will not happen on Tuesday."],
      ["Cancel training until there is more equipment", "The room is the constraint; the program bends to it."],
      ["Run everyone through one rack in turn", "That is a queue, not a session."],
    ], 0),
  ],
};
