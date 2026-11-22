import { q, type SeedAcademyTrack } from "./types";

/** 2026-11-22, written from Forge's own research review (server/seed-data/research-review).
 * Forge's outline and Forge's words; studies are described, never quoted. */
export const HAMSTRINGS_AND_GROINS_TRACK: SeedAcademyTrack = {
  title: "Hamstrings and Groins: The Strength Work That Protects",
  description:
    "Why sprinting athletes strain the hamstring and the adductors, the two single exercises that cut those injuries roughly in half, how little volume it takes, and where it goes in the week.",
  keyPrinciplesForAi:
    "Hamstring strains are the signature injury of sprinting sports and adductor strains the signature injury of kicking, skating and cutting sports. The strongest risk factor for either is a previous injury of the same kind, and a recent hamstring strain raises the risk most. Programs that include the Nordic hamstring curl roughly halve hamstring injuries across sports, and progressive eccentric programs cut recurrent strains even more; low-volume Nordic programs build as much eccentric strength as high-volume ones after six weeks, with less soreness and better compliance. The Copenhagen adduction exercise, progressed through three levels, three times a week in the preseason and once a week in season, cut groin problems by about forty percent in male soccer players and raised eccentric adductor strength by about a third. Hard eccentric hamstring work belongs after training, not in the warm-up, because doing it first weakened the hamstrings during play. Fatigue late in matches lowers the hamstring-to-quadriceps strength ratio, matching the late rise in strains. Exposure to high-speed running is a modifiable factor, so build sprint volume gradually rather than in spikes. Diagnosis and rehab of a strain are a clinician's.",
  lessons: [
    {
      lessonNumber: 1,
      title: "Who Strains What, and Why",
      estMinutes: 6,
      content:
        "Hamstring strains happen most where athletes sprint: track sprints and hurdles, soccer, football, baseball base running. In athletics as a whole the thigh is the most injured region and muscle the most injured tissue, which in sprint events mostly means the hamstring. The strain usually happens late in the swing phase of a stride, when the hamstring is lengthening hard to slow the lower leg before the foot strikes. That is an eccentric job, done at very high speed, which is why eccentric strength sits at the center of prevention.\n\nAdductor and groin injuries belong to the sports that kick, skate and change direction: soccer, ice hockey, football. In soccer, the hamstrings and adductors are the two muscle groups most often strained, which is why eccentric strength in both is listed among the key physical qualities of the game.\n\nThe risk factors are consistent across reviews. The strongest single predictor of a hamstring strain is a previous one, about two and three-quarter times the risk, rising to nearly five times when the previous strain was recent. Older age, a prior ACL injury and a prior calf strain also raise the risk. Among the factors a coach can change, the amount of high-speed running an athlete is exposed to and their hamstring strength are the most consistently linked. For the groin, a previous groin injury, weaker adductors (in absolute terms and relative to the abductors), a higher level of play and less sport-specific training all appear.\n\nTiming within a game matters too. Match-like fatigue lowered the ratio of eccentric hamstring strength to concentric quadriceps strength by about ten percent, which lines up with the rise in hamstring strains late in each half. A tired hamstring is a weaker brake.\n\nTwo implications follow. First, an athlete with any history of a strain is a priority for prevention work, not an afterthought. Second, high-speed running is both the cause and the cure: athletes who never sprint in practice are unprepared for the sprint that comes in a game, while athletes whose sprint volume jumps suddenly are exposed. Sprint exposure should build gradually and stay regular through the season.",
      flashcards: [
        { front: "Strongest risk factor for a hamstring strain", back: "A previous hamstring strain, especially a recent one." },
        { front: "When in a stride the hamstring is usually strained", back: "Late swing, while it lengthens hard to slow the lower leg." },
        { front: "Modifiable hamstring risk factors", back: "High-speed running exposure and hamstring strength." },
      ],
    },
    {
      lessonNumber: 2,
      title: "The Nordic Hamstring Curl",
      estMinutes: 6,
      content:
        "The Nordic hamstring curl is a partner exercise: the athlete kneels, a partner holds the ankles, and the athlete lowers the trunk toward the floor as slowly as possible, catching themselves with their hands at the bottom and pushing back up. It is simple, needs no equipment, and is one of the best-supported prevention exercises in sport.\n\nA 2019 review pooling studies across sports and levels found programs including the Nordic roughly halved hamstring injuries. Trials in men's soccer that used a progressive eccentric program cut new hamstring injuries and especially recurrent ones, where the reduction was larger still; an amateur soccer trial agreed. Across randomized trials eccentric hamstring training reduced injuries by somewhere between about half and seventy percent. In professional and semi-professional soccer, interventions built around the Nordic, a neuromuscular warm-up and trunk and balance work reduced hamstring injuries by more than half.\n\nThe good news for compliance is that it does not take much. Low-volume Nordic programs produced eccentric strength gains as large as high-volume ones once athletes had trained for six weeks or more, and the high-volume versions caused more soreness. Soreness is what makes athletes and coaches quit. A sensible build is a few sets of a few reps, twice a week for the first weeks, then a single short session a week through the season to hold the gain.\n\nCoach the lowering. The point of the rep is the slow descent; a rep where the athlete drops quickly after the first few degrees is not doing the job. Athletes who cannot control much of the range begin with a band assist or a shortened range and progress. Keep the hips extended rather than bending at the waist to make it easier.\n\nOne caution is worth repeating from the warm-up track. Doing Nordics before soccer training left the hamstrings weaker eccentrically during the play that followed, while doing them after training gave the same strength gains over twelve weeks. Hard eccentric hamstring work goes after practice. Single-exercise eccentric programs have the strongest evidence; evidence that trunk or core stability training alone prevents hamstring strains is thin.",
      flashcards: [
        { front: "Effect of programs including the Nordic hamstring curl", back: "Roughly half as many hamstring injuries across sports." },
        { front: "Does a Nordic program need high volume?", back: "No. Low volume built as much eccentric strength after six weeks, with less soreness." },
        { front: "The key coaching point on a Nordic", back: "A slow, controlled lowering with the hips kept extended." },
      ],
    },
    {
      lessonNumber: 3,
      title: "The Copenhagen Adduction Exercise and the Groin",
      estMinutes: 6,
      content:
        "The groin has its own single-exercise answer. The Copenhagen adduction exercise is a side plank with the top leg supported on a bench or a partner's arm and the bottom leg free; the athlete lifts the body by squeezing the top leg down and lowers slowly. It comes in three levels: short lever with the knee supported, long lever with the ankle supported, and longer holds or more reps.\n\nIn a 2019 cluster-randomized trial of semi-professional male soccer players across thirty-five teams, a program built only on the Copenhagen adduction exercise cut the prevalence of groin problems by about forty percent. The dose was three sessions a week for six to eight weeks of preseason, then one session a week in season. A separate eight-week in-season program raised eccentric adductor strength by about a third with high compliance and little soreness, which answers the usual worry that adductor work will leave players sore for games.\n\nThe evidence is not unanimous. Used in isolation in some studies, the exercise reliably increased adduction strength but did not significantly reduce groin injury, and broader groin programs showed a smaller, non-significant reduction. The honest summary is that the Copenhagen exercise reliably builds the strength the groin needs, and the best trial so far found a substantial drop in groin problems.\n\nIce hockey adds a screening idea. A preseason adductor strengthening program for professional players identified as weak cut adductor strains sharply in a before-and-after comparison, and checking the ratio of adductor to abductor strength in the preseason and monthly in season was proposed as a way to find players who need the work. A simple squeeze test, the athlete squeezing a ball or a cuff between the knees, gives a coach a usable number to watch over a season, and athletes with long-standing groin pain show lower squeeze values.\n\nFor a team, the program is short: the Copenhagen exercise at the right level two or three times a week in the preseason, once a week in season, after practice or as part of a strength session, alongside the hip and trunk strength the rest of the program already covers.",
      flashcards: [
        { front: "Copenhagen adduction dose in the 2019 soccer trial", back: "Three times a week for six to eight weeks of preseason, then once a week in season." },
        { front: "Effect on groin problems in that trial", back: "About forty percent lower prevalence." },
        { front: "A simple adductor strength check", back: "A squeeze test between the knees, tracked over the season." },
      ],
    },
    {
      lessonNumber: 4,
      title: "Putting It in the Week",
      estMinutes: 6,
      content:
        "Two exercises, done briefly and consistently, cover most of the protection this track describes. The difficulty is never knowing what to do; it is keeping it in the week once games start.\n\nIn the preseason, put the Nordic hamstring curl and the Copenhagen adduction exercise into two or three sessions a week, after practice or at the end of a strength session, starting at a low level and building over six to eight weeks. In season, drop each to a single short session a week, placed early enough that any soreness has cleared before the next game, often two or three days out. A few sets of a few reps is enough to hold what was built.\n\nAlongside them, manage high-speed running. Athletes need regular exposure to near-maximal sprinting in practice so the first all-out sprint of a game is not the first one of the week. The danger is the spike: a week of conditioning sprints after a holiday break, or a sudden increase in sprint volume in the first days of camp. Preseason hamstring strain rates in college baseball and softball were about twice in-season rates, which fits the picture of athletes arriving unprepared for the speed of practice.\n\nThe warm-up still has its job. A neuromuscular routine before practice, as described in the warm-up track, belongs at the start; the hard eccentric work belongs at the end. Keeping the two separate respects the finding that pre-training Nordics left hamstrings weaker during later play.\n\nWatch the athletes with a history first. A previous hamstring, groin, ACL or calf injury puts an athlete at the top of the list for consistent prevention work and careful sprint progression.\n\nWhen a strain happens, the athlete stops and is assessed by a clinician, who classifies the injury and leads rehab. Published rehab is mostly progressed by pain and cleared with clinical and performance tests, and lengthening-focused hamstring rehab returned elite soccer players faster than conventional exercise. Those are decisions for the clinician; the coach's job is to build the athlete back into full-speed practice gradually once cleared, and to restart the prevention work as part of the return.",
      flashcards: [
        { front: "In-season dose of Nordic and Copenhagen work", back: "About one short session a week each, placed so soreness clears before games." },
        { front: "Why manage sprint spikes", back: "Sudden jumps in high-speed running volume expose unprepared hamstrings." },
        { front: "Who gets priority for prevention work", back: "Athletes with a previous hamstring, groin, ACL or calf injury." },
      ],
    },
  ],
  quizQuestions: [
    q(0, "What is the strongest single risk factor for a hamstring strain?", [
      ["A previous hamstring strain, especially a recent one", "Correct. A recent strain raised the risk nearly five times."],
      ["Being too flexible", "Flexibility was not the strongest predictor."],
      ["Wearing the wrong cleats", "Footwear was not identified as the main factor."],
      ["Lifting weights", "Strength work protects rather than harms."],
    ], 0),
    q(1, "Programs that include the Nordic hamstring curl reduce hamstring injuries by about how much?", [
      ["About half", "Correct. A 2019 review found roughly half as many injuries."],
      ["About five percent", "The effect is much larger."],
      ["They increase injuries", "They reduce hamstring injuries by about half."],
      ["They eliminate hamstring injuries", "No program eliminates them."],
    ], 0),
    q(2, "A coach worries that Nordics will leave players too sore. What does the evidence say about volume?", [
      ["Low-volume programs built as much eccentric strength after six weeks, with less soreness", "Correct. High volume added soreness without extra strength."],
      ["Only very high volume works", "Low volume worked as well after six weeks."],
      ["Any soreness means stop forever", "A gradual build keeps soreness manageable."],
      ["Nordics should be done to failure daily", "That would maximize soreness and hurt compliance."],
    ], 0),
    q(3, "When should hard Nordic hamstring work be scheduled?", [
      ["After practice, because doing it first weakened the hamstrings during later play", "Correct. Twelve-week gains were the same either way."],
      ["As the first part of the warm-up", "That placement reduced eccentric strength during play."],
      ["On game day before kickoff", "Hard eccentric work before competition adds fatigue."],
      ["Only in the offseason", "An in-season maintenance dose holds the gain."],
    ], 0),
    q(4, "What did a 2019 trial of the Copenhagen adduction exercise find in semi-professional soccer?", [
      ["About forty percent fewer groin problems", "Correct. Three times a week in preseason, once a week in season."],
      ["More groin injuries", "Groin problems fell by about forty percent."],
      ["No change in adductor strength", "Adductor strength rises reliably with the exercise."],
      ["It only worked for goalkeepers", "It was a whole-team program."],
    ], 0),
    q(5, "Late in a match, what happens to the hamstring-to-quadriceps strength ratio?", [
      ["It drops by about ten percent, matching the late rise in strains", "Correct. A tired hamstring is a weaker brake."],
      ["It rises", "Fatigue lowers it, by about ten percent."],
      ["Nothing changes", "Match-like fatigue changed it measurably."],
      ["It only changes in the weight room", "The change was measured after match-like exercise."],
    ], 0),
    q(6, "How should high-speed running be managed?", [
      ["Regular near-maximal sprint exposure in practice, built gradually without sudden spikes", "Correct. Running exposure is a modifiable risk factor."],
      ["Avoid sprinting in practice entirely", "Unprepared athletes meet their first sprint in a game."],
      ["Double sprint volume in the first week of camp", "Spikes expose unprepared hamstrings."],
      ["Sprint only when tired", "Sprint work belongs when athletes are fresh."],
    ], 0),
    q(7, "An athlete strains a hamstring in practice. What is the coach's role?", [
      ["Stop them, get a clinician's assessment, and rebuild full-speed practice gradually once cleared", "Correct. Classification and rehab belong to the clinician."],
      ["Have them stretch it out and finish practice", "Continuing on a strain risks a worse injury."],
      ["Prescribe heavy Nordics the next day", "Rehab is clinician-led and pain-guided."],
      ["Set a fixed two-week return regardless of tests", "Return is criteria-based."],
    ], 0),
  ],
};
