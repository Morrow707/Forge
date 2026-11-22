import { q, type SeedAcademyTrack } from "./types";

/** 2026-11-22, written from Forge's own research review (server/seed-data/research-review).
 * Forge's outline and Forge's words; studies are described, never quoted. */
export const HEAT_SCHEDULES_LOAD_TRACK: SeedAcademyTrack = {
  title: "Heat, Schedules and In-Season Load",
  description:
    "Heat acclimatization and the conditioning habits behind exertional heat stroke, workload spikes, why games carry most of the risk, specialization and the calendar, and how to keep athletes strong through a season without wearing them down.",
  keyPrinciplesForAi:
    "Exertional heat stroke deaths in football cluster around high-intensity conditioning that is not position-specific, exercise used as punishment, and failure to adjust for heat and humidity, and linemen carry the highest risk. Phased preseason heat acclimatization, which builds session length, intensity and equipment over the first days, was associated with about half the rate of exertional heat illness in high schools in states that mandated it; never use conditioning as punishment and modify or move sessions in heat and humidity. Injury rates are several times higher in games than in practice, so practice should prepare athletes for game intensity rather than avoid it. Sudden spikes in training load were among the strongest injury predictors in junior athletes, and gradual ramp-ups of about four weeks reduced injuries, so build load after breaks and at the start of seasons. Highly specialized youth athletes, especially those playing one sport more than eight months a year, have more overuse injuries; encourage multiple sports and planned rest. Strength can be maintained in season with one or two short intense sessions a week. Rapid weight cutting of more than about five percent of body mass harms performance and health and should never be programmed.",
  lessons: [
    {
      lessonNumber: 1,
      title: "Heat Kills Athletes, and It Is Preventable",
      estMinutes: 7,
      content:
        "Exertional heat stroke is one of the few sport injuries that kills young athletes, and the circumstances behind it repeat with grim regularity. A registry of youth, high school and college cases, together with a national athletic trainers' task force, found that heat stroke deaths in football cluster around three things: high-intensity conditioning that is not tailored to the position, exercise used as punishment, and failure to change the session for heat and humidity. Linemen carry the highest risk, because they are the largest athletes doing repeated high-effort work, and conditioning for them needs work-to-rest ratios that fit the position rather than the same gassers as the receivers.\n\nThe best-supported prevention is heat acclimatization in the first days of preseason. A 2019 study of high schools found that schools in states with mandated preseason acclimatization guidelines had roughly half the rate of exertional heat illness during preseason. Acclimatization phases in the practice length, intensity and protective equipment over the first one to two weeks, so the body adapts to heat before it is asked to do maximal work in it. The specific schedule comes from the athletic trainer and the state or national guidance a school follows; the coach's part is to keep to it, even when the depth chart is unsettled and the temptation is to go hard on day one.\n\nPreparation lags behind the evidence. Only about a quarter of high schools in one athletic trainers' survey reported using all six recommended heat-stroke preparedness strategies, and use was highest in hot regions with state mandates. A school in a mild climate is not exempt: an unusually hot week in August is exactly the situation where nobody planned for heat.\n\nThe habits for a coach are clear. Never use conditioning as punishment. Plan conditioning by position and by readiness, not as one test for everyone on the first day. Check heat and humidity before every session and move, shorten or reduce practice when they are high, with longer and more frequent rest and fluid breaks. Make sure an athletic trainer or another trained person, a plan for rapid cooling and a way to call for help are present at every hot-weather session. An athlete who collapses, becomes confused or stops sweating in the heat is a medical emergency, not someone to sit in the shade.",
      flashcards: [
        { front: "Three circumstances behind football heat stroke deaths", back: "Non-position-specific high-intensity conditioning, exercise as punishment, and no adjustment for heat and humidity." },
        { front: "Effect of mandated preseason heat acclimatization in high schools", back: "Roughly half the rate of exertional heat illness during preseason." },
        { front: "Position with the highest heat stroke risk", back: "Linemen." },
      ],
    },
    {
      lessonNumber: 2,
      title: "Games, Spikes and the Shape of a Week",
      estMinutes: 6,
      content:
        "Across high school sports, injuries happen far more often in games than in practice. In soccer, game injury rates were several times practice rates, nearly five times for girls; in basketball, two to three times; in baseball, a little over twice; and for ACL injuries specifically, the gap in some sports reached seven or eight times. Games bring maximal speed, unpredictable opponents, fatigue and adrenaline, and in female basketball, accelerometer load was higher in games than in practice.\n\nThe lesson is not to fear games. It is that practice should prepare athletes for game intensity. A team that never sprints, cuts or collides at full speed in practice sends athletes into games unprepared for the very efforts that hurt them. Small-sided games are one useful tool: in female basketball, three-on-three produced more load and running than five-on-five, so court size and player numbers let a coach build conditioning into practice in a game-like way.\n\nThe other half of the story is change. In junior tennis, sudden spikes in workload, with the recent week far above the athlete's usual load, were the strongest outside predictor of injury, and four-week ramp-up periods reduced injuries by a meaningful margin. In swimming, a high recent-to-usual workload ratio was one of the few factors linked to shoulder injury. College baseball and softball players strained hamstrings at roughly double the rate in the preseason that they did once the season was running, which is what athletes who arrive unready for practice speed would produce. The pattern across sports is that the danger is less in the total than in the jump.\n\nThat gives a planning rule a coach can use without any special equipment. Know roughly what each athlete has been doing, and when the load is about to rise, at the start of a season, after a holiday break, when an athlete returns from injury or joins from another sport, build it over a few weeks instead of all at once. Keep the hardest practice of the week well away from game day. And after a congested stretch of games, schedule a lighter practice rather than an extra conditioning session to make up for lost time.",
      flashcards: [
        { front: "Where most high school sport injuries happen", back: "In games, at several times practice rates." },
        { front: "Strongest outside injury predictor in junior tennis", back: "Sudden spikes in workload." },
        { front: "Planning rule for load", back: "Build it over a few weeks after any break instead of all at once." },
      ],
    },
    {
      lessonNumber: 3,
      title: "Specialization, the Calendar and Rest",
      estMinutes: 6,
      content:
        "Year-round single-sport training is common in youth sport, and the injury data are consistent about its cost. Highly specialized youth athletes had about one and four-fifths times the overuse injury risk of athletes who specialized little, in a 2018 pooled analysis. Baseball shows the same shape: the most specialized high school players carried several times the odds of an overuse injury to the arm, and a season stretched past eight months a year roughly doubled them. Among high school girls in distance running, those who ran and nothing else for most of the year had several times the odds of low bone density. Sports medicine bodies recommend multisport participation and delaying specialization until at least adolescence.\n\nSpecialization usually means three things together: choosing one main sport, quitting the others, and training it more than eight months a year. Few studies separate specialization from simple training volume, so the safest reading is that both the single sport and the sheer number of months matter. An expert review for junior tennis put it in practical terms: avoid single-sport specialization before about twelve, train no more hours a week than the athlete's age in years, keep a couple of hours a week for injury-prevention training, and limit tournaments to a couple a month. Those numbers are low-to-moderate evidence, but they express a principle every sport can use.\n\nGrowth adds a layer. Injury rates and burden rise with maturity, and growth-related injuries peak around the adolescent growth spurt, with faster growth in height and leg length linked to more injury in elite youth. During a growth spurt, an athlete's coordination, flexibility and tolerance for repetitive impact can change quickly, and a smart coach temporarily trims high-impact and high-volume work for that athlete rather than holding them to last year's numbers.\n\nRest is not wasted time. Overuse injuries, overtraining and burnout come from loads that exceed recovery, and burnout is one of the main reasons young people leave sport, according to a pediatric clinical report. A coach can do more for long-term development by planning a few weeks off competitive play each year, encouraging a second sport and protecting sleep than by adding another tournament weekend. For the coach of a single school team, the practical lever is the offseason: make it a real change of activity rather than more of the same.",
      flashcards: [
        { front: "Overuse injury risk of highly specialized youth athletes", back: "About 1.8 times that of low-specialization athletes." },
        { front: "Common definition of specialization", back: "One main sport, quitting others, and training more than eight months a year." },
        { front: "Why trim load during a growth spurt", back: "Growth-related injuries peak around the spurt, and faster growth is linked to more injury." },
      ],
    },
    {
      lessonNumber: 4,
      title: "Staying Strong In Season, and Never Cutting Weight",
      estMinutes: 6,
      content:
        "The in-season challenge is to keep the strength that was built in the offseason without adding fatigue that costs games. The good news is that strength is cheaper to keep than to build. In rowers, strength was maintained in season with one or two intense sessions a week at roughly three-quarters of maximum, and the same principle shows up across strength research: a short, heavy-enough session once or twice a week holds most of what a longer program built. Keep the intensity, cut the volume, and place the session where it least interferes with games, typically early in the week.\n\nThe injury-prevention work belongs in season too, at a maintenance dose: the neuromuscular warm-up stays two or three times a week, Nordic hamstring and Copenhagen adduction work drops to about one short session a week, and shoulder programs for throwers continue inside the warm-up. These are the programs that fade first when the schedule gets busy, and the knee and hamstring injuries they prevent concentrate late in the season and late in games, when fatigue is highest.\n\nConditioning should track the sport. In college football, practice workload intensity was driven more by the type of drill and the day of the week than by position, but each position group responded differently to each drill, so conditioning needs to be planned per position and per drill. In elite women's field hockey, forwards reached the highest peak running in the most intense minute of games, which argues for preparing athletes for the peak of a game, not its average.\n\nOne practice should never appear in a program: rapid weight cutting. In wrestling and other weight-class sports, losing more than about five percent of body mass quickly through dehydration and food restriction is linked to worse performance, more injury, hormonal disruption and a higher risk of eating disorders. Weight class should be decided by gradual change in body composition over months, with a clinician or dietitian involved for a young athlete, never by dehydration in the days before a match.\n\nPut together, the in-season week is simple: one or two short strength sessions, prevention work at maintenance dose, conditioning shaped by position and by the game's peak demands, recovery protected around games, and no weight cutting.",
      flashcards: [
        { front: "Dose that maintains strength in season", back: "One or two short, intense sessions a week." },
        { front: "Prevention work in season", back: "Keep it at a maintenance dose; it is what fades first and what protects late in the season." },
        { front: "Rapid weight loss threshold linked to harm", back: "More than about five percent of body mass." },
      ],
    },
  ],
  quizQuestions: [
    q(0, "Which circumstances are behind most exertional heat stroke deaths in football?", [
      ["High-intensity conditioning not tailored to position, exercise used as punishment, and no adjustment for heat and humidity", "Correct. All three are under the coach's control."],
      ["Too much water during practice", "Hydration is protective, not the cause."],
      ["Strength training in the offseason", "That was not linked to heat stroke deaths."],
      ["Light walk-throughs", "Low-intensity sessions are not the risk."],
    ], 0),
    q(1, "What was associated with fewer exertional heat illnesses in high schools?", [
      ["Mandated preseason heat acclimatization, phasing in practice length, intensity and equipment", "Correct. Roughly half the rate during preseason."],
      ["Starting preseason with a maximal conditioning test", "That is the pattern linked to heat illness."],
      ["Practicing in full pads from day one", "Acclimatization phases equipment in."],
      ["Holding practice at midday", "Hot midday sessions add risk."],
    ], 0),
    q(2, "Where do most high school sport injuries happen?", [
      ["In games, at several times practice rates", "Correct. Practice should prepare athletes for game intensity."],
      ["In the weight room", "Most happen in games."],
      ["During warm-ups", "Warm-ups reduce injury."],
      ["Equally in games and practice", "Game rates are several times higher."],
    ], 0),
    q(3, "In junior tennis, what was the strongest outside predictor of injury?", [
      ["Sudden spikes in workload", "Correct. Four-week ramp-ups reduced injuries."],
      ["Steady, high training load", "The jump mattered more than the steady total."],
      ["Too much rest", "Rest was not the risk."],
      ["Playing on clay courts", "Surface was not the finding."],
    ], 0),
    q(4, "A team returns from a two-week holiday break. What does the evidence suggest?", [
      ["Build training load back over a few weeks rather than all at once", "Correct. The danger is the spike."],
      ["Double conditioning to make up for lost time", "That is exactly a workload spike."],
      ["Skip warm-ups to save time", "The warm-up stays; it is part of the protection."],
      ["Test maximal sprints on the first day back", "That is a spike in high-speed load."],
    ], 0),
    q(5, "What did a 2018 pooled analysis find about highly specialized youth athletes?", [
      ["About 1.8 times the overuse injury risk of low-specialization athletes", "Correct. Multisport participation is recommended."],
      ["They had fewer injuries", "Specialized athletes had more overuse injuries, not fewer."],
      ["No difference", "There was a clear difference."],
      ["Only adults are affected by specialization", "The evidence is in youth athletes."],
    ], 0),
    q(6, "How can strength be maintained in season?", [
      ["One or two short, intense sessions a week", "Correct. Keep intensity, cut volume."],
      ["It cannot; it is always lost", "Strength is cheaper to keep than to build."],
      ["Daily maximal lifting", "That adds fatigue that costs games."],
      ["Only by stretching", "Stretching does not maintain strength."],
    ], 0),
    q(7, "A wrestler wants to drop a weight class this week by cutting fluids. What should the coach do?", [
      ["Refuse to program it; rapid loss of more than about five percent of body mass harms performance and health", "Correct. Weight class should come from gradual change over months with professional input."],
      ["Supervise a sauna session", "Dehydration-based cutting is the harmful practice."],
      ["Allow it if the athlete is strong", "Strength does not offset the harm."],
      ["Encourage skipping meals instead", "Food restriction is part of the same harm."],
    ], 0),
  ],
};
