import type { SeedAcademyTrack } from "./types";

/** The original seven Coaches Corner tracks, moved out of server/seed.ts on 2026-10-08 so that
 * every repo-written track is importable from one place (the lesson re-sync and its hash
 * ratchet need the full set). The text is the seed's, byte for byte, with the 2026-10-08
 * proofread applied; seed.ts still creates them first, in this order. */
export const COACHES_CORNER_TRACKS_ORIGINAL: SeedAcademyTrack[] = [
  {
    title: "Strength & Conditioning Fundamentals",
    description:
      "The core program-design knowledge every strength coach should have: exercise sequencing, progressive overload, periodization models, and safe testing protocols.",
    keyPrinciplesForAi:
      "When advising on training structure, apply core program-design principles: sequence exercises multi-joint/power before single-joint/isolation within a session, respect the inverse relationship between volume and intensity (don't max both at once), and progress load conservatively using autoregulation (RPE/RIR) rather than fixed percentage jumps every week. Recommend safe, standardized testing/assessment protocols appropriate to the athlete's training age, and favor direct 1RM testing only for athletes with sufficient technical proficiency -- otherwise use an estimated max from a submaximal set.",
    lessons: [
      {
        lessonNumber: 1,
        title: "Program Design: The Big Picture",
        estMinutes: 6,
        content:
          "Every effective strength program answers three questions before a single set is written: what is this athlete training for, how much can they currently recover from, and how will the plan change over time to keep producing adaptation. Skipping straight to picking exercises is the most common mistake a new coach makes -- the exercises are the last decision, not the first.\n\nStart with exercise order within a session. The general rule is to sequence from the most technically demanding and neurologically taxing movements to the least: power/explosive work (jumps, throws, Olympic-lift variations) first, followed by primary strength lifts (squat, deadlift, press patterns), then accessory and isolation work, finishing with low-skill conditioning or corrective work. The reasoning is simple -- an athlete's technical precision and rate of force development are both highest when fresh, and a movement like a box jump or a clean pull deteriorates fast (and becomes a real injury risk) under fatigue in a way a bicep curl simply doesn't.\n\nNext, understand the volume-intensity relationship: as intensity (load relative to a max, or generally how hard a set is) goes up, the volume (total sets x reps, or total reps at that intensity) an athlete can sustain goes down. A program that tries to push both high volume and high intensity at the same time, every week, is a program that breaks athletes down faster than it builds them up. Good programs wave one against the other -- a high-volume, moderate-intensity block followed by a lower-volume, higher-intensity block is a common, effective pattern.\n\nFinally, plan for change over time. A program that looks the same in week 8 as it did in week 1 has no mechanism left to keep producing adaptation -- the body has already adapted to that exact stimulus. This doesn't mean constant novelty for its own sake (a common youth-coaching mistake); it means a deliberate, gradual progression in load, volume, or complexity, planned in advance rather than improvised set-to-set.",
      },
      {
        lessonNumber: 2,
        title: "Progressive Overload & Autoregulation",
        estMinutes: 6,
        content:
          "Progressive overload -- gradually increasing the demand placed on the body over time -- is the single most important variable in a strength program. Without it, an athlete plateaus almost immediately, regardless of how well-designed everything else is. But progressive overload done carelessly (adding weight on a fixed schedule regardless of how the athlete is actually responding) is exactly how programs cause overuse injuries and burnout.\n\nThe fix is autoregulation: letting the athlete's actual daily readiness adjust the plan within a bounded range, instead of forcing a fixed number every session no matter what. The most practical tool for this is RPE (Rating of Perceived Exertion) or its inverse, RIR (Reps in Reserve) -- after a set, the athlete rates how hard it felt. A \"top set at RPE 8\" means the athlete could have done roughly 2 more reps before failure; that's a very different, more honest target than \"225 lbs for 5,\" which might be an RPE 6 on a good day and an RPE 10 on a bad one.\n\nFor youth or novice athletes, full RPE-based autoregulation can be too abstract at first -- a simpler entry point is a basic self-check: \"Could you have done 2 more good reps with the same form?\" If yes, they're in a reasonable working range; if the last rep looked nothing like the first, the weight was too heavy for the intended purpose.\n\nThe practical rule of thumb: plan the program's structure in advance, but let RPE/RIR govern the exact load on the bar each session. This gives you the best of both worlds -- a program with real direction, but one that still respects a bad night's sleep or a hard practice the day before, rather than blindly forcing a number that was written weeks in advance without knowing how today would actually feel.",
      },
      {
        lessonNumber: 3,
        title: "Periodization Models",
        estMinutes: 7,
        content:
          "Periodization is simply the deliberate, planned variation of training variables (volume, intensity, exercise selection) over time, structured around when an athlete needs to peak. Three models cover almost every real-world situation a team-sport coach will run into.\n\nLinear periodization moves in one direction over a training block: volume starts high and intensity low, then volume gradually decreases as intensity gradually increases, aiming at a single peak. This works well for an off-season block building toward a defined testing day or season start, where there's no in-season competition to interrupt the progression.\n\nUndulating (or non-linear) periodization varies volume and intensity from session to session or week to week, rather than one long ramp. This suits athletes who train frequently and need more varied stimulus to keep adapting, and it tolerates a disrupted schedule better than a strict linear ramp does, since missing one session doesn't derail a months-long progression.\n\nBlock periodization groups training into short, concentrated blocks each targeting one or two qualities hard (a hypertrophy/volume block, then a strength/intensity block, then a short power/peaking block) rather than trying to develop everything at once. This tends to produce the sharpest peaks and suits athletes who already have a solid training base and a clear, single peak event to build toward.\n\nFor a team sport with a long in-season competitive calendar, the practical answer is usually a hybrid: an off-season block that's more linear or block-style building a base, transitioning to an undulating in-season model that can flex around the game schedule without demanding a rigid multi-week ramp the season won't allow.",
      },
      {
        lessonNumber: 4,
        title: "Assessment & Testing Protocols",
        estMinutes: 6,
        content:
          "Testing tells you whether the program is actually working and gives athletes concrete, motivating feedback -- but testing done poorly can waste a training day, produce meaningless numbers, or genuinely hurt someone. A few principles keep it useful and safe.\n\nStandardize the conditions. The same warm-up, the same order of tests, the same equipment, and ideally the same time of day and rest since the last hard session, every time you test. An athlete's numbers can swing meaningfully based on fatigue alone -- if you don't control for that, you can't tell whether a number changed because of training or because of when you happened to test.\n\nMatch the test to the athlete's training age. A true 1-rep max test requires enough technical proficiency that a breakdown in form under maximal load doesn't turn into an injury -- this generally means a novice lifter (especially a younger one) should use an estimated max from a submaximal set rather than testing an actual 1RM. Reserve true 1RM testing for athletes who have already demonstrated clean technique under heavy, but submaximal, load.\n\nTest what you'll actually use. A focused set -- something from each of speed, power, and strength, plus anything sport-specific -- is usually enough to track real trends without turning a testing day into an all-day event.\n\nFinally, set a retest cadence you'll actually keep. Every 6-8 weeks, aligned with the end of a training block, is a reasonable default for most team-sport programs.",
      },
    ],
    quizQuestions: [
      {
        orderIndex: 0,
        questionText: "Within a single training session, which exercise sequencing is generally recommended?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Power/explosive work first, then primary strength lifts, then accessory work",
            isCorrect: true,
            explanation: "This is correct: technical precision and rate of force development are highest when fresh, so the most neurologically demanding work (jumps, throws, Olympic-lift variations) should come first, before fatigue makes those movements riskier and less effective.",
          },
          {
            orderIndex: 1,
            answerText: "Accessory work first to pre-fatigue the muscle before the main lift",
            isCorrect: false,
            explanation: "This is a valid bodybuilding technique in some contexts, but it's backwards for general athletic development -- pre-fatiguing before a power or primary strength movement increases injury risk and reduces the quality of the most important work in the session.",
          },
          {
            orderIndex: 2,
            answerText: "Whatever the athlete feels like starting with that day",
            isCorrect: false,
            explanation: "Random ordering ignores the real physiological reasoning behind sequencing -- technical, high-skill movements need to happen while the nervous system is freshest, not whenever it's convenient.",
          },
          {
            orderIndex: 3,
            answerText: "Conditioning first to get the 'hard part' out of the way",
            isCorrect: false,
            explanation: "Conditioning first fatigues the athlete before the technical strength and power work, which is exactly backwards -- it increases injury risk on lifts that need the most precision.",
          },
        ],
      },
      {
        orderIndex: 1,
        questionText: "What does \"RPE 8\" on a top set generally mean?",
        answers: [
          {
            orderIndex: 0,
            answerText: "The athlete could have done roughly 2 more reps before failure",
            isCorrect: true,
            explanation: "Correct -- RPE (Rating of Perceived Exertion) on a 1-10 scale directly maps to reps in reserve; an 8 means about 2 reps were left, a more honest target than a fixed weight number.",
          },
          {
            orderIndex: 1,
            answerText: "The athlete hit an exact percentage of their 1-rep max",
            isCorrect: false,
            explanation: "RPE is about how the set actually felt, not a fixed percentage -- the whole point of autoregulation is that the same percentage can feel very different depending on the day.",
          },
          {
            orderIndex: 2,
            answerText: "The set was a warm-up set",
            isCorrect: false,
            explanation: "RPE 8 describes a genuinely hard working set, not a warm-up -- warm-ups are typically well below this effort level.",
          },
          {
            orderIndex: 3,
            answerText: "The athlete failed to complete the set",
            isCorrect: false,
            explanation: "Failure would be RPE 10 -- RPE 8 specifically means reps were left in reserve, not that the set broke down.",
          },
        ],
      },
      {
        orderIndex: 2,
        questionText: "Which periodization model is generally best suited to a long in-season competitive calendar?",
        answers: [
          {
            orderIndex: 0,
            answerText: "A hybrid: base-building block/linear off-season transitioning to undulating in-season",
            isCorrect: true,
            explanation: "Correct -- build a base when there's no competition to interrupt a longer ramp, then switch to a model that can flex week-to-week around games.",
          },
          {
            orderIndex: 1,
            answerText: "Pure linear periodization straight through the whole year",
            isCorrect: false,
            explanation: "A strict linear ramp assumes an uninterrupted progression toward one peak, which a long in-season game schedule won't allow -- games and travel will constantly disrupt it.",
          },
          {
            orderIndex: 2,
            answerText: "No periodization -- keep training identical year-round",
            isCorrect: false,
            explanation: "Identical training year-round has no mechanism to keep producing adaptation, and ignores that off-season and in-season have fundamentally different goals.",
          },
          {
            orderIndex: 3,
            answerText: "Block periodization exclusively, with no adjustment for the season",
            isCorrect: false,
            explanation: "Block periodization's short, single-quality-focused blocks work best building toward one clear peak -- a season with games happening constantly doesn't offer that clean, uninterrupted structure.",
          },
        ],
      },
    ],
  },
  {
    title: "Olympic Lift Technique & Progressions",
    description:
      "Teaching progressions for the snatch and clean & jerk, from safe starting positions through the full lift, plus the most common faults and the cues that fix them.",
    keyPrinciplesForAi:
      "Olympic lifts (snatch, clean & jerk) build rate of force development and explosive power, but require a coached technical progression -- never recommend a novice or young athlete jump straight to a full lift from the floor; teach from the hang/high-hang and power positions first, and only add the full pull once positions are clean. If asked about faults, the most common are an early arm pull, a looping bar path away from the body, and the knees drifting forward on the catch -- correct with cues, not just more weight.",
    lessons: [
      {
        lessonNumber: 1,
        title: "Why Olympic Lifts? Benefits and Risks",
        estMinutes: 5,
        content:
          "The snatch and clean & jerk (and their many partial variations -- hang cleans, power snatches, clean pulls) are, from a sports-performance standpoint, the highest rate-of-force-development exercises available in a weight room. Nothing else trains an athlete to produce large amounts of force in a very short amount of time as directly as these lifts do, which is exactly the quality that shows up in a sprint start, a jump, or a swing.\n\nThat benefit comes with real technical demand. These are the most technically complex lifts a strength coach will teach -- more joints, more sequencing, and more room for a fault to compound than a squat or a bench press. The risk isn't the load on the bar (Olympic lifts are almost always programmed at a lower relative intensity than a squat or deadlift); the risk is a technical breakdown under any load turning into an awkward catch or a lost bar.\n\nThis means the honest answer to \"should I be teaching these?\" depends entirely on whether you can actually coach the technique. If you don't have that background yet, partial and regression versions still deliver most of the power-development benefit with a fraction of the technical risk, and are a completely legitimate place to stop. There's no rule that says a team has to work up to a full competition snatch from the floor.\n\nFor younger or newer athletes specifically, the value of Olympic lifts is less about the lift itself and more about what it teaches: triple extension, catching/absorbing force, and general explosiveness. A well-coached regression that teaches those things safely is a better outcome than a poorly-coached full lift that technically \"counts.\"",
      },
      {
        lessonNumber: 2,
        title: "The Progression Ladder: From Hang to Floor",
        estMinutes: 6,
        content:
          "Never start a new athlete with the full lift from the floor. The standard teaching progression works backward from the easiest position to the hardest, building each position's technique in isolation before combining them.\n\nStart at the power position (bar at mid-thigh, knees slightly bent, torso near vertical) -- this isolates the explosive hip/knee/ankle extension without any of the first-pull complexity of getting the bar off the floor. An athlete drills jumping/shrugging from here with an empty bar or light load until the extension is crisp and vertical, not looping forward.\n\nNext, move to the high hang and then the hang (knee height), each adding a little more of the first pull. Only once these positions look consistently good should you add the full hang-to-floor pull, and even then, many programs simply stay at hang or high-hang variations indefinitely -- again, there's no rule requiring the full lift.\n\nThroughout this whole ladder, the catch position (front rack for the clean, overhead for the snatch) should be drilled completely separately, usually starting from a static position before ever combining it with a pull. Trying to teach the pull and the catch simultaneously on a brand-new athlete is how you get the most common fault of all: an athlete who pulls with the arms early to \"save\" a bad catch position.\n\nA practical rule: an athlete graduates to the next position in the ladder only when the current one is clean and repeatable under a light training load, not on a fixed calendar schedule.",
      },
      {
        lessonNumber: 3,
        title: "Clean & Jerk Teaching Progressions",
        estMinutes: 6,
        content:
          "The clean and the jerk are two separate lifts that happen to be contested together, and they should be taught that way -- as two distinct skills, not one continuous motion, until both are independently solid.\n\nFor the clean, the front rack position is the foundation everything else depends on: elbows up and pointed forward, bar resting on the front deltoids, fingertips loose under the bar. An athlete who can't hold a comfortable front rack with an empty bar has no business catching a loaded clean -- spend real time here first, including mobility work for athletes who physically can't get the elbows up yet.\n\nOnce the front rack is solid, drill the catch in isolation using a muscle clean and then a power clean (catching above parallel) before ever asking for a full squat clean. This lets the athlete feel a clean catch position repeatedly at low technical risk before adding the extra complexity of dropping under a fast-moving bar into a full squat.\n\nFor the jerk, footwork is the whole lesson: a short, quick split with the front foot flat and the back foot up on the ball, torso staying vertical through the dip. The most common jerk fault in beginners is diving forward instead of driving straight up -- a simple fix is drilling the footwork pattern with no bar at all, dozens of times, before ever loading it.",
      },
      {
        lessonNumber: 4,
        title: "Common Faults and Coaching Cues",
        estMinutes: 6,
        content:
          "Three faults account for the large majority of technical breakdowns in Olympic lift coaching, and each has a specific, repeatable cue that fixes it faster than simply saying \"do it again.\"\n\nEarly arm pull: the athlete starts bending the elbows and pulling with the arms before full leg/hip extension is complete, which short-circuits the power output of the lift and usually means the bar path drifts away from the body. Cue: \"long arms until your hips are open\" or \"jump the bar up, don't pull it up\" -- have the athlete feel the extension as a jump first, arms staying passive until the very top.\n\nLooping bar path: instead of traveling in a tight, near-vertical line close to the body, the bar swings out and away during the first pull, then has to loop back in. This is very often actually a hip/torso positioning issue, not an arm issue: the athlete is starting with hips too high. Cue: \"keep the bar brushing your thighs,\" combined with checking the starting hip height.\n\nForward knee travel on the catch: in the receiving position, the knees drift forward past the toes and the torso collapses forward to compensate. This is frequently a mobility limitation as much as a cueing issue, so pair the verbal cue -- \"sit back into your heels, chest tall\" -- with an honest mobility screen; cueing alone won't fix a genuine range-of-motion restriction.",
      },
    ],
    quizQuestions: [
      {
        orderIndex: 0,
        questionText: "What's the recommended starting point for teaching a brand-new athlete an Olympic lift?",
        answers: [
          {
            orderIndex: 0,
            answerText: "The power position, isolating the final explosive extension",
            isCorrect: true,
            explanation: "Correct -- starting at the power position lets the athlete groove the actual explosive extension without the added complexity of the first pull off the floor.",
          },
          {
            orderIndex: 1,
            answerText: "A full competition snatch from the floor, to learn the whole lift at once",
            isCorrect: false,
            explanation: "This is specifically what the progression is designed to avoid -- combining the hardest first-pull mechanics with the hardest catch position on day one is how technical breakdowns and injuries happen.",
          },
          {
            orderIndex: 2,
            answerText: "The catch position under maximum load, to build confidence",
            isCorrect: false,
            explanation: "Catching under heavy load before the position is proven safe under light load is backwards -- the catch should be drilled statically and lightly first.",
          },
          {
            orderIndex: 3,
            answerText: "Whichever position the athlete finds most comfortable",
            isCorrect: false,
            explanation: "Comfort isn't the criterion here -- the progression exists because certain positions are objectively safer starting points regardless of preference.",
          },
        ],
      },
      {
        orderIndex: 1,
        questionText: "An athlete's bar path loops away from the body during the first pull. What's the most likely underlying cause?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Starting the pull with hips too high, more like a stiff-leg deadlift",
            isCorrect: true,
            explanation: "Correct -- a looping bar path is very often a hip-height problem at the start, not an arm problem; cueing \"keep the bar brushing your thighs\" alongside checking starting hip height addresses the root cause.",
          },
          {
            orderIndex: 1,
            answerText: "The athlete is using too little weight",
            isCorrect: false,
            explanation: "Bar path problems are technical, not load-related -- adding weight to a looping pull just makes the flawed pattern more dangerous, not more correct.",
          },
          {
            orderIndex: 2,
            answerText: "The athlete's grip width is too narrow",
            isCorrect: false,
            explanation: "Grip width affects the catch position, not the pull's bar path -- this isn't the relevant variable for this fault.",
          },
          {
            orderIndex: 3,
            answerText: "The athlete needs to pull with the arms earlier",
            isCorrect: false,
            explanation: "This is the opposite of the fix -- pulling with the arms earlier is itself a separate major fault (early arm pull) and doesn't address a looping bar path.",
          },
        ],
      },
      {
        orderIndex: 2,
        questionText: "Why might a coach choose to never progress a team past hang or high-hang variations?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Because most of the power-development benefit is available without the added technical risk of a full floor pull",
            isCorrect: true,
            explanation: "Correct -- the value of Olympic lifts for most athletes is the triple extension and force development, which hang/high-hang variations already deliver, at lower technical risk than the full lift.",
          },
          {
            orderIndex: 1,
            answerText: "Because the full lift is against competition rules for team sports",
            isCorrect: false,
            explanation: "There's no such rule -- this isn't a regulatory issue, it's a risk/benefit and coaching-capacity decision.",
          },
          {
            orderIndex: 2,
            answerText: "Because hang variations use heavier loads and are therefore superior",
            isCorrect: false,
            explanation: "Hang variations are not about using heavier loads -- the reasoning is about reducing technical complexity, not increasing load.",
          },
          {
            orderIndex: 3,
            answerText: "Because full-lift Olympic lifts don't build explosive power",
            isCorrect: false,
            explanation: "Full Olympic lifts absolutely build explosive power -- the reason to stop at a partial isn't that the full lift lacks benefit, it's managing technical risk relative to coaching resources.",
          },
        ],
      },
    ],
  },
  {
    title: "Youth Long-Term Athletic Development (LTAD)",
    description:
      "Why youth training isn't scaled-down adult training, the real cost of early specialization, and how to structure a season around a young athlete's actual development.",
    keyPrinciplesForAi:
      "Youth athletes are not small adults -- never recommend adult-scaled training volume or intensity for a pre-pubertal or early-pubertal athlete. Actively discourage single-sport early specialization when asked about it, and frame long-term development around broad motor-skill and movement competency rather than early peak performance or maximal loading at a young age.",
    lessons: [
      {
        lessonNumber: 1,
        title: "Why Youth Training Is Not Mini-Adult Training",
        estMinutes: 5,
        content:
          "The single biggest mistake in youth strength and conditioning is scaling down an adult program rather than building a genuinely different one. Kids are not just smaller, weaker adults -- their bones, recovery capacity, and motor-learning systems work differently, and a program that ignores those differences either underdelivers or actively causes harm.\n\nGrowth plates are open until roughly the late teens and are structurally weaker than mature bone at the same location. This doesn't mean strength training is dangerous for youth -- well-supervised resistance training is well-supported as safe and beneficial at essentially any age -- but it does mean technique and appropriate loading matter more, not less.\n\nRecovery capacity also differs, generally in the athlete's favor: pre-pubertal athletes typically recover from a single training session faster than adults do, which is part of why frequent, shorter sessions with lots of varied movement tend to work better than the longer, more concentrated sessions that suit an adult. But this doesn't mean unlimited volume is fine -- overuse injuries are a real and growing problem in youth sports specifically because total volume across multiple teams/seasons goes unmanaged.\n\nFinally, motor learning in youth athletes is generally faster and more durable for genuinely new movement patterns than it is in adults -- which is the entire argument for prioritizing broad movement skill over narrow, sport-specific repetition at a young age.",
      },
      {
        lessonNumber: 2,
        title: "The Danger of Early Specialization",
        estMinutes: 6,
        content:
          "Early specialization -- a young athlete playing one sport nearly year-round, often starting before age 10-12 -- has become common in competitive youth sports. The evidence points toward real costs rather than the promised advantage.\n\nOn the injury side, early specialization is consistently associated with higher rates of overuse injury compared to multi-sport participation at the same age: the same joints and tissues are stressed in the same patterns in every practice, every season, with no genuine variation to distribute the load differently.\n\nOn the burnout side, athletes who specialize early report higher rates of dropping out of sport entirely by their late teens -- the same intensity meant to build a long-term athlete often produces the opposite.\n\nOn performance itself, the research on eventual elite athletes is notably one-sided: the large majority of athletes who reach the highest levels of their sport were multi-sport participants through at least early adolescence. Broad athleticism built across multiple sports tends to produce a more well-rounded, more resilient, and often ultimately more skilled athlete than the same total hours spent in one sport alone.\n\nNone of this means single-sport participation is never appropriate -- by mid-to-late adolescence, with the athlete's own genuine interest driving it, specializing makes sense. The concern is specifically early, externally-driven specialization.",
      },
      {
        lessonNumber: 3,
        title: "Windows of Trainability",
        estMinutes: 6,
        content:
          "Certain physical qualities appear to be more responsive to training at certain points in a young athlete's development -- often discussed as \"windows of trainability,\" most notably linked to Peak Height Velocity (PHV), the point of fastest growth during a growth spurt.\n\nBefore PHV, general coordination, balance, and basic speed/agility tend to be highly trainable -- this is the window where broad motor-skill work pays the largest long-term dividends, since the nervous system is laying down fundamental movement patterns that will be built on for the rest of the athlete's career.\n\nAround and shortly after PHV, athletes often go through a temporary period of reduced coordination -- limbs have grown but the nervous system hasn't fully re-calibrated to the new lever lengths yet. This is a normal, temporary phase, not a regression in ability. It's also a window where strength training tends to become highly responsive, as the athlete's hormonal environment shifts to support it.\n\nAfter PHV, once growth has largely leveled off, this is generally the window where strength and power training produce the most direct, adult-like adaptations.\n\nThe practical takeaway isn't to rigidly gate what an athlete is \"allowed\" to train based on a growth chart -- it's to recognize that a temporary dip in coordination around a growth spurt is normal, and that the years before a growth spurt are uniquely valuable for broad motor development.",
      },
      {
        lessonNumber: 4,
        title: "Structuring a Season for a 10-14-Year-Old",
        estMinutes: 5,
        content:
          "Translating the previous lessons into an actual season plan for a 10-14-year-old comes down to a few concrete guardrails.\n\nCap total organized volume across everything the athlete does, not just what you personally coach. A young athlete who plays on two teams, takes private lessons, and attends your strength sessions can easily be doing far more total volume than any single coach realizes. Ask directly about what else the athlete is doing.\n\nFavor 2-3 shorter, varied sessions per week over fewer, longer, more concentrated ones -- this matches the faster single-session recovery discussed earlier and keeps any one session from becoming a marathon that a young athlete's attention span and technique both degrade through.\n\nBuild in genuine unstructured time. A full calendar of organized practices, games, and lessons leaves no room for the free, unstructured play that's historically where a lot of natural athleticism and creativity actually develops.\n\nFinally, resist the urge to chase short-term competitive results at this age at the expense of the long-term plan. Coaching for who's best in two years, not who's best this Saturday, is the actual job at this age.",
      },
    ],
    quizQuestions: [
      {
        orderIndex: 0,
        questionText: "What is a key argument against early single-sport specialization before age 10-12?",
        answers: [
          {
            orderIndex: 0,
            answerText: "It's associated with higher overuse injury rates and higher long-term dropout, without a performance advantage",
            isCorrect: true,
            explanation: "Correct -- research consistently shows more overuse injury and burnout from early specialization, while most eventual elite athletes were actually multi-sport participants through adolescence.",
          },
          {
            orderIndex: 1,
            answerText: "It's technically prohibited by youth sports governing bodies",
            isCorrect: false,
            explanation: "There's no blanket prohibition -- the concern is evidence-based (injury and burnout data), not a rules violation.",
          },
          {
            orderIndex: 2,
            answerText: "It guarantees the athlete will lose interest in sports entirely",
            isCorrect: false,
            explanation: "It's associated with higher dropout rates, not a guarantee -- framing it as inevitable overstates the evidence.",
          },
          {
            orderIndex: 3,
            answerText: "Multi-sport athletes always outperform specialists at every age",
            isCorrect: false,
            explanation: "The advantage shows up in eventual elite outcomes, not necessarily at every single age group along the way -- early-specializing athletes can still win in younger age brackets before broader development catches up.",
          },
        ],
      },
      {
        orderIndex: 1,
        questionText: "What typically happens to an athlete's coordination around their growth spurt (Peak Height Velocity)?",
        answers: [
          {
            orderIndex: 0,
            answerText: "A temporary, normal dip, as the nervous system re-calibrates to new limb lengths",
            isCorrect: true,
            explanation: "Correct -- this is a well-documented, temporary phase, not a real regression in ability, and shouldn't be met with added volume or frustration.",
          },
          {
            orderIndex: 1,
            answerText: "A permanent decline that most athletes never recover from",
            isCorrect: false,
            explanation: "This dip is temporary, not permanent -- coordination typically returns and improves as the nervous system adapts to the new proportions.",
          },
          {
            orderIndex: 2,
            answerText: "No change at all -- growth spurts don't affect coordination",
            isCorrect: false,
            explanation: "Growth spurts are specifically linked to a temporary coordination dip in the research this track draws on -- it's a real, expected phenomenon.",
          },
          {
            orderIndex: 3,
            answerText: "An immediate improvement in coordination",
            isCorrect: false,
            explanation: "The opposite is typically true in the short term -- coordination often temporarily dips before improving.",
          },
        ],
      },
      {
        orderIndex: 2,
        questionText: "Before a growth spurt, what type of training tends to produce the largest long-term benefit?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Broad motor-skill development -- running, jumping, throwing, catching, changing direction",
            isCorrect: true,
            explanation: "Correct -- this is the highest-value window for building a broad athletic base, since motor learning is fast and durable at this stage.",
          },
          {
            orderIndex: 1,
            answerText: "Heavy, maximal-load strength training",
            isCorrect: false,
            explanation: "Strength training tends to become highly responsive later, around and after the growth spurt, rather than being the priority beforehand.",
          },
          {
            orderIndex: 2,
            answerText: "Narrow, single-sport skill repetition",
            isCorrect: false,
            explanation: "This is exactly what the track argues against at this age -- narrowing too early costs the broad development window.",
          },
          {
            orderIndex: 3,
            answerText: "No structured training at all until after puberty",
            isCorrect: false,
            explanation: "The claim isn't \"wait until later\" -- it's that broad, varied motor development specifically (not narrow specialization) is valuable during this window.",
          },
        ],
      },
    ],
  },
  {
    title: "Sport-Specific Arm Care & Pitching Development",
    description:
      "Pitch count discipline, building a real arm-care routine, velocity development done responsibly, and recognizing the red flags that mean stop throwing now.",
    keyPrinciplesForAi:
      "For any pitching or throwing-volume question, defer to the athlete's own league's official pitch count and rest guidelines rather than stating a specific numeric limit yourself -- those vary by governing body and age group. Always recommend a proper arm-care warm-up/cooldown routine around throwing. Treat any reported arm pain as a hard stop: refer to a coach or medical professional, never suggest 'pitching through it' or continuing to throw.",
    lessons: [
      {
        lessonNumber: 1,
        title: "Pitch Count & Rest Guidelines",
        estMinutes: 5,
        content:
          "Pitch count and mandatory rest guidelines exist because youth arm injuries are strongly, repeatedly linked to overall throwing volume and insufficient rest between outings -- far more than to any single mechanical flaw. This is the single most well-documented injury-prevention issue in youth baseball and softball, and it is entirely preventable through discipline about volume.\n\nThe specific numeric limits vary by governing body -- Little League, high school federations, and travel organizations each publish their own official charts, and they are updated periodically. The right habit as a coach is to know which governing body's rules apply to your team, always follow their official published guidelines without exception, and count every pitch across every context -- practice bullpens, showcases, private lessons -- not just games, since a young arm doesn't distinguish between a game pitch and a bullpen pitch.\n\nA related, less-discussed part of the guidelines is pitch type restrictions by age -- most official guidance recommends significantly delaying the introduction of breaking balls until an athlete's growth plates are further along, since the specific stress these pitches place on the elbow is a documented additional risk factor in still-developing arms.\n\nThe uncomfortable part of this job is that following the rules sometimes means pulling your best pitcher in a big moment. That's not a close call -- \"but he feels fine\" is not a reliable signal for this kind of cumulative injury risk.",
      },
      {
        lessonNumber: 2,
        title: "Building an Arm Care Routine",
        estMinutes: 6,
        content:
          "A real arm-care routine isn't a few stretches before first pitch -- it's a structured warm-up and cooldown built around the shoulder and elbow's specific demands, done consistently, every single time an athlete throws, not just on game days.\n\nThe warm-up should progress in stages: general movement first, then shoulder-specific activation targeting the rotator cuff and scapular stabilizers -- band external rotations, scaption raises, and prone Y-T-W raises are staples for a reason, since these are exactly the muscles that decelerate the arm after release. Only after this activation work should an athlete begin an actual throwing progression -- short, easy toss building gradually to full-effort distance.\n\nThe cooldown matters just as much and is far more commonly skipped entirely. After throwing, light band work and gentle stretching help manage the acute inflammatory response and maintain range of motion that repetitive throwing naturally tightens over a season.\n\nBeyond single-session routines, a season-long arm-care program should include dedicated strength work for the posterior shoulder and scapular stabilizers year-round, not just during a throwing season -- these are small muscles relative to the prime movers, they fatigue and detrain faster, and they are disproportionately important for injury prevention relative to their size.",
      },
      {
        lessonNumber: 3,
        title: "Velocity Development Without Overuse",
        estMinutes: 6,
        content:
          "Velocity is the measurable outcome every throwing athlete wants more of, and there are legitimate, well-supported ways to build it -- but several popular methods carry real risk that deserves an honest conversation, not a blanket endorsement or a blanket ban.\n\nLong toss (gradually increasing throwing distance, then working back down with flatter, quicker throws) is one of the most well-established and lowest-risk velocity development tools available, when built into a structured, gradually progressing program rather than just \"throw it as far as you can.\"\n\nWeighted-ball programs have real research support for producing velocity gains, but also a documented increase in injury risk in some studies, particularly when followed without proper supervision or progressed too aggressively. The honest coaching position is that weighted-ball work genuinely benefits from a qualified velocity-development specialist's direct supervision -- skipping that supervision to save cost or time is where the injury risk concentrates.\n\nThe lower-risk, higher-priority path for most youth and developing athletes is simply building the fundamentals first: consistent arm care, appropriate strength training, and sound mechanics. Chasing velocity-specific specialty programs before that foundation is in place is a common way to add risk for a gain that a well-built general foundation would have produced anyway.",
      },
      {
        lessonNumber: 4,
        title: "Recognizing Red Flags",
        estMinutes: 5,
        content:
          "The single most important skill in arm care isn't a stretch or an exercise -- it's recognizing when to stop, and having the discipline to act on it immediately rather than \"seeing how the next inning goes.\"\n\nMechanical red flags show up before pain does, if you're watching for them: a drop in arm slot or release point late in an outing, reduced hip-shoulder separation, a pitcher who starts \"muscling\" the ball with the arm rather than using their whole body, or a visible change in follow-through.\n\nReported pain is a hard stop, full stop -- not a modification, not \"let's see how it feels after a few easy ones.\" This is true even for a pitcher who is pitching a great game, even in a playoff situation. Elbow or shoulder pain during or after throwing in a still-developing athlete is exactly the population where \"pitching through it\" turns a manageable issue into a season-ending or growth-plate injury.\n\nPersistent soreness that doesn't resolve with normal rest, a decline in velocity that doesn't track with normal season fatigue, or any report of numbness/tingling are all reasons to involve a medical professional. As a coach, your job in all of these situations is the same: stop the throwing, communicate clearly with the parent, and refer to a doctor or sports medicine professional -- never attempt to diagnose or clear an athlete to return yourself.",
      },
    ],
    quizQuestions: [
      {
        orderIndex: 0,
        questionText: "Where should a coach look for official pitch count and rest guidelines?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Whichever governing body (Little League, high school federation, travel org) applies to the team, followed without exception",
            isCorrect: true,
            explanation: "Correct -- guidelines vary by governing body and are updated periodically, so the right habit is knowing which one applies and following it exactly, not applying a number from memory or a different context.",
          },
          {
            orderIndex: 1,
            answerText: "Whatever number feels reasonable based on how the pitcher looks that day",
            isCorrect: false,
            explanation: "This is exactly the reasoning the track warns against -- \"but he feels fine\" isn't a reliable signal for cumulative injury risk, which is why fixed, official guidelines exist in the first place.",
          },
          {
            orderIndex: 2,
            answerText: "Only game pitches count toward the limit, not bullpens or lessons",
            isCorrect: false,
            explanation: "A young arm doesn't distinguish between contexts -- practice bullpens, showcases, and lessons all count toward total throwing volume.",
          },
          {
            orderIndex: 3,
            answerText: "There's one universal number that applies to every league and age",
            isCorrect: false,
            explanation: "Numbers vary meaningfully by governing body and age group -- there's no single universal figure.",
          },
        ],
      },
      {
        orderIndex: 1,
        questionText: "What is the recommended approach to introducing breaking balls (like curveballs) to a young pitcher?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Delay introduction until further along in growth-plate development, per official guidance",
            isCorrect: true,
            explanation: "Correct -- most official youth guidance recommends significantly delaying breaking-ball introduction because of the specific elbow stress involved, favoring fastballs and changeups for younger arms.",
          },
          {
            orderIndex: 1,
            answerText: "Introduce them as early as possible to build a full arsenal",
            isCorrect: false,
            explanation: "This runs directly against the documented additional injury risk breaking pitches carry for still-developing arms.",
          },
          {
            orderIndex: 2,
            answerText: "It doesn't matter what pitch type is thrown, only total pitch count matters",
            isCorrect: false,
            explanation: "Pitch type is a real, separate risk factor from raw volume -- breaking balls carry documented additional elbow stress.",
          },
          {
            orderIndex: 3,
            answerText: "Only allow breaking balls in practice, never in games",
            isCorrect: false,
            explanation: "The concern is the pitch's mechanical stress on the arm, which is present regardless of whether it's practice or a game.",
          },
        ],
      },
      {
        orderIndex: 2,
        questionText: "An athlete reports mild elbow tightness after throwing, but says they can keep going. What should a coach do?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Stop the throwing immediately and refer to a medical professional",
            isCorrect: true,
            explanation: "Correct -- reported pain during or after throwing is a hard stop, not a judgment call, regardless of how minor it sounds or the game situation.",
          },
          {
            orderIndex: 1,
            answerText: "Have them throw a few easy ones to see if it works itself out",
            isCorrect: false,
            explanation: "This is precisely the \"pitching through it\" pattern that turns a manageable issue into a season-ending or growth-plate injury in a still-developing athlete.",
          },
          {
            orderIndex: 2,
            answerText: "Let them finish the inning since they say they're fine",
            isCorrect: false,
            explanation: "Self-report of being fine doesn't override the hard-stop rule for reported pain -- no game situation changes this.",
          },
          {
            orderIndex: 3,
            answerText: "Reduce their pitch count for next outing but let them continue this one",
            isCorrect: false,
            explanation: "Any reported pain calls for stopping now, not a plan for a future outing -- the current session is the one that needs to stop.",
          },
        ],
      },
    ],
  },
  {
    title: "Reading Forge's Own Analytics",
    description:
      "What ACWR, force-velocity profiling, asymmetry flags, and the readiness score actually mean, and how to turn each one into a real coaching decision.",
    keyPrinciplesForAi:
      "When an athlete's ACWR, force-velocity, asymmetry, or readiness data is available in context, use it to inform your explanation: a high ACWR or a low readiness score is a signal to deload or modify intensity that day, not something to override or ignore. An asymmetry flag is a screening signal, not a diagnosis -- frame it as something worth mentioning to a coach, never as a medical conclusion.",
    lessons: [
      {
        lessonNumber: 1,
        title: "Understanding Acute:Chronic Workload Ratio (ACWR)",
        estMinutes: 6,
        content:
          "ACWR compares an athlete's recent training load (the 'acute' load, typically the last 7 days) against their longer-term average load (the 'chronic' load, typically a rolling 28-day average). The ratio tells you how much that recent load has spiked relative to what their body has actually adapted to handle.\n\nThe commonly cited \"sweet spot\" for this ratio sits roughly between 0.8 and 1.3. Ratios meaningfully above that range are associated with elevated injury risk, because the body is being asked to absorb a jump in demand faster than its tissues have had time to adapt. Ratios well below that range aren't risk-free either -- they can indicate detraining, where an athlete has lost fitness relative to what they're about to be asked to do.\n\nThe practical use of this number is as an early-warning flag, not an automatic stop sign. A spiking ACWR after a genuinely planned hard week isn't necessarily a problem on its own -- but it's a reason to be more deliberate about the deload that follows, rather than immediately stacking another hard week on top of it. Where it becomes a real red flag is a spike that's unplanned or ongoing.\n\nWhen you see a flagged ACWR, the right response is almost never \"push through it\" -- it's to actually look at what changed in the last week and make a deliberate call about backing off volume or intensity for a few days.",
      },
      {
        lessonNumber: 2,
        title: "Force-Velocity Profiling, Explained",
        estMinutes: 6,
        content:
          "Every athlete's power output can be described along a spectrum from force-dominant to velocity-dominant, and understanding where an individual athlete sits on that spectrum changes what kind of training will actually move the needle for them.\n\nA force-velocity profile is built from testing an athlete's power output across a range of loads and looking at the resulting curve. A force-dominant athlete produces relatively more force at higher loads but doesn't express that force especially quickly; a velocity-dominant athlete moves fast and explosively but tops out at a lower peak force. Two athletes can have identical vertical jump heights and still sit at very different points on this spectrum.\n\nThe actionable insight is training prescription: a force-dominant athlete generally benefits more from adding velocity-biased work (jumps, throws, plyometrics) to round out their profile, while a velocity-dominant athlete typically benefits more from added heavy strength work. Programming more of what an athlete is already good at tends to produce diminishing returns compared to training the weaker side of their own profile.\n\nWhen reviewing a profile with an athlete or parent, frame it as descriptive, not as a verdict on overall talent -- it's information about which training emphasis is likely to help most right now, and profiles do shift over a training career.",
      },
      {
        lessonNumber: 3,
        title: "Interpreting Leg-Drive Asymmetry Flags",
        estMinutes: 5,
        content:
          "An asymmetry flag compares an athlete's left and right leg output and flags a meaningful, repeated imbalance between sides -- generally when one side is consistently contributing significantly more than the other across a real sample of reps, not just one noisy rep.\n\nThe most important thing to understand about this flag is what it is not: it is not a diagnosis, and it is not proof of an injury. Some degree of side-to-side asymmetry is completely normal, tied to dominant-side preference or sport-specific movement patterns. A flag means \"this is worth a closer look,\" not \"something is wrong.\"\n\nThat said, a real, consistent, and previously-absent asymmetry is worth taking seriously as a screening signal -- it can indicate a developing overuse pattern, a strength imbalance worth addressing directly, or discomfort the athlete hasn't consciously reported.\n\nThe correct response as a coach is a simple triage: ask the athlete directly whether anything feels different, sore, or off on either side. If pain or discomfort is present, this becomes a medical referral, not a training decision. If there's no pain and it's an underlying strength imbalance, appropriate unilateral training is a reasonable, proactive response.",
      },
      {
        lessonNumber: 4,
        title: "Using the Readiness Score to Adjust a Session",
        estMinutes: 5,
        content:
          "The readiness score combines an athlete's self-reported sleep, soreness, stress, hydration, and focus into a single daily signal -- and its entire value comes from actually letting it influence that day's session, rather than being logged and then ignored.\n\nA low readiness score is not a reason to cancel training outright in most cases -- it's a reason to adjust what that session emphasizes. Practical adjustments include: dropping planned top-end intensity while keeping movement quality work, swapping a heavy strength day for a technique-focused session, or simply reducing volume while watching how the athlete actually moves once warmed up.\n\nIt's worth distinguishing a single bad day from a real pattern. One low-readiness day after a late night is normal and doesn't require a program overhaul. A pattern of consistently low scores over multiple days or weeks deserves an actual conversation with the athlete about what's driving it.\n\nThe score is most useful when athletes trust that reporting honestly actually changes something about their day -- a coach who visibly adjusts sessions based on the score, even in small ways, is the single biggest driver of athletes continuing to fill it out honestly over a full season.",
      },
    ],
    quizQuestions: [
      {
        orderIndex: 0,
        questionText: "An athlete's ACWR spikes above the typical 0.8-1.3 range after a planned hard training week. What's the appropriate response?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Be more deliberate about the deload/recovery period that follows, rather than stacking another hard week on top",
            isCorrect: true,
            explanation: "Correct -- a spike after a genuinely planned hard week isn't automatically a problem, but it's a cue to manage the recovery that follows carefully rather than compounding it.",
          },
          {
            orderIndex: 1,
            answerText: "Ignore it completely since the week was planned",
            isCorrect: false,
            explanation: "Even a planned spike is worth watching -- the real risk is stacking more hard training on top without adequate recovery.",
          },
          {
            orderIndex: 2,
            answerText: "Immediately stop all training for that athlete",
            isCorrect: false,
            explanation: "A single elevated reading after planned hard training isn't cause for a full stop -- it's a cue for a more careful recovery period, not a shutdown.",
          },
          {
            orderIndex: 3,
            answerText: "Increase volume further to \"push through\" the spike",
            isCorrect: false,
            explanation: "This is the exact opposite of the appropriate response -- adding more volume on top of an elevated ACWR is how spikes turn into injuries.",
          },
        ],
      },
      {
        orderIndex: 1,
        questionText: "What does a flagged leg-drive asymmetry most accurately represent?",
        answers: [
          {
            orderIndex: 0,
            answerText: "A screening signal worth a conversation, not a diagnosis",
            isCorrect: true,
            explanation: "Correct -- some asymmetry is normal for most athletes; a flag means it's worth asking the athlete directly whether something feels off, not concluding an injury exists.",
          },
          {
            orderIndex: 1,
            answerText: "Definitive proof of an existing injury",
            isCorrect: false,
            explanation: "The track is explicit that this is not a diagnosis -- it's a prompt for a conversation, since normal side-to-side variation exists in most athletes.",
          },
          {
            orderIndex: 2,
            answerText: "A sign the athlete should stop training that leg entirely",
            isCorrect: false,
            explanation: "That's a significant, specific intervention the flag alone doesn't justify -- the correct next step is asking questions, not prescribing a training change.",
          },
          {
            orderIndex: 3,
            answerText: "Something to note but never act on",
            isCorrect: false,
            explanation: "The flag should prompt at least a direct conversation with the athlete -- treating it as pure background noise defeats its purpose as an early-warning signal.",
          },
        ],
      },
      {
        orderIndex: 2,
        questionText: "How should a coach respond to an athlete's low readiness score on a given day?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Adjust that day's session -- e.g., drop top-end intensity or swap to technique-focused work",
            isCorrect: true,
            explanation: "Correct -- the entire value of the readiness score comes from actually letting it change that day's plan, via concrete adjustments like reduced intensity or volume.",
          },
          {
            orderIndex: 1,
            answerText: "Ignore it since one bad day doesn't matter",
            isCorrect: false,
            explanation: "A single bad day is normal, but the score is only useful if it actually changes something about the session -- otherwise athletes stop trusting it's worth reporting honestly.",
          },
          {
            orderIndex: 2,
            answerText: "Automatically cancel the entire session",
            isCorrect: false,
            explanation: "Most low-readiness days call for an adjustment, not an outright cancellation -- reserve that for genuine patterns or more serious signals.",
          },
          {
            orderIndex: 3,
            answerText: "Add extra volume to compensate for the athlete being \"behind\"",
            isCorrect: false,
            explanation: "Adding volume on top of low readiness is exactly backwards -- it increases risk precisely when the athlete's capacity is reduced.",
          },
        ],
      },
    ],
  },
  {
    title: "Season & Practice Planning",
    description:
      "Macrocycle structure across a full year, tapering into competition, minimum-effective-dose in-season lifting, and how to sequence a single practice.",
    keyPrinciplesForAi:
      "Frame training recommendations by season phase (off-season, pre-season, in-season, post-season) whenever that context is available -- in-season strength work should generally be minimum-effective-dose to protect game-day freshness, and training volume should taper down, not spike, heading into a competition or tournament.",
    lessons: [
      {
        lessonNumber: 1,
        title: "Macrocycle Basics: Off-Season, Pre-Season, In-Season, Post-Season",
        estMinutes: 6,
        content:
          "A macrocycle is simply the full-year view of training, broken into phases that each serve a different purpose. Understanding what each phase is actually for keeps you from running the same style of training year-round regardless of what's happening in the competitive calendar.\n\nOff-season is the longest window with the fewest competitive demands, and it's where the heaviest lifting, the biggest structural changes to an athlete's strength, and the most aggressive addressing of weaknesses identified during the season should happen.\n\nPre-season is a transition phase: volume and general strength work start to taper as sport-specific conditioning, movement patterns, and intensity ramp up toward what competition will actually demand. A common mistake is either continuing off-season-style heavy volume too late, or cutting training too early.\n\nIn-season is about maintenance, not building -- the goal shifts from \"get stronger\" to \"don't lose what you built, and stay fresh enough to perform and avoid injury.\"\n\nPost-season is recovery, both physical and mental -- a deliberate window of reduced structured training that lets accumulated fatigue actually resolve before the next off-season build begins. Skipping this phase because an athlete \"wants to keep training\" is a common way off-seasons start from a fatigue deficit rather than a fresh slate.",
      },
      {
        lessonNumber: 2,
        title: "Tapering for Competition",
        estMinutes: 5,
        content:
          "A taper is a planned, temporary reduction in training volume in the days-to-weeks before an important competition, designed to let accumulated fatigue dissipate while preserving the fitness that training built.\n\nThe key principle that makes a taper work is reducing volume while maintaining intensity. Cutting volume removes accumulated fatigue quickly, since fatigue clears faster than fitness does. Intensity needs to stay relatively high, because dropping intensity too is what actually causes a loss of the specific fitness qualities the taper is supposed to be protecting. A taper that cuts both volume and intensity together isn't a taper, it's just detraining.\n\nHow long a taper should last depends on how much fatigue has actually accumulated and how big the competition is. A single important regular-season game might warrant only a lighter day or two beforehand; a season-defining tournament might warrant a more significant 1-2 week reduction.\n\nA common mistake is either not tapering at all, or overdoing the taper so much that the athlete arrives undertrained rather than fresh. Planning the taper in advance as part of the season's macrocycle, rather than improvising it the week of, is what keeps it in that effective middle ground.",
      },
      {
        lessonNumber: 3,
        title: "In-Season Maintenance Strength Work",
        estMinutes: 6,
        content:
          "The goal of in-season strength training is not to keep making an athlete stronger at the same rate as the off-season -- it's to preserve as much of the off-season's gains as possible while protecting the athlete's freshness for games and practices, which are now the primary training stimulus.\n\nThe research and practical coaching consensus on maintenance training is consistently encouraging on one point: maintaining strength and power built in the off-season requires meaningfully less volume than building it did in the first place -- often as little as one well-designed session per week, at a reasonably high intensity but low total volume, is enough to maintain most of what a full off-season block produced.\n\nPractically, this usually means: fewer total exercises per session, fewer sets per exercise, but keeping intensity reasonably high. Timing matters too -- placing the harder in-season lifting session further from the next competition reduces the chance that game-day freshness is compromised by lingering lifting-session fatigue.\n\nThe mindset shift for a coach moving from off-season to in-season programming is simply this: less is not laziness here, it's the correct, evidence-supported response to a fundamentally different set of competing demands on the athlete's recovery.",
      },
      {
        lessonNumber: 4,
        title: "Structuring a Single Practice",
        estMinutes: 6,
        content:
          "A well-structured practice follows a deliberate sequence for the same reason a well-structured training session does -- different types of work have different fatigue and skill-acquisition demands, and the order they happen in matters as much as what's included.\n\nStart with a genuine warm-up/movement-prep block -- dynamic movement that actually raises body temperature and rehearses movement patterns the practice will use, at progressively higher effort.\n\nPlace your highest-skill, highest-cognitive-demand work early, while athletes are freshest -- new technical instruction or anything requiring fine motor precision should never be introduced after athletes are already fatigued, since fatigue is exactly when technical learning and retention suffer most.\n\nCompetitive/scrimmage work generally fits in the middle-to-later portion of practice, once foundational skill work is done but before athletes are too depleted to compete at a meaningful intensity.\n\nSave dedicated conditioning for the end of practice. Conditioning athletes early leaves them fatigued for the technical work that follows, defeating the purpose of the ordering above.\n\nFinally, always end with a genuine cooldown and, where relevant, sport-specific arm-care or recovery work -- the last few minutes of practice are often the first thing cut when time runs short, but they're doing real, cumulative injury-prevention work over a season.",
      },
    ],
    quizQuestions: [
      {
        orderIndex: 0,
        questionText: "What is the main goal of in-season strength training, compared to off-season?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Preserve off-season gains with minimum-effective-dose training, not continue building at the same rate",
            isCorrect: true,
            explanation: "Correct -- research consistently shows maintaining strength requires meaningfully less volume than building it, which is good news for fitting lifting around a busy game schedule.",
          },
          {
            orderIndex: 1,
            answerText: "Push for the same rate of strength gains as the off-season",
            isCorrect: false,
            explanation: "Trying to build at the off-season rate during a demanding game schedule risks adding fatigue the athlete can't afford -- the goal shifts to maintenance.",
          },
          {
            orderIndex: 2,
            answerText: "Stop all strength training once the season starts",
            isCorrect: false,
            explanation: "Stopping entirely tends to lose real strength over a season -- a well-designed low-volume maintenance approach preserves far more than doing nothing.",
          },
          {
            orderIndex: 3,
            answerText: "Increase training frequency to compensate for game fatigue",
            isCorrect: false,
            explanation: "This is backwards -- in-season programming typically reduces frequency/volume specifically because game fatigue is already a competing demand on recovery.",
          },
        ],
      },
      {
        orderIndex: 1,
        questionText: "What's the key principle behind an effective competition taper?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Reduce volume while keeping intensity relatively high",
            isCorrect: true,
            explanation: "Correct -- cutting volume clears fatigue quickly, while maintaining intensity preserves the specific fitness qualities the taper is meant to protect; cutting both together is just detraining.",
          },
          {
            orderIndex: 1,
            answerText: "Reduce both volume and intensity together as much as possible",
            isCorrect: false,
            explanation: "This is explicitly called out as a mistake -- reducing both isn't a taper, it's detraining, and it costs the athlete real fitness right before competition.",
          },
          {
            orderIndex: 2,
            answerText: "Increase volume right before competition to \"peak\" fitness",
            isCorrect: false,
            explanation: "This is the opposite of tapering -- adding volume right before competition adds fatigue exactly when freshness matters most.",
          },
          {
            orderIndex: 3,
            answerText: "Tapering only matters for very long competitive seasons",
            isCorrect: false,
            explanation: "Tapering applies at any scale -- even a single important regular-season game can warrant a lighter day or two beforehand.",
          },
        ],
      },
      {
        orderIndex: 2,
        questionText: "In what order should a single practice generally be structured?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Warm-up, high-skill/technical work, competitive/scrimmage work, conditioning, cooldown",
            isCorrect: true,
            explanation: "Correct -- this order matches fatigue and skill-acquisition demands: technical learning suffers most under fatigue, so it goes early, while conditioning (lower skill demand) tolerates fatigue best at the end.",
          },
          {
            orderIndex: 1,
            answerText: "Conditioning first to build a base of fatigue for the rest of practice",
            isCorrect: false,
            explanation: "Conditioning first leaves athletes fatigued for the technical work that follows, which is exactly backwards for skill retention.",
          },
          {
            orderIndex: 2,
            answerText: "Cooldown and arm care first, then everything else",
            isCorrect: false,
            explanation: "Cooldown/recovery work belongs at the end, addressing the fatigue and tightness practice itself creates -- doing it first doesn't serve that purpose.",
          },
          {
            orderIndex: 3,
            answerText: "Whatever order keeps the athletes most entertained",
            isCorrect: false,
            explanation: "Entertainment isn't the organizing principle -- the order is based on when the nervous system can best absorb technical learning versus tolerate fatigue.",
          },
        ],
      },
    ],
  },
  {
    title: "Coaching Communication & Culture",
    description:
      "Building genuine buy-in instead of just compliance, adapting to different personality types, handling a bad practice, and creating real accountability.",
    keyPrinciplesForAi:
      "When discussing motivation or communication approaches with an athlete, favor explaining the 'why' behind a task over a blunt directive, and encourage the athlete to bring concerns or questions to their real coach -- consistent with never positioning yourself as the final authority on their training or behavior.",
    lessons: [
      {
        lessonNumber: 1,
        title: "Building Buy-In, Not Just Compliance",
        estMinutes: 5,
        content:
          "There's a meaningful difference between an athlete who does a drill because you told them to and an athlete who does it because they understand why it matters -- and that difference shows up directly in effort, retention, and whether the behavior sticks once you're not standing right there watching.\n\nCompliance is what you get from authority alone: a directive, delivered with enough force or consequence attached, produces the behavior in the moment. It has its place, particularly around safety, but compliance-only coaching tends to produce athletes who perform exactly to the letter of the instruction and no further.\n\nBuy-in is what you get from understanding: an athlete who knows why a warm-up matters, or why a certain in-game decision is the right one, tends to actually apply that understanding even in moments you can't directly supervise.\n\nBuilding buy-in doesn't require a long lecture before every instruction -- most of the time it's a short, genuine \"why\" attached to the \"what.\" Over a season, an athlete who consistently hears the reasoning behind what they're asked to do develops actual understanding of their own training and sport -- a far more durable outcome than an athlete who's simply gotten good at doing what they're told.",
      },
      {
        lessonNumber: 2,
        title: "Motivating Different Personality Types",
        estMinutes: 5,
        content:
          "Not every athlete responds to the same motivational approach, and a coach who has exactly one style will connect well with some athletes and completely miss others -- often the ones who need the most help.\n\nSome athletes respond well to direct, even blunt, feedback -- they want to know exactly what's wrong and exactly how to fix it, without much cushioning. For these athletes, a direct correction delivered matter-of-factly is respectful of how they actually want to be coached, not harsh for its own sake.\n\nOther athletes need encouragement and psychological safety established first before a correction lands well -- delivering the same blunt correction to an athlete in this category, especially in front of teammates, can shut them down rather than motivate them. Leading with something genuine they did well, then framing the correction as the next step, tends to produce far better results from the same underlying feedback.\n\nThe practical skill here is paying attention to how a specific athlete actually responds over time and adjusting your delivery to that individual, while keeping the actual substance of your coaching consistent.",
      },
      {
        lessonNumber: 3,
        title: "Handling a Bad Practice or a Bad Attitude",
        estMinutes: 5,
        content:
          "Every coach eventually deals with a practice that's going poorly, or an individual athlete showing a bad attitude in the moment -- and how that's handled in real time says more about a program's culture than almost anything else a coach does.\n\nThe first, most consistently useful rule: address individual behavior privately, not in front of the team. Calling out one athlete's attitude in front of teammates tends to produce defensiveness rather than genuine correction.\n\nSeparate the behavior from the person when you address it. \"You're being lazy\" describes an identity; \"that rep didn't match the effort I know you're capable of\" describes a specific, correctable action, and gives the athlete somewhere to go.\n\nFor a genuinely bad team practice, resist the urge to escalate with more volume or punishment conditioning as the immediate response -- this often treats the symptom with more of exactly what's draining it. A short, direct conversation, followed by continuing the practice plan, usually addresses the issue more effectively than an emotional response.\n\nAlways follow up. A brief, genuine check-in at the next practice closes the loop and reinforces that the correction was about improvement, not punishment.",
      },
      {
        lessonNumber: 4,
        title: "Creating a Culture of Accountability",
        estMinutes: 5,
        content:
          "A team culture of genuine accountability isn't built from a single speech at the start of the season -- it's built from consistently applied standards that don't bend based on who the athlete is or how good they are, applied over the course of an entire season.\n\nThe single fastest way to destroy a culture of accountability is applying standards unevenly based on talent -- letting your best player skip standards everyone else is held to. Athletes notice this immediately, and the message it sends is that the standard is actually optional if you're good enough.\n\nPeer accountability, once established, is more powerful and more sustainable than a coach enforcing every single standard personally. A captain or respected veteran reinforcing a standard to a teammate carries different weight than the same reminder from a coach.\n\nConsistency over time matters more than intensity in any single moment. A standard that's strictly enforced during a good week and quietly ignored during a stressful or losing stretch teaches athletes that the standard was situational all along -- whereas a standard that holds steady specifically during the hard stretches is what actually builds trust that the standard is real.",
      },
    ],
    quizQuestions: [
      {
        orderIndex: 0,
        questionText: "What's the key difference between compliance and buy-in?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Buy-in comes from understanding the \"why\" and persists even without direct supervision; compliance is authority-driven and often stops there",
            isCorrect: true,
            explanation: "Correct -- an athlete who understands why they're doing something tends to apply it even when the coach isn't watching, while pure compliance often doesn't generalize beyond the exact instruction given.",
          },
          {
            orderIndex: 1,
            answerText: "They produce identical long-term results",
            isCorrect: false,
            explanation: "The track specifically argues they produce different durability of behavior -- buy-in tends to generalize and persist, compliance often doesn't.",
          },
          {
            orderIndex: 2,
            answerText: "Compliance is always the better approach for safety-critical instructions",
            isCorrect: false,
            explanation: "Compliance does have its place for safety-critical moments, but that's a narrower claim than saying it's always superior overall -- buy-in is presented as generally the more durable approach.",
          },
          {
            orderIndex: 3,
            answerText: "Buy-in requires a long lecture before every single instruction",
            isCorrect: false,
            explanation: "The track explicitly says building buy-in doesn't require a lecture every time -- usually a short, genuine \"why\" attached to the \"what\" is enough.",
          },
        ],
      },
      {
        orderIndex: 1,
        questionText: "How should a coach generally handle correcting an individual athlete's poor effort or attitude?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Address it privately, separating the behavior from the athlete's identity",
            isCorrect: true,
            explanation: "Correct -- private correction avoids the defensiveness public correction tends to produce, and describing a specific action (rather than labeling the person) gives the athlete something concrete to fix.",
          },
          {
            orderIndex: 1,
            answerText: "Call it out immediately in front of the team to set an example",
            isCorrect: false,
            explanation: "Public correction tends to produce defensiveness and can turn into a performance for teammates to react to, rather than genuine correction.",
          },
          {
            orderIndex: 2,
            answerText: "Say nothing and hope it improves on its own",
            isCorrect: false,
            explanation: "Unaddressed behavior doesn't reliably self-correct, and the track's whole framework is about active, deliberate correction -- just privately, not publicly.",
          },
          {
            orderIndex: 3,
            answerText: "Assign extra conditioning as the primary response",
            isCorrect: false,
            explanation: "Punishment conditioning is called out as a common but often counterproductive instinct -- it treats the symptom rather than addressing the actual behavior directly.",
          },
        ],
      },
      {
        orderIndex: 2,
        questionText: "What's the fastest way to undermine a team's culture of accountability?",
        answers: [
          {
            orderIndex: 0,
            answerText: "Applying standards unevenly based on an athlete's talent level",
            isCorrect: true,
            explanation: "Correct -- letting a star player skip a standard everyone else follows sends a clear signal that the standard is optional if you're good enough, which erodes trust in every other standard.",
          },
          {
            orderIndex: 1,
            answerText: "Empowering team captains to reinforce standards among teammates",
            isCorrect: false,
            explanation: "This is actually a positive, sustainable practice (peer accountability) -- it's presented as something that strengthens culture, not undermines it.",
          },
          {
            orderIndex: 2,
            answerText: "Holding the same standard steady during a difficult losing stretch",
            isCorrect: false,
            explanation: "Consistency specifically during hard stretches is what builds genuine trust that a standard is real -- this strengthens culture rather than undermining it.",
          },
          {
            orderIndex: 3,
            answerText: "Following up after a correction to reinforce the standard",
            isCorrect: false,
            explanation: "Following up closes the loop and reinforces that a correction was about improvement -- this supports accountability rather than undermining it.",
          },
        ],
      },
    ],
  },
];
