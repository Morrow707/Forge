import { q, type SeedAcademyTrack } from "./types";

export const FUELING_TRACK: SeedAcademyTrack = {
  title: "Fueling the Athlete",
  description:
    "Enough food, the right kinds at the right times, water, and how to talk about any of it with a teenager without doing harm. The nutrition a strength coach can responsibly teach, and where the line is.",
  keyPrinciplesForAi:
    "The first nutrition problem on almost every roster is not enough food, not the wrong food; an under-fuelled athlete cannot adapt, gets hurt more and plays worse. Carbohydrate is the fuel for hard training and games and should be the bulk of an athlete's plate around them; protein, spread across the day in three to five servings with one after training, supplies the material for repair; fat is needed and is not the enemy. Hydration starts before the session and is checked by urine colour and bodyweight change, not thirst. Timing matters less than totals, but a meal within a couple of hours after hard work helps, and a game-day plan that was rehearsed in practice beats one invented on the bus. A coach talks about fuel and performance, never about weight, shape or body fat, with any athlete and above all with a minor; anything beyond general guidance, any sign of disordered eating, and any medical condition goes to a registered dietitian or physician. Supplements are a separate track and the answer is mostly no.",
  lessons: [
    {
      lessonNumber: 1,
      title: "The Problem Is Usually Not Enough",
      estMinutes: 6,
      content:
        "Ask most coaches what their athletes eat wrong and they will describe junk food. Look at what the athletes actually eat on a training day and the more common finding is that they do not eat enough, especially early in the day. A teenager who skips breakfast, eats a small lunch at eleven, trains at four and has dinner at seven has done the hardest work of the day on almost nothing. The body cannot build what it is not given, and an under-fuelled athlete does not adapt, recovers slowly, gets ill more, gets hurt more, and loses the mental sharpness that practice is supposed to build.\n\nThe demands are large. A growing athlete training hard needs considerably more energy than a sedentary peer, and that need climbs during growth spurts and heavy training blocks. Low energy availability, where intake does not cover the cost of training plus the cost of living and growing, is a recognised condition with consequences for bone, hormones, immunity and performance in both sexes. It does not require an eating disorder; it is often just an athlete who is busy, not hungry after practice, and nobody told them.\n\nThe coach's first intervention is simple and powerful: make eating enough normal and expected. Talk about fuel the way you talk about sleep. Encourage breakfast. Suggest a real snack before an afternoon session, something with carbohydrate and a little protein, rather than training empty. Make sure the team has food available after a late practice or game rather than going home to bed on nothing. These are not diets; they are logistics.\n\nThe second intervention is to watch for the athlete who is not fuelling. Fatigue that does not match the training, frequent minor illness, slow recovery, declining performance, irritability and, in girls, changes to the menstrual cycle are all signals. The coach does not diagnose and does not manage it. The coach notices, asks gently and generally, and refers to a dietitian or physician, and does so early. The athlete whose coach noticed in October has a very different year from the one whose coach noticed in March.",
    },
    {
      lessonNumber: 2,
      title: "Carbohydrate, Protein, Fat and Water",
      estMinutes: 7,
      content:
        "Carbohydrate is the fuel for anything hard. Sprints, lifts, games and intense practice all run largely on carbohydrate stored in the muscle, and that store is limited and refilled from food. An athlete low on it feels flat, loses power late in a session, and recovers slowly. Around training and competition, carbohydrate should be the biggest part of the plate: rice, pasta, bread, potatoes, fruit, oats. The idea that carbohydrate is something to avoid, borrowed from adult dieting culture, is harmful for an athlete and should be contradicted when it shows up on a team.\n\nProtein supplies the material for repair and growth. The body uses it best when it arrives in several servings across the day rather than one large one at dinner, so a serving at each meal plus one after training, from eggs, dairy, meat, fish, beans, or a shake if a real meal is impossible, is the practical pattern. Total daily protein for a hard-training athlete is higher than for a sedentary person, but the amounts are reachable from food; the enormous intakes promoted online add nothing beyond a point and displace the carbohydrate the athlete needs more.\n\nFat is necessary for hormones, for absorbing certain vitamins, and for the slow energy that carries an athlete between meals. It is not the enemy and very low fat diets harm athletes, especially growing ones. Nuts, oils, dairy, eggs and fish supply it without effort. The practical message is to eat a varied plate and not fear any part of it.\n\nWater is the one most often forgotten. An athlete arriving at practice already dehydrated, which is common after a school day, has lower power, worse concentration and a higher heat-illness risk before the session starts. The checks are simple: urine that is pale yellow in the morning, and bodyweight after a session that is close to the weight before it. A loss of more than a couple of percent of bodyweight during a session means the athlete needs to drink more, during and after. For sessions under an hour in normal conditions, water is enough. For long or hot sessions, something with carbohydrate and salt helps, and a sports drink is a reasonable tool there and a poor one everywhere else.",
    },
    {
      lessonNumber: 3,
      title: "Timing, Game Day and the Bus",
      estMinutes: 6,
      content:
        "Totals matter more than timing. An athlete who eats enough of the right things across the day will do well even if the meals are not perfectly placed. Within that, a few placements help. A meal two to three hours before training or a game, built around carbohydrate with some protein and not much fat, gives fuel without a heavy stomach. A small carbohydrate snack in the hour before, a banana or a piece of toast, tops it up. Something with carbohydrate and protein within a couple of hours afterward starts the repair and refills the stores for tomorrow; a proper meal does this best and a shake does it when a meal is not possible.\n\nGame day is where nutrition goes wrong most often, because the routine breaks. Early starts, long waits, nerves that kill appetite, a tournament with three games and nothing to eat between them, a bus that leaves before dinner. The answer is a plan, rehearsed in practice so nothing is new on the day: what the athlete eats the night before, at breakfast, in the hours before the game, between games, and after. The foods in the plan are foods the athlete has eaten before hard training and tolerated. Game day is not the day to try a new bar or a new drink.\n\nTournaments deserve special attention. Between games, an athlete needs carbohydrate they can digest quickly and fluid, not a large meal: fruit, sandwiches, crackers, a sports drink if it is hot. A team that eats nothing between the morning game and the afternoon game plays the afternoon game on empty, and it shows in the second half.\n\nTravel is the other breaker. A team bus that stops at a fast-food counter is not the end of the world if the athletes choose the carbohydrate-and-protein options and the coach has packed fruit and water. A team bus that stops nowhere for six hours is worse than any fast food. Pack food. Have water on the bus. Build the trip around eating rather than hoping it works out.\n\nThe weigh-in sports, wrestling above all, have their own rules and their own dangers, and the coach follows the sport's governing body's weight management program exactly rather than any folk method of making weight. Dehydrating a teenager to make a class is a line a coach never crosses.",
    },
    {
      lessonNumber: 4,
      title: "How to Talk About Food With a Teenager",
      estMinutes: 6,
      content:
        "A coach's words about food carry weight that a parent's often do not, and the wrong words do lasting harm. Adolescence is when eating disorders most often begin, athletes are at raised risk, and an offhand comment from a respected coach is a documented trigger. This lesson is about the line.\n\nTalk about fuel and performance, never about weight, shape, size or body fat. \"Make sure you eat before practice so you have something to train on\" is coaching. \"You could stand to lose a few pounds\" is harm, whatever the intent and whatever the sport. The same applies to praise: complimenting an athlete on getting leaner is a comment on their body, and it teaches the whole team what the coach notices. Praise the effort, the performance, the consistency.\n\nDo not run weigh-ins in front of the team, do not post weights, and do not set weight targets for anyone. In sports where weight is measured for a legitimate reason, do it privately, record it only where the sport requires it, and never comment on it beyond what the rule needs. Body composition testing of minors is not a tool a strength coach uses; if a sport has a reason for it, a physician or dietitian runs it, with the guardian's agreement.\n\nWatch for the signs of disordered eating and act on them early: skipping meals, cutting food groups, talking about food constantly, training excessively outside the program, rapid weight change in either direction, withdrawal, fatigue that does not fit, and in girls a changed or absent cycle. None of these is a diagnosis and the coach does not make one. The coach speaks privately, without accusation, says what they have noticed and that they are concerned, and brings in the guardian and a qualified professional. The conversation feels awkward and it is one of the most important a coach will have.\n\nFinally, model it. A coach who skips lunch, talks about their own diet, or jokes about weight is teaching. A coach who eats with the team, treats food as fuel and never comments on bodies is teaching too.",
    },
  ],
  quizQuestions: [
    q(0, "What is the most common nutrition problem on a high-school roster, according to the track?", [
      ["Not eating enough, especially early in the day", "Correct. An under-fuelled athlete cannot adapt, recovers slowly, and gets ill and hurt more."],
      ["Eating too much junk food", "It happens, but under-fuelling is more common and more harmful."],
      ["Too much protein", "Protein excess displaces carbohydrate but is rarely the first problem."],
      ["Too much water", "Dehydration is far more common than over-hydration."],
    ], 0),
    q(1, "Which nutrient should make up the biggest part of the plate around hard training and games?", [
      ["Carbohydrate", "Correct. Hard efforts run on muscle carbohydrate stores that are refilled from food."],
      ["Protein", "Protein supplies repair material but is not the main fuel for hard work."],
      ["Fat", "Fat is necessary but is slow fuel, not the main source for intensity."],
      ["Fibre", "Fibre is healthy but not a fuel for performance."],
    ], 0),
    q(2, "How is protein best distributed across the day?", [
      ["In three to five servings, including one after training", "Correct. The body uses it better spread out than in one large evening serving."],
      ["All at dinner", "A single large serving is used less well than several spread across the day."],
      ["Only in shakes", "Food does the job; a shake is for when a meal is not possible."],
      ["As much as possible at every meal", "Beyond a point it adds nothing and displaces carbohydrate."],
    ], 0),
    q(3, "What are the two simple hydration checks the track recommends?", [
      ["Morning urine colour and bodyweight change across a session", "Correct. Pale yellow urine and a small weight change mean the athlete is close to right."],
      ["Thirst and sweat volume", "Thirst lags behind need and sweat is hard to judge."],
      ["Blood tests weekly", "Unnecessary; the simple checks work."],
      ["How much the athlete says they drank", "Self-report is unreliable; the checks are objective."],
    ], 0),
    q(4, "What is the rule for food on game day?", [
      ["Follow a plan rehearsed in practice, using foods the athlete has already tolerated before hard work", "Correct. Game day is not the day to try anything new."],
      ["Try whatever is available", "An untested food on game day is a gamble."],
      ["Eat nothing to avoid feeling heavy", "Playing on empty costs performance, especially late."],
      ["A large meal thirty minutes before the start", "Too close and too large; the meal belongs two to three hours out."],
    ], 0),
    q(5, "A wrestler needs to make weight. What does the track say?", [
      ["Follow the governing body's weight management program exactly; never dehydrate a teenager to make a class", "Correct. That is a line a coach never crosses."],
      ["Cut water the day before", "Dehydrating a minor to make weight is dangerous and prohibited."],
      ["Skip meals for the week", "Under-fuelling harms performance and health; the sanctioned program exists for a reason."],
      ["Whatever worked for the coach as an athlete", "Folk methods are the problem the sanctioned programs replaced."],
    ], 0),
    q(6, "Which of these is coaching rather than harm?", [
      ["\"Make sure you eat before practice so you have something to train on\"", "Correct. Fuel and performance, never weight, shape or size."],
      ["\"You could stand to lose a few pounds\"", "A comment on an athlete's body, and a documented trigger for harm."],
      ["\"You look leaner, nice work\"", "Praise for a body change teaches the team what the coach notices."],
      ["Posting the team's weights on the wall", "Weights are private, recorded only where a sport requires them."],
    ], 0),
    q(7, "A coach notices an athlete skipping meals, training excessively on their own and losing weight fast. What is the right action?", [
      ["Speak privately and without accusation, say what was noticed, and bring in the guardian and a qualified professional early", "Correct. The coach notices and refers; the coach does not diagnose or manage it."],
      ["Praise the dedication", "The pattern is a warning sign, not dedication."],
      ["Say nothing; it is not the coach's business", "Early action by the coach changes the athlete's year."],
      ["Put the athlete on a diet plan", "A strength coach does not prescribe diets; a dietitian does."],
    ], 0),
  ],
};
