import { keyPoints, type ForgeClassContent } from "./types";

/** Pitching: Building a Complete Pitcher (2026-10-04). Six chapters, each with a drill day
 * from the Pitching and Throwing drills in the skill library, a quiz of mixed shapes and a
 * set of flashcards. Written for a high-school pitcher. No velocity or accuracy claim is
 * made for any camera number anywhere in it. */
export const PITCHING_CLASS: ForgeClassContent = {
  name: "Pitching: Building a Complete Pitcher",
  description:
    "Six chapters on becoming a pitcher rather than a thrower: a repeatable delivery, an arm that lasts, fastball command first, off-speed that changes a hitter's timing, and the game management that wins innings.",
  category: "Pitching",
  readingLevel: "high_school",
  chapters: [
    {
      title: "What Pitching Actually Is",
      description:
        "Throwing hard is a skill. Pitching is a different one: putting the right pitch in the right place, pitch after pitch, while a hitter tries to beat you. This chapter sets the frame for everything that follows.",
      drills: ["Overhand Throwing Mechanics", "Long Toss for Pitchers", "Mound Repeat Drill"],
      content: [
        {
          title: "Throwers and Pitchers",
          body:
            "Every pitcher starts as a thrower. A thrower has an arm, and the arm decides what happens. A pitcher has a plan, and the arm carries it out.\n\nThe difference shows up in the box score, not on the radar gun. Two pitchers can throw the same speed and have completely different seasons, because one of them knows where the ball is going and why. The hitter does not care how hard you throw if the pitch is where he wants it.\n\nThis class is about becoming the second kind. The arm still matters, and we will train it. But the arm serves the plan, not the other way round.",
        },
        {
          title: "The Three Things Every Pitch Needs",
          body:
            "Strip pitching down and every pitch needs three things.\n\n**Location.** Where the ball crosses the plate, or where it would if the hitter let it. A fastball on the corner at the knees is a different pitch from the same fastball down the middle, even though the arm did the same thing.\n\n**Movement.** What the ball does on the way: the run of a two-seam fastball, the fade of a changeup, the break of a curve. Movement is what makes a hitter's bat arrive at the wrong place.\n\n**Timing.** When the ball gets there compared with when the hitter expected it. A changeup works because the hitter's swing is already started when the ball is still on its way.\n\nVelocity helps with the third one, and that is the only place it helps on its own. A pitcher who can command location, add movement and change timing is dangerous at any speed.",
        },
        {
          title: "Command Comes First",
          body:
            "The order this class teaches is deliberate: delivery, arm care, fastball command, then off-speed, then game management. Command sits in the middle on purpose, because everything before it builds it and everything after it depends on it.\n\nA breaking ball you cannot throw for a strike is a pitch the hitter can ignore. A changeup you cannot keep down is batting practice. Hitters at every level are taught to look fastball and adjust; the pitcher who can put a fastball where he wants it takes that plan away from them.\n\nSo the first number that matters in a bullpen is not velocity. It is how many of your fastballs landed where the catcher set up. Count that, every session, and watch the number move.",
        },
        {
          title: "The Mound Is a Different Place",
          body:
            "A lot of young pitchers throw beautifully in catch and fall apart on the mound. The mound adds three things: a slope, a target, and a consequence.\n\nThe slope changes your balance. Everything you do flat has to be rebuilt downhill, which is why the delivery chapter spends so long on balance and weight transfer.\n\nThe target narrows your attention. In catch you throw to a person; on the mound you throw to a glove the size of a dinner plate, and a miss by a foot is a ball.\n\nThe consequence is the hitter. Nothing in practice can fully reproduce a real at-bat, but the drills in this class move you closer to it one step at a time: catch, then flat-ground, then the mound with no hitter, then the mound with one.\n\nYour first assignment is a baseline bullpen: twenty fastballs to a catcher, and you write down how many hit the glove's spot. That number is where you start, and the last chapter asks you to compare it with where you end.",
        },
        keyPoints([
          "A thrower's arm decides; a pitcher's plan decides and the arm carries it out.",
          "Every pitch needs location, movement and timing. Velocity helps timing and nothing else on its own.",
          "Command comes first: an off-speed pitch you cannot throw for a strike is a pitch the hitter ignores.",
          "The mound adds a slope, a target and a consequence. Build toward it one step at a time.",
          "Your baseline: twenty fastballs, count the ones that hit the spot.",
        ]),
      ],
      flashcards: [
        { front: "What separates a pitcher from a thrower?", back: "A pitcher has a plan for each pitch and the arm carries it out. A thrower lets the arm decide." },
        { front: "The three things every pitch needs", back: "Location, movement and timing." },
        { front: "What does velocity help with on its own?", back: "Timing only. It does not give you location or movement." },
        { front: "Why does command come before off-speed in this class?", back: "A breaking ball or changeup you cannot throw for a strike can be ignored by the hitter." },
        { front: "What does the mound add that flat ground does not?", back: "A slope, a target and a consequence (the hitter)." },
        { front: "The first number to count in a bullpen", back: "How many fastballs hit the catcher's spot, not how hard they were thrown." },
      ],
      quizQuestions: [
        {
          questionText: "According to this chapter, what is the difference between a thrower and a pitcher?",
          answers: [
            { answerText: "A pitcher has a plan for every pitch and the arm carries it out; a thrower lets the arm decide.", isCorrect: true, explanation: "That is the frame for the whole class: the arm serves the plan." },
            { answerText: "A pitcher throws harder than a thrower.", isCorrect: false, explanation: "Velocity is not the difference. Two pitchers at the same speed can have very different seasons." },
            { answerText: "A thrower plays the outfield and a pitcher plays on the mound.", isCorrect: false, explanation: "The chapter is about how a pitcher thinks, not what position they play." },
            { answerText: "There is no real difference.", isCorrect: false, explanation: "The chapter argues the difference shows up in the box score." },
          ],
        },
        {
          questionText: "Every pitch needs location, movement and ___.",
          questionType: "fill_blank",
          payload: { accepted: ["timing"], explanation: "Location, movement and timing. Velocity only helps the third one on its own." },
        },
        {
          questionText: "Why does this class teach fastball command before off-speed pitches?",
          answers: [
            { answerText: "Because an off-speed pitch you cannot throw for a strike is a pitch the hitter can ignore.", isCorrect: true, explanation: "Hitters are taught to look fastball and adjust; command of the fastball takes that plan away." },
            { answerText: "Because off-speed pitches are illegal before high school.", isCorrect: false, explanation: "The chapter says nothing about rules; it is about what makes off-speed pitches work." },
            { answerText: "Because the fastball is the hardest pitch to learn.", isCorrect: false, explanation: "The reason given is about what off-speed pitches depend on, not difficulty." },
            { answerText: "Because coaches only count fastballs.", isCorrect: false, explanation: "Coaches count what lands on the spot, and the chapter asks you to do the same." },
          ],
        },
        {
          questionText: "Put the practice progression toward a real at-bat in the order the chapter gives.",
          questionType: "ordering",
          payload: { items: ["Catch", "Flat-ground", "The mound with no hitter", "The mound with a hitter"], explanation: "Each step adds one of the things the mound brings: the slope, the target, then the consequence." },
        },
        {
          questionText: "What is your baseline assignment in this chapter?",
          answers: [
            { answerText: "Twenty fastballs to a catcher, counting how many hit the glove's spot.", isCorrect: true, explanation: "That count is where you start, and Chapter 6 asks you to compare it with where you end." },
            { answerText: "A radar-gun reading of your hardest fastball.", isCorrect: false, explanation: "The chapter says the first number that matters is not velocity." },
            { answerText: "Fifty curveballs in a row.", isCorrect: false, explanation: "Off-speed pitches come later, once the fastball is commanded." },
            { answerText: "A full game pitched without a walk.", isCorrect: false, explanation: "The baseline is a bullpen measurement, not a game outcome." },
          ],
        },
      ],
    },
    {
      title: "The Delivery: Balance, Transfer, Stride",
      description:
        "A delivery you can repeat is the foundation of command. This chapter walks through the delivery from the rocker step to the finish and explains what each piece is for.",
      drills: ["Balance Point Drill", "Rocker Drill (Weight Transfer)", "Stride Length Drill", "Towel Drill"],
      content: [
        {
          title: "Repeatable Beats Perfect",
          body:
            "No two good deliveries look exactly alike. Watch ten pitchers at the top of the game and you will see ten different arm slots, leg lifts and tempos. What they share is not a shape. It is that each of them does the same thing every time.\n\nA delivery you can repeat lets you fix one thing at a time. If every pitch comes out of the same motion, a miss tells you something: the arm was late, the front side flew open, the stride landed closed. If every pitch comes out of a different motion, a miss tells you nothing, because everything changed.\n\nSo the goal of this chapter is not the perfect delivery. It is yours, repeated.",
        },
        {
          title: "Balance Point and the Leg Lift",
          body:
            "The delivery starts with a small rocker step back, then the leg lift. At the top of the lift you reach the balance point: weight stacked over the back leg, head over the belly button, the lifted knee quiet.\n\nThe balance point is not a pose to hold. In a real pitch you move through it. But a pitcher who cannot find it on purpose will not pass through it by accident, which is why the Balance Point Drill has you pause there. If you fall toward the plate before the knee reaches its height, the rest of the delivery is a chase.\n\nTwo checks: your head should not drift toward first or third base during the lift, and your lifted foot should hang under the knee rather than kicking out. Both drifts cost you the straight line to the plate.",
        },
        {
          title: "Weight Transfer and the Stride",
          body:
            "From the balance point the body moves down the mound. This is the weight transfer: the hips lead toward the plate while the upper body stays back, which stretches the body like a rubber band. The Rocker Drill isolates this feeling: back leg loads, hips go, the arm waits.\n\nThe stride is where that motion lands. Three things decide whether it helps or hurts.\n\n**Length.** Most pitchers stride somewhere around their own height. Too short and the body has nowhere to go; too long and the front leg cannot brace.\n\n**Direction.** The front foot lands on a line to the target, toes slightly closed. Landing open (toward the glove side) opens the hips early and the arm drags behind.\n\n**Firmness.** The front leg lands bent and then firms up. That brace is what stops the body so the arm can whip through.",
        },
        {
          title: "The Arm Path and the Finish",
          body:
            "The arm's job is to be on time. When the front foot lands, the throwing hand should be up, roughly at head height with the ball facing away from the target. Early and the arm fights the body; late and the shoulder takes the strain.\n\nThe Towel Drill trains the path and the finish without a ball: a towel in the throwing hand, a target held out in front at full extension, and the goal of snapping the towel onto the target every rep. It teaches the body to get out over the front leg and finish long instead of pulling off.\n\nThe finish tells the truth about the delivery. A pitcher who finishes square to the plate, chest over the front knee, glove tucked, with the throwing arm finishing across the body, has done the work in order. A pitcher who falls off toward first base has opened early and the ball probably ran arm-side.\n\nWatch your own finish on video from the side and from behind. The camera does not have to measure anything to show you where you landed.",
        },
        keyPoints([
          "Repeatable beats perfect. A delivery that repeats lets you fix one thing at a time.",
          "The balance point is weight over the back leg with a quiet knee, passed through, not posed.",
          "Weight transfer: hips lead, upper body waits, the body stretches like a band.",
          "The stride needs length (about your height), direction (on line, slightly closed) and a firm brace.",
          "The arm is on time when the hand is up at foot strike. The finish shows whether the delivery was in order.",
        ]),
      ],
      flashcards: [
        { front: "What do all good deliveries share?", back: "Not a shape. Each pitcher repeats their own delivery every time." },
        { front: "Describe the balance point", back: "Weight stacked over the back leg, head over the belly button, lifted knee quiet. Moved through, not held." },
        { front: "What leads the weight transfer?", back: "The hips go toward the plate while the upper body stays back." },
        { front: "Three things about the stride", back: "Length (about your height), direction (on line, toes slightly closed), firmness (the front leg braces)." },
        { front: "Where should the throwing hand be at foot strike?", back: "Up, roughly head height, ball facing away from the target." },
        { front: "What does falling off toward first base tell you?", back: "The front side opened early; the ball probably ran arm-side." },
      ],
      quizQuestions: [
        {
          questionText: "Why does the chapter prefer a repeatable delivery over a perfect one?",
          answers: [
            { answerText: "Because a repeated delivery makes every miss mean something, so you can fix one thing at a time.", isCorrect: true, explanation: "If everything changes on every pitch, a miss tells you nothing." },
            { answerText: "Because perfect deliveries are against the rules.", isCorrect: false, explanation: "Rules have nothing to do with it." },
            { answerText: "Because every good pitcher has the same delivery.", isCorrect: false, explanation: "The chapter says the opposite: ten pitchers, ten different deliveries." },
            { answerText: "Because repeating is easier than practising.", isCorrect: false, explanation: "Repeating a delivery is the practice." },
          ],
        },
        {
          questionText: "At the balance point, your weight is stacked over the ___ leg.",
          questionType: "fill_blank",
          payload: { accepted: ["back", "rear", "back leg", "rear leg", "drive"], explanation: "Weight over the back leg, head over the belly button, knee quiet." },
        },
        {
          questionText: "Match each stride fault with what it costs you.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Stride too short", right: "The body has nowhere to go" },
              { left: "Stride too long", right: "The front leg cannot brace" },
              { left: "Landing open", right: "Hips open early, the arm drags" },
            ],
            explanation: "Length, direction and firmness are the three things that decide whether the stride helps.",
          },
        },
        {
          questionText: "Where should the throwing hand be when the front foot lands?",
          answers: [
            { answerText: "Up, about head height, with the ball facing away from the target.", isCorrect: true, explanation: "That is what being on time means for the arm." },
            { answerText: "Down by the hip, about to start forward.", isCorrect: false, explanation: "That is late, and late is what strains the shoulder." },
            { answerText: "Already past the head and releasing.", isCorrect: false, explanation: "That is early, and the arm then fights the body." },
            { answerText: "Tucked into the glove.", isCorrect: false, explanation: "The glove hand tucks on the finish; the throwing hand is up at foot strike." },
          ],
        },
        {
          questionText: "What does the Towel Drill train?",
          answers: [
            { answerText: "The arm path and a long finish out over the front leg, without a ball.", isCorrect: true, explanation: "Snapping the towel onto a target at full extension teaches the body not to pull off." },
            { answerText: "Grip pressure on the changeup.", isCorrect: false, explanation: "The changeup is Chapter 5." },
            { answerText: "Pickoff moves.", isCorrect: false, explanation: "Pickoffs are Chapter 6." },
            { answerText: "Running between starts.", isCorrect: false, explanation: "The towel drill is a delivery drill." },
          ],
        },
      ],
    },
    {
      title: "The Arm That Lasts",
      description:
        "An arm is built, not spent. This chapter covers how throwing volume works, what long toss is for, the warm-up and the arm-care work that let a pitcher throw all season.",
      drills: ["Long Toss Progression", "Reverse Throws (Arm Care)", "One-Knee Throwing Drill", "Long Toss for Pitchers"],
      content: [
        {
          title: "Volume Is a Dial, Not a Switch",
          body:
            "The arm adapts to what you ask of it, as long as you ask gradually. Throw a little more each week and the tissue gets stronger. Throw a lot more all at once and something gives.\n\nThat is the whole principle behind pitch counts, rest days between outings and the slow build of a throwing program before the season. None of it is about being soft. It is about the dial: turn it up slowly and the arm follows; slam it and the arm does not.\n\nThe pitchers who throw the most innings in a career are rarely the ones who threw the most innings at fifteen. Keep a simple log of what you threw each day: how many, how far, how hard. The log is how you see the dial moving.",
        },
        {
          title: "What Long Toss Is For",
          body:
            "Long toss is throwing at increasing distance, then coming back in. It does two different jobs depending on which half you are in.\n\nGoing out, the throws get longer and the arc gets higher. This stretches the arm out, builds the whole throwing motion and lets the arm work at full range without the strain of a flat, hard throw.\n\nComing back in, the distance shortens but the intent stays up: throws stay on a line, and the last throws at sixty feet feel like pitches. That is where the strength built on the way out turns into something you can use on the mound.\n\nThe Long Toss Progression in the drill library sets the distances. Go out only as far as you can throw with your normal mechanics. The moment you start lunging or dropping the elbow to reach a distance, you are past the useful point.",
        },
        {
          title: "Warm-Up and Arm Care",
          body:
            "You warm up to throw; you do not throw to warm up. Before the first throw the body should already be warm: a jog, dynamic stretches, some arm circles and band work. Cold tissue is where injuries start.\n\nAfter throwing, the arm-care work is what makes tomorrow possible. The Reverse Throws drill works the back of the shoulder, the muscles that slow the arm down after release. Every throw asks those muscles to stop a fast-moving arm, and they are the ones that fatigue first and get hurt most.\n\nThe One-Knee Throwing Drill belongs here too: it takes the legs out and lets you feel the arm path on its own, which is useful early in a session and on light days.",
        },
        {
          title: "Pain, Soreness and Knowing the Difference",
          body:
            "Soreness is dull, spread out, shows up the next day and fades with warming up. It is the arm telling you it worked.\n\nPain is sharp, located in one spot, shows up during a throw or right after, and does not fade with warming up. It is the arm telling you to stop.\n\nThe mistake young pitchers make is treating pain as something to throw through. There is no outing worth the rest of a season. If it is sharp and in one spot, especially on the inside of the elbow or the front of the shoulder, you stop that day and tell your coach, and somebody who knows arms looks at it.\n\nNothing in this class, and nothing Forge measures, replaces that conversation. The app can hold your throwing log; it cannot tell you whether your elbow is fine.",
        },
        keyPoints([
          "The arm adapts to gradual increases. Turn the dial up slowly; never slam it.",
          "Long toss builds range going out and turns it into usable intent coming back in. Stop going out when mechanics change.",
          "Warm up to throw, never the other way round. Arm-care work after throwing is what makes tomorrow possible.",
          "Soreness is dull, spread out and fades with warming up. Pain is sharp, in one spot and does not. Pain means stop and tell your coach.",
        ]),
      ],
      flashcards: [
        { front: "How does the arm respond to throwing volume?", back: "It adapts to gradual increases. A sudden jump is what gets hurt." },
        { front: "The two halves of long toss", back: "Going out: longer, higher arc, builds range. Coming back: shorter, on a line, builds usable intent." },
        { front: "When to stop going out in long toss", back: "The moment you lunge or drop the elbow to reach the distance." },
        { front: "Warm up to throw, or throw to warm up?", back: "Warm up to throw. The body is already warm before the first throw." },
        { front: "What do Reverse Throws work?", back: "The back of the shoulder, the muscles that slow the arm down after release." },
        { front: "Soreness versus pain", back: "Soreness: dull, spread out, fades with warming up. Pain: sharp, one spot, does not fade. Pain means stop." },
      ],
      quizQuestions: [
        {
          questionText: "What is the principle behind pitch counts and rest days?",
          answers: [
            { answerText: "The arm adapts to gradual increases in work and breaks down under sudden ones.", isCorrect: true, explanation: "The dial, not the switch." },
            { answerText: "Pitchers get bored after a hundred pitches.", isCorrect: false, explanation: "Not what the chapter says." },
            { answerText: "Umpires require them.", isCorrect: false, explanation: "League rules exist, but the chapter explains why they make sense for the arm." },
            { answerText: "Rest days are only for pitchers who are hurt.", isCorrect: false, explanation: "Rest is part of how a healthy arm adapts." },
          ],
        },
        {
          questionText: "Match each half of long toss with its job.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Going out", right: "Stretch the arm and build range with a higher arc" },
              { left: "Coming back in", right: "Keep the intent up and throw on a line" },
            ],
            explanation: "The strength built going out becomes usable on the way back.",
          },
        },
        {
          questionText: "You warm up to ___; you do not throw to warm up.",
          questionType: "fill_blank",
          payload: { accepted: ["throw", "pitch"], explanation: "The body is already warm before the first throw." },
        },
        {
          questionText: "Which of these describes pain rather than soreness?",
          answers: [
            { answerText: "Sharp, in one spot, shows up during a throw and does not fade with warming up.", isCorrect: true, explanation: "That is the signal to stop and tell your coach." },
            { answerText: "Dull, spread across the arm, shows up the next day.", isCorrect: false, explanation: "That is soreness: the arm telling you it worked." },
            { answerText: "Fades after ten minutes of throwing.", isCorrect: false, explanation: "Fading with warming up is a sign of soreness, not pain." },
            { answerText: "Only happens on cold days.", isCorrect: false, explanation: "Cold raises injury risk, but the chapter's test is about how the feeling behaves." },
          ],
        },
        {
          questionText: "What do the Reverse Throws work, and why does it matter?",
          answers: [
            { answerText: "The back of the shoulder, which slows the arm down after every release and fatigues first.", isCorrect: true, explanation: "Those muscles get hurt most, so they get the arm-care work." },
            { answerText: "The fingers, for grip strength.", isCorrect: false, explanation: "Grip is not what the drill is for." },
            { answerText: "The legs, for the stride.", isCorrect: false, explanation: "That is the delivery chapter." },
            { answerText: "Nothing; it is a warm-up game.", isCorrect: false, explanation: "It is arm-care work done after throwing." },
          ],
        },
      ],
    },
    {
      title: "Fastball Command",
      description:
        "The fastball is the pitch everything else is built on. This chapter is about putting it where you want it: grip, target, the glove-side pitch most pitchers avoid, and how to run a bullpen that actually moves the number.",
      drills: ["4-Seam Grip Accuracy Drill", "Bullpen Session - Fastball Command", "Glove-Side Command Drill", "Mound Repeat Drill"],
      content: [
        {
          title: "Grip and the Straight Line",
          body:
            "The four-seam fastball is the straightest pitch you have, which is why it is the one to command first. The grip is two fingers across the horseshoe of the seams, thumb underneath, the ball held out in the fingers rather than jammed in the palm. Pressure comes from the fingertips.\n\nA ball held too deep in the hand comes out slow and heavy. A ball held too loosely sails. The 4-Seam Grip Accuracy Drill is where you find the pressure that produces a straight, true spin, and the test is simple: does the ball go where the fingers pointed?\n\nEvery fastball in this chapter is a four-seamer unless your coach says otherwise. Movement pitches come after you can throw a straight one on purpose.",
        },
        {
          title: "Throw to a Spot, Not a Zone",
          body:
            "\"Throw strikes\" is advice that produces pitches down the middle. The strike zone is a big target and a pitch anywhere in it counts, so a pitcher told to throw strikes aims at the whole thing and the misses land in the fat part.\n\nAim small. The target is the catcher's glove, and the catcher's glove is set on a corner or at the knees. If you miss a small target by a little you are still on the edge of the zone. If you miss a big target by a little you are in the middle of it.\n\nIn the Bullpen Session for fastball command, the catcher moves the glove every few pitches: low and away, low and in, up, then back. You throw to the glove, not the plate. Count the pitches that land within a glove's width of the spot. That count is the number from Chapter 1, and it should climb across the season.",
        },
        {
          title: "The Glove-Side Pitch",
          body:
            "Most pitchers find it easy to throw to the arm side (inside to a same-handed hitter) and hard to throw to the glove side (away from a same-handed hitter). The reason is in the delivery: the arm naturally finishes across the body, and a pitcher who opens early will pull everything arm-side.\n\nHitters know this. A pitcher who only lives arm-side is a pitcher the hitter can lean toward.\n\nThe Glove-Side Command Drill works the pitch most pitchers avoid. The cues are to stay closed a beat longer, let the front shoulder point at the target through foot strike, and finish out over the front leg rather than falling off. If the pitch keeps running back toward the middle, the front side is opening early. Go back to the Towel Drill for a few reps and come back.",
        },
        {
          title: "Running a Bullpen That Means Something",
          body:
            "A bullpen with no plan is just throwing. A bullpen with a plan is practice.\n\nBefore you start, decide what the session is for: a count to hit, a spot to work, a pitch to add. Warm up fully first. Then throw the session the way you would pitch an inning: a target on every pitch, a breath between pitches, the same pre-pitch routine every time.\n\nThe Mound Repeat Drill is the engine of it: the same pitch to the same spot until the misses are small and the same direction, then move the spot. Repeating a miss in one direction is useful information; a spray of misses in every direction means the delivery is changing and the drill to run is from Chapter 2, not this one.\n\nEnd the session with ten pitches at game intent to the catcher's spot and write down the count. Thirty to forty pitches is plenty for a between-start bullpen. More is not better; it is just more.",
        },
        keyPoints([
          "Command the four-seamer first: fingertips across the horseshoe, the ball out in the fingers, a straight spin.",
          "Aim at the glove, never the zone. A small miss off a small target is still a corner.",
          "The glove-side pitch is the one hitters bet you cannot throw. Stay closed a beat longer and finish over the front leg.",
          "A bullpen has a purpose, a target on every pitch, and a count at the end. Thirty to forty pitches is enough.",
        ]),
      ],
      flashcards: [
        { front: "Four-seam fastball grip", back: "Two fingers across the horseshoe, thumb under, ball out in the fingers, pressure from the fingertips." },
        { front: "Why aim at the glove instead of the zone?", back: "A small miss off a small target is still on a corner; a small miss off the whole zone is down the middle." },
        { front: "Which side is hard for most pitchers?", back: "The glove side (away from a same-handed hitter), because opening early pulls everything arm-side." },
        { front: "Cues for the glove-side pitch", back: "Stay closed a beat longer, front shoulder at the target through foot strike, finish over the front leg." },
        { front: "What does a spray of misses in every direction mean?", back: "The delivery is changing. Go back to the Chapter 2 drills." },
        { front: "How many pitches in a between-start bullpen?", back: "Thirty to forty. More is just more." },
      ],
      quizQuestions: [
        {
          questionText: "Why does \"throw strikes\" tend to produce pitches down the middle?",
          answers: [
            { answerText: "The zone is a big target, so the pitcher aims at all of it and the misses land in the fat part.", isCorrect: true, explanation: "Aim small: the glove, set on a corner." },
            { answerText: "Because umpires only call strikes down the middle.", isCorrect: false, explanation: "Not what the chapter says." },
            { answerText: "Because fastballs cannot be thrown to a corner.", isCorrect: false, explanation: "The whole chapter is about throwing them to a corner." },
            { answerText: "Because catchers always set up in the middle.", isCorrect: false, explanation: "In the bullpen session the catcher moves the glove every few pitches." },
          ],
        },
        {
          questionText: "The four-seam grip holds the ball out in the fingers, with pressure from the ___.",
          questionType: "fill_blank",
          payload: { accepted: ["fingertips", "finger tips", "tips of the fingers"], explanation: "A ball jammed in the palm comes out slow and heavy." },
        },
        {
          questionText: "Why is the glove-side pitch harder for most pitchers?",
          answers: [
            { answerText: "The arm naturally finishes across the body, and opening early pulls everything arm-side.", isCorrect: true, explanation: "Which is why the cues are about staying closed and finishing over the front leg." },
            { answerText: "The glove gets in the way.", isCorrect: false, explanation: "The glove side is a direction, not an obstacle." },
            { answerText: "It is a different grip.", isCorrect: false, explanation: "Same four-seam grip, different target." },
            { answerText: "It is not harder; the chapter says both sides are the same.", isCorrect: false, explanation: "The chapter says most pitchers find it hard, and hitters know it." },
          ],
        },
        {
          questionText: "Put the steps of a bullpen that means something in order.",
          questionType: "ordering",
          payload: {
            items: ["Decide what the session is for", "Warm up fully", "Throw with a target and a routine on every pitch", "Ten pitches at game intent, write down the count"],
            explanation: "A bullpen with no plan is just throwing.",
          },
        },
        {
          questionText: "Your misses in the Mound Repeat Drill are all running arm-side by about the same amount. What does that tell you?",
          answers: [
            { answerText: "Something useful: a repeated miss in one direction points at one fault to fix.", isCorrect: true, explanation: "A spray in every direction would mean the delivery is changing; one direction means one thing." },
            { answerText: "Nothing; misses are random.", isCorrect: false, explanation: "A consistent miss is information." },
            { answerText: "You need a new glove.", isCorrect: false, explanation: "Equipment is not the point." },
            { answerText: "You should throw harder.", isCorrect: false, explanation: "Velocity does not fix direction." },
          ],
        },
      ],
    },
    {
      title: "Off-Speed: Changing the Hitter's Clock",
      description:
        "A changeup and a breaking ball exist to do one thing: make the hitter's swing arrive at the wrong time or the wrong place. This chapter teaches both from the fastball outward, and when to use them.",
      drills: ["Change-Up Grip and Feel Drill", "Curveball Spin Drill", "Bullpen Session - Off-Speed Mix", "Glove-Side Command Drill"],
      content: [
        {
          title: "Everything Looks Like the Fastball",
          body:
            "An off-speed pitch works only if the hitter thinks it is a fastball for as long as possible. That means the same arm speed, the same arm slot, the same delivery, the same release point. The only thing that changes is the grip, and the grip is the one thing the hitter cannot see.\n\nThis is why the delivery chapter came first. A pitcher who slows the arm to throw a changeup, or drops the elbow to throw a curve, is telling the hitter what is coming. Hitters at every level read arm speed and arm slot, and they are good at it.\n\nThe rule for every pitch in this chapter: throw it with fastball effort and let the grip do the work.",
        },
        {
          title: "The Changeup",
          body:
            "The changeup is the first off-speed pitch to learn, because it is the kindest to the arm and the most useful against the most hitters. It is a fastball thrown with a grip that takes speed off the ball, and it works on timing: the hitter's swing starts for a fastball and the ball is not there yet.\n\nThe common grips (circle change, three-finger) all do the same thing: the ball sits deeper in the hand, more fingers are on it, and the fingertips that drive a fastball are off it. The Change-Up Grip and Feel Drill is spent entirely on that feel. Play catch with it until the ball comes out with fastball arm speed and arrives soft.\n\nLocation matters as much as speed. A changeup at the knees or below is a swing-and-miss or a ground ball. A changeup up in the zone is a slow fastball, and hitters do not miss those.",
        },
        {
          title: "The Breaking Ball",
          body:
            "A curveball or slider works on movement: the ball leaves the hand on one line and arrives on another. The spin creates the break, and the spin comes from the fingers getting out in front of the ball at release rather than behind it.\n\nThe Curveball Spin Drill is about spin, not break. Throw it short, to a partner, and watch the ball: a tight, fast rotation with a red dot in the middle is what you are after. Break follows spin; chase the spin and the break arrives.\n\nTwo cautions. First, the elbow stays up through release; a dropped elbow to \"get around\" the ball is what hurts arms on breaking balls. Second, the pitch has to be thrown for a strike before it is thrown as a chase pitch, or the hitter learns to take it. Your coach decides when you are ready to add a breaking ball; some arms are ready at fifteen and some are not.",
        },
        {
          title: "Sequencing: When to Throw What",
          body:
            "Off-speed pitches are set up by the fastball. A changeup after a fastball in the same spot is a different pitch from a changeup after a changeup, because the hitter's clock is set by the last thing he saw.\n\nSome patterns that hold up at every level:\n\n- Establish the fastball early in the at-bat so the hitter has to respect it.\n- A changeup is best when the hitter is ahead in the count and sitting fastball.\n- A breaking ball for a strike early in the count is a pitch the hitter did not plan for.\n- Never throw the same off-speed pitch twice in a row to the same spot without a reason.\n\nThe Bullpen Session with the off-speed mix is where you practise sequences, not pitches: fastball away, changeup away, fastball in. Throw the pitches in the order you would use them in a game, and you will find out which sequences you can actually execute.",
        },
        keyPoints([
          "An off-speed pitch works only while the hitter thinks it is a fastball: same arm speed, slot, delivery and release. Only the grip changes.",
          "The changeup first: ball deeper in the hand, fastball effort, arrives soft, kept at the knees or below.",
          "A breaking ball is spin first and break second. Elbow up through release; thrown for a strike before it is a chase pitch.",
          "Sequence off the fastball. The hitter's clock is set by the last pitch he saw.",
        ]),
      ],
      flashcards: [
        { front: "What has to look identical on an off-speed pitch?", back: "Arm speed, arm slot, delivery and release point. Only the grip changes." },
        { front: "Which off-speed pitch comes first and why?", back: "The changeup: kindest to the arm, useful against the most hitters." },
        { front: "Where does a changeup have to be?", back: "At the knees or below. Up in the zone it is a slow fastball." },
        { front: "What does the Curveball Spin Drill chase?", back: "Tight, fast spin with a red dot in the middle. Break follows spin." },
        { front: "Breaking-ball safety cue", back: "Elbow up through release. A dropped elbow is what hurts arms." },
        { front: "What sets the hitter's clock?", back: "The last pitch he saw. Sequence off the fastball." },
      ],
      quizQuestions: [
        {
          questionText: "What is the one thing that changes between a fastball and a changeup thrown correctly?",
          answers: [
            { answerText: "The grip.", isCorrect: true, explanation: "Arm speed, slot, delivery and release all stay the same, so the hitter reads fastball." },
            { answerText: "The arm speed.", isCorrect: false, explanation: "Slowing the arm tells the hitter what is coming." },
            { answerText: "The arm slot.", isCorrect: false, explanation: "A different slot is a tell." },
            { answerText: "The stride length.", isCorrect: false, explanation: "The delivery is the same; only the grip changes." },
          ],
        },
        {
          questionText: "A breaking ball is ___ first and break second.",
          questionType: "fill_blank",
          payload: { accepted: ["spin"], explanation: "Chase the spin and the break arrives." },
        },
        {
          questionText: "Match the pitch with what it works on.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Changeup", right: "Timing: the swing starts and the ball is not there yet" },
              { left: "Curveball or slider", right: "Movement: leaves on one line, arrives on another" },
              { left: "Four-seam fastball", right: "The straight pitch everything is set up from" },
            ],
            explanation: "Location, movement and timing, from Chapter 1.",
          },
        },
        {
          questionText: "Where is a changeup most useful, according to the sequencing page?",
          answers: [
            { answerText: "When the hitter is ahead in the count and sitting fastball.", isCorrect: true, explanation: "The hitter's clock is set for a fastball; the changeup arrives late." },
            { answerText: "As the first pitch of every at-bat.", isCorrect: false, explanation: "The fastball is established first." },
            { answerText: "Twice in a row to the same spot.", isCorrect: false, explanation: "The chapter says never without a reason." },
            { answerText: "Only with two strikes.", isCorrect: false, explanation: "Count matters, but the chapter's rule is about what the hitter is sitting on." },
          ],
        },
        {
          questionText: "Why does the breaking-ball page say the pitch must be thrown for a strike before it is used as a chase pitch?",
          answers: [
            { answerText: "Because a hitter who never sees it in the zone learns to take it.", isCorrect: true, explanation: "A pitch the hitter can ignore is not a weapon." },
            { answerText: "Because umpires will not call it otherwise.", isCorrect: false, explanation: "Not the reason given." },
            { answerText: "Because strikes are worth more points.", isCorrect: false, explanation: "Baseball does not work that way." },
            { answerText: "Because chase pitches hurt the arm.", isCorrect: false, explanation: "The arm caution is about the elbow, not the location." },
          ],
        },
      ],
    },
    {
      title: "Managing the Game",
      description:
        "Pitching does not end at release. Holding runners, fielding your position, the pitch-by-pitch routine and knowing how to read your own outings are what turn good stuff into won innings. The last page returns to your Chapter 1 baseline.",
      drills: ["Slide Step Drill (Runners On)", "Pickoff Move Drill - First Base", "Fielding Position Drill (PFP)", "Bullpen Session - Fastball Command"],
      content: [
        {
          title: "Runners On: The Slide Step and the Pickoff",
          body:
            "With a runner on first, the delivery changes. The big leg lift that helps you with the bases empty gives a runner a free base, so pitchers work from the stretch and use a slide step: a short, quick lift that gets the ball to the plate faster.\n\nThe Slide Step Drill is about keeping your command when the delivery shortens. The danger is that the arm ends up late because the body moved early; the cue is the same as always, hand up at foot strike.\n\nThe pickoff move is the other half. It does not have to pick anyone off; it has to make the runner stop leaning. The Pickoff Move Drill works a quick, legal move to first with the same look as a pitch. Vary your timing from the set: hold the ball one second, then three, then one. A runner who cannot time you cannot steal on you.",
        },
        {
          title: "Fielding Your Position",
          body:
            "After release, you are an infielder. Comebackers, bunts, covering first on a ball to the right side, backing up bases on throws from the outfield: a pitcher who does these well saves himself runs that never show up in his line.\n\nThe Fielding Position Drill (PFP, pitchers' fielding practice) covers the three that matter most: fielding a ball in front of the mound and throwing to first, covering first on a ground ball to the first baseman, and fielding a bunt and knowing which base to throw to.\n\nThe finish from Chapter 2 matters here too. A pitcher who finishes square, balanced, glove up, is ready to field. A pitcher who falls off the mound is not.",
        },
        {
          title: "The Pitch-by-Pitch Routine",
          body:
            "An at-bat is a string of single pitches, and the best pitchers treat each one as its own job. The routine between pitches is what makes that possible.\n\nA simple one: get the ball back, step off or turn away, breathe out, look at the sign, see the target, throw. Same thing every pitch. After a bad result, the routine is what keeps the next pitch from being thrown angry; after a great one, it is what keeps it from being thrown careless.\n\nThe routine is also where you think. Before each pitch, three questions: what does the count say, what has this hitter seen, and where is the glove. Answer them, then let the delivery do the work. Thinking during the delivery is what makes a pitcher aim, and aiming is what makes him miss.",
        },
        {
          title: "Reading Your Own Outings",
          body:
            "After an outing, the score tells you less than you think. A pitcher can throw well and lose, or throw badly and win. The things to read are the ones you control.\n\nStart with strikes: how many first-pitch strikes, how many at-bats where you got ahead. Then command: in the bullpen before the game and in the game, how often did the pitch land near the glove. Then the misses: were they in one direction (one fault to fix) or everywhere (the delivery was changing)? Then the sequences: which ones worked, which pitch did the hitters sit on.\n\nWrite it down the same way each time, and you will see what to practise before the next outing.",
        },
        {
          title: "Back to Your Baseline",
          body:
            "In Chapter 1 you threw twenty fastballs and counted how many hit the spot. Do it again now, same catcher if you can, same spots.\n\nCompare the two counts. Then compare how the misses behaved: smaller, more consistent, more of them on the edge rather than the middle. Then compare the delivery on video, side by side with the first one.\n\nWhat you are looking for is not a perfect number. It is proof that the dial moved, and a clear idea of the one thing to work on next. That is how pitchers are built: one repeatable delivery, one commanded pitch, one more pitch, one more season.",
        },
        keyPoints([
          "With a runner on, a slide step gets the ball to the plate faster; the pickoff makes the runner stop leaning. Vary your hold times.",
          "After release you are an infielder: comebackers, covering first, bunts. A balanced finish makes you ready to field.",
          "The same routine between every pitch. Think before the pitch, not during it.",
          "Read outings by what you control: first-pitch strikes, command, the shape of the misses, the sequences.",
          "Repeat the twenty-fastball baseline and compare. Proof the dial moved, and the next thing to work on.",
        ]),
      ],
      flashcards: [
        { front: "What is a slide step for?", back: "Getting the ball to the plate faster with a runner on, so the big leg lift does not give a free base." },
        { front: "What does a pickoff move have to do?", back: "Make the runner stop leaning. It does not have to pick anyone off." },
        { front: "Three things PFP covers", back: "Fielding a ball in front of the mound, covering first, fielding a bunt and throwing to the right base." },
        { front: "A simple between-pitch routine", back: "Get the ball back, step off, breathe out, see the sign, see the target, throw. Same every pitch." },
        { front: "Three questions before each pitch", back: "What does the count say, what has this hitter seen, where is the glove." },
        { front: "What to read after an outing", back: "First-pitch strikes, command near the glove, the shape of the misses, which sequences worked." },
      ],
      quizQuestions: [
        {
          questionText: "What does a pickoff move have to accomplish, according to this chapter?",
          answers: [
            { answerText: "Make the runner stop leaning, so he cannot time you.", isCorrect: true, explanation: "It does not have to pick anyone off." },
            { answerText: "Pick the runner off at least once a game.", isCorrect: false, explanation: "The chapter says it does not have to pick anyone off." },
            { answerText: "Give the catcher a rest.", isCorrect: false, explanation: "Not what the chapter says." },
            { answerText: "Replace the slide step.", isCorrect: false, explanation: "They are two halves of the same job." },
          ],
        },
        {
          questionText: "Put the between-pitch routine in the order the chapter gives.",
          questionType: "ordering",
          payload: {
            items: ["Get the ball back", "Step off or turn away", "Breathe out", "Look at the sign", "See the target", "Throw"],
            explanation: "Same thing every pitch, after a bad result and after a great one.",
          },
        },
        {
          questionText: "Thinking during the delivery makes a pitcher ___, and that is what makes him miss.",
          questionType: "fill_blank",
          payload: { accepted: ["aim", "aim the ball", "steer"], explanation: "Think before the pitch, then let the delivery do the work." },
        },
        {
          questionText: "When reading your own outing, which of these is something you control?",
          answers: [
            { answerText: "How many first-pitch strikes you threw.", isCorrect: true, explanation: "Strikes, command, the shape of the misses and the sequences are the things to read." },
            { answerText: "The final score.", isCorrect: false, explanation: "A pitcher can throw well and lose." },
            { answerText: "How many runs the other team's pitcher gave up.", isCorrect: false, explanation: "Not yours to control." },
            { answerText: "Whether the umpire's zone was wide.", isCorrect: false, explanation: "You adjust to it, but you do not control it." },
          ],
        },
        {
          questionText: "What are you looking for when you repeat the twenty-fastball baseline?",
          answers: [
            { answerText: "Proof the number moved and a clear idea of the one thing to work on next.", isCorrect: true, explanation: "Not a perfect score: evidence the dial moved." },
            { answerText: "A perfect twenty out of twenty.", isCorrect: false, explanation: "The chapter says it is not a perfect number you are after." },
            { answerText: "A higher velocity than Chapter 1.", isCorrect: false, explanation: "The baseline counts location, not speed." },
            { answerText: "A reason to stop practising.", isCorrect: false, explanation: "The last line is one more season." },
          ],
        },
      ],
    },
  ],
};
