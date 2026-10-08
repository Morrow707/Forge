import { q, type SeedAcademyTrack } from "./types";

export const MUSCLE_AND_FORCE_TRACK: SeedAcademyTrack = {
  title: "How Muscle Produces Force",
  description:
    "What a coach needs to know about muscle and nerve to understand why athletes get stronger before they get bigger, why fast athletes are built differently, and what a rep is actually training.",
  keyPrinciplesForAi:
    "Force is produced by motor units, each a nerve and the fibers it drives, recruited from small to large as the demand rises; heavy or fast efforts are what reach the biggest units. Early strength gains are mostly neural (more units, faster firing, better coordination between muscles) and arrive in weeks; muscle growth follows over months and needs enough volume near effort. Fiber types sit on a spectrum from slow and fatigue-resistant to fast and powerful, the mix is largely inherited, and training shifts how fibers behave more than what they are. Muscle produces the most force when lengthening, less when still, least when shortening fast, which is why eccentrics are strong, why slow heavy lifts and fast light lifts train different ends of the same curve, and why a coach picks the load for the quality wanted. Coach the nervous system first: intent to move fast, full recruitment, clean patterns. Size comes after.",
  lessons: [
    {
      lessonNumber: 1,
      title: "Motor Units: The Unit of Strength",
      estMinutes: 6,
      content:
        "A muscle does not contract as one piece. It is organized into motor units, each one a single nerve cell and the bundle of muscle fibers it controls. A small motor unit might drive a dozen fibers and be used for precise, low-force work; a large one can drive thousands and is reserved for heavy or fast effort. When the brain asks for force, it recruits units in order from small to large, adding bigger ones as the demand rises. That ordering is the single most useful fact in this track, because it tells a coach what reaches the big, powerful units: a heavy load, or a light load moved with maximal intent, or a set carried close to the point where the smaller units can no longer keep up.\n\nTwo other dials sit beside recruitment. Firing rate is how often a unit is told to contract; higher rates mean more force from the same fibers, and trained athletes fire faster. Synchronization is how well units fire together rather than staggered; it matters most for explosive efforts. Both improve with training before any fiber has grown, which is why a beginner's numbers climb for weeks while the tape measure does not move.\n\nThis is also why intent matters more than the number on the bar for power. A light bar moved as fast as possible recruits the large units because the demand for speed is high, even though the demand for force is modest. A heavy bar moved slowly recruits them because the force demand is high. A moderate bar moved at a moderate pace, which is most of what happens in an unsupervised weight room, often recruits neither fully. A coach who insists on intent on every rep is getting more out of the same session than one who counts reps.\n\nOne caution for the youth and novice athlete: the nervous system is also what keeps a lift safe. Recruitment and coordination are learned, and learning them under a load the athlete cannot control teaches the wrong pattern at full recruitment. Technique first, intent second, load third is the order that respects how the system works.",
    },
    {
      lessonNumber: 2,
      title: "Fiber Types and What Training Changes",
      estMinutes: 6,
      content:
        "Muscle fibers sit on a spectrum. At one end are slow fibers: small, rich in the machinery that uses oxygen, slow to fatigue and modest in force. At the other end are fast fibers: larger, powerful, quick to fatigue, and the ones that make a jump or a sprint. Between them sit fibers that can lean either way depending on how they are trained. Every muscle in every athlete has a mix, and the mix differs by muscle and by person. A postural muscle in the calf is mostly slow; the muscles that extend the hip in a sprinter are often weighted fast.\n\nThe mix is largely inherited and that is worth saying plainly to athletes and parents, because it explains why two athletes doing the same program end up with different gifts. What training changes is how the fibers behave rather than what they are. Endurance work makes fast fibers more fatigue-resistant and improves their aerobic machinery; heavy and explosive work makes the intermediate fibers behave more like fast ones, growing them and speeding their contraction. Prolonged, high-volume, low-intensity work can push the spectrum the other way, which is the physiological reason a sprinter's coach protects them from long slow running.\n\nFor the coach, the practical reading is about matching the work to the fiber you want to develop. Fast fibers are reached by heavy loads, by fast movement with intent, and by sets taken near failure where the slow fibers are exhausted and the fast ones are forced to take over. Slow fibers and the aerobic quality of all fibers are reached by sustained work at a pace the athlete can hold. A program that lives in the middle, moderate load and moderate pace and moderate volume, develops neither end particularly well. Most athletes in most sports need both ends and a coach who keeps them separate in the week.\n\nFibre type also explains individual recovery. Athletes weighted toward fast fibers fatigue faster in a session, take longer to recover from heavy work, and often perform badly on high-volume days that a slow-fiber teammate shrugs off. When one athlete on a team consistently needs more rest between heavy days, that is not softness. It is biology, and the program should bend to it.",
    },
    {
      lessonNumber: 3,
      title: "Neural First, Then Size",
      estMinutes: 7,
      content:
        "Strength comes from two sources that develop on different clocks. The nervous system adapts first: within the first weeks of a new program an athlete recruits more motor units, fires them faster, coordinates the muscles around a joint better and switches off the muscles that were fighting the movement. These changes are large, fast and specific to the movements being trained. A novice can add a great deal to a squat in six weeks without a visible change in leg size, and this is why.\n\nMuscle growth arrives later and more slowly. Fibers add contractile material when they are asked, repeatedly, to produce force near their limit, and the signal is strongest when sets are taken close to the point where another good rep is not possible. Growth needs enough total work across the week, enough protein, enough sleep, and months rather than weeks. For a high-school athlete, the first season of real training is mostly neural; the muscle shows up in the second and third.\n\nThis changes how a coach reads progress and how a program is built. Early on, numbers climbing is the nervous system learning, so the priority is clean patterns under loads the athlete controls, because what is being learned at that stage is the pattern itself. The specificity cuts both ways: a stronger squat does not make a stronger single-leg hop until the hop is trained, because the coordination is different. Later, when neural gains plateau, more volume near effort is what moves things, and that is when a program that stayed conservative on sets starts to stall.\n\nThere is one more practical consequence. Because neural gains are specific, variety has a cost early on. A beginner who changes exercises every week is starting the neural learning over each time and never reaches the point where load can climb. Keep the main movements stable for a block and let the pattern be learned. Variety is a tool for the experienced athlete who has learned the patterns and needs a new stimulus, not for the beginner who has not yet learned the first one.",
    },
    {
      lessonNumber: 4,
      title: "The Force-Velocity Curve in the Weight Room",
      estMinutes: 6,
      content:
        "Muscle produces different amounts of force depending on how fast it is moving. At one end, a muscle lengthening under load, the eccentric, can produce more force than it can when holding still, which is why athletes can lower a weight they cannot lift and why lowering is where soreness comes from. Holding still comes next. Shortening slowly produces less, and shortening fast produces least, which is why a maximal lift moves slowly whether the athlete wants it to or not. Plotted, this is the force-velocity curve, and every training tool sits somewhere on it.\n\nHeavy lifts train the high-force, low-velocity end. Jumps, throws and sprints train the high-velocity, low-force end. Loaded jumps, Olympic-style lifts and medium loads moved fast sit in the middle. Power, which most sports actually want, is force multiplied by velocity and peaks in the middle of the curve. An athlete who only lifts heavy pushes the curve up on the force end and may not get faster; an athlete who only jumps pushes the velocity end and may not have the strength to express it. The curve is moved as a whole by training both ends.\n\nFor a coach the question on every exercise is which part of the curve it trains, and whether the athlete is weak there. A strong athlete who jumps poorly needs velocity work; a fast athlete who cannot squat their bodyweight needs force work. A novice usually needs force first, because a base of strength is what makes the velocity work productive and safe. Reading an athlete's profile this way is more useful than any single test number.\n\nEccentric strength deserves a last word. Because muscle is strongest lengthening, controlled lowering is a powerful stimulus and the most common cause of soreness. It is also what absorbs landings, decelerations and cuts. An athlete who cannot control the lowering phase of a squat is an athlete who cannot control a landing, which is a connection worth explaining to a team that thinks the lowering does not count.",
    },
  ],
  quizQuestions: [
    q(0, "In what order does the body recruit motor units as force demand rises?", [
      ["Small units first, larger units added as demand increases", "Correct. That ordering is why heavy loads and maximal intent are what reach the largest, most powerful units."],
      ["Largest units first, then smaller ones for precision", "The order runs the other way; the big units are reserved for high demand."],
      ["All units at once on every effort", "If that were true, no effort could be gentle; recruitment is graded."],
      ["Randomly, depending on the athlete's mood", "Recruitment order is physiological, not a matter of mood."],
    ], 0),
    q(1, "A beginner's squat climbs sharply in the first six weeks with no visible change in leg size. What is the main reason?", [
      ["Neural adaptation: more units recruited, faster firing, better coordination", "Correct. The nervous system adapts within weeks; muscle growth takes months."],
      ["Rapid muscle growth that is hard to see", "Growth is slow and comes later; early gains are mostly neural."],
      ["The bar has become lighter through practice", "No; the athlete's system has become better at producing force."],
      ["Improved flexibility alone", "Mobility can help, but the main driver of early strength is neural."],
    ], 0),
    q(2, "Which kind of work reaches the fast fibers most reliably?", [
      ["Heavy loads, fast movement with intent, or sets taken near failure", "Correct. Each one creates a demand the slow fibers cannot meet alone."],
      ["Long, slow, continuous running", "That develops the slow fibers and aerobic qualities, and can shift the spectrum away from fast."],
      ["Moderate loads at a moderate pace", "The middle often recruits neither end fully; it is the least specific stimulus."],
      ["Stretching", "Stretching does not recruit fibers for force production."],
    ], 0),
    q(3, "Why does changing exercises every week slow a beginner's progress?", [
      ["Early strength gains are specific to the movement, so each change restarts the learning", "Correct. The pattern has to be learned before load can climb; variety is a tool for later."],
      ["Beginners get bored with new movements", "Boredom is not the issue; specificity of neural learning is."],
      ["New exercises are always more dangerous", "Risk depends on load and technique, not novelty alone."],
      ["It does not; beginners should change exercises weekly", "The track says the opposite: keep the main movements stable for a block."],
    ], 0),
    q(4, "Where on the force-velocity curve does power peak?", [
      ["In the middle, where force and velocity are both moderate", "Correct. Power is force times velocity, and the product is largest in the middle."],
      ["At the heaviest load", "Force is highest there but velocity is near zero, so power is low."],
      ["At the fastest, lightest movement", "Velocity is highest but force is low, so power is low."],
      ["Power is the same at every point", "The product changes along the curve; it peaks in the middle."],
    ], 0),
    q(5, "A fast athlete cannot squat their own bodyweight. What does the curve suggest?", [
      ["They need force work; a strength base is what lets velocity be expressed", "Correct. The force end is the weak end, and it limits what the fast end can do."],
      ["More jumping, since they are already fast", "That trains the end they are already strong on."],
      ["Nothing; speed is all that matters", "Without a strength base the velocity work is less productive and less safe."],
      ["Only stretching", "Mobility does not address a force deficit."],
    ], 0),
    q(6, "Why is an athlete able to lower a weight they cannot lift?", [
      ["Muscle produces more force while lengthening than while shortening", "Correct. The eccentric is the strongest part of the curve, and also where soreness comes from."],
      ["Gravity helps on the way down", "Gravity acts in both phases; the difference is in the muscle's force capacity by velocity."],
      ["The weight is lighter at the bottom", "No; the muscle's capacity differs, not the weight."],
      ["They cannot; lowering and lifting are equal", "They are not equal, which is the point of the lesson."],
    ], 0),
    q(7, "One athlete on the team consistently needs more rest after heavy days than teammates. What is the most likely reading?", [
      ["A fiber-type difference; the program should bend to it", "Correct. Athletes weighted toward fast fibers fatigue faster and recover slower from heavy work."],
      ["Laziness", "Individual recovery differences are biological, not a character flaw."],
      ["They are lifting wrong", "Technique can matter, but a consistent recovery difference points to biology."],
      ["They need more heavy days to adapt", "Adding heavy days to an athlete who recovers slowly is how overtraining starts."],
    ], 0),
  ],
};
