import { q, type SeedAcademyTrack } from "./types";

/** 2026-11-22, written from Forge's own research review (server/seed-data/research-review).
 * Forge's outline and Forge's words; studies are described, never quoted. Nothing here is
 * medical advice: every lesson places diagnosis, timelines and clearance with the clinician. */
export const RETURNING_AFTER_INJURY_TRACK: SeedAcademyTrack = {
  title: "Returning to Training After an Injury: The Coach's Part",
  description:
    "What the studies say about coming back from ACL surgery, ankle sprains, shoulder and elbow injuries and concussion, which decisions belong to the clinician, and the part of a return only the coach can do well.",
  keyPrinciplesForAi:
    "Return to training after an injury is a continuum that runs alongside rehab and is decided jointly by the clinician, the athlete and the coach; diagnosis, timelines and clearance belong to the treating clinician, and nothing in this track is medical advice. Returns are criteria-based rather than calendar-based. After ACL reconstruction, waiting at least nine months and restoring near-symmetrical quadriceps strength lowered reinjury, each month of delay up to nine months cut risk substantially, and hop tests can look symmetrical while quadriceps strength is still short, so strength has to be measured. Young athletes, especially female soccer players, have high rates of a second ACL injury, so prevention work continues after return. Ankle sprain returns cover pain, ankle impairments, confidence, balance and sport tasks. Throwers return through range, strength and scapular control, then plyometrics, then an interval throwing program. After a concussion, children and adolescents recover better with an early return to light activity and less screen time than with strict rest, under a clinician-led stepwise plan. The coach's part is protecting the plan, rebuilding training load gradually, watching confidence and continuing prevention work.",
  lessons: [
    {
      lessonNumber: 1,
      title: "Who Decides What",
      estMinutes: 6,
      content:
        "Nothing in this track is medical advice, and the first lesson is about why that sentence is not just a disclaimer. When an athlete is hurt, three people have a stake in the return: the clinician who diagnosed and is treating the injury, the athlete whose body and career it is, and the coach who controls what the athlete does every day at practice. A widely cited consensus statement on return to sport describes the return as a continuum that runs alongside rehab, not a single pass-or-fail test at the end, and argues that the decision should be shared among those three, weighing the risk of the activity against how much risk the athlete and the situation can tolerate.\n\nWithin that shared decision, the roles are clear. The clinician owns the diagnosis, the treatment, any imaging, surgery and its timeline, and medical clearance. That is true for a suspected fracture, a severe sprain, a suspected stress injury of the spine in a young athlete with back pain, a groin injury that needs classifying, and every concussion. Simple field tests are not reliable enough to diagnose some of these; a pars stress injury in a young athlete with back pain, for example, needs clinical assessment and imaging.\n\nThe coach owns something just as important: what happens between appointments. A clinician can prescribe a graded progression, but the coach decides whether the athlete sprints in the third drill of practice, whether a pitcher throws a few extra balls because they feel good, whether a returning player is thrown straight into full-contact scrimmage. Most failed returns are not a misjudged clearance; they are a progression that skipped steps.\n\nThe athlete's own voice belongs in the room too. Psychological readiness and confidence are measurable and predict return in young athletes after knee surgery, as a later lesson describes. An athlete who is physically cleared and still afraid of cutting is not finished.\n\nThe practical habit is communication: know who the treating clinician is, understand the stage of the plan the athlete is in, ask what the athlete is and is not cleared to do this week, and report back what you see in practice.",
      flashcards: [
        { front: "Who owns diagnosis, timelines and clearance", back: "The treating clinician." },
        { front: "What the coach owns in a return", back: "Daily training between appointments: following the progression without skipping steps." },
        { front: "How the consensus describes return to sport", back: "A continuum alongside rehab, decided jointly by clinician, athlete and coach." },
      ],
    },
    {
      lessonNumber: 2,
      title: "The Knee After ACL Surgery",
      estMinutes: 7,
      content:
        "The ACL return is the one coaches are most likely to face with a high school athlete, and the published evidence is unusually clear on a few points, all of which the surgeon and therapist will apply to the individual athlete.\n\nTime matters. In a 2016 prospective study of patients after ACL reconstruction, the reinjury risk fell substantially for each month return to sport was delayed, up to about nine months, and returning to pivoting sport raised the risk several times over. Strength matters too: having near-symmetrical quadriceps strength between the legs lowered reinjury. In professional athletes, those who did not meet all of a set of discharge criteria covering strength, running and agility and hop tests had about four times the risk of rupturing the graft.\n\nTests help but do not guarantee safety. Only around a quarter of patients pass full return-to-sport test batteries; passing lowered graft rupture risk but did not clearly prevent every later ACL injury. And hop tests can look symmetrical while quadriceps strength is still well under ninety percent of the other side, so strength must be measured rather than guessed from how well an athlete hops. Typical rehab phase goals described in the literature run from about eighty-five percent symmetry before agility and sprinting to ninety percent or more, with no swelling and assessed confidence, before full return.\n\nThe second injury is the big risk for young athletes. Roughly a quarter of under-twenty-five-year-olds who return to sport after reconstruction go on to another ACL injury, either graft or other knee, and the figure was similar or higher in female soccer players. Psychological readiness, measured with a short questionnaire, rises between six and twelve months in adolescents and predicts return.\n\nFor the coach, that translates into three jobs. Respect the timeline and the criteria the clinical team sets, even when the athlete looks ready. Rebuild practice gradually, from straight-line running to planned cutting to reactive play, as the plan allows. And treat the end of rehab as the start of prevention: the landing and cutting program from the knee track is exactly what a returning athlete should keep doing for the rest of their career. Only about two-thirds of football players returned to play after reconstruction in one review, and most performed below their earlier level, which is why patience pays.",
      flashcards: [
        { front: "ACL return timing finding", back: "Reinjury risk fell for each month of delay up to about nine months." },
        { front: "Why measure quadriceps strength directly", back: "Hop tests can look symmetrical while quadriceps strength is still short." },
        { front: "Second ACL injury risk in young returning athletes", back: "Roughly a quarter of under-25s, similar or higher in female soccer players." },
      ],
    },
    {
      lessonNumber: 3,
      title: "Ankles, Shoulders, Elbows and Groins",
      estMinutes: 6,
      content:
        "Different joints come back through different sequences, but the logic is the same: restore the basics, rebuild capacity step by step, and test sport-like tasks before full play.\n\nFor a lateral ankle sprain, exercise-based rehab after the sprain cuts reinjury, although the best content and dose are not settled. An international consensus sets out five domains a return should check: pain during sport and over the next day; ankle range, strength, endurance and power; the athlete's own perception and confidence; balance and control; and sport performance such as hops, agility and completing a full session. Guidelines favor supervised exercise over passive treatment and suggest braces to prevent a recurrence. A suspected fracture, a severe sprain or an ankle that keeps giving way afterward needs a clinician.\n\nThrowers come back in a set sequence too. Motion and strength at the shoulder, with good control of the scapula, are restored before anything else, then medicine-ball and band plyometrics for the upper body, and only then an interval throwing plan in which throws get longer, harder and more numerous a step at a time, with every throw counted. One recent pitching plan built on workload data takes around seven months. About four in five athletes treated without surgery for an injured ulnar collateral ligament got back to their sport, with partial tears near the top of the ligament doing much better than those lower down; that grading and the choice of treatment belong to the clinician. After reconstruction, most professional pitchers return in about a year, and returning to the same level takes longer.\n\nFor groin and hamstring injuries, rehab is mostly progressed by pain and cleared using clinical examination and strength and sprint tests. After acute adductor injuries in male athletes, a criteria-based program got most athletes back to full team training in a few weeks. Groin pain should be classified clinically before rehab is planned, because adductor, hip-flexor, inguinal, pubic and hip-joint problems are different problems. The adductor squeeze test is a useful marker to track.\n\nAcross all of these, two patterns repeat. A previous injury is the strongest predictor of the next one, so the return is when prevention work must resume. And the athlete who feels fine before the tests say so is the athlete most likely to skip ahead; the coach's patience is part of the treatment.",
      flashcards: [
        { front: "Five domains of an ankle sprain return", back: "Pain, ankle impairments, athlete perception, balance and control, sport performance." },
        { front: "Order of a thrower's return", back: "Range, strength and scapular control; then plyometrics; then interval throwing by workload." },
        { front: "Why classify groin pain clinically first", back: "Adductor, hip-flexor, inguinal, pubic and hip-joint problems need different rehab." },
      ],
    },
    {
      lessonNumber: 4,
      title: "Concussion, and Rebuilding the Training Load",
      estMinutes: 6,
      content:
        "Concussion has its own rules, set by international consensus, and the coach's first job is the simplest: an athlete with a suspected concussion stops playing that day and is assessed by a clinician. Diagnosis, the use of the standardized assessment tools and clearance are a clinician's job, under medical supervision.\n\nWhat has changed in recent years is the advice on rest. For children and adolescents, the most recent consensus statement found that an early return to light physical activity and reduced screen time help recovery more than strict rest in a dark room. The return then proceeds stepwise under the clinician's direction, and when dizziness, neck pain or headache last more than about ten days, specific rehab for the neck and balance systems is advised. The coach's role is to fit practice to the stage the clinician has set, to never let an athlete leap a stage because a game is coming, and to report any symptom that reappears with exertion.\n\nConcussion risk is not evenly spread. Girls had roughly twice the concussion rate of boys in comparable high school sports, older youth athletes and those with a prior concussion carried higher risk, and some positions, such as soccer goalkeepers and volleyball liberos, show up often in the data. A previous concussion raised later risk several times in one youth cohort.\n\nWhatever the injury, the last phase of a return is rebuilding training load, and this is squarely the coach's work. Spikes in workload were among the strongest injury predictors in junior athletes in one sport, and gradual ramp-up periods of about four weeks reduced injuries. An athlete coming back after weeks away has lost fitness, and the first full-intensity practice is a spike. Plan the return over several weeks: partial practice, then full practice without contact or live competition, then limited game minutes, then full play, with sprinting, jumping and throwing volumes rising a step at a time.\n\nKeep an eye on the athlete's confidence and mood as well. Fear of reinjury is common, measurable and linked to how well athletes return, and an athlete who is anxious about a cut or a tackle is better served by graded exposure in practice than by being told they are fine. Finish every return by putting the athlete back on the prevention program for that injury.",
      flashcards: [
        { front: "Current advice on rest after a youth concussion", back: "Early light activity and less screen time help more than strict rest, under a clinician-led plan." },
        { front: "First step with a suspected concussion", back: "Stop play that day and have a clinician assess the athlete." },
        { front: "The coach's job at the end of every return", back: "Rebuild training load gradually over weeks and restart the injury's prevention work." },
      ],
    },
  ],
  quizQuestions: [
    q(0, "Who owns diagnosis, timelines and medical clearance after an injury?", [
      ["The treating clinician", "Correct. The coach and athlete share the decision, but clearance is clinical."],
      ["The head coach", "The coach controls daily training, not diagnosis or clearance."],
      ["The athlete alone", "The athlete has a voice but does not clear themselves medically."],
      ["Whoever is available", "These decisions belong to the treating clinician."],
    ], 0),
    q(1, "What did a 2016 study find about the timing of return after ACL reconstruction?", [
      ["Reinjury risk fell for each month return was delayed, up to about nine months", "Correct. Time and strength symmetry both mattered."],
      ["Returning at three months was safest", "Early return raised risk."],
      ["Timing made no difference", "Timing made a substantial difference."],
      ["Waiting longer always increased risk", "Delay up to nine months reduced risk."],
    ], 0),
    q(2, "Why should quadriceps strength be measured directly in a returning ACL athlete?", [
      ["Hop tests can look symmetrical while quadriceps strength is still short", "Correct. Strength cannot be inferred from hops."],
      ["Hop tests are illegal", "Hop tests are useful; they just do not replace strength testing."],
      ["Strength does not matter after surgery", "Near-symmetrical quadriceps strength lowered reinjury."],
      ["Because hops always overestimate injury", "The problem is the opposite: hops can look fine too early."],
    ], 0),
    q(3, "What should a coach do when an athlete finishes ACL rehab?", [
      ["Continue landing and cutting prevention work, because second ACL injury rates are high in young athletes", "Correct. Roughly a quarter of young returners have another ACL injury."],
      ["Stop all prevention work, the knee is fixed", "The second injury is the major risk."],
      ["Avoid all jumping forever", "Controlled, progressed jumping and landing is part of prevention."],
      ["Move them to a different sport", "That is not what the evidence suggests."],
    ], 0),
    q(4, "Which five areas does the international consensus cover for return after an ankle sprain?", [
      ["Pain, ankle impairments, athlete perception, balance and control, and sport performance", "Correct. Pain-free walking alone is not enough."],
      ["Only pain", "Pain is one of five domains."],
      ["Only how the ankle looks", "Appearance is not a return criterion."],
      ["Only the number of days since the sprain", "Returns are criteria-based, not calendar-based."],
    ], 0),
    q(5, "What is the order of a thrower's return after a shoulder or elbow injury?", [
      ["Range, strength and scapular control; then plyometrics; then an interval throwing program", "Correct. Each stage is earned and tracked by workload."],
      ["Full-effort pitching first to test the arm", "That skips every stage."],
      ["Interval throwing before any strength work", "Strength and control come first."],
      ["Rest only, then return to full games", "A graded progression is needed."],
    ], 0),
    q(6, "What does the current consensus say about rest after a concussion in children and adolescents?", [
      ["An early return to light activity and less screen time help recovery more than strict rest, under clinician direction", "Correct. The return is stepwise and clinician-led."],
      ["Complete rest in a dark room for weeks is best", "Strict prolonged rest is no longer the advice."],
      ["Return to full contact the next day", "That skips the stepwise, supervised plan."],
      ["Coaches should diagnose concussions themselves", "Diagnosis is a clinician's job."],
    ], 0),
    q(7, "An athlete is cleared for full practice after five weeks out. How should training load return?", [
      ["Gradually over several weeks, because a sudden return to full load is a spike", "Correct. Workload spikes predicted injury and gradual ramps reduced it."],
      ["Full practice, full game minutes and extra conditioning immediately", "That is the spike most linked to injury."],
      ["No conditioning at all until the next season", "Fitness has to be rebuilt progressively."],
      ["Only game minutes, no practice", "Games are the highest-load setting."],
    ], 0),
  ],
};
