import { keyPoints, type ForgeClassContent } from "./types";

/** Football: Winning as a Receiver (2026-10-04). Six chapters for a wide receiver, built on the
 * Route Running, Footwork, Agility and Starts drills in the skill library. Written for a
 * high-school player. */
export const FOOTBALL_RECEIVING_CLASS: ForgeClassContent = {
  name: "Football: Winning as a Receiver",
  description:
    "Six chapters on getting open and finishing the catch: the stance and release, the route tree run at full speed, breaks that create separation, hands that never drop a ball, reading coverage, and the sideline, the end zone and the ball in the air.",
  category: "Football",
  readingLevel: "high_school",
  chapters: [
    {
      title: "Getting Off the Line",
      description:
        "Every route starts with a release. This chapter covers the stance, the first three steps, and beating a defender who is standing on the line to stop you.",
      drills: ["Release Package vs. Press", "Reactive Start Drill", "20-Yard Dash", "Quick Feet In-Place Drill"],
      content: [
        {
          title: "The Stance Is the Start",
          body:
            "A receiver's stance has one job: let you leave fast in the direction the route needs. Front foot up, back foot staggered, weight on the balls of the feet, hips down and chest over the knees. The hands are relaxed. The eyes are on the ball or the defender, whichever the play asks for, never on the ground.\n\nA stance that is too tall leaves you standing up before you run. A stance that is too low makes the first step a lurch. Find the depth where your first step goes forward, not up, and then make every stance that one. The defender across from you reads your stance for a tell; a stance that never changes gives him nothing.\n\nThe 20-Yard Dash in this chapter's drill day is not a sprint test. It is a release test: the first three steps out of your stance, repeated until they are the same every time.",
        },
        {
          title: "Three Steps to Full Speed",
          body:
            "The first three steps off the line decide the route. Short, hard, driving steps, chest over the knees, arms pumping, the body rising a little with each step until you are at full speed by the third or fourth.\n\nTwo faults show up over and over. The first is a false step: a small step backward before the first step forward, which costs a tenth of a second and tells the defender you are leaving. The second is standing up too early, which turns a drive into a jog. The Reactive Start Drill fixes both by taking away the time to think: on the signal, go, and a false step shows up on film immediately.\n\nFull speed matters even on a short route. A corner who sees you jog off the line sits on the short stuff. A corner who sees you fly off the line has to respect the deep ball, and that respect is what opens the slant underneath.",
        },
        {
          title: "Beating Press Coverage",
          body:
            "When a defender lines up on the line of scrimmage and puts hands on you, the route starts with a fight. The Release Package vs. Press drill works the three tools you need.\n\n**The foot fire.** Quick feet in place that freeze the defender's hands: he cannot jam what he cannot time.\n\n**The swipe or the rip.** When his hands come, knock them away and get your shoulder past his. The hands are the whole battle; a corner who gets his hands on your chest wins the first two seconds of the play.\n\n**The stack.** Once you are past him, get directly in front of him so that he has to run through you to get to the ball. Separation is not only sideways; it is also putting your body between the defender and the throw.\n\nThe mistake is fighting with the hands and forgetting the feet. The release is a footwork move with a hand move attached, not the other way round.",
        },
        {
          title: "Leverage: Where the Defender Is",
          body:
            "Before the snap, look at where the defender is standing. Inside of you, outside of you, or head up. That is called his leverage, and it tells you which way he wants you to go.\n\nA defender with inside leverage is protecting the middle of the field and daring you to go outside. A defender with outside leverage is protecting the sideline and inviting you inside. Head up means he has not decided and will react to your first step.\n\nThe route is called in the huddle, but the release is yours. If the route breaks inside and the defender has inside leverage, you release outside first and bring him with you before the break. If the route breaks outside and he is outside, release inside. Taking him the opposite way from the break is what creates the space you will need in Chapter 3.",
        },
        keyPoints([
          "One stance, every time: front foot up, hips down, weight on the balls of the feet. A stance that never changes gives the defender nothing.",
          "Three hard steps to full speed, no false step, no standing up early. Full speed on every route, even the short ones.",
          "Against press: quick feet, swipe or rip the hands, then stack on top of him. A footwork move with a hand move attached.",
          "Read the defender's leverage before the snap. Release away from the break.",
        ]),
      ],
      flashcards: [
        { front: "A receiver's stance has one job", back: "Let you leave fast in the direction the route needs." },
        { front: "What is a false step?", back: "A small step backward before the first step forward. Costs time and tells the defender you are leaving." },
        { front: "Why run full speed on a short route?", back: "A corner who sees you fly off the line has to respect the deep ball, which opens the short route." },
        { front: "Three tools against press", back: "Foot fire, swipe or rip the hands, stack on top of him." },
        { front: "What is leverage?", back: "Where the defender lines up relative to you: inside, outside or head up. It tells you which way he wants you to go." },
        { front: "The release rule for leverage", back: "Release away from the break: take him the opposite way first." },
      ],
      quizQuestions: [
        {
          questionText: "What is the one job of a receiver's stance?",
          answers: [
            { answerText: "Let you leave fast in the direction the route needs.", isCorrect: true, explanation: "Everything in the stance serves the first step." },
            { answerText: "Hide the play from the defense.", isCorrect: false, explanation: "A stance that never changes hides tells, but that is a consequence, not the job." },
            { answerText: "Look intimidating.", isCorrect: false, explanation: "No." },
            { answerText: "Rest between plays.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "A small step backward before the first step forward is called a ___ step.",
          questionType: "fill_blank",
          payload: { accepted: ["false", "false step"], explanation: "It costs a tenth of a second and tells the defender you are leaving." },
        },
        {
          questionText: "Put the press release in order.",
          questionType: "ordering",
          payload: { items: ["Foot fire to freeze his hands", "Swipe or rip the hands away", "Get your shoulder past his", "Stack directly in front of him"], explanation: "The hands are the battle; the feet are the move." },
        },
        {
          questionText: "The route breaks inside and the defender has inside leverage. Which way do you release?",
          answers: [
            { answerText: "Outside first, to bring him with you before the break.", isCorrect: true, explanation: "Release away from the break to create the space." },
            { answerText: "Inside, straight at him.", isCorrect: false, explanation: "That runs into his leverage and gives the break away." },
            { answerText: "Straight ahead, then stop.", isCorrect: false, explanation: "Stopping is not a release." },
            { answerText: "It does not matter.", isCorrect: false, explanation: "It is the whole point of reading leverage." },
          ],
        },
        {
          questionText: "What is the 20-Yard Dash for in this chapter?",
          answers: [
            { answerText: "Repeating the first three steps out of the stance until they are the same every time.", isCorrect: true, explanation: "A release test, not a sprint test." },
            { answerText: "Measuring top speed.", isCorrect: false, explanation: "That is not what the chapter uses it for." },
            { answerText: "Conditioning.", isCorrect: false, explanation: "No." },
            { answerText: "Nothing; it is a warm-up.", isCorrect: false, explanation: "It is on the drill day for the release." },
          ],
        },
      ],
    },
    {
      title: "The Route Tree at Full Speed",
      description:
        "Routes are a language, and the route tree is its alphabet. This chapter runs the tree the way a game asks for it: at depth, at speed, with the same stem on every route.",
      drills: ["Route Tree Cone Drill", "Slant Route Technique", "Out Route Technique", "Post Route Timing"],
      content: [
        {
          title: "Every Route Looks the Same Until It Does Not",
          body:
            "The stem is the first part of every route, the straight-line drive off the line before the break. A good receiver runs the same stem on every route: same speed, same body lean, same eyes. The defender cannot tell a slant from a go until the break, and by then it is too late.\n\nThat is the whole idea of the route tree. The routes are numbered so the quarterback and receiver can call them quickly, but what makes them work is that they share a stem. A receiver who slows down on a short route or leans early on a deep one has told the defender which number is coming.\n\nThe Route Tree Cone Drill runs the whole tree in order, and the thing to watch on film is not the breaks. It is whether the first five yards of every route look identical.",
        },
        {
          title: "Depth Is a Promise",
          body:
            "A route called at ten yards breaks at ten yards. Not eight, not twelve. The quarterback is throwing to a spot before you get there, timed to the depth of the route, and a receiver who breaks early arrives before the ball and a receiver who breaks late arrives after it.\n\nThis is harder than it sounds. At full speed, counting steps is the only way to hit depth consistently, and every receiver's count is their own. Find yours for each route on the cone drill: how many steps to a five-yard break, to ten, to twelve. Then run it with your eyes up, trusting the count.\n\nThe Post Route Timing drill is where this gets tested, because the post is thrown long and early. If you are a yard off at the break, you are three yards off when the ball arrives.",
        },
        {
          title: "The Short Game: Slants and Outs",
          body:
            "The slant and the out are the two routes a high-school receiver runs most, and they are mirror problems.\n\nThe slant breaks inside at an angle, three steps and go. It is thrown fast and caught in traffic, so the keys are a hard first three steps that sell the go route, a sharp plant off the outside foot, and hands ready immediately, because the ball is out before your head comes round. The Slant Route Technique drill is about the plant and the hands.\n\nThe out breaks toward the sideline at a right angle. The danger is rounding it off: drifting upfield on the break so that the route becomes a curve and the corner undercuts it. The Out Route Technique drill is about a flat break: plant, drop the hips, and come out of the break at the same depth you went into it.",
        },
        {
          title: "The Deep Game: Posts and Gos",
          body:
            "Deep routes win on the stem and on the eyes. A go route is a race, and the race is won off the line and with the stack from Chapter 1. A post route is a go route that bends to the goalpost at the break, and it wins when the safety has been convinced it is a go.\n\nOn a deep ball, the eyes matter more than on any other route. Look for the ball too early and you slow down; look too late and you cannot adjust. The rule is to run through the break with the eyes on the defender, then find the ball over the inside shoulder as the quarterback's count says it is in the air.\n\nTracking the ball is Chapter 6. For now, the job is to be where the throw expects you: at depth, at speed, on the line the route promised.",
        },
        keyPoints([
          "Same stem on every route: same speed, lean and eyes. The defender cannot read a route from its first five yards.",
          "Depth is a promise to the quarterback. Count your steps and trust the count.",
          "The slant: hard three steps, sharp plant, hands ready before the head comes round.",
          "The out: a flat break, out of it at the same depth you went in. Never round it off.",
          "Deep routes win on the stem and the eyes. Run through the break, then find the ball.",
        ]),
      ],
      flashcards: [
        { front: "What is the stem?", back: "The straight-line drive off the line before the break. The same on every route." },
        { front: "Why does the route tree work?", back: "Every route shares a stem, so the defender cannot tell them apart until the break." },
        { front: "Why does depth matter?", back: "The quarterback throws to a spot timed to the route's depth. Early or late, you are not where the ball is." },
        { front: "The slant's three keys", back: "Hard first three steps, sharp plant off the outside foot, hands ready immediately." },
        { front: "The out's one danger", back: "Rounding it off: drifting upfield on the break so the corner undercuts it." },
        { front: "Where are the eyes on a deep route?", back: "On the defender through the break, then the ball over the inside shoulder." },
      ],
      quizQuestions: [
        {
          questionText: "What should look identical on every route in the tree?",
          answers: [
            { answerText: "The stem: the first five yards, at the same speed, lean and eyes.", isCorrect: true, explanation: "A different stem tells the defender which route is coming." },
            { answerText: "The break.", isCorrect: false, explanation: "The breaks are what differ; the stems are what match." },
            { answerText: "The catch.", isCorrect: false, explanation: "No." },
            { answerText: "The depth.", isCorrect: false, explanation: "Depths differ by route; the stem is shared." },
          ],
        },
        {
          questionText: "Match the route with its key.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Slant", right: "Hard three steps, sharp plant, hands ready" },
              { left: "Out", right: "Flat break at the same depth you went in" },
              { left: "Post", right: "A go route that bends to the goalpost" },
            ],
            explanation: "The short game and the deep game, from the chapter.",
          },
        },
        {
          questionText: "A route called at ten yards breaks at ___ yards.",
          questionType: "fill_blank",
          payload: { accepted: ["ten", "10"], explanation: "Not eight, not twelve. Depth is a promise." },
        },
        {
          questionText: "Why is counting steps the way to hit depth?",
          answers: [
            { answerText: "At full speed it is the only consistent way, and the eyes can stay up.", isCorrect: true, explanation: "Find your own count for each route on the cone drill." },
            { answerText: "Because the yard lines are hard to see.", isCorrect: false, explanation: "The chapter's reason is consistency at speed, with the eyes up." },
            { answerText: "Because coaches count steps too.", isCorrect: false, explanation: "No." },
            { answerText: "It is not; you should watch the yard markers.", isCorrect: false, explanation: "Watching the ground takes the eyes off the defender and the ball." },
          ],
        },
        {
          questionText: "What makes a post route work?",
          answers: [
            { answerText: "The safety has been convinced it is a go route before it bends.", isCorrect: true, explanation: "Same stem, then the bend to the goalpost." },
            { answerText: "Running it slower than a go.", isCorrect: false, explanation: "A slower stem gives it away." },
            { answerText: "Looking for the ball off the line.", isCorrect: false, explanation: "Looking early slows you down." },
            { answerText: "Breaking at five yards.", isCorrect: false, explanation: "A post is a deep route." },
          ],
        },
      ],
    },
    {
      title: "Breaks That Create Separation",
      description:
        "Separation is made at the break, in one step. This chapter covers sinking the hips, the plant foot, the head and shoulders, and the double move for the defender who has learned your breaks.",
      drills: ["Comeback Route Technique", "Double Move Route Running", "Deceleration and Stick Landing", "Hip Turn and Open-Gate Drill"],
      content: [
        {
          title: "Separation Is One Step",
          body:
            "A receiver does not get open by being faster than the defender over forty yards. He gets open in the one step where he changes direction and the defender does not yet know it. Everything in this chapter is about that step.\n\nThe defender is reacting to you. He sees your break a fraction after it happens, and that fraction is the window the ball arrives in. The sharper the break, the bigger the fraction. A rounded break gives him time to turn with you; a break that happens in one step leaves him a yard behind, and a yard is a completion.\n\nThe Deceleration and Stick Landing drill is on this chapter's day because the break is a deceleration first: you cannot change direction at full speed without stopping first, and the best receivers stop in a single step.",
        },
        {
          title: "Sink, Plant, Go",
          body:
            "The break has three parts and they happen almost at once.\n\n**Sink.** The hips drop. A receiver who breaks tall takes three steps to stop; a receiver who sinks stops in one. The chest stays over the knees, so the sink does not become a lean back.\n\n**Plant.** The outside foot (the one away from the direction of the break) hits the ground hard, toes pointed roughly where you came from, and takes the whole body's momentum. The plant is the break; everything else is cleanup.\n\n**Go.** The first step out of the break is as hard as the first step off the line. Most receivers lose their separation here, coming out of the break at a jog because the hard part felt done. It was not.\n\nThe Comeback Route Technique drill is the purest test of all three, because the comeback asks you to go from full speed upfield to coming back toward the ball in one plant.",
        },
        {
          title: "Head, Shoulders, Eyes",
          body:
            "The defender reads your upper body, because that is what he can see. So the upper body sells the route.\n\nOn a break inside, the head and shoulders turn inside a beat before the feet, which makes the plant look like a continuation and not a change. On a double move, the head and shoulders sell the first break completely, with the eyes looking where the first route would go, so that the defender commits.\n\nThe Hip Turn and Open-Gate Drill trains the hips to open quickly so the upper body can lead without the feet lagging behind. A receiver whose hips are slow has to turn in two steps, and two steps is a defender back in position.",
        },
        {
          title: "The Double Move",
          body:
            "A defender who has seen you break the same way three times starts jumping the break. The double move is the answer: sell the route he expects, let him jump it, and go.\n\nThe Double Move Route Running drill works the common ones: a slant-and-go, where the first three steps and the plant look exactly like a slant, and then the second plant takes you back upfield; an out-and-up, the same idea toward the sideline. The first move has to be real. A half-hearted first break fools nobody, and then the second break is just a slow go route.\n\nThe double move is a counter, not a diet. It works because the single breaks were run honestly all game. A receiver who runs double moves every play teaches the defender to wait, and a defender who waits is never fooled.",
        },
        keyPoints([
          "Separation is one step: the step where you change direction before the defender knows it.",
          "Sink, plant, go. The hips drop, the outside foot takes the momentum, the first step out is as hard as the first step off the line.",
          "The upper body sells the break because that is what the defender can see.",
          "The double move: sell the first break completely. A counter that works because the single breaks were honest.",
        ]),
      ],
      flashcards: [
        { front: "Where does a receiver get open?", back: "In the one step where he changes direction and the defender does not yet know it." },
        { front: "Why is a break a deceleration first?", back: "You cannot change direction at full speed without stopping; the best receivers stop in one step." },
        { front: "Sink, plant, go", back: "Hips drop, outside foot takes the momentum, first step out as hard as the first step off the line." },
        { front: "Where most receivers lose separation", back: "Coming out of the break at a jog because the hard part felt done." },
        { front: "Why does the upper body sell the route?", back: "The defender reads what he can see, and he can see your head and shoulders." },
        { front: "When does a double move work?", back: "When the defender has jumped honest single breaks and the first move is sold completely." },
      ],
      quizQuestions: [
        {
          questionText: "Put the break in order.",
          questionType: "ordering",
          payload: { items: ["Sink the hips", "Plant the outside foot", "Drive the first step out"], explanation: "They happen almost at once, in that order." },
        },
        {
          questionText: "Why is the Deceleration and Stick Landing drill on this chapter's day?",
          answers: [
            { answerText: "Because a break is a deceleration first: you have to stop before you can change direction.", isCorrect: true, explanation: "The best receivers stop in a single step." },
            { answerText: "Because landing is part of catching.", isCorrect: false, explanation: "Catching is Chapter 4." },
            { answerText: "Because it is a conditioning drill.", isCorrect: false, explanation: "No." },
            { answerText: "By mistake.", isCorrect: false, explanation: "It is there on purpose." },
          ],
        },
        {
          questionText: "The plant foot is the ___ foot, the one away from the direction of the break.",
          questionType: "fill_blank",
          payload: { accepted: ["outside", "outside foot", "far", "opposite"], explanation: "It hits hard and takes the whole body's momentum." },
        },
        {
          questionText: "Why does the upper body sell the route?",
          answers: [
            { answerText: "The defender reads what he can see, and he sees your head and shoulders.", isCorrect: true, explanation: "The head and shoulders turn a beat before the feet." },
            { answerText: "Because the feet are too fast to see.", isCorrect: false, explanation: "Not the reason the chapter gives." },
            { answerText: "Because the referee watches the shoulders.", isCorrect: false, explanation: "No." },
            { answerText: "It does not; only the feet matter.", isCorrect: false, explanation: "The chapter says the opposite." },
          ],
        },
        {
          questionText: "Why does a double move stop working if you run it every play?",
          answers: [
            { answerText: "The defender learns to wait, and a defender who waits is never fooled.", isCorrect: true, explanation: "It works because the single breaks were run honestly." },
            { answerText: "It gets you tired.", isCorrect: false, explanation: "No." },
            { answerText: "The quarterback cannot throw it.", isCorrect: false, explanation: "No." },
            { answerText: "It is illegal more than twice.", isCorrect: false, explanation: "No." },
          ],
        },
      ],
    },
    {
      title: "Hands",
      description:
        "A receiver who gets open and drops the ball has done nothing. This chapter is about catching: the hands, the eyes, catching in traffic, and the thing most receivers never practice, catching a bad ball.",
      drills: ["Comeback Catch and Sideline Awareness", "Slant Route Technique", "Reaction Ball Footwork", "Catch-and-Shoot Reps"],
      content: [
        {
          title: "Hands, Not Body",
          body:
            "Catch the ball with the hands, away from the body, and bring it in. A ball caught against the chest is a ball that bounces off the pads, and it is also a ball the defender can knock loose because it never got secured.\n\nThe shape: thumbs together for a ball above the chest, pinkies together for a ball below the waist, fingers spread and relaxed. The hands go to the ball; the ball does not come to the hands. See the point of the ball into the hands, then tuck it.\n\nThis is not a chapter you read once. It is fifty catches a day for the rest of your career. The best receivers at every level still start practice with hands drills, and so will you.",
        },
        {
          title: "Eyes Through the Catch",
          body:
            "Most drops are not hand problems. They are eye problems. The receiver looks away from the ball a moment before it arrives, toward the defender or the sideline or the end zone, and the hands close on nothing.\n\nThe rule is eyes through the catch: watch the ball into the hands, watch the tuck, and only then look up. It costs a tenth of a second, and that tenth is nothing beside the drop it prevents.\n\nThe Comeback Catch and Sideline Awareness drill puts this under pressure on purpose: the sideline is right there and the body wants to check it. Feel the sideline with the feet from the earlier reps; the eyes stay on the ball.",
        },
        {
          title: "Catching in Traffic",
          body:
            "On a slant, the ball arrives as the defender does. Catching it means expecting the hit and catching anyway.\n\nThree things help. Catch it early, with the hands out in front, so the ball is secured before the contact. Tuck it high and tight immediately, elbow over the point. And keep your eyes on the ball through the hit, because flinching is what opens the hands.\n\nThe Slant Route Technique drill in this chapter is run with a partner closing on the catch. Not to hit you, but to be there, so that catching with somebody in your space stops being new.",
        },
        {
          title: "The Bad Ball",
          body:
            "Quarterbacks miss. The ball comes high, low, behind, early, late. A receiver who only practices catching perfect passes drops the imperfect ones, and in a game most of them are imperfect.\n\nSo practice the bad ball on purpose. Balls behind you, where the body has to turn and the hands have to reach back. Balls low, where the pinkies come together and the knees bend. Balls high, where you have to climb and still bring it in. The Reaction Ball Footwork drill belongs here: an unpredictable bounce makes the hands and feet adjust together, which is exactly what a bad throw asks of them.\n\nThe Catch-and-Shoot Reps drill is borrowed from basketball for one reason: it asks for hands that catch while the feet are moving and the eyes are somewhere else a moment later. Any catch-and-move rep builds the same thing.",
        },
        keyPoints([
          "Hands, not body. Thumbs together high, pinkies together low, hands to the ball, see it in, tuck.",
          "Most drops are eye problems. Eyes through the catch, then look up.",
          "In traffic: catch early with the hands out front, tuck high and tight, eyes on the ball through the hit.",
          "Practice the bad ball on purpose. In a game, most of them are.",
          "Fifty catches a day, for the rest of your career.",
        ]),
      ],
      flashcards: [
        { front: "Why not catch against the chest?", back: "The ball bounces off the pads, and it never gets secured, so a defender can knock it loose." },
        { front: "Hand shape above the chest and below the waist", back: "Thumbs together high, pinkies together low, fingers spread and relaxed." },
        { front: "What causes most drops?", back: "The eyes leaving the ball a moment before it arrives." },
        { front: "The rule for the eyes", back: "Eyes through the catch: watch it in, watch the tuck, then look up." },
        { front: "Three things for a catch in traffic", back: "Catch early with hands out front, tuck high and tight, eyes on the ball through the hit." },
        { front: "Why practice bad throws?", back: "In a game most throws are imperfect; a receiver who only catches perfect passes drops the rest." },
      ],
      quizQuestions: [
        {
          questionText: "Match the ball's height with the hand shape.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Above the chest", right: "Thumbs together" },
              { left: "Below the waist", right: "Pinkies together" },
            ],
            explanation: "Fingers spread and relaxed in both.",
          },
        },
        {
          questionText: "According to the chapter, most drops are ___ problems, not hand problems.",
          questionType: "fill_blank",
          payload: { accepted: ["eye", "eyes", "vision"], explanation: "The eyes leave the ball a moment early and the hands close on nothing." },
        },
        {
          questionText: "What is the rule for the eyes on a catch?",
          answers: [
            { answerText: "Eyes through the catch: watch the ball in, watch the tuck, then look up.", isCorrect: true, explanation: "It costs a tenth of a second and prevents the drop." },
            { answerText: "Watch the defender so you can brace.", isCorrect: false, explanation: "Watching the defender is what opens the hands." },
            { answerText: "Look upfield as the ball arrives to plan the run.", isCorrect: false, explanation: "That is the drop." },
            { answerText: "Close your eyes on contact.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Why is the slant drill in this chapter run with a partner closing on the catch?",
          answers: [
            { answerText: "So that catching with somebody in your space stops being new.", isCorrect: true, explanation: "Not to hit you, but to be there." },
            { answerText: "To practice tackling.", isCorrect: false, explanation: "This is a receiving class." },
            { answerText: "To make the drill harder for no reason.", isCorrect: false, explanation: "The reason is the game: on a slant the ball and the defender arrive together." },
            { answerText: "It is not; the drill is run alone.", isCorrect: false, explanation: "The chapter says a partner closes on the catch." },
          ],
        },
        {
          questionText: "Why practice catching bad throws on purpose?",
          answers: [
            { answerText: "Because in a game most throws are imperfect, and a receiver who only catches perfect ones drops the rest.", isCorrect: true, explanation: "High, low, behind, early, late: practice all of them." },
            { answerText: "To embarrass the quarterback.", isCorrect: false, explanation: "No." },
            { answerText: "Because bad throws are easier to catch.", isCorrect: false, explanation: "They are harder, which is the point of practicing them." },
            { answerText: "Coaches do not recommend it.", isCorrect: false, explanation: "The chapter does." },
          ],
        },
      ],
    },
    {
      title: "Reading Coverage",
      description:
        "A receiver who knows what the defense is doing gets open on purpose. This chapter is a working introduction to coverage: man or zone, where the safeties are, and what it means for your route.",
      drills: ["Option Route Reads", "Post Route Timing", "Backpedal to Sprint Transition", "Mirror Drill - Reactive Footwork"],
      content: [
        {
          title: "Man or Zone",
          body:
            "The first question on every snap is whether the defender across from you is covering you or covering a piece of the field.\n\nIn man coverage he follows you wherever you go. His eyes are on you, his hips are turned toward you, and he will run with you. Against man, the route is a race and a break: beat him off the line, win the break, and the throw is to you.\n\nIn zone coverage he drops to a spot and watches the quarterback. His eyes are on the backfield, his hips are square, and he will pass you off to the next defender when you leave his area. Against zone, the route is about finding the space between defenders and sitting in it.\n\nThe tell is the eyes. A defender looking at you is in man; a defender looking at the quarterback is in zone. Check it on the first step of the route and adjust.",
        },
        {
          title: "Count the Safeties",
          body:
            "After man or zone, the second question is how many safeties are deep. Two deep safeties split the field in halves and make the deep middle hard to throw; one deep safety sits in the middle and leaves the deep sidelines to the corners; no deep safety means everybody is up and the deep ball is on.\n\nYou do not need to know the names of the coverages to use this. Two high means the post is covered and the out is open. One high means the post has a chance and the corner is alone on the sideline. Zero high means run, because the ball is coming deep.\n\nLook before the snap. The safeties tell you more than anybody else on the field, and they are the easiest to see because they are standing still twelve yards away.",
        },
        {
          title: "Option Routes: Reading on the Move",
          body:
            "An option route is a route with a decision in it: the receiver reads the defender at the break and goes where the defender is not. Inside leverage, break outside. Outside leverage, break inside. Zone, sit in the hole. Man, keep running.\n\nThe Option Route Reads drill is where this is learned, and it is learned slowly. The read has to happen at full speed and the break has to be as sharp as a called route, so there is no time to think. The decision rules have to be so familiar that the feet make them.\n\nThe quarterback is making the same read. That is what makes the option route work and what makes it dangerous: if you see it one way and he sees it the other, the ball goes where you are not. Reps with your quarterback, not just with cones, are the only cure.",
        },
        {
          title: "Finding the Hole in a Zone",
          body:
            "Against zone the race is not with a defender; it is with the quarterback's clock. The route has to arrive in the space between two defenders at the moment the quarterback is ready to throw, and then stop there.\n\nThree habits. Throttle down when you reach the hole; a receiver running through the open space arrives in the next defender's zone. Turn and show the quarterback your numbers so he has a target. And keep working: if the throw does not come, slide along the hole with the quarterback's eyes rather than standing still.\n\nThe Backpedal to Sprint Transition and the Mirror Drill are defensive-footwork drills on a receiver's day for one reason: running them teaches you how a defender moves, and a receiver who knows how the defender's feet work knows where the hole will be.",
        },
        keyPoints([
          "Man or zone: look at the defender's eyes. On you is man, on the quarterback is zone.",
          "Count the safeties. Two high closes the post and opens the out; one high leaves the corner alone; zero high is a deep ball.",
          "Option routes: the read happens at full speed, and the quarterback is reading the same thing. Rep it with him.",
          "Against zone, throttle down in the hole, show your numbers, and slide with the quarterback's eyes.",
        ]),
      ],
      flashcards: [
        { front: "The tell for man or zone", back: "The defender's eyes. On you: man. On the quarterback: zone." },
        { front: "Against man, the route is...", back: "A race and a break. Beat him off the line, win the break." },
        { front: "Against zone, the route is...", back: "Finding the space between defenders and sitting in it." },
        { front: "Two deep safeties means", back: "The deep middle is covered: the post is closed, the out is open." },
        { front: "What makes an option route dangerous?", back: "The quarterback makes the same read; if you disagree, the ball goes where you are not." },
        { front: "Three habits in a zone hole", back: "Throttle down, show your numbers, slide with the quarterback's eyes." },
      ],
      quizQuestions: [
        {
          questionText: "How do you tell man coverage from zone on the first step?",
          answers: [
            { answerText: "The defender's eyes: on you is man, on the quarterback is zone.", isCorrect: true, explanation: "His hips tell the same story: turned toward you or square." },
            { answerText: "Ask the referee.", isCorrect: false, explanation: "No." },
            { answerText: "Count the linemen.", isCorrect: false, explanation: "Linemen do not tell you coverage." },
            { answerText: "You cannot tell until the throw.", isCorrect: false, explanation: "The chapter says to check it on the first step." },
          ],
        },
        {
          questionText: "Match the safety count with what it means for your route.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Two deep", right: "Post covered, out open" },
              { left: "One deep", right: "Corner alone on the sideline" },
              { left: "Zero deep", right: "The deep ball is on" },
            ],
            explanation: "The safeties tell you more than anyone else on the field.",
          },
        },
        {
          questionText: "On an option route against inside leverage, you break ___.",
          questionType: "fill_blank",
          payload: { accepted: ["outside", "out"], explanation: "Go where the defender is not." },
        },
        {
          questionText: "Why do you throttle down in a zone hole?",
          answers: [
            { answerText: "A receiver running through the open space arrives in the next defender's zone.", isCorrect: true, explanation: "Stop in the hole, show your numbers, slide with the quarterback's eyes." },
            { answerText: "To rest.", isCorrect: false, explanation: "No." },
            { answerText: "Because zone defenders are slow.", isCorrect: false, explanation: "Not the reason." },
            { answerText: "You should not; keep running.", isCorrect: false, explanation: "Keep running is the answer against man, not zone." },
          ],
        },
        {
          questionText: "Why are two defensive footwork drills on a receiver's drill day?",
          answers: [
            { answerText: "Running them teaches how a defender moves, so you know where the hole will be.", isCorrect: true, explanation: "A receiver who knows the defender's feet knows the space." },
            { answerText: "Because receivers also play defense.", isCorrect: false, explanation: "Some do, but that is not the reason given." },
            { answerText: "To fill the day.", isCorrect: false, explanation: "No." },
            { answerText: "They are not; the chapter removes them.", isCorrect: false, explanation: "They are there on purpose." },
          ],
        },
      ],
    },
    {
      title: "The Ball in the Air",
      description:
        "The last part of the job: tracking a deep ball, winning a contested catch, the sideline and the end zone, and what to do after the catch. The final page returns to your Chapter 1 release.",
      drills: ["Post Route Timing", "Comeback Catch and Sideline Awareness", "Double Move Route Running", "40-Yard Dash"],
      content: [
        {
          title: "Tracking the Deep Ball",
          body:
            "A deep ball is caught with the eyes first. Chapter 2 gave the rule: the defender gets your eyes through the break, and only then does the ball, picked up over the inside shoulder.\n\nOnce you see it, run under it rather than to it. The ball has an arc, and the arc tells you where it will come down; a receiver who sprints to where the ball is now arrives early and has to slow down, which is when the defender catches up. Adjust your speed to arrive as the ball does, and catch it at full extension, hands out, away from the body, with the defender behind you.\n\nThe Post Route Timing drill on this day is run with real throws, not a cone at the end. The cone taught you the depth; the throw teaches you the arc.",
        },
        {
          title: "The Contested Catch",
          body:
            "Sometimes the defender is there. The ball is in the air, he is as close as you are, and somebody is going to come down with it.\n\nThe receiver's advantages are that he knows where the ball is going and he is going forward. Use both: go up for the ball at its highest point, with the hands above the defender's, and bring it down with the body turned so that your back is to him. Attack the ball; a receiver who waits for it lets the defender play it.\n\nFinish the catch on the ground. The tuck, the elbow over the point, the ball secured before you worry about anything else. A contested catch is not complete until the ball is yours after the landing.",
        },
        {
          title: "The Sideline and the End Zone",
          body:
            "Two places on the field change the catch. On the sideline, the feet decide whether the catch counts, and the rule for your level decides how many feet. Know the rule. Then practice catching with the sideline as a fact you can feel, not a thing you look at: the Comeback Catch and Sideline Awareness drill is built on exactly that, and the point of the earlier reps was to put the sideline in your feet so the eyes can stay on the ball.\n\nIn the end zone, the field gets short. Routes that break at ten yards have nowhere to go, so the breaks get sharper and the throws get faster. The back line is a sideline too, and the same rule applies: feel it, do not look for it.",
        },
        {
          title: "After the Catch",
          body:
            "The catch is secured. Now you are a runner. Two decisions, made before the ball arrives: which way, and how.\n\nWhich way is read from the coverage in Chapter 5: against man, away from the defender who was covering you; against zone, toward the space the defenders left when they converged. How is simpler: get upfield. A receiver who dances sideways gives the defense time to arrive. Get north, protect the ball with the arm away from the nearest defender, and take the yards the play gives you.\n\nThe 40-Yard Dash is on this day as a reminder that the job after the catch is still running, and running well is a skill.",
        },
        {
          title: "Back to Your Release",
          body:
            "In Chapter 1 you ran the 20-Yard Dash as a release test: three steps out of your stance, repeated. Run it again. Film it the same way you did then.\n\nCompare. Is the stance the same every rep? Has the false step gone? Are the first three steps driving? Then watch a route from Chapter 2 beside one from today: same stem, sharper break, the eyes in the right place.\n\nWhat you are looking for is not a faster time. It is a receiver whose release, routes, breaks and hands look like one player's, every rep. That is what a defense cannot read, and that is what gets you the ball.",
        },
        keyPoints([
          "Track the deep ball by its arc: run under it, arrive as it does, catch at full extension.",
          "Contested catch: attack the ball at its highest point, back to the defender, finish on the ground.",
          "The sideline and the back line are in your feet, never in your eyes. Know the rule for your level.",
          "After the catch: which way is read from coverage; how is get upfield.",
          "Repeat the release test. One player's release, routes, breaks and hands, every rep.",
        ]),
      ],
      flashcards: [
        { front: "How do you track a deep ball?", back: "Find it over the inside shoulder, run under its arc, arrive as it does, catch at full extension." },
        { front: "The receiver's advantages on a contested catch", back: "He knows where the ball is going and he is going forward." },
        { front: "When is a contested catch complete?", back: "After the landing, with the ball secured." },
        { front: "The sideline rule", back: "Feel it with the feet, never look for it. Know how many feet your level needs." },
        { front: "After the catch, how?", back: "Get upfield. Protect the ball with the arm away from the nearest defender." },
        { front: "What does the repeated release test look for?", back: "A release, routes, breaks and hands that look like one player's, every rep." },
      ],
      quizQuestions: [
        {
          questionText: "Why run under a deep ball rather than to where it is?",
          answers: [
            { answerText: "The arc tells you where it comes down; sprinting to where it is now means arriving early and slowing, which lets the defender catch up.", isCorrect: true, explanation: "Adjust speed to arrive as the ball does." },
            { answerText: "Because deep balls are thrown short.", isCorrect: false, explanation: "No." },
            { answerText: "To avoid the sideline.", isCorrect: false, explanation: "Not the reason." },
            { answerText: "You should sprint to it.", isCorrect: false, explanation: "The chapter says the opposite." },
          ],
        },
        {
          questionText: "Put the contested catch in order.",
          questionType: "ordering",
          payload: { items: ["Go up at the ball's highest point", "Hands above the defender's", "Turn so your back is to him", "Finish the catch on the ground"], explanation: "Attack the ball; a receiver who waits lets the defender play it." },
        },
        {
          questionText: "The sideline should be in your ___, not your eyes.",
          questionType: "fill_blank",
          payload: { accepted: ["feet", "foot"], explanation: "The earlier reps put it there so the eyes can stay on the ball." },
        },
        {
          questionText: "After the catch, how do you run?",
          answers: [
            { answerText: "Get upfield, with the ball in the arm away from the nearest defender.", isCorrect: true, explanation: "A receiver who dances sideways gives the defense time to arrive." },
            { answerText: "Sideways, looking for the biggest gap.", isCorrect: false, explanation: "Dancing is what the chapter warns against." },
            { answerText: "Backward, to set up blockers.", isCorrect: false, explanation: "No." },
            { answerText: "Stop and go down to protect the ball.", isCorrect: false, explanation: "Take the yards the play gives you." },
          ],
        },
        {
          questionText: "What does the repeated 20-yard release test look for?",
          answers: [
            { answerText: "The same stance, no false step, three driving steps: one player's release every rep.", isCorrect: true, explanation: "Not a faster time." },
            { answerText: "A faster forty time.", isCorrect: false, explanation: "The chapter says it is not about the time." },
            { answerText: "More catches.", isCorrect: false, explanation: "The release test is about the first three steps." },
            { answerText: "A reason to stop practicing.", isCorrect: false, explanation: "No." },
          ],
        },
      ],
    },
  ],
};
