import { keyPoints, type ForgeClassContent } from "./types";

/** Wrestling: Winning the Positions (2026-10-04). Six chapters across stance, takedowns, the
 * sprawl, bottom, top and the match itself, built on the Takedowns, Escapes and Par Terre drills
 * in the skill library. Written for a high-school wrestler. Every technique page defers to the
 * coach on the mat for what is safe for a given partner and level. */
export const WRESTLING_CLASS: ForgeClassContent = {
  name: "Wrestling: Winning the Positions",
  description:
    "Six chapters on the positions a match is made of: the stance and the tie-up, the setup that makes a shot work, the sprawl that makes an opponent pay for his, getting out from the bottom, riding and turning from the top, and managing a six-minute match.",
  category: "Wrestling",
  readingLevel: "high_school",
  chapters: [
    {
      title: "Stance, Motion and the Tie-Up",
      description:
        "Nothing in wrestling works from a bad stance. This chapter covers the stance, moving in it, hand fighting, and the ties that control an opponent before a shot is ever taken.",
      drills: ["Setup and Level Change Drilling", "Quick Feet In-Place Drill", "Sprawl and Front Headlock", "Lateral Shuffle Footwork"],
      content: [
        {
          title: "The Stance",
          body:
            "A wrestling stance is a ready position you can attack from and defend from without changing it. Feet about shoulder-width, one slightly ahead, knees bent, hips back and down, back flat, head up, elbows in, hands in front of the knees.\n\nThe head is the part young wrestlers get wrong. Head down means the eyes are on the mat and the opponent is already shooting. Head up, eyes on his hips, and you see the level change before it happens.\n\nThe elbows are the second. Elbows out invite an underhook and a duck; elbows in, hands in front, keep the opponent's hands off your body. A good stance feels tight and a little uncomfortable. That is correct.",
        },
        {
          title: "Motion",
          body:
            "A stance that stands still is a target. Wrestlers move constantly in their stance, small steps that keep the feet under the hips, never crossing, never hopping, so that the stance is intact at every moment of the movement.\n\nThe Quick Feet In-Place Drill and the Lateral Shuffle Footwork drill build the habit: short, quick, grounded steps with the knees bent. The test is simple: at any instant in the drill, could you shoot or sprawl? If the feet are together, crossed or in the air, the answer is no.\n\nMotion also creates angles. A wrestler who circles makes his opponent turn to follow, and an opponent who is turning is an opponent whose feet are not set. Shots come from angles, and angles come from motion.",
        },
        {
          title: "Hand Fighting",
          body:
            "Before anybody shoots, the hands are fighting for position. The wrestler who controls the hands and the head controls the tie, and the tie decides who gets to shoot.\n\nThe basic tools: a collar tie, hand behind the opponent's neck, pulling his head down; an inside tie, your hand inside his elbow, controlling his arm; an underhook, your arm under his and up through his armpit, lifting his shoulder. Each one takes something away from him and gives you an angle.\n\nHand fighting is tiring and it is where matches are won in the third period. Snap, clear, re-tie. Never let his hands rest on you, never let your head drop below his, never stop moving the hands.",
        },
        {
          title: "The Level Change",
          body:
            "Every shot begins with a level change: dropping the hips straight down, keeping the back flat and the head up, so that the body is lower than the opponent's hands without the shoulders dipping forward.\n\nThe Setup and Level Change Drilling drill is where it is learned without a partner: hundreds of level changes from a moving stance, back flat, head up, knees driving forward rather than down. A level change that bends at the waist puts the head down and the hips back, which is a stance that cannot shoot and cannot defend.\n\nThe Sprawl and Front Headlock drill is in this chapter as the other half: the moment your opponent changes level is the moment you sprawl, and a wrestler who knows how to change level knows how to see one coming.",
        },
        keyPoints([
          "The stance: knees bent, hips back and down, back flat, head UP, elbows in. Tight and a little uncomfortable.",
          "Move in the stance with short, grounded steps. At any instant, could you shoot or sprawl?",
          "Hand fighting decides the tie, and the tie decides who shoots. Snap, clear, re-tie, never rest.",
          "A level change drops the hips straight down with the back flat and the head up. Never bend at the waist.",
        ]),
      ],
      flashcards: [
        { front: "The two parts of a stance young wrestlers get wrong", back: "The head (keep it up, eyes on his hips) and the elbows (keep them in)." },
        { front: "The test for motion in the stance", back: "At any instant, could you shoot or sprawl? Feet together, crossed or in the air means no." },
        { front: "Why move in the stance?", back: "A still stance is a target, and motion creates the angles shots come from." },
        { front: "Three basic ties", back: "Collar tie (behind the neck), inside tie (inside the elbow), underhook (under the arm, lifting the shoulder)." },
        { front: "The rule of hand fighting", back: "Snap, clear, re-tie. Never let his hands rest on you." },
        { front: "A level change is...", back: "The hips dropping straight down, back flat, head up, knees driving forward. Never a bend at the waist." },
      ],
      quizQuestions: [
        {
          questionText: "In a good stance, where are the eyes?",
          answers: [
            { answerText: "Up, on the opponent's hips, so you see the level change before it happens.", isCorrect: true, explanation: "Head down means he is already shooting." },
            { answerText: "On the mat.", isCorrect: false, explanation: "That is the mistake." },
            { answerText: "On the coach.", isCorrect: false, explanation: "No." },
            { answerText: "Closed, to feel his movement.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Match the tie with what it does.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Collar tie", right: "Pulls his head down" },
              { left: "Inside tie", right: "Controls his arm from inside the elbow" },
              { left: "Underhook", right: "Lifts his shoulder from under the arm" },
            ],
            explanation: "Each takes something from him and gives you an angle.",
          },
        },
        {
          questionText: "The rule of hand fighting is snap, clear, ___.",
          questionType: "fill_blank",
          payload: { accepted: ["re-tie", "retie", "re tie", "tie"], explanation: "Never let his hands rest on you, never stop moving the hands." },
        },
        {
          questionText: "What is wrong with a level change that bends at the waist?",
          answers: [
            { answerText: "It puts the head down and the hips back, a position that cannot shoot and cannot defend.", isCorrect: true, explanation: "The hips drop straight down with the back flat." },
            { answerText: "Nothing; it is faster.", isCorrect: false, explanation: "It is the fault the drill exists to remove." },
            { answerText: "It is against the rules.", isCorrect: false, explanation: "No." },
            { answerText: "It makes you too low.", isCorrect: false, explanation: "The problem is the head and hips, not the height." },
          ],
        },
        {
          questionText: "Why does the chapter say motion creates shots?",
          answers: [
            { answerText: "Circling makes the opponent turn, and an opponent who is turning has his feet unset, which is an angle.", isCorrect: true, explanation: "Shots come from angles, and angles come from motion." },
            { answerText: "Because motion tires him out.", isCorrect: false, explanation: "It does, but that is not the reason given." },
            { answerText: "Because the referee rewards activity.", isCorrect: false, explanation: "No." },
            { answerText: "It does not; shots come from strength.", isCorrect: false, explanation: "The chapter says the opposite." },
          ],
        },
      ],
    },
    {
      title: "Takedowns: The Setup Makes the Shot",
      description:
        "A shot without a setup is a shot into a sprawl. This chapter covers the single, the double and the high crotch, the penetration step they share, and the setups that make them land.",
      drills: ["Single Leg Takedown", "Double Leg Takedown", "High Crotch Takedown", "Setup and Level Change Drilling"],
      content: [
        {
          title: "The Penetration Step",
          body:
            "Every leg attack shares one movement: the penetration step. From the level change, the lead knee drives forward and down toward the mat between the opponent's feet, the trail leg follows through, and the head stays up with the back flat. The shot is finished by the hips driving forward, not by the arms pulling.\n\nThe common fault is reaching: arms out in front, head down, hips behind. A reaching shot is a shot that gets sprawled on. The drill cue is that the hips arrive before the hands.\n\nThe Setup and Level Change Drilling drill runs the penetration step hundreds of times without a partner: level change, step, drive, recover to stance. Fast, low and in a straight line.",
        },
        {
          title: "Single, Double, High Crotch",
          body:
            "**The single leg** attacks one leg. The head goes to the outside of the hip, both hands lock behind the knee, and the finish lifts or runs the leg. It is the most common attack in wrestling because it is the one most often available. The Single Leg Takedown drill works the shot and the finishes.\n\n**The double leg** attacks both legs. The head goes to the side, the arms wrap behind both knees, and the hips drive through the opponent to the mat. It is the most powerful finish when the opponent is square and his hands are out of the way. The Double Leg Takedown drill works the drive.\n\n**The high crotch** attacks one leg from the inside, with the head inside and the arm deep across the thigh. It is what a single becomes when the opponent's leg is not where you expected. The High Crotch Takedown drill works the switch from one attack to the other.\n\nYour coach decides which of these fits your body and your level. Most wrestlers own one and are competent at the other two.",
        },
        {
          title: "Setups",
          body:
            "A setup is anything that makes the opponent's hands, head or feet wrong at the moment you shoot. Without one, a good opponent sprawls on every shot you take.\n\nThe simplest setups come from the hand fighting in Chapter 1: snap his head down and shoot as it comes back up; clear his inside tie and shoot through the opening; pull him forward with a collar tie and shoot as he resists. A fake shot that makes him sprawl is a setup for the real shot that follows as he stands back up.\n\nThe rule is that the setup and the shot are one movement. A pause between them resets the opponent. Snap and shoot, clear and shoot, fake and shoot, with no gap.",
        },
        {
          title: "Finishing",
          body:
            "A shot that gets in and does not finish is a shot that gets wrestled out of. Finishing is where the points are, and finishing is mostly about the head and the hips.\n\nOn a single leg, the head stays up and tight to the hip, and the finish is either a lift (hips in, leg up, trip) or a run (drive the leg forward and the opponent down). On a double, the head stays to the side and the hips drive through. On a high crotch, the head comes up and the finish turns the corner to the leg.\n\nWhen the finish stalls, change it. A single that will not lift becomes a run; a double that stalls becomes a single. A wrestler who keeps trying the same finish is a wrestler who gets scrambled on. Finish fast, or change.",
        },
        keyPoints([
          "Every leg attack shares the penetration step: lead knee drives, trail leg follows, head up, hips arrive before hands.",
          "Single, double, high crotch. Own one, be competent at the others. Your coach picks which.",
          "A setup makes his hands, head or feet wrong at the moment you shoot. Setup and shot are one movement.",
          "Finishing is the head and the hips. When a finish stalls, change it.",
        ]),
      ],
      flashcards: [
        { front: "The penetration step", back: "Lead knee drives forward and down between his feet, trail leg follows, head up, back flat." },
        { front: "The common fault on a shot", back: "Reaching: arms out, head down, hips behind. The hips arrive before the hands." },
        { front: "Single leg: where is the head?", back: "Outside, tight to his hip, up." },
        { front: "What is a setup?", back: "Anything that makes his hands, head or feet wrong at the moment you shoot." },
        { front: "The rule for setups", back: "The setup and the shot are one movement. A pause resets the opponent." },
        { front: "A single that will not lift becomes...", back: "A run. When a finish stalls, change it." },
      ],
      quizQuestions: [
        {
          questionText: "On a penetration step, which arrives first?",
          answers: [
            { answerText: "The hips, before the hands.", isCorrect: true, explanation: "A reaching shot gets sprawled on." },
            { answerText: "The hands, before the hips.", isCorrect: false, explanation: "That is reaching." },
            { answerText: "The head, down toward the mat.", isCorrect: false, explanation: "The head stays up." },
            { answerText: "The trail leg.", isCorrect: false, explanation: "The lead knee drives first." },
          ],
        },
        {
          questionText: "Match the attack with what it attacks.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Single leg", right: "One leg, head outside the hip" },
              { left: "Double leg", right: "Both legs, hips drive through" },
              { left: "High crotch", right: "One leg from the inside, arm deep across the thigh" },
            ],
            explanation: "Most wrestlers own one and are competent at the other two.",
          },
        },
        {
          questionText: "The setup and the shot are ___ movement.",
          questionType: "fill_blank",
          payload: { accepted: ["one", "a single", "1", "the same"], explanation: "A pause between them resets the opponent." },
        },
        {
          questionText: "Put a snap-and-shoot setup in order.",
          questionType: "ordering",
          payload: { items: ["Collar tie", "Snap his head down", "Shoot as his head comes back up", "Finish with the hips"], explanation: "Snap and shoot, with no gap." },
        },
        {
          questionText: "Your single leg finish has stalled. What does the chapter say?",
          answers: [
            { answerText: "Change it: a single that will not lift becomes a run.", isCorrect: true, explanation: "A wrestler who keeps trying the same finish gets scrambled on." },
            { answerText: "Keep lifting until it works.", isCorrect: false, explanation: "That is how you get scrambled on." },
            { answerText: "Let go and reset to neutral.", isCorrect: false, explanation: "Finish fast, or change; letting go gives the shot away." },
            { answerText: "Pull his leg with your arms harder.", isCorrect: false, explanation: "Finishing is the head and the hips, not the arms." },
          ],
        },
      ],
    },
    {
      title: "The Sprawl and the Counter",
      description:
        "Defending a shot is a skill, and it scores. This chapter covers the sprawl, the front headlock, the duck under and the ankle pick as attacks off the opponent's mistakes.",
      drills: ["Sprawl and Front Headlock", "Duck Under Takedown", "Ankle Pick Technique", "Setup and Level Change Drilling"],
      content: [
        {
          title: "The Sprawl",
          body:
            "When the opponent shoots, the sprawl is the answer: the hips drop back and down, the legs shoot straight back, the chest comes down on his head and shoulders, and his shot runs out of room. Done well it is one movement that takes less than a second.\n\nThe Sprawl and Front Headlock drill works the reaction and the position. The reaction is reading his level change, from Chapter 1, and sprawling before his knee hits the mat. The position is the hips: a sprawl with the hips high lets him finish under them; a sprawl with the hips down and back stops him cold.\n\nSprawl on every level change, real or fake. A wrestler who waits to see if the shot is real is a wrestler who is already taken down.",
        },
        {
          title: "The Front Headlock",
          body:
            "A stopped shot leaves the opponent's head out in front of him and down. That is a front headlock: your arm wraps his head, your other hand locks on his chin or his arm, your chest is on the back of his neck, and his hips are flat.\n\nFrom here the sprawl becomes an attack. Spin behind him for a takedown, snap him down to his hands and go behind, or drive his head to the mat and circle. The Sprawl and Front Headlock drill runs the position straight into the go-behind so that the two feel like one thing.\n\nThe front headlock is where a defensive wrestler scores most of his points. Learn it as an attack, not a stall.",
        },
        {
          title: "The Duck Under",
          body:
            "A duck under is a shot that goes under the opponent's arm rather than at his legs. When he reaches with a collar tie or his elbow comes up, you change level, duck your head under his arm, and come up behind him with your hips to his.\n\nThe Duck Under Takedown drill works the timing: it works only when his arm is up and his weight is forward, which means it works off his tie, not yours. Pull his collar tie, let him pull back, and duck as his elbow rises.\n\nIt is quiet and it is fast, and it is the attack that punishes a wrestler who hand fights lazily. Make him pay for every high elbow.",
        },
        {
          title: "The Ankle Pick",
          body:
            "An ankle pick attacks the foot nearest you when the opponent's weight is on it. From a collar tie, snap his head down and toward the leg you want; as his weight loads onto that foot, drop and pick the ankle with your free hand while the collar tie drives him over it.\n\nThe Ankle Pick Technique drill is about the snap and the timing. Picking an ankle with no weight on it is picking at air; the snap is what puts the weight there.\n\nThe duck under and the ankle pick belong in this chapter for one reason: they are both attacks that come from reading what the opponent gives, the same reading that produces a sprawl. A defensive wrestler is not a wrestler who waits. He is a wrestler who attacks the mistakes.",
        },
        keyPoints([
          "Sprawl on every level change: hips down and back, legs back, chest on his head. Never wait to see if the shot is real.",
          "A stopped shot is a front headlock, and a front headlock is an attack: spin, snap-down, go behind.",
          "The duck under punishes a high elbow. It works off his tie, when his weight is forward.",
          "The ankle pick needs weight on the foot; the snap puts it there.",
          "A defensive wrestler attacks the opponent's mistakes.",
        ]),
      ],
      flashcards: [
        { front: "The sprawl", back: "Hips back and down, legs straight back, chest on his head and shoulders, in one movement." },
        { front: "The sprawl fault", back: "Hips high. He finishes under them. Hips down and back stop him cold." },
        { front: "When do you sprawl?", back: "On every level change, real or fake." },
        { front: "The front headlock as an attack", back: "Spin behind, snap him down and go behind, or drive the head to the mat and circle." },
        { front: "When does the duck under work?", back: "When his arm is up and his weight is forward, off his tie, as his elbow rises." },
        { front: "What makes an ankle pick land?", back: "Weight on the foot you pick. The snap of the collar tie puts it there." },
      ],
      quizQuestions: [
        {
          questionText: "Put the sprawl in order.",
          questionType: "ordering",
          payload: { items: ["Read his level change", "Hips back and down", "Legs straight back", "Chest down on his head and shoulders"], explanation: "One movement, under a second." },
        },
        {
          questionText: "A sprawl with the hips ___ lets the opponent finish under them.",
          questionType: "fill_blank",
          payload: { accepted: ["high", "up", "too high"], explanation: "Hips down and back stop him cold." },
        },
        {
          questionText: "What should you do on a fake shot?",
          answers: [
            { answerText: "Sprawl anyway. A wrestler who waits to see if the shot is real is already taken down.", isCorrect: true, explanation: "Sprawl on every level change." },
            { answerText: "Stand still and watch.", isCorrect: false, explanation: "That is how you get taken down." },
            { answerText: "Shoot back immediately.", isCorrect: false, explanation: "Sprawl first; the attack comes from the position it gives you." },
            { answerText: "Step back out of bounds.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Why does the chapter say to learn the front headlock as an attack?",
          answers: [
            { answerText: "It is where a defensive wrestler scores most of his points: spin, snap-down, go behind.", isCorrect: true, explanation: "The sprawl and the go-behind should feel like one thing." },
            { answerText: "Because it is a pinning hold.", isCorrect: false, explanation: "It is a neutral position that leads to takedowns." },
            { answerText: "Because it is illegal to hold it.", isCorrect: false, explanation: "No." },
            { answerText: "It should be used to stall.", isCorrect: false, explanation: "The chapter says the opposite." },
          ],
        },
        {
          questionText: "Match the counter-attack with what it punishes.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Duck under", right: "A high elbow with his weight forward" },
              { left: "Ankle pick", right: "Weight loaded onto the near foot after a snap" },
              { left: "Front headlock go-behind", right: "A shot that was stopped by the sprawl" },
            ],
            explanation: "A defensive wrestler attacks the opponent's mistakes.",
          },
        },
      ],
    },
    {
      title: "Bottom: Getting Out",
      description:
        "A wrestler who cannot get out from the bottom gives up a point and a lot of time. This chapter covers the referee's position, the base, the stand-up, the sit-out and the switch.",
      drills: ["Referee's Position Stance Drill", "Stand-Up Escape", "Sit-Out Escape", "Switch Escape"],
      content: [
        {
          title: "The Base",
          body:
            "On the bottom, everything starts from the base: hands in front of the knees, elbows slightly bent, back flat, head up, hips under you, weight balanced so that no one hand or knee can be pulled out from under you.\n\nThe Referee's Position Stance Drill is about that base and the first move out of it. The whistle blows and the bottom wrestler moves first, because the top wrestler is waiting to react. A bottom wrestler who waits is a bottom wrestler being ridden.\n\nThe head is the key again. Head up, back flat, and the top wrestler cannot break you down. Head down and the hips come up, and that is a wrestler on his belly.",
        },
        {
          title: "The Stand-Up",
          body:
            "The stand-up is the first escape every wrestler learns and the one most used. On the whistle, the inside leg steps up and forward, the hips come up and back into the top wrestler, the hands control his hands, and you stand, turn and face him.\n\nThe Stand-Up Escape drill breaks it into pieces: the explosion off the whistle, the hand control (peel his hands off your waist, pull them apart, never let them lock), and the turn to face. A stand-up that gets to the feet and does not clear the hands is a stand-up that gets returned to the mat.\n\nHand control is the whole escape. The feet get you up; the hands get you out.",
        },
        {
          title: "The Sit-Out and the Switch",
          body:
            "When the stand-up is taken away, there are two more.\n\n**The sit-out** turns the base into a sitting position: the hips come through, the legs go out in front, the back comes up against the top wrestler's chest, and from there a turn-in or a turn-out faces him. The Sit-Out Escape drill is about the hips coming through fast and the hand control staying tight.\n\n**The switch** reverses the position: sit through to one side, reach back over the top wrestler's near arm, and drive the hips into him to come on top. Done right it is two points for reversal, not one for escape. The Switch Escape drill works the hip drive, because a switch without the hips is a switch that gets caught.\n\nAll three escapes chain: a stand-up that is stopped becomes a sit-out; a sit-out that is stopped becomes a switch. Keep moving.",
        },
        {
          title: "Never Stop Moving",
          body:
            "The worst thing a bottom wrestler can do is lie still. A still wrestler is being ridden, gives up riding time, and is one mistake from being turned.\n\nThe chain is the answer. Stand-up, sit-out, switch, back to base, stand-up again, with no pause between them. Every move the top wrestler stops has cost him position for the next one.\n\nThere is a conditioning truth under this: escaping is tiring, and the wrestler who has drilled the chain until it is automatic escapes in the third period when the one who has not cannot. The drills in this chapter are not about learning the escapes. They are about never having to think about them.",
        },
        keyPoints([
          "The base: hands in front of the knees, back flat, head up, hips under you. Move first on the whistle.",
          "The stand-up: inside leg up, hips back into him, hand control, turn and face. The hands get you out.",
          "The sit-out turns the base into a sit; the switch reverses the position with the hips.",
          "The escapes chain. A still wrestler is being ridden. Never stop moving.",
        ]),
      ],
      flashcards: [
        { front: "The base on the bottom", back: "Hands in front of the knees, back flat, head up, hips under you, weight balanced." },
        { front: "Who moves first on the whistle?", back: "The bottom wrestler. The top wrestler is waiting to react." },
        { front: "What breaks a bottom wrestler down?", back: "Head down. The hips come up and he goes to his belly." },
        { front: "The stand-up in one sentence", back: "Inside leg up, hips back into him, control his hands, stand, turn, face." },
        { front: "What is a switch worth?", back: "A reversal: two points, not one for an escape." },
        { front: "The chain", back: "Stand-up, sit-out, switch, back to base, no pause. A still wrestler is being ridden." },
      ],
      quizQuestions: [
        {
          questionText: "Why does the bottom wrestler move first on the whistle?",
          answers: [
            { answerText: "The top wrestler is waiting to react; a bottom wrestler who waits is being ridden.", isCorrect: true, explanation: "The explosion off the whistle is the first piece of every escape." },
            { answerText: "The rules require it.", isCorrect: false, explanation: "No." },
            { answerText: "To tire himself out.", isCorrect: false, explanation: "No." },
            { answerText: "He should wait to see what the top wrestler does.", isCorrect: false, explanation: "That is the mistake." },
          ],
        },
        {
          questionText: "On the stand-up, the feet get you up and the ___ get you out.",
          questionType: "fill_blank",
          payload: { accepted: ["hands", "hand control"], explanation: "A stand-up that does not clear the hands gets returned to the mat." },
        },
        {
          questionText: "Match the escape with its key.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Stand-up", right: "Hand control, then turn and face" },
              { left: "Sit-out", right: "Hips through fast into a sit" },
              { left: "Switch", right: "Reach back over his arm, drive the hips to come on top" },
            ],
            explanation: "All three chain.",
          },
        },
        {
          questionText: "Put the escape chain in the order the chapter gives.",
          questionType: "ordering",
          payload: { items: ["Stand-up", "Sit-out", "Switch", "Back to base"], explanation: "Every move the top wrestler stops has cost him position for the next one." },
        },
        {
          questionText: "What does the chapter say the bottom drills are really for?",
          answers: [
            { answerText: "Never having to think about the escapes, so they still work in the third period.", isCorrect: true, explanation: "Escaping is tiring; automatic is what survives fatigue." },
            { answerText: "Learning the names of the escapes.", isCorrect: false, explanation: "Names are not the point." },
            { answerText: "Impressing the referee.", isCorrect: false, explanation: "No." },
            { answerText: "Resting on the bottom.", isCorrect: false, explanation: "A still wrestler is being ridden." },
          ],
        },
      ],
    },
    {
      title: "Top: Riding and Turning",
      description:
        "From the top, the job is to keep the opponent down and turn him to his back. This chapter covers the ride, breaking him down, the half nelson and the cradle, with the coach's rules on what is safe.",
      drills: ["Top Position Riding Technique", "Defensive Base Building", "Half Nelson Turn", "Cradle Turn Technique"],
      content: [
        {
          title: "The Ride",
          body:
            "Riding is controlling the bottom wrestler so that he cannot escape, and it is done with the hips, not the arms. Chest on his back, hips heavy on his hips, weight driving forward and down, with the legs or the arms used to take away his base.\n\nThe Top Position Riding Technique drill is about the pressure: following his hips wherever they go so that your weight is always on him, never beside him. A top wrestler who is beside the bottom wrestler is a top wrestler about to be reversed.\n\nThe Defensive Base Building drill is in this chapter so you feel the other side: a bottom wrestler with a strong base is hard to ride, and knowing what a strong base feels like tells you what to break.",
        },
        {
          title: "Breaking Him Down",
          body:
            "Before you can turn a wrestler you have to break him down: take away his base so that he is flat on his belly rather than up on his hands and knees.\n\nThe tools are the same ones that make a base strong, used against it. Chop the near arm at the elbow while driving forward and his arm collapses. Pull the far ankle while driving and his hips drop. Tight waist with one arm and the near arm chopped with the other, and he has nothing to hold himself up with.\n\nTiming matters: break him down as he moves, because a wrestler in motion has his weight on fewer points. The whistle is the moment, the same whistle he is trying to explode on.",
        },
        {
          title: "The Half Nelson",
          body:
            "The half nelson is the first turn every wrestler learns. From a broken-down opponent, the near arm goes under his near arm and the hand comes up behind his head; the other hand controls his far side; and the turn is a drive of the hips over him with the half pulling his head down and across.\n\nThe Half Nelson Turn drill is about the drive. A half that pulls with the arm alone is a half that gets fought off; a half that drives with the legs and the hips over the top of him puts him on his back.\n\nOnce he is over, the pin is a chest-on-chest position, hips low, head up, the half still in, the other arm controlling his far arm or leg. Hold the position; do not reach for the pin.",
        },
        {
          title: "The Cradle, and What Is Safe",
          body:
            "The cradle locks the opponent's head and one leg together with your arms, hands locked, and turns him with the lock. It is a turn and a pin in one, and it works when the bottom wrestler's head and knee come close together, which happens on a broken-down wrestler who pulls a knee up.\n\nThe Cradle Turn Technique drill works the lock and the turn. The lock has to be tight, hands clasped, before the turn starts; a cradle turned with a loose lock is a cradle that opens.\n\nOne rule above all. Every turn in this chapter puts pressure on the opponent's neck, shoulders or spine, and every one has a limit the rules and your coach set. Learn the turns from your coach, on the mat, with a partner who knows what is coming. This class tells you what the moves are for; it does not teach them to you alone.",
        },
        keyPoints([
          "Riding is hips, not arms: chest on his back, weight on his hips, following wherever they go.",
          "Break him down before you turn him: chop the arm, pull the ankle, tight waist, as he moves.",
          "The half nelson turns with the hips driving over him, never the arm alone. Then hold the pin position.",
          "The cradle locks head and knee together; the lock is tight before the turn starts.",
          "Every turn has a limit the rules and your coach set. Learn them on the mat, never alone.",
        ]),
      ],
      flashcards: [
        { front: "Riding is done with...", back: "The hips, not the arms. Chest on his back, weight on his hips, always on him, never beside him." },
        { front: "Three ways to break him down", back: "Chop the near arm, pull the far ankle, tight waist with the near arm chopped." },
        { front: "When to break him down", back: "As he moves, on the whistle, when his weight is on fewer points." },
        { front: "What turns a half nelson?", back: "The hips driving over him. A half pulled with the arm alone gets fought off." },
        { front: "When does a cradle work?", back: "When his head and knee come close together, usually on a broken-down wrestler who pulls a knee up." },
        { front: "The rule above all on top", back: "Every turn has a limit; learn them from your coach on the mat, never alone." },
      ],
      quizQuestions: [
        {
          questionText: "A top wrestler who is beside the bottom wrestler is about to be ___.",
          questionType: "fill_blank",
          payload: { accepted: ["reversed", "switched", "escaped on", "scored on"], explanation: "The weight has to be on him, never beside him." },
        },
        {
          questionText: "Put the top sequence in order.",
          questionType: "ordering",
          payload: { items: ["Ride with the hips", "Break him down", "Turn him", "Hold the pin position"], explanation: "You cannot turn a wrestler who still has his base." },
        },
        {
          questionText: "Why does a half nelson pulled with the arm alone fail?",
          answers: [
            { answerText: "It gets fought off; the turn needs the legs and hips driving over the top of him.", isCorrect: true, explanation: "The drill is about the drive." },
            { answerText: "Because it is illegal.", isCorrect: false, explanation: "A half nelson is legal; the limit is on how it is applied." },
            { answerText: "Because the arm is not strong enough.", isCorrect: false, explanation: "Strength is not the issue; position is." },
            { answerText: "It does not fail; the arm is enough.", isCorrect: false, explanation: "The chapter says the opposite." },
          ],
        },
        {
          questionText: "Match the tool with what it does to the bottom wrestler.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Chop the near arm", right: "His arm collapses" },
              { left: "Pull the far ankle", right: "His hips drop" },
              { left: "Tight waist plus near-arm chop", right: "Nothing to hold himself up with" },
            ],
            explanation: "The same things that make a base strong, used against it.",
          },
        },
        {
          questionText: "What does the chapter say about learning the turns?",
          answers: [
            { answerText: "Learn them from your coach on the mat with a partner who knows what is coming; the class says what they are for, not how to do them alone.", isCorrect: true, explanation: "Every turn has a limit the rules and the coach set." },
            { answerText: "Practise them alone on a dummy until they are perfect.", isCorrect: false, explanation: "The chapter says never alone." },
            { answerText: "Try them on a smaller partner first.", isCorrect: false, explanation: "The partner has to know what is coming; size is not the rule." },
            { answerText: "They are too dangerous to learn at all.", isCorrect: false, explanation: "They are learned, with the coach, within the limits." },
          ],
        },
      ],
    },
    {
      title: "The Six-Minute Match",
      description:
        "A match is three periods of decisions. This chapter covers the periods and the score, pace and conditioning, scrambles, and reading your own matches. The last page returns to your stance.",
      drills: ["Setup and Level Change Drilling", "Live Bottom Escape Series", "Sprawl and Front Headlock", "Granby Roll Escape"],
      content: [
        {
          title: "Three Periods, One Plan",
          body:
            "A match starts on the feet and the first period is takedowns. The second and third start with a choice, top, bottom or neutral, and the choice is a decision about where you score and where he does.\n\nA wrestler who escapes easily chooses bottom, takes the point and gets back to his feet. A wrestler who rides and turns chooses top. A wrestler who is better on the feet than anywhere else chooses neutral. Know which you are, honestly, and choose that.\n\nThe score decides the plan. Ahead late, the plan is position: no risky shots, hands fighting, no stalling call. Behind late, the plan is points: shots with setups, from angles, and a bottom wrestler who gets out and shoots again.",
        },
        {
          title: "Pace",
          body:
            "Most high-school matches are won by the wrestler who is still wrestling in the third period. Conditioning is part of it, and the drills in this class are built to be run until they hurt. But pace is also a choice.\n\nSet the pace from the first whistle: hand fighting, motion, level changes, a shot in the first thirty seconds. An opponent who has to defend from the start is an opponent who is tired at the end. A wrestler who waits to feel out the match has let the other wrestler set the pace.\n\nThe Live Bottom Escape Series drill is a conditioning drill in disguise: escapes in a row against a live partner until the chain is automatic and the lungs are burning. That is what the third period feels like.",
        },
        {
          title: "Scrambles",
          body:
            "Not every position is in this class. A shot half-finished, a sprawl half-beaten, two wrestlers tangled with nobody in control: that is a scramble, and scrambles decide close matches.\n\nTwo rules. Keep your hips under you; the wrestler whose hips are lower and more under him usually comes out on top. And keep moving; a wrestler who stops in a scramble to think is the one who gets scored on.\n\nThe Granby Roll Escape drill is here as an example of scramble wrestling: a roll from the bottom that uses the top wrestler's pressure against him and comes out in a new position. It is not a move to use every time. It is a move that teaches you to feel where the position is going and get there first.",
        },
        {
          title: "Reading Your Own Matches",
          body:
            "After a match, before you think about the result, think about the positions. Where were the points scored, yours and his? Takedowns, escapes, reversals, near falls. Which position did you win and which did you lose?\n\nThen the setups. Did your shots have them? Did his? If you were taken down, what was your head doing and where were your hands?\n\nThen the third period. Were you still wrestling? Was he?\n\nWrite it down the same way each time. Over a season the pattern tells you which chapter of this class to go back to, and that is more useful than any single result.",
        },
        {
          title: "Back to Your Stance",
          body:
            "In Chapter 1 you learned the stance and the motion. Film yourself now, a minute of moving in your stance, then a minute of hand fighting with a partner.\n\nCompare it with the first week. Head up? Elbows in? Feet under the hips at every instant? Could you shoot or sprawl from any frame of the video?\n\nEverything in this class came from that stance. The shot, the sprawl, the escape, the ride all start from the hips being under you and the head being up. If the stance is better, everything built on it is better. That is what you are checking, and that is the thing to keep checking for as long as you wrestle.",
        },
        keyPoints([
          "Choose the position where you score. Ahead late, wrestle position; behind late, wrestle for points.",
          "Set the pace from the first whistle. The wrestler still wrestling in the third period wins.",
          "In a scramble, hips under you and keep moving. The wrestler who stops to think gets scored on.",
          "Read your matches by position, setups and the third period. The pattern tells you which chapter to go back to.",
          "Everything started from the stance. Keep checking it.",
        ]),
      ],
      flashcards: [
        { front: "How do you choose top, bottom or neutral?", back: "Honestly, by where you score: bottom if you escape easily, top if you ride and turn, neutral if the feet are your best." },
        { front: "Ahead late in a match", back: "Wrestle position: no risky shots, hand fighting, no stalling call." },
        { front: "Who wins most high-school matches?", back: "The wrestler still wrestling in the third period. Set the pace from the first whistle." },
        { front: "Two rules in a scramble", back: "Hips under you, and keep moving." },
        { front: "Three things to read after a match", back: "The positions where points were scored, the setups, and the third period." },
        { front: "Where did everything in this class start?", back: "The stance: hips under you, head up." },
      ],
      quizQuestions: [
        {
          questionText: "You are behind by two with a minute left. What is the plan?",
          answers: [
            { answerText: "Points: shots with setups from angles, and if on the bottom, get out and shoot again.", isCorrect: true, explanation: "Behind late, the plan is points." },
            { answerText: "Position: hand fight and avoid risk.", isCorrect: false, explanation: "That is the plan when ahead." },
            { answerText: "Stall and hope.", isCorrect: false, explanation: "No." },
            { answerText: "Choose top and ride.", isCorrect: false, explanation: "Riding does not score the points you need." },
          ],
        },
        {
          questionText: "Set the pace from the first ___.",
          questionType: "fill_blank",
          payload: { accepted: ["whistle", "second", "period", "moment"], explanation: "An opponent who has to defend from the start is tired at the end." },
        },
        {
          questionText: "Match the situation with the chapter's rule.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "In a scramble", right: "Hips under you, keep moving" },
              { left: "Ahead late", right: "Wrestle position, no risky shots" },
              { left: "Choosing a period start", right: "Pick the position where you score" },
            ],
            explanation: "Three periods, one plan, adjusted by the score.",
          },
        },
        {
          questionText: "Why is the Live Bottom Escape Series called a conditioning drill in disguise?",
          answers: [
            { answerText: "Escapes in a row against a live partner until the chain is automatic and the lungs burn is what the third period feels like.", isCorrect: true, explanation: "The drills are built to be run until they hurt." },
            { answerText: "Because it is easy.", isCorrect: false, explanation: "No." },
            { answerText: "Because it is done without a partner.", isCorrect: false, explanation: "It is live." },
            { answerText: "It is not; it is only about technique.", isCorrect: false, explanation: "The chapter says it is both." },
          ],
        },
        {
          questionText: "What does the stance video at the end of the class check?",
          answers: [
            { answerText: "Head up, elbows in, feet under the hips, and whether you could shoot or sprawl from any frame.", isCorrect: true, explanation: "Everything in the class was built on it." },
            { answerText: "How fast you can run.", isCorrect: false, explanation: "No." },
            { answerText: "How many takedowns you scored this season.", isCorrect: false, explanation: "That is the match reading, not the stance check." },
            { answerText: "Whether you need a new singlet.", isCorrect: false, explanation: "No." },
          ],
        },
      ],
    },
  ],
};
