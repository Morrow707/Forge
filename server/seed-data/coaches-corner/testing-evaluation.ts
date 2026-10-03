import { q, type SeedAcademyTrack } from "./types";

export const TESTING_EVALUATION_TRACK: SeedAcademyTrack = {
  title: "Testing & Evaluation That Means Something",
  description:
    "Choosing tests that match the sport, running them so the numbers are repeatable, and reading results as evidence about the program rather than a leaderboard.",
  keyPrinciplesForAi:
    "A test is only useful if it measures a quality the sport needs, is run the same way every time, and is read against the athlete's own history before anyone else's. Pick a small battery that covers strength, power, speed and the sport's conditioning demand, standardise the warm-up, the order, the surface, the time of day and the rest, and test when the roster is fresh. Use a repeatable estimate of maximal strength for most athletes rather than a true one-rep max, especially with novices. Treat a change smaller than the test's own noise as no change. Share results with athletes as their own progress, never as a public ranking of children, and change the program when the tests say it is not working.",
  lessons: [
    {
      lessonNumber: 1,
      title: "Why Test, and What to Test",
      estMinutes: 5,
      content:
        "Testing answers two questions: is this athlete improving, and is this program working. Both need numbers taken the same way at different times. Without testing a coach is guessing, and the guess is usually flattering. With bad testing, the coach is guessing with a spreadsheet, which is worse because it feels like knowledge.\n\nThe first decision is what to test, and the answer comes from the sport. A test should measure a quality the sport demands and the program is trying to improve. For most team sports that is a short list: a strength measure such as a squat or trap-bar deadlift estimate; a lower-body power measure such as a vertical or broad jump; a speed measure such as a ten- and a forty-yard sprint; a change-of-direction measure if the sport cuts; and a conditioning measure that reflects the sport's effort pattern, such as a repeated-sprint test. Add a body composition or weight measure if it is tracked respectfully and privately, and a movement screen if you use one to guide the program.\n\nFive or six tests is a battery. Fifteen is a day lost to testing that produces numbers nobody reads. Every test on the list should have a reason it is there and a decision it might change. If a result would not change anything about the program, drop the test.\n\nThe second decision is when. Test at the start of a block to set the baseline, at the end to see what changed, and otherwise leave the roster alone to train. In-season testing should be minimal and non-fatiguing: a jump and a few check-in numbers tell you most of what you need without costing a practice. Testing in the middle of a hard block, or the day after a game, produces numbers that reflect fatigue rather than fitness, and those numbers go into the record looking like a decline.",
    },
    {
      lessonNumber: 2,
      title: "Running a Test So the Number Is Real",
      estMinutes: 6,
      content:
        "A test's value is in its repeatability. The same athlete, with the same fitness, should produce the same number on two different days. Everything about how a test is run either protects that or spends it.\n\nStandardise the setup and write it down. The warm-up before the test, the order of the tests, the rest between attempts, the surface, the footwear rule, the equipment, the time of day, and who is reading the result. A forty-yard sprint hand-timed by a different coach on a different surface after a different warm-up is a different test, and a change in the number tells you nothing. Keep a one-page protocol per test and follow it every time.\n\nOrder matters because fatigue carries. Run the tests that need the freshest athlete first: jumps and sprints before strength, strength before conditioning, and conditioning last. Give proper rest between attempts, two to three minutes for a maximal sprint or jump, and take the best of a small number of attempts rather than one. Where an athlete's technique on a test is poor, the number measures technique rather than the quality; a few familiarisation sessions before a baseline are worth the time.\n\nTiming and measurement should be as objective as the budget allows. Timing gates beat a stopwatch by a wide margin; a jump mat or a reach device beats a chalk mark; a standardised bar speed read beats an estimate. Where only a hand and a stopwatch are available, have the same person time every athlete every time and accept that small differences are noise. Forge's camera numbers are uncalibrated at the time of writing and carry a warning for a reason; they are useful for trends within one athlete filmed the same way, and not yet a substitute for a measured test.\n\nFinally, test the roster when it is fresh and fed. Announce the test day in advance so athletes sleep and eat for it, hold it after a light day, and do not test the day after a game. Testing a tired roster produces a record of how tired they were.",
    },
    {
      lessonNumber: 3,
      title: "Strength Testing: Estimates Over Maxes",
      estMinutes: 5,
      content:
        "The question strength testing answers is how much force an athlete can produce, and a true one-repetition maximum is the most direct way to ask it. It is also the most demanding, the most technique-dependent and the riskiest, and for most of a high-school roster it is the wrong tool.\n\nA repetition maximum at a lower load, three to five reps taken to a hard but clean set, with the one-rep value estimated from a standard formula, gives a number that is close enough to program from, is far more repeatable in novices, and does not ask an athlete who learned to squat two months ago to grind a maximal single with a bar on their back. The estimate loses accuracy as reps rise, so keep the test set under about six reps, and never estimate from a set of twelve. Forge's strength profile uses exactly this rule and caps the reps it will score for the same reason.\n\nWhen a true max makes sense: experienced lifters with stable technique, athletes in strength sports where the max is the event, and a coach with the spotting and the time to do it properly. Even then, treat it as an occasional event with a full taper into it, not a monthly check.\n\nWhatever the method, the number only means something if the standard is held. A squat to parallel on one test day and a quarter squat on the next produces a big improvement that did not happen. Decide the depth, the grip, the pause, and the bar, write it on the protocol, and have the same coach judge it. A conservative, consistent standard beats a generous one every time, because the point of the test is to see change, and change is only visible against a fixed standard.\n\nOne more reason to prefer estimates: they double as training. A hard set of five is a session; a max attempt is a test that costs a session. For a roster with limited time, the estimate gives the number and the training in one.",
    },
    {
      lessonNumber: 4,
      title: "Reading Results: Noise, Progress and Privacy",
      estMinutes: 5,
      content:
        "Every test has noise: the range within which the same athlete's number will wander from day to day with no real change in fitness. A hand-timed sprint has a tenth of a second or more of it; a jump has a few centimetres; an estimated max has a few percent. A change smaller than the noise is not a change, and reading it as one leads to program decisions based on nothing. Know each test's rough noise and set the bar for a real change above it.\n\nRead an athlete against their own history first. The question is whether this athlete improved on the quality this block was meant to improve, not where they sit on the roster. Comparing to teammates comes second and only in context: a freshman who added fifteen percent to a squat estimate had a better block than a senior who added two, whatever their absolute numbers. Cohort comparisons, where a sample is large enough to mean anything, can tell an athlete how they sit against similar athletes without naming anyone; Forge's percentiles work this way and refuse to show a number from a thin group for exactly that reason.\n\nRead the roster as evidence about the program. If most athletes improved on the block's target quality, the block worked. If most did not, the program needs changing, and the honest response is to change it rather than to decide the roster did not work hard enough. If some improved and some did not, look at what separated them: attendance, sleep, in-season load, injury, technique on the test. That is where coaching decisions come from.\n\nPrivacy is not optional. A public leaderboard of teenagers' body weights, maxes or sprint times is a wall chart of who is the weakest and the slowest, and it does damage to the athletes at the bottom that no motivational effect at the top repays. Share results with each athlete as their own progress, with the trend and the context. If the team culture wants recognition, recognise improvement and effort rather than absolute numbers, and never post anything about an athlete's body. The record exists to make the program better, and a program that makes a fourteen-year-old dread test day is not better.",
    },
  ],
  quizQuestions: [
    q(0, "What decides which tests belong in a battery?", [
      ["Whether each measures a quality the sport needs and could change a decision about the program", "Correct. A test with no decision attached is time spent producing numbers nobody uses."],
      ["How many tests other programs use", "Other programs' choices say nothing about this sport or this roster."],
      ["Whichever tests are easiest to run", "Ease matters for repeatability, but relevance decides inclusion."],
      ["As many as possible for completeness", "A large battery costs a training day and produces numbers that are rarely read."],
    ], 0),
    q(1, "In what order should a test day run?", [
      ["Jumps and sprints first, strength next, conditioning last", "Correct. Fatigue carries forward, so the tests that need the freshest athlete go first."],
      ["Conditioning first to warm the athletes up", "Conditioning first fatigues everything that follows and ruins the speed and strength numbers."],
      ["Any order; it does not matter", "Order changes the numbers because fatigue accumulates across tests."],
      ["Strength first because it is most important", "Heavy lifting before sprints and jumps depresses those results."],
    ], 0),
    q(2, "Why is a one-page written protocol per test important?", [
      ["The number is only comparable if the test is run the same way every time", "Correct. Different warm-ups, surfaces or timers make it a different test, and the change in the number means nothing."],
      ["It is required by rule", "There is no rule; it is what makes the data worth keeping."],
      ["It is not important if the same coach runs the test", "Even the same coach drifts; a written protocol holds the standard."],
      ["Only for sprint tests", "Every test, including strength and conditioning, needs its standard held."],
    ], 0),
    q(3, "For a high-school athlete who started lifting two months ago, how should maximal strength be tested?", [
      ["A hard, clean set of three to five reps with the max estimated from it", "Correct. The estimate is repeatable, safer, close enough to program from, and doubles as training."],
      ["A true one-rep max with a spotter", "A true max is technique-dependent and risky for a novice, and the number is less repeatable."],
      ["A set of twelve reps estimated upward", "Estimates lose accuracy as reps rise; keep the test set under about six."],
      ["No strength testing for the first year", "An estimate from a moderate set is appropriate and useful early."],
    ], 0),
    q(4, "An athlete's squat estimate jumped twenty percent, but the depth on test day was noticeably shallower than at baseline. What happened?", [
      ["The standard changed, so the improvement is not real", "Correct. Change is only visible against a fixed standard; a shallower squat is a different test."],
      ["The athlete got much stronger", "A shallower squat lifts more regardless of strength; the number measures depth, not progress."],
      ["The formula is wrong", "The formula is fine; the input was a different movement."],
      ["Nothing; depth does not matter for estimates", "Depth is the standard, and without it the number is meaningless."],
    ], 0),
    q(5, "A hand-timed forty improved by five hundredths of a second. How should the coach read it?", [
      ["As no change, because it is inside the test's noise", "Correct. A change smaller than the test's day-to-day variation is not evidence of anything."],
      ["As a real improvement worth adjusting the program for", "Hand timing has a tenth of a second or more of noise; five hundredths is well inside it."],
      ["As a decline, since hand timing runs fast", "Timing bias affects both tests equally; the difference is still noise."],
      ["As proof the speed program works", "One athlete's within-noise change proves nothing about a program."],
    ], 0),
    q(6, "Most of the roster failed to improve on the block's target quality. What is the honest response?", [
      ["Change the program; the tests are evidence that it did not work", "Correct. Testing exists to make the program better, and that means acting on the result."],
      ["Decide the roster did not work hard enough", "That conclusion ignores the evidence and changes nothing."],
      ["Retest until the numbers improve", "Repeated testing produces noise and fatigue, not improvement."],
      ["Stop testing", "Removing the evidence does not fix the program."],
    ], 0),
    q(7, "How should test results be shared with a high-school roster?", [
      ["With each athlete as their own progress and trend, never as a public ranking of names or bodies", "Correct. A public leaderboard does damage at the bottom that no effect at the top repays."],
      ["Posted on the wall in rank order to motivate", "Ranking teenagers by weight, max or sprint time harms the athletes at the bottom."],
      ["Only with parents", "Athletes should see their own progress; that is part of the point."],
      ["Not at all; results are for coaches only", "Athletes who never see their progress lose the motivation that progress provides."],
    ], 0),
  ],
};
