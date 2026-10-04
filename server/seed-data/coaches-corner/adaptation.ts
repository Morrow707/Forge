import { q, type SeedAcademyTrack } from "./types";

export const ADAPTATION_TRACK: SeedAcademyTrack = {
  title: "How the Body Adapts to Training",
  description:
    "The stress-recover-adapt cycle that every program depends on: what changes with strength, power and endurance training, how fast it goes away, and how to tell adaptation from overreaching before it becomes overtraining.",
  keyPrinciplesForAi:
    "Training is a stress; adaptation happens in the recovery after it, and the program is a schedule of stresses spaced so the athlete arrives at the next one adapted rather than still recovering. Strength training raises neural drive first and muscle size later; power training raises rate of force; endurance training grows the aerobic machinery, capillaries and the heart's stroke volume. Adaptation is specific to what was trained and is lost on roughly the schedule it was gained, with strength holding longest and aerobic fitness fading fastest, which is why in-season maintenance exists. Overreaching is a planned, short dip from a hard block that rebounds with a week of lighter work; overtraining is a long decline with sleep, mood, resting heart rate and illness all moving the wrong way, and it takes weeks to months to undo. Monitor the simple signals, cut volume before intensity when they move, and treat a plateau as a question about recovery before a question about load.",
  lessons: [
    {
      lessonNumber: 1,
      title: "Stress, Recover, Adapt",
      estMinutes: 6,
      content:
        "A training session does not make an athlete stronger. It makes them weaker, temporarily, and the body responds to that by rebuilding to a slightly higher level, provided it is given the time and the raw materials to do so. That sequence, stress then recovery then adaptation, is the whole basis of training, and every decision about sets, days and seasons is a decision about how to arrange it.\n\nThe size of the stress matters. Too small and the body has no reason to change; the athlete who lifts the same comfortable weight for a year stays the same. Too large and the body cannot rebuild before the next stress arrives; the athlete who trains to exhaustion daily goes backward. The right dose is one the athlete can recover from in time for the next session, and that dose rises as the athlete adapts, which is what progressive overload means.\n\nThe timing of recovery matters just as much. Adaptation to a hard lower-body session takes somewhere between a day and three, depending on the athlete and the work. Stack the next hard lower-body session inside that window and the athlete trains on an unrecovered base, which is fine occasionally and damaging as a habit. Spread them too far apart and the adaptation has started to fade before the next stimulus arrives. A well-built week is one in which each quality is stressed, given its recovery window, and stressed again just as the adaptation has taken hold.\n\nRecovery is not only time. It is sleep, which is when most of the rebuilding happens; food, which supplies the material; and the absence of other stresses that draw on the same reserves. An athlete in exam week, sleeping five hours and skipping meals, has less recovery capacity and needs a smaller training dose to get the same adaptation. A coach who holds the program fixed while the athlete's life changes is changing the effective dose without meaning to.",
    },
    {
      lessonNumber: 2,
      title: "What Each Kind of Training Changes",
      estMinutes: 7,
      content:
        "Adaptation is specific. The body changes in the direction it is pushed, and the main training qualities push in different directions.\n\nHeavy strength training first raises neural drive: more motor units recruited, faster, in better coordination. Over months it adds contractile protein to the fibres and the muscle grows. It also thickens tendons and strengthens bone, slowly, which is a large part of why strong athletes are durable. What it does not do by itself is make the athlete faster at expressing that force, which is the next quality's job.\n\nPower training, the jumps, throws, sprints and explosive lifts, raises the rate at which force develops and improves the coordination of fast movement. It changes how the nervous system fires more than how big the muscle is. It is the quality that transfers most directly to most sports and the one that fades quickly when it is not practised.\n\nEndurance training grows the aerobic machinery inside the fibres, adds capillaries so more blood reaches them, and enlarges the heart's stroke volume so each beat delivers more. The result is a higher ceiling for sustained work and faster recovery between short efforts. It does not grow muscle and, done in large volumes, it can blunt the strength and power adaptations if the two are stacked carelessly, which is why the energy systems track separates them in the week.\n\nFlexibility and mobility work changes the range the nervous system allows at a joint, more than the length of the tissue, and the gains are kept only while the range is used. Skill work changes the pattern itself, and is the most specific adaptation of all: the squat makes the squat better, the sprint drill makes the sprint better, and the transfer between them is real but smaller than coaches hope.\n\nThe practical upshot is that a program has to name what it wants and train that. A team that wants to be more explosive in the fourth quarter needs power work and an aerobic base, scheduled apart. A team that only lifts heavy will be strong and may not be either.",
    },
    {
      lessonNumber: 3,
      title: "Detraining: How Fast It Goes Away",
      estMinutes: 6,
      content:
        "Adaptations are maintained only while they are stimulated. Stop training and the body begins returning toward baseline, on a schedule that differs by quality and is worth knowing because it decides how little work is enough to hold a gain.\n\nAerobic fitness fades fastest. Within two to three weeks of no endurance work, measurable losses appear: the heart's stroke volume falls, the enzymes decline, and the athlete who could repeat sprints all game starts fading in the third quarter. Power, especially the sharp, high-velocity end, goes next; athletes who stop jumping and sprinting lose their pop within a few weeks even if their strength holds. Strength holds longest. Several weeks without lifting cost a well-trained athlete relatively little, and muscle size holds longer than the neural edge that sits on top of it.\n\nTwo things follow. First, maintenance is cheap. The dose needed to hold a quality is much smaller than the dose needed to build it, often a single quality session a week at the intensity the quality was built at. That is the whole argument for in-season strength work: one or two short, heavy sessions keep what the off-season built, while skipping them for three months hands much of it back. Second, the order in which qualities fade tells a coach what to protect in a crowded week. If something has to go, cut the volume of strength work before cutting the one speed or power session, because the power is what will be gone first.\n\nInjury layoffs are a special case. Muscle that cannot be trained because of an injury loses size and strength quickly, and the surrounding joints lose coordination. Training the uninjured limbs, the rest of the body, and whatever range the injured area can safely use preserves more than most athletes expect, and it is why a return-to-play plan involves the strength coach from the start rather than after the clinician is done.\n\nThere is a hopeful side. Muscle that has been trained before regains size and strength faster than muscle that never has, an effect sometimes called muscle memory. An athlete returning after a layoff is not starting from zero, and the program can progress faster than it did the first time, provided the tendons and the pattern are given the respect they need.",
    },
    {
      lessonNumber: 4,
      title: "Overreaching, Overtraining and the Signals",
      estMinutes: 7,
      content:
        "A hard block of training is supposed to leave an athlete tired. Performance dips for a few days, sleep is a little worse, legs are heavy, and after a lighter week the athlete comes back above where they started. That is functional overreaching, and it is a tool: a planned overshoot followed by a planned recovery. Many of the best training blocks are built on it.\n\nOvertraining is what happens when the recovery never arrives. The dip does not rebound after a light week; it deepens. Performance falls across weeks, not days. Sleep is disturbed, resting heart rate drifts up, appetite drops, mood flattens or sours, minor illnesses come and go, and the athlete who used to look forward to training starts dreading it. Once an athlete is genuinely overtrained, the fix is weeks to months of greatly reduced work, and the season is usually lost. The whole value is in catching it early, when it is still overreaching that has gone on too long.\n\nThe simplest monitoring works. A short daily check-in on sleep quality, soreness, mood and energy, scored one to five, costs the athlete thirty seconds and gives the coach a trend. Resting heart rate on waking, taken the same way each day, is a free objective signal; a sustained rise of several beats is worth a conversation. Performance on a standard warm-up jump or a sub-maximal lift, done the same way every week, shows whether the athlete is adapting or sinking. Forge's readiness score is built from signals like these, and the track on reading Forge's analytics covers how to act on it.\n\nWhen the signals move the wrong way, the first move is to cut volume while holding intensity, because intensity is what maintains the adaptations and volume is what costs recovery. The second is to look outside the gym: a dip that coincides with exams, a family problem or poor sleep is a life-load problem that the training plan has to absorb. The third is to ask before assuming; athletes know when something is off and will say so to a coach who asks without judgement.\n\nA plateau is the mild version of all this. Before adding load to a stalled athlete, ask whether they are recovering. More often than coaches expect, the answer to a plateau is a lighter week, not a heavier one.",
    },
  ],
  quizQuestions: [
    q(0, "When does adaptation to a training session actually happen?", [
      ["During the recovery after the session", "Correct. The session is the stress; the rebuilding that raises the baseline happens afterwards."],
      ["During the session itself", "The session temporarily reduces capacity; the gain comes later."],
      ["Only during sleep on the same night", "Sleep is a big part of it, but recovery spans the days after."],
      ["Immediately after the last rep", "Adaptation takes time, which is why spacing sessions matters."],
    ], 0),
    q(1, "An athlete in exam week is sleeping five hours and skipping meals. What has changed about the program, even if nothing was edited?", [
      ["The effective dose has gone up because recovery capacity has gone down", "Correct. Holding the program fixed while life-load rises changes the dose without meaning to."],
      ["Nothing; the program is the program", "The same work on less recovery is a larger stress."],
      ["The program got easier", "Less recovery makes the same work harder to adapt to."],
      ["The athlete should add sessions to compensate", "Adding work on reduced recovery is how overtraining starts."],
    ], 0),
    q(2, "Which quality fades fastest when training stops?", [
      ["Aerobic fitness", "Correct. Measurable losses appear within two to three weeks; strength holds longest."],
      ["Maximal strength", "Strength holds longest; weeks without lifting cost relatively little."],
      ["Muscle size", "Size holds longer than the neural edge and far longer than aerobic fitness."],
      ["All qualities fade at the same rate", "They fade on different schedules, which decides what to protect in a crowded week."],
    ], 0),
    q(3, "Why does one short, heavy in-season session a week make sense?", [
      ["Maintaining a quality needs far less work than building it", "Correct. A small dose at the right intensity holds what the off-season built."],
      ["Because athletes enjoy it", "Enjoyment is welcome, but the reason is the maintenance dose."],
      ["It does not; in-season lifting should stop", "Stopping hands much of the off-season gain back within months."],
      ["To replace practice", "It supplements practice; it does not replace it."],
    ], 0),
    q(4, "What distinguishes functional overreaching from overtraining?", [
      ["Overreaching rebounds after a lighter week; overtraining deepens across weeks", "Correct. The planned overshoot is a tool; the unrecovered decline is a problem that takes months to undo."],
      ["They are the same thing", "One is planned and short; the other is a long decline."],
      ["Overreaching only happens to beginners", "Any athlete can overreach; it is often deliberate in a hard block."],
      ["Overtraining is just soreness", "Soreness is normal; overtraining involves sleep, mood, heart rate and performance all moving the wrong way."],
    ], 0),
    q(5, "An athlete's resting heart rate has risen several beats for a week and performance is sliding. What is the first adjustment?", [
      ["Cut volume while holding intensity", "Correct. Intensity maintains the adaptation; volume is what costs recovery."],
      ["Add volume to push through", "That deepens the problem."],
      ["Cut intensity and keep volume", "Dropping intensity loses the adaptation while keeping the recovery cost."],
      ["Ignore it; heart rate is noise", "A sustained rise is one of the most reliable simple signals."],
    ], 0),
    q(6, "Why does the strength coach belong in a return-to-play plan from the start?", [
      ["Training the uninjured body and safe ranges preserves far more than resting everything", "Correct. Detraining during a layoff is fast, and much of it is avoidable."],
      ["To decide when the athlete is healed", "Clearance is the clinician's call; the coach preserves what can be preserved."],
      ["They do not; injury is purely medical", "The clinician leads, but the coach's role in preventing detraining starts on day one."],
      ["To push the athlete back faster", "The goal is to preserve capacity, not to rush clearance."],
    ], 0),
    q(7, "An athlete has plateaued on a lift for a month. What does the track say to ask first?", [
      ["Whether they are recovering", "Correct. A plateau is often answered by a lighter week, not a heavier one."],
      ["Whether the bar needs more weight", "Adding load to an unrecovered athlete usually deepens the stall."],
      ["Whether to change the exercise entirely", "A change may help later, but recovery is the first question."],
      ["Whether they are trying hard enough", "Effort is rarely the issue; recovery and life-load usually are."],
    ], 0),
  ],
};
