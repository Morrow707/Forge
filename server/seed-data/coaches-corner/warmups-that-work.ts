import { q, type SeedAcademyTrack } from "./types";

/** 2026-11-22, written from Forge's own research review (server/seed-data/research-review).
 * Forge's outline and Forge's words; studies are described, never quoted. */
export const WARMUPS_THAT_WORK_TRACK: SeedAcademyTrack = {
  title: "Warm-Ups That Work",
  description:
    "What the published studies say a warm-up actually does, how long it needs to be, where static stretching fits, and how to turn the first fifteen minutes of practice into the best injury-reduction tool a coach has.",
  keyPrinciplesForAi:
    "A warm-up has two jobs: prepare the athlete to perform and reduce injury over a season. For performance, raise body temperature with easy movement, move through large dynamic ranges, then finish with sport-like work at rising intensity, the raise, activate, mobilize and potentiate shape. Static stretching is not harmful in short holds of under about 45 to 60 seconds per muscle inside a fuller warm-up, but it should never be the whole warm-up and it does not prevent injury on its own. For injury reduction, structured neuromuscular warm-ups that mix running, strength, balance, landing and agility cut youth team-sport injuries by roughly a third or more, and the dose that matters is two or three sessions a week of ten to fifteen minutes, done consistently all season. Compliance decides the result, so keep the routine short, coach-led and the same every day. Heavy or explosive potentiation work helps jumping more reliably than sprinting and needs several minutes of rest before the effort it is meant to improve. Hard eccentric hamstring work belongs after training, not inside the warm-up.",
  lessons: [
    {
      lessonNumber: 1,
      title: "What a Warm-Up Is For",
      estMinutes: 6,
      content:
        "Ask ten coaches why their team warms up and most will say it prevents injuries. That answer is half right, and the half that is right is more specific than most programs treat it. A warm-up does two separate things, and they are built differently.\n\nThe first job is performance on the day. A review that pooled thirty-two controlled studies found a warm-up improved the performance that followed it on about four out of every five measures tested, and almost none showed harm. Most of that benefit comes from simply raising muscle temperature: warmer muscle contracts faster, nerves conduct faster, and joints move more freely. That is why the opening minutes of a good warm-up are easy jogging, skipping or cycling, nothing clever. The temperature is the foundation and everything else is built on it.\n\nThe second job is reducing injury across a season. That benefit does not come from one session. It comes from the strength, balance and landing control an athlete builds by doing the same structured routine two or three times a week for months. A single warm-up does not make a knee safer; forty of them can.\n\nThe practical shape that serves both jobs is often called RAMP: raise, activate, mobilize, potentiate. Raise is the light aerobic start. Activate and mobilize are the dynamic movements through large ranges plus the targeted strength and balance work, such as lunges, glute bridges, single-leg holds and landing drills. Potentiate is the last few minutes, where intensity climbs toward what practice demands: accelerations, jumps, cuts and sport-specific speed. In youth soccer players, a RAMP warm-up produced faster thirty-meter sprints and higher jumps than either static stretching or no warm-up, a moderate effect.\n\nNotice what the shape leaves out: long holds of static stretching while athletes sit on the grass. That is not banned, as a later lesson explains, but it is not where the value is.",
      flashcards: [
        { front: "The two jobs of a warm-up", back: "Prepare the athlete to perform today, and build season-long injury resistance through repeated structured work." },
        { front: "RAMP", back: "Raise, activate, mobilize, potentiate: easy movement first, dynamic and targeted work next, rising sport-specific intensity last." },
        { front: "Where most of a warm-up's same-day benefit comes from", back: "Raising muscle temperature." },
      ],
    },
    {
      lessonNumber: 2,
      title: "The Injury-Reduction Warm-Up and the Dose That Matters",
      estMinutes: 7,
      content:
        "The strongest evidence in youth sport injury prevention belongs to structured neuromuscular warm-ups: routines that replace the usual team warm-up with a planned mix of running, strength, balance, jumping and landing, and change of direction. A 2015 review of youth team sports found these programs lowered lower-limb injury by roughly a third, and later reviews of adolescent team sports landed near forty percent fewer injuries. Named programs such as FIFA 11+ in soccer have their own trials behind them, including fewer knee and ACL injuries in college men's soccer and fewer ankle injuries across ages.\n\nThe question coaches actually need answered is how much. A dose-response analysis published in 2017 gave a clear answer. Two or three sessions a week produced the biggest drop in injuries, ten to fifteen minute sessions worked as well as longer ones, and programs that ran beyond six months were not better than shorter ones. In other words, a short routine done often beats a long routine done occasionally. More than about half an hour a week in total seems to be where the effect is reliably present.\n\nYouth basketball supports the same message. A ten-minute, coach-led routine of thirteen aerobic, agility, strength and balance exercises was linked to about a third fewer ankle and knee injuries, and it worked as well when athletes ran it without a supervisor as when someone watched over it. A 2011 trial in Chicago public high schools ran a twenty-minute version before practice for girls' soccer and basketball; non-contact lower-limb injuries fell by about two-thirds and non-contact ACL injuries by even more.\n\nSo the design target for a school program is modest: one routine, ten to fifteen minutes, run at the start of practice at least two or three times a week, every week of the season. That fits inside the time most teams already spend warming up. The routine does not need new equipment. It needs a coach who decides it is the warm-up, rather than something added on top of it.",
      flashcards: [
        { front: "Dose of an injury-reduction warm-up that the studies support", back: "Ten to fifteen minutes, two or three times a week, all season." },
        { front: "Does a longer program work better?", back: "Not reliably: sessions over fifteen minutes and programs over six months were not better than shorter ones." },
        { front: "Typical effect of youth neuromuscular warm-ups", back: "Roughly a third to two-fifths fewer lower-limb injuries." },
      ],
    },
    {
      lessonNumber: 3,
      title: "Stretching: Where It Fits and Where It Does Not",
      estMinutes: 6,
      content:
        "Static stretching has been argued about for twenty years, and the evidence has settled into something sensible. Holding a stretch causes a small, temporary loss of strength and power, and that loss grows with the length of the hold. A 2013 review found the average losses were around five percent for strength and two percent for explosive performance, and were smallest when each muscle was held for forty-five seconds or less. A newer analysis found the strength loss shows up mainly with holds of a minute or more per bout, with no general harm to jumping or sprinting. When short stretches sit inside a full warm-up that finishes with dynamic, sport-type work, studies find little or no effect on performance either way, even though athletes often believe it helped.\n\nThe injury question has a plainer answer. Across twenty-five trials, stretching programs did not prevent sports injuries, while strength training and balance training did, strength by a wide margin. That single comparison is the most useful sentence a coach can take into a planning meeting: the parts of the warm-up that protect athletes are the strength, balance and landing parts, not the stretching.\n\nStretching still earns a place for range of motion. Over weeks, static and contract-relax stretching increase joint range more than dynamic stretching, and long-term static stretching lowers muscle stiffness. That is a reason for an athlete who needs more hip or shoulder range to stretch regularly, often after practice or at home, rather than a reason to make the whole team sit for ten minutes before a sprint session. Stretching after exercise as a cool-down did not speed recovery of strength or reduce soreness compared with simply resting, so it should not be sold to athletes as a recovery tool either.\n\nThe working rule: keep any static holds short and early, follow them with dynamic movement that rises toward practice speed, and spend the bulk of the warm-up on the strength and balance work that actually changes injury rates.",
      flashcards: [
        { front: "Static hold length that keeps the performance loss small", back: "About 45 seconds or less per muscle, inside a fuller warm-up." },
        { front: "Did stretching programs prevent injuries across 25 trials?", back: "No. Strength training and balance training did." },
        { front: "What stretching is good for", back: "Building joint range of motion over weeks." },
      ],
    },
    {
      lessonNumber: 4,
      title: "Potentiation, Timing and Keeping the Routine Alive",
      estMinutes: 6,
      content:
        "The last part of a warm-up raises intensity so the first hard rep of practice is not the first fast thing the athlete has done. Some coaches go further and add a heavy or explosive activity on purpose, called potentiation: a few heavy squats, a handful of jumps, or a single resisted sprint before sprint work. The evidence is real but narrower than the marketing. On average it gives a moderate boost to sprinting, larger in stronger and more experienced athletes, and a small boost to jumps and throws. The effect follows a period of fatigue, so it typically appears four to nine minutes after the conditioning activity; for heavy squats the sprint gains showed up with about four to eight minutes of rest. Some add-ons, such as loaded jump squats before sprints in college track athletes, did nothing, and a recent pooled analysis found reliable gains for jumping but no clear sprint benefit. For a high school team, potentiation is an option for strong, experienced athletes, not a requirement.\n\nTiming within the session matters for one exercise in particular. The Nordic hamstring curl is one of the best-supported injury-prevention exercises in sport, but doing it before soccer training left the hamstrings weaker eccentrically during later play than doing it afterward. Twelve-week strength gains were the same either way. So the hard eccentric hamstring work goes after training, while the warm-up keeps its proven slot for the neuromuscular routine.\n\nThe last and largest lesson is compliance. In adolescent female soccer players, the most compliant third of teams had dramatically fewer ACL injuries than the least compliant third, and team compliance slipped a few percent every month of the season. Time and motivation were the main barriers coaches reported. Three habits keep a routine alive: make it the warm-up rather than an extra, keep it short enough that nobody looks for a shortcut, and progress the exercises across the season so athletes are not bored by week eight. Re-warm briefly after long breaks, such as halftime or a long stoppage, because the temperature effect fades quickly.",
      flashcards: [
        { front: "When a potentiation effect usually appears", back: "About four to nine minutes after the heavy or explosive activity." },
        { front: "Where the Nordic hamstring curl belongs in a session", back: "After training, not inside the warm-up." },
        { front: "What decides whether a prevention warm-up works", back: "Compliance: teams that actually do it most often get the biggest drop in injuries." },
      ],
    },
  ],
  quizQuestions: [
    q(0, "Which description best matches the warm-up shape the studies support?", [
      ["Easy movement to raise temperature, dynamic and targeted strength and balance work, then rising sport-specific intensity", "Correct. That is the raise, activate, mobilize, potentiate shape."],
      ["Ten minutes of static stretching in a circle, then straight into drills", "Static stretching alone is a weak warm-up and does not prevent injury."],
      ["Maximal sprints first so athletes are ready for anything", "Maximal efforts come at the end, after temperature and range are up."],
      ["No warm-up, because practice itself warms athletes up", "A warm-up improved later performance in most controlled studies."],
    ], 0),
    q(1, "A coach has fifteen minutes of practice for injury prevention. What dose do the studies support?", [
      ["A ten to fifteen minute neuromuscular routine, two or three times a week, all season", "Correct. Short and frequent beat long and occasional in the dose-response analysis."],
      ["One long forty-five minute session once a month", "Infrequent sessions do not build the strength and control the effect depends on."],
      ["Only in the preseason, then stop once games begin", "The benefit depends on doing it through the season."],
      ["Any amount, as long as athletes stretch at the end", "Stretching does not supply the protective effect."],
    ], 0),
    q(2, "Across twenty-five trials, which kinds of training reduced sports injuries?", [
      ["Strength training and balance training", "Correct. Stretching programs showed no effect, while strength and balance work did."],
      ["Static stretching programs", "Stretching programs did not prevent sports injuries in that review."],
      ["Foam rolling alone", "Foam rolling was not what reduced injuries."],
      ["None of them", "Strength and balance programs clearly did."],
    ], 0),
    q(3, "How should static stretching be used in a pre-practice warm-up?", [
      ["Short holds, roughly 45 seconds or less per muscle, followed by dynamic work that rises to practice speed", "Correct. Short holds inside a full warm-up have little effect on performance."],
      ["Long two-minute holds right before sprinting", "Long holds produce the largest strength and power losses."],
      ["It must be banned entirely", "Short holds within a fuller warm-up are not harmful."],
      ["As the whole warm-up", "Stretching alone is a poor warm-up and gives no injury protection."],
    ], 0),
    q(4, "When does a potentiation effect from heavy squats usually help a sprint?", [
      ["After several minutes of rest, roughly four to nine minutes", "Correct. The effect follows an initial period of fatigue."],
      ["Immediately, within ten seconds", "Straight after the heavy set the athlete is still fatigued."],
      ["The next day", "Potentiation is a short-term effect."],
      ["Only if the squats are done to failure", "Heavy sets with full rest are used, not sets to failure."],
    ], 0),
    q(5, "Where does the evidence place hard Nordic hamstring curls in a soccer session?", [
      ["After training, because doing them first left the hamstrings weaker during later play", "Correct. Strength gains were similar either way, but pre-training Nordics reduced eccentric strength during play."],
      ["As the first exercise of the warm-up", "That is the placement the study warned against."],
      ["Only on game day", "Hard eccentric work on game day adds fatigue when it matters most."],
      ["Nowhere, because they do not work", "Programs that include the Nordic roughly halve hamstring injuries."],
    ], 0),
    q(6, "What best predicted the drop in ACL injuries among adolescent female soccer teams using a prevention warm-up?", [
      ["How consistently the team actually did it", "Correct. The most compliant teams had far fewer ACL injuries than the least compliant."],
      ["The color of the cones", "Equipment details did not drive the result."],
      ["Whether a physician designed it", "Compliance, not authorship, separated the teams."],
      ["Whether it was done after games", "These routines are proven as the pre-practice warm-up."],
    ], 0),
    q(7, "Does stretching after practice speed recovery?", [
      ["No. It did not restore strength faster or reduce soreness compared with resting", "Correct. Post-exercise stretching should not be sold as a recovery tool."],
      ["Yes, it removes all soreness", "Studies did not find a soreness benefit."],
      ["Yes, it doubles the speed of recovery", "No such effect was found."],
      ["Only when done for twenty minutes", "Longer stretching did not change the finding."],
    ], 0),
  ],
};
