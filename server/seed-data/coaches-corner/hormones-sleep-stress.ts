import { q, type SeedAcademyTrack } from "./types";

export const HORMONES_SLEEP_STRESS_TRACK: SeedAcademyTrack = {
  title: "Hormones, Sleep and Stress",
  description:
    "The parts of the body's internal chemistry a coach can actually influence: how training signals the body to adapt, why sleep is the most powerful recovery tool there is, and what chronic stress does to a season.",
  keyPrinciplesForAi:
    "Training sends hormonal signals that tell the body to build, and recovery is when those signals are acted on; the coach influences this through session design, sleep and stress, never through anything an athlete takes. Heavy, multi-joint work with adequate volume produces the strongest building signal; long, exhausting sessions and chronic under-recovery tip the balance toward breakdown. Sleep is where growth and repair hormones peak and where the nervous system consolidates skill, so an athlete sleeping six hours is training at a discount; eight to ten hours for teenagers is a performance intervention, not a lifestyle tip. Chronic stress, from school, home or the sport itself, draws on the same reserves as training and shows up as poor sleep, flat mood, slow recovery and more illness. The coach's levers are the dose of training, the timing of hard sessions, teaching sleep habits, and noticing when life-load has risen so training load can come down. Puberty changes everything about an athlete's hormonal response, and the program for a thirteen-year-old is not a scaled adult program.",
  lessons: [
    {
      lessonNumber: 1,
      title: "The Signals Training Sends",
      estMinutes: 6,
      content:
        "When an athlete trains hard, the body releases a set of hormones in the minutes and hours afterward that act as instructions: repair this, build that, mobilise fuel, calm down. Some of these signals favour building, and they rise most after heavy, multi-joint lifting with meaningful volume and short-to-moderate rests. Others favour breakdown and mobilisation, and they rise with any stress, including a very long session, a hard conditioning day or a sleepless night. Adaptation depends on the balance between the two over days and weeks, not on any single reading.\n\nThe practical reading is that the design of a session shapes its signal. A heavy squat and press session with full-body involvement sends a stronger building message than the same number of sets of isolation work. A session that runs past ninety minutes, or one that ends with the athlete exhausted and shaking, shifts the balance the other way. Neither is a reason to chase a hormone number; the coach cannot see it and does not need to. The design rules that come out of the physiology are the ones good coaches already follow: compound lifts, enough load to matter, sessions that end before quality collapses, and conditioning that does not bleed into the next day.\n\nTwo cautions belong here. First, the acute hormonal response to a single session is small and short-lived; it is the pattern over weeks, under enough sleep and food, that builds an athlete. A single great session does not build anything if the week around it is a mess. Second, the differences in response between individuals, and especially between athletes at different stages of puberty, are large. Two fifteen-year-olds on the same program can respond completely differently because one is two years further through puberty than the other. That is biology, not effort, and the program has to allow for it.\n\nThe coach never reaches for anything that manipulates these systems from outside. The supplements and substances track covers why; this one is about what the coach can do with the program, which is more than most realise.",
    },
    {
      lessonNumber: 2,
      title: "Sleep Is Where the Work Lands",
      estMinutes: 7,
      content:
        "If a coach could prescribe one thing to a roster to make them stronger, faster and less injured, it would be sleep. The hormones that drive growth and repair peak during the deep sleep of the first half of the night. The nervous system consolidates the skills practised that day during sleep, which is why a technique learned on Tuesday is better on Thursday after two nights than it was on Tuesday evening. Reaction time, decision-making and mood all degrade measurably on short sleep, and injury rates climb in athletes who sleep less.\n\nTeenagers need more than adults, somewhere between eight and ten hours, and most get far less. Their body clocks also run later during adolescence, so an early practice is a bigger cost to a sixteen-year-old than to a thirty-year-old coach. None of that is an excuse; it is a fact the program has to respect. A heavy session the morning after a late game is a session on an athlete who has not recovered from the game, and the signal it sends is mostly breakdown.\n\nWhat a coach can do is teach the habits and make the schedule allow them. The habits are the same ones every sleep clinician gives: a consistent bedtime and wake time including weekends, screens off thirty to sixty minutes before bed, a dark and cool room, no caffeine after mid-afternoon, and a wind-down routine that the body learns to read as a signal. Naps of twenty to thirty minutes in the early afternoon help athletes who are short on sleep; longer or later naps make the night worse.\n\nThe schedule is the coach's bigger lever. Avoiding six in the morning sessions where possible, keeping the hardest sessions away from the day after travel or a late game, and treating a team-wide sleep debt as a reason to lighten the week are all program decisions. Asking athletes how they slept, and meaning it, is the cheapest monitoring there is. An athlete who reports two bad nights in a row is not an athlete to test on.",
    },
    {
      lessonNumber: 3,
      title: "Stress Is Stress",
      estMinutes: 6,
      content:
        "The body does not file stress by source. Training, exams, a difficult home, a breakup, a long bus trip and a coach who shouts all draw on the same physiological reserves and produce the same chemistry. An athlete carrying a heavy life-load has less capacity left for training stress, and the training plan that was right in a calm month becomes too much in a hard one.\n\nThe signs are the same as the ones in the adaptation track, because the mechanism is the same: sleep worsens, appetite shifts, mood flattens or sharpens, small illnesses accumulate, recovery slows, and performance drifts down. The difference is that the cause is not in the training log, so a coach looking only at the log will not find it. This is where a conversation beats a spreadsheet. A coach who knows that an athlete's parents are separating, or that finals are next week, can lighten the week before the signals appear rather than after.\n\nIt also runs the other way. The weight room can be the one stable, predictable hour in a chaotic day, and a coach who makes it that is doing real recovery work. Consistency, calm, clear expectations and a session that ends with a win of some kind lower an athlete's stress rather than adding to it. A coach who runs the room as a place of punishment and uncertainty is adding to the load every day, and the chemistry does not distinguish that from an extra session.\n\nChronic stress has a specific effect on younger athletes. During growth and puberty, prolonged high stress interferes with the hormonal signals that drive development, and in girls it is one of the contributors to the pattern of low energy availability covered in the track on training women. A team that is chronically stressed is a team that is not developing as it should, whatever the training plan says.\n\nThe coach's job here is not to be a counsellor. It is to notice, to adjust the training dose, to make the room a place that lowers stress rather than raising it, and to know who to refer an athlete to when what they are carrying is more than a lighter week can fix.",
    },
    {
      lessonNumber: 4,
      title: "Puberty Changes the Rules",
      estMinutes: 6,
      content:
        "Before puberty, boys and girls respond to training in nearly the same way, and that way is mostly neural. They get stronger through coordination and recruitment, not through muscle growth, which is why a well-coached ten-year-old can double a lift without looking any different. The building hormones that drive muscle growth are present at low levels in both sexes, and the program for a child is about movement skill, variety, and enjoyment, with load as a distant third. The youth development track covers that program; this lesson covers why.\n\nPuberty changes the chemistry and the two sexes diverge. In boys the hormone that drives muscle growth rises many-fold across a few years, and the response to strength training changes from mostly neural to neural plus substantial growth. Boys at the same age can be years apart in this process, which is why one fourteen-year-old looks like a man and another like a child, and why the same program produces very different results in a group of fourteen-year-olds. In girls the changes include a rise in the hormones that affect connective tissue laxity, body composition and the menstrual cycle, and the neural gains continue alongside more modest muscle growth.\n\nFor a coach, three consequences follow. First, stage matters more than age. Grouping athletes by developmental stage, which can be estimated from growth rate and a few observable markers, produces fairer competition and safer loading than grouping by birthday. Second, the growth spurt itself is a period of raised injury risk, because bones lengthen faster than tendons and muscles adapt, coordination temporarily worsens, and growth plates are vulnerable. Loading is held or reduced during a rapid growth phase, not progressed, and the focus returns to movement quality. Third, the comparison trap is real. The late-maturing athlete who is out-lifted by an early-maturing teammate is not behind; they are on a different timeline, and often ends up the better athlete once the timelines converge. A coach who says that out loud, to the athlete and the parents, prevents a great deal of harm.\n\nNone of this requires measuring anything invasive. Height tracked every few months, a question about recent growth, and an eye for the athlete whose coordination has suddenly gone are enough to adjust the program.",
    },
  ],
  quizQuestions: [
    q(0, "Which session design sends the strongest building signal, according to the track?", [
      ["Heavy, multi-joint lifting with meaningful volume, ending before quality collapses", "Correct. Compound work with enough load, in a session that does not run to exhaustion."],
      ["A three-hour session of isolation exercises", "Length and isolation both shift the balance toward breakdown."],
      ["A session that ends with the athlete shaking and exhausted", "Exhaustion tips the signal the wrong way."],
      ["Any session; the signal is the same regardless", "Design shapes the signal, which is why the rules exist."],
    ], 0),
    q(1, "How much sleep does a teenage athlete need?", [
      ["Roughly eight to ten hours", "Correct. Most get far less, and the shortfall is a performance and injury problem."],
      ["Five to six hours, like many adults get", "That is a deficit for a teenager, and it shows in recovery and injury rates."],
      ["As little as they can function on", "Functioning is not the same as adapting."],
      ["Twelve hours every night", "More than needed does not add benefit; eight to ten is the range."],
    ], 0),
    q(2, "What is the coach's biggest lever on sleep?", [
      ["The schedule: avoiding early sessions and hard days after late games or travel", "Correct. Habits matter, but the schedule is the coach's decision."],
      ["Telling athletes to sleep more", "Advice helps a little; the schedule decides whether it is possible."],
      ["Prescribing naps during school", "Short early-afternoon naps help, but the coach does not control the school day."],
      ["Nothing; sleep is the athlete's business", "Sleep is a performance variable the program influences."],
    ], 0),
    q(3, "An athlete's performance is sliding but the training log looks fine. Where does the track say to look?", [
      ["Outside the gym: school, home, travel, the sport's own pressure", "Correct. The body does not file stress by source; a conversation finds what the log cannot."],
      ["Add more training to push through", "Adding load to a stressed athlete deepens the decline."],
      ["Change the exercises", "The problem is reserves, not exercise selection."],
      ["Test them to find the weakness", "Testing a stressed athlete gives a bad number and adds stress."],
    ], 0),
    q(4, "How can the weight room reduce an athlete's stress rather than add to it?", [
      ["By being consistent, calm and predictable, with clear expectations and a session that ends on a win", "Correct. The chemistry does not distinguish a punishing room from an extra session."],
      ["By being as hard as possible so life feels easy by comparison", "That adds load; it does not relieve it."],
      ["By skipping training entirely during stressful weeks", "Lightening is often right; a stable session can itself be recovery."],
      ["It cannot; training is always a stress", "Training is a stress, but the environment around it can lower or raise the total."],
    ], 0),
    q(5, "Before puberty, how do children mostly get stronger?", [
      ["Through neural adaptation: coordination and recruitment, not muscle growth", "Correct. Which is why movement skill, variety and enjoyment lead the program."],
      ["Through rapid muscle growth", "The hormones that drive growth are low before puberty."],
      ["They cannot get stronger before puberty", "They can, substantially, through the nervous system."],
      ["Only through bodyweight exercise", "The mechanism, not the tool, is the point; the gains are neural."],
    ], 0),
    q(6, "Why should athletes be grouped by developmental stage rather than age?", [
      ["Athletes of one age can be years apart in puberty, so stage gives fairer competition and safer loading", "Correct. Two fourteen-year-olds can respond to the same program completely differently."],
      ["Age is not known reliably", "Age is known; it is simply a poor proxy for development."],
      ["Stage grouping is required by rule", "It is good practice, not a rule."],
      ["It should not; age is the only fair measure", "The track argues the opposite, and explains why."],
    ], 0),
    q(7, "An athlete is in a rapid growth spurt. What happens to loading?", [
      ["It is held or reduced and the focus returns to movement quality", "Correct. Bones outpace tendons and muscles, coordination dips and growth plates are vulnerable."],
      ["It is increased to match the new height", "Progressing load during a spurt raises injury risk."],
      ["Nothing changes", "The spurt is a known period of raised risk."],
      ["Training stops entirely", "Training continues with the emphasis on quality, not load."],
    ], 0),
  ],
};
