import { keyPoints, type ForgeClassContent } from "./types";

/** Soccer: The Complete Attacker (2026-10-04). Six chapters for an attacking player, built on
 * the Ball Control, Dribbling, Passing and Shooting drills in the skill library. Written for a
 * high-school player. */
export const SOCCER_ATTACKING_CLASS: ForgeClassContent = {
  name: "Soccer: The Complete Attacker",
  description:
    "Six chapters on the four things an attacker does with the ball: a first touch that buys time, dribbling that beats a defender, passing that moves a defense, and finishing that ends the move. Then the thing that ties them together: the decision before the ball arrives.",
  category: "Soccer",
  readingLevel: "high_school",
  chapters: [
    {
      title: "The First Touch",
      description:
        "Everything an attacker does starts with the first touch. This chapter is about receiving the ball so that the next thing you want to do is already possible.",
      drills: ["First Touch - Ground Ball", "First Touch - Aerial Ball", "Wall Passing - One Touch", "Sole Roll Control"],
      content: [
        {
          title: "A Touch Is a Decision",
          body:
            "The first touch is not about stopping the ball. It is about putting the ball where your next action starts. A touch that kills the ball dead at your feet is a touch that has decided nothing, and now a defender is closing while you decide.\n\nWatch a good attacker receive a pass. The ball does not stop; it moves a yard, into space, away from pressure, onto the foot that will pass or shoot. The touch and the decision are the same thing.\n\nSo every drill in this chapter asks the same question: after the touch, where is the ball, and what can you do from there? The First Touch drills with a ground ball and an aerial ball are about control; the point of the control is the yard the ball travels on purpose.",
        },
        {
          title: "Look Before It Arrives",
          body:
            "The decision about the touch is made before the ball gets to you. In the second the pass is travelling, the head comes up: where is the nearest defender, where is the space, where are my teammates. Then the eyes come back to the ball for the touch itself.\n\nPlayers who never look up receive the ball and then look, and by then the picture has changed. Players who look while the ball travels receive it already knowing where it goes next.\n\nThis is a habit, not a talent. Build it in the Wall Passing drill: every pass against the wall, look over your shoulder while the ball is on its way back, then take the touch. It feels slow for a week and then it is the fastest thing you do.",
        },
        {
          title: "Cushion, Push, Turn",
          body:
            "Three kinds of first touch cover most of the game.\n\n**The cushion.** For a ball arriving fast or in the air, the receiving surface gives as the ball arrives, taking pace off it so it drops at your feet. The First Touch - Aerial Ball drill is all cushion: chest, thigh, foot, each one a soft landing.\n\n**The push.** For a ball you want to move into space, the touch sends it a yard or two in the direction of your next action. Firm, directed, with the inside or outside of the foot. The ball should arrive where your second step lands.\n\n**The turn.** For a ball arriving with your back to goal, the touch takes you round in one movement, so that you are facing forward with the ball in front of you. The Sole Roll Control drill is the simplest turn: trap under the sole, roll it across your body, and the turn is done.\n\nWhich touch depends on the look you took while the ball was travelling.",
        },
        {
          title: "Under Pressure",
          body:
            "The first touch is easy with nobody near you. The skill is the touch with a defender on your back, and that is where the yard of movement matters most: a touch away from the defender is a yard he has to cover before he can tackle.\n\nTwo rules. Receive on the back foot, the one farther from the defender, so the body is between him and the ball from the moment it arrives. And touch away from pressure, not toward it: if he is on your right, the ball goes left.\n\nA touch under pressure that goes wrong is a turnover in a dangerous place. A touch under pressure that goes right is the defender beaten without a dribble. Spend more time on this than anything else in the chapter.",
        },
        keyPoints([
          "A first touch is a decision: the ball moves a yard on purpose, into the next action.",
          "Look while the ball is travelling, then eyes back to the ball for the touch.",
          "Cushion for pace, push for space, turn for a ball with your back to goal.",
          "Under pressure: receive on the back foot, touch away from the defender.",
        ]),
      ],
      flashcards: [
        { front: "What is the first touch for?", back: "Putting the ball where your next action starts. Not stopping it." },
        { front: "When is the touch decided?", back: "Before the ball arrives, while it is travelling, with the head up." },
        { front: "The cushion", back: "The surface gives as the ball arrives, taking pace off so it drops at your feet." },
        { front: "The push", back: "A firm, directed touch that sends the ball a yard or two into the next action." },
        { front: "The turn", back: "A touch that takes you round in one movement with the ball in front of you." },
        { front: "Two rules under pressure", back: "Receive on the back foot; touch away from the defender." },
      ],
      quizQuestions: [
        {
          questionText: "What does a good first touch do with the ball?",
          answers: [
            { answerText: "Moves it a yard on purpose, into the space where the next action starts.", isCorrect: true, explanation: "A touch that kills the ball dead has decided nothing." },
            { answerText: "Stops it dead at your feet.", isCorrect: false, explanation: "That leaves the decision still to make while a defender closes." },
            { answerText: "Sends it back where it came from.", isCorrect: false, explanation: "No." },
            { answerText: "Lifts it into the air.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Match the touch with when you use it.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Cushion", right: "A fast or aerial ball that needs pace taken off" },
              { left: "Push", right: "A ball you want to move into space" },
              { left: "Turn", right: "A ball arriving with your back to goal" },
            ],
            explanation: "Which touch depends on the look you took while the ball travelled.",
          },
        },
        {
          questionText: "Under pressure, receive the ball on the ___ foot, the one farther from the defender.",
          questionType: "fill_blank",
          payload: { accepted: ["back", "back foot", "far", "far foot"], explanation: "So the body is between him and the ball from the moment it arrives." },
        },
        {
          questionText: "When should you look up to read the picture?",
          answers: [
            { answerText: "While the ball is travelling to you, before the touch.", isCorrect: true, explanation: "Then the eyes come back to the ball for the touch itself." },
            { answerText: "After the touch, once the ball is under control.", isCorrect: false, explanation: "By then the picture has changed." },
            { answerText: "Never; keep your eyes on the ball at all times.", isCorrect: false, explanation: "The eyes return to the ball for the touch, but the look comes first." },
            { answerText: "Only when a coach shouts.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "The defender is on your right. Which way does your touch go?",
          answers: [
            { answerText: "Left, away from him.", isCorrect: true, explanation: "A touch away from pressure is a yard he has to cover." },
            { answerText: "Right, into him, to draw a foul.", isCorrect: false, explanation: "The chapter says touch away from pressure." },
            { answerText: "Straight back.", isCorrect: false, explanation: "No." },
            { answerText: "It does not matter.", isCorrect: false, explanation: "It is the difference between a turnover and a beaten defender." },
          ],
        },
      ],
    },
    {
      title: "Beating a Defender",
      description:
        "Dribbling is not tricks. It is taking the ball past a defender when that is the best thing to do. This chapter covers close control, change of pace, the one or two moves you will actually use, and when not to dribble at all.",
      drills: ["Close Control Sprint", "Change of Direction Dribbling", "1v1 Attacking Moves", "Ball Mastery Circuit"],
      content: [
        {
          title: "Close Control First",
          body:
            "A dribble is a series of touches, and the ball should never be more than a step away from the foot that will touch it next. That is close control, and without it every move in this chapter is a ball given away.\n\nThe Ball Mastery Circuit is where close control is built: toe taps, sole rolls, inside-outside touches, hundreds of them, with both feet, until the ball feels like part of the foot. The Close Control Sprint adds speed: push the ball with the laces so that it stays within a stride at a full run.\n\nYou will not feel like an attacker doing these. Every attacker who can take a defender on did them anyway.",
        },
        {
          title: "Change of Pace Beats Change of Direction",
          body:
            "Most young players think beating a defender is about a move. It is mostly about speed, and specifically about changing it.\n\nA defender sets his feet to the speed you are going. Approach him slowly, with the ball under control, and he slows with you. Then go, with one touch that takes the ball past him and a burst that takes you after it. By the time his feet have caught up to the new speed, you are a yard past.\n\nThe Change of Direction Dribbling drill works the second half: the cut that sends the ball one way while the defender's weight is going the other. But the cut only works because the pace changed first. Slow, slow, fast is the pattern, and the move is just how the fast part starts.",
        },
        {
          title: "Two Moves, Owned",
          body:
            "You do not need ten moves. You need two that you can do at speed, with either foot, without thinking, and that go in different directions. The 1v1 Attacking Moves drill will show you several; pick the two that feel natural and own them.\n\nA simple pair: a step-over that goes outside, and a cut inside with the inside of the foot. The step-over sells outside and goes outside when the defender does not bite, or goes inside when he does. The cut inside is the plain answer when the defender is leaning outside.\n\nThe move happens at the right distance. Too far away and the defender has time to reset; too close and he has a foot in. About two strides from him is where it starts, with the ball on the foot you will push it with.",
        },
        {
          title: "When Not to Dribble",
          body:
            "The best dribblers dribble less than you think. They take a defender on when the numbers favour it, and they pass when they do not.\n\nTake him on when: you are one-on-one with space behind him, a teammate is not in a better position, and the move puts you closer to goal. Pass when: there are two defenders, a teammate is open and forward, or losing the ball here would leave your team exposed.\n\nThe decision is made before you receive the ball, in the look from Chapter 1. A player who receives the ball and then decides whether to dribble has already waited too long. Dribbling is a choice with a reason, never a reflex.",
        },
        keyPoints([
          "Close control first: the ball never more than a step from the foot that touches it next.",
          "Change of pace beats change of direction. Slow, slow, fast; the move is how the fast part starts.",
          "Two moves, owned, in different directions, at speed, with either foot.",
          "Take a defender on when the numbers favour it. Dribbling is a choice with a reason.",
        ]),
      ],
      flashcards: [
        { front: "What is close control?", back: "The ball never more than a step from the foot that will touch it next." },
        { front: "What beats a defender more than a move?", back: "A change of pace. He sets his feet to your speed; change it and he is a step behind." },
        { front: "The pattern for beating a defender", back: "Slow, slow, fast." },
        { front: "How many moves do you need?", back: "Two, owned, going in different directions, at speed, with either foot." },
        { front: "Where does the move start?", back: "About two strides from the defender, ball on the foot you will push it with." },
        { front: "When do you pass instead of dribble?", back: "Two defenders, a teammate open and forward, or a loss here would expose your team." },
      ],
      quizQuestions: [
        {
          questionText: "According to the chapter, what mostly beats a defender?",
          answers: [
            { answerText: "A change of pace: slow, then a burst past him.", isCorrect: true, explanation: "The defender sets his feet to your speed." },
            { answerText: "A move with lots of step-overs.", isCorrect: false, explanation: "The move is only how the fast part starts." },
            { answerText: "Shouting.", isCorrect: false, explanation: "No." },
            { answerText: "Running straight at him at full speed from thirty yards.", isCorrect: false, explanation: "Full speed from far away gives him time to set." },
          ],
        },
        {
          questionText: "The pattern for beating a defender is slow, slow, ___.",
          questionType: "fill_blank",
          payload: { accepted: ["fast", "go", "quick", "burst"], explanation: "By the time his feet catch up to the new speed, you are past." },
        },
        {
          questionText: "Why does the chapter say to own two moves rather than ten?",
          answers: [
            { answerText: "Two you can do at speed, with either foot, without thinking, in different directions, cover what a game asks.", isCorrect: true, explanation: "The 1v1 drill shows several; pick the two that feel natural." },
            { answerText: "Because ten moves is against the rules.", isCorrect: false, explanation: "No." },
            { answerText: "Because defenders only know two.", isCorrect: false, explanation: "No." },
            { answerText: "It does not; it says learn as many as possible.", isCorrect: false, explanation: "The chapter says the opposite." },
          ],
        },
        {
          questionText: "Put the take-on in order.",
          questionType: "ordering",
          payload: { items: ["Approach slowly with the ball under control", "Get to about two strides from him", "One touch past him", "Burst after the ball"], explanation: "Slow, slow, fast, with the move at the right distance." },
        },
        {
          questionText: "Which situation says pass rather than dribble?",
          answers: [
            { answerText: "Two defenders in front of you and a teammate open and forward.", isCorrect: true, explanation: "Take a defender on when the numbers favour it." },
            { answerText: "One-on-one with space behind the defender.", isCorrect: false, explanation: "That is a take-on." },
            { answerText: "You feel like it.", isCorrect: false, explanation: "Dribbling is a choice with a reason, never a reflex." },
            { answerText: "The crowd wants a trick.", isCorrect: false, explanation: "No." },
          ],
        },
      ],
    },
    {
      title: "Passing That Moves a Defense",
      description:
        "A pass is a message to a teammate and a problem for a defense. This chapter covers weight and accuracy, the surfaces, the passes an attacker uses most, and passing with a purpose.",
      drills: ["Two-Touch Passing Circuit", "Give-and-Go Passing", "Through Ball Passing", "Driven Ball Passing"],
      content: [
        {
          title: "Weight and Target",
          body:
            "Two things decide whether a pass is good. Where it goes, and how hard. Most players think about the first and forget the second, and a pass that reaches the right player at the wrong speed is still a bad pass: too soft and it is intercepted, too hard and it cannot be controlled.\n\nThe target is usually a foot, not a player. Pass to the foot that lets your teammate do the next thing: the far foot if he wants to turn, the near foot if he wants to play it back, in front of him if he is running.\n\nThe Two-Touch Passing Circuit trains both. Every pass has a target foot and a weight the receiver can take in one touch and play in the second. If the receiver needs three touches, the weight was wrong.",
        },
        {
          title: "Surfaces",
          body:
            "The inside of the foot is the accurate surface: a big flat area, good for short and medium passes where the target matters more than the speed. Ankle locked, toe up, follow through at the target.\n\nThe laces are the power surface: a driven ball with the instep that travels fast and low, for a longer pass that has to beat a defender to the receiver. The Driven Ball Passing drill is about keeping it on the ground: strike through the middle of the ball, body over it, and the ball stays down.\n\nThe outside of the foot is the disguised surface: a pass that can be played without turning the hips, so the defender does not see it coming. Learn it last, use it least, and when it is right it is the best pass on the field.",
        },
        {
          title: "The Give-and-Go and the Through Ball",
          body:
            "Two passes do most of an attacker's work.\n\nThe give-and-go is a pass and a run: play it to a teammate, run past the defender who was marking you, and receive it back. It works because a defender cannot watch the ball and you at the same time. The Give-and-Go Passing drill is about the run as much as the pass: the pass is the easy part, the burst after it is what beats the defender.\n\nThe through ball is a pass into space for a runner. The weight is everything: it has to arrive where the runner will be, not where he is, and it has to get there before the defender. The Through Ball Passing drill is all timing. Play it as the runner's defender turns to look at the ball, because that is the moment he cannot see the runner go.",
        },
        {
          title: "Passing With a Purpose",
          body:
            "A pass that goes sideways and changes nothing is a pass the defense is happy with. A good pass makes the defense move: it goes forward, it goes between two defenders, or it switches the ball to the side they are not on.\n\nBefore every pass, one question: what does this do to them? If the answer is nothing, look for a different pass, or carry the ball a yard to make the defender commit and then pass.\n\nThe best attackers pass early. A pass played as soon as the picture is clear arrives before the defense has reset. A pass held for one more touch arrives after it has. The look from Chapter 1 is what makes the early pass possible.",
        },
        keyPoints([
          "A pass is where it goes AND how hard. Target a foot, and a weight the receiver can take in one touch.",
          "Inside of the foot for accuracy, laces for a driven ball, outside of the foot for disguise.",
          "The give-and-go is a pass and a run; the run is what beats the defender.",
          "The through ball is timing: play it as the runner's defender turns to look at the ball.",
          "Every pass asks: what does this do to them? Pass early.",
        ]),
      ],
      flashcards: [
        { front: "Two things that decide a pass", back: "Where it goes and how hard. Weight matters as much as target." },
        { front: "The target of a pass", back: "A foot, not a player: the foot that lets your teammate do the next thing." },
        { front: "Inside of the foot, laces, outside of the foot", back: "Accuracy, power, disguise." },
        { front: "What makes a give-and-go work?", back: "A defender cannot watch the ball and you at the same time. The run after the pass beats him." },
        { front: "When to play a through ball", back: "As the runner's defender turns to look at the ball." },
        { front: "The question before every pass", back: "What does this do to them? If nothing, find a different pass." },
      ],
      quizQuestions: [
        {
          questionText: "Match the surface with what it is for.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Inside of the foot", right: "Accuracy over short and medium range" },
              { left: "Laces", right: "A driven ball that travels fast and low" },
              { left: "Outside of the foot", right: "Disguise, played without turning the hips" },
            ],
            explanation: "Learn the outside of the foot last and use it least.",
          },
        },
        {
          questionText: "A pass should be weighted so the receiver can take it in ___ touch and play it with the second.",
          questionType: "fill_blank",
          payload: { accepted: ["one", "1", "a single"], explanation: "If the receiver needs three touches, the weight was wrong." },
        },
        {
          questionText: "What makes a give-and-go beat a defender?",
          answers: [
            { answerText: "He cannot watch the ball and you at the same time, and the run after the pass goes past him.", isCorrect: true, explanation: "The pass is the easy part." },
            { answerText: "The pass is hit very hard.", isCorrect: false, explanation: "Power is not the point." },
            { answerText: "The defender is not allowed to follow you.", isCorrect: false, explanation: "No." },
            { answerText: "It does not; give-and-gos rarely work.", isCorrect: false, explanation: "It is one of the two passes that do most of an attacker's work." },
          ],
        },
        {
          questionText: "When should a through ball be played?",
          answers: [
            { answerText: "As the runner's defender turns to look at the ball.", isCorrect: true, explanation: "That is the moment he cannot see the runner go." },
            { answerText: "As soon as you receive the ball, every time.", isCorrect: false, explanation: "Timing is everything; the runner and the defender decide when." },
            { answerText: "After the runner has stopped.", isCorrect: false, explanation: "The ball goes where the runner will be, not where he is." },
            { answerText: "Only from a free kick.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Why does the chapter say to pass early?",
          answers: [
            { answerText: "A pass played as soon as the picture is clear arrives before the defense has reset.", isCorrect: true, explanation: "One more touch and it arrives after." },
            { answerText: "To avoid being tackled.", isCorrect: false, explanation: "Safety is not the reason given." },
            { answerText: "Because referees punish slow play.", isCorrect: false, explanation: "No." },
            { answerText: "It does not; it says to hold the ball.", isCorrect: false, explanation: "The chapter says the opposite." },
          ],
        },
      ],
    },
    {
      title: "Finishing",
      description:
        "Goals are what attackers are for. This chapter covers placement over power, the two finishes you will use most, first-time finishing, and the one-on-one with the keeper.",
      drills: ["Finesse Shot Placement", "Instep Drive Shooting", "First-Time Finishing", "Breakaway Finishing"],
      content: [
        {
          title: "Placement Beats Power",
          body:
            "A shot that goes in the corner at half pace is a goal. A shot that goes straight at the keeper at full pace is a save. Most missed chances at this level are missed because the player tried to break the net instead of putting the ball where the keeper is not.\n\nThe corners, low, are the hardest places for a keeper to reach. A ball along the ground into the far corner asks the keeper to get down and across, and most cannot. The Finesse Shot Placement drill is about exactly that: curling the ball with the inside of the foot to a target, with the pace the target needs and no more.\n\nPower has its place, and the next page is about it. But the first question on every shot is where, not how hard.",
        },
        {
          title: "The Two Finishes",
          body:
            "**The side-foot finish.** Inside of the foot, ankle locked, like a firm pass into the corner. Accurate, repeatable, and the right choice from inside the box when you have a moment to pick a spot. Most goals at every level are this finish.\n\n**The instep drive.** Laces through the ball, body over it, head down, for a shot from distance or a ball that needs to beat the keeper with pace. The Instep Drive Shooting drill is about keeping it low: strike through the middle or just above, and plant the standing foot beside the ball. A plant foot behind the ball lifts it over the bar.\n\nKnow which one the moment asks for. Close and with time, side-foot. Far or rushed, drive. The decision is faster than the shot.",
        },
        {
          title: "First-Time Finishing",
          body:
            "In the box there is often no time for a touch. The ball arrives and the shot has to go, and the First-Time Finishing drill is about doing that well.\n\nThree keys. Get the body behind the ball and over it early, with the hips open to the goal, so the shot is a redirection rather than a swing. Use the pace of the pass: a first-time finish is a guided ball, not a struck one, and the harder the pass arrives the softer the touch needs to be. And pick the spot before the ball arrives, with the look from Chapter 1, because there is no time to pick it after.\n\nA first-time finish that is placed beats a first-time finish that is powered. The ball is already moving fast; you just have to send it to the corner.",
        },
        {
          title: "One-on-One With the Keeper",
          body:
            "The breakaway looks like the easiest chance in the game and is missed more than any other. The reason is time: the player has too much of it and thinks.\n\nThe Breakaway Finishing drill builds a routine. Run with the ball under close control, so you can shoot off any step. Watch the keeper, not the ball: when he comes out, go round him or slide it past him early; when he stays back, pick a corner and side-foot it. Decide before you reach the box and do not change your mind. A changed mind on a breakaway is a shot straight at the keeper.\n\nTwo more things. Low is better than high, because a keeper's hands are above his waist. And a keeper who is coming fast is a keeper you can dribble; a keeper who is set is a keeper you shoot past.",
        },
        keyPoints([
          "Placement beats power. The first question is where, never how hard. Low corners are hardest to reach.",
          "Side-foot when close and with time; instep drive when far or rushed. Plant foot beside the ball keeps it low.",
          "First-time finishes are guided, not struck: body over the ball, use the pace of the pass, pick the spot before it arrives.",
          "On a breakaway, decide early, watch the keeper, keep it low, never change your mind.",
        ]),
      ],
      flashcards: [
        { front: "The first question on every shot", back: "Where, not how hard." },
        { front: "The hardest place for a keeper to reach", back: "Low in the corners, especially along the ground to the far corner." },
        { front: "The side-foot finish", back: "Inside of the foot, ankle locked, like a firm pass into the corner. Most goals are this." },
        { front: "What lifts an instep drive over the bar?", back: "A plant foot behind the ball instead of beside it." },
        { front: "A first-time finish is...", back: "A guided ball, not a struck one. Use the pace of the pass; pick the spot before it arrives." },
        { front: "On a breakaway, what do you watch?", back: "The keeper, not the ball. Coming out: go round or slide it early. Set: pick a corner." },
      ],
      quizQuestions: [
        {
          questionText: "Why are most chances at this level missed, according to the chapter?",
          answers: [
            { answerText: "The player tried to break the net instead of putting the ball where the keeper is not.", isCorrect: true, explanation: "Placement beats power." },
            { answerText: "Bad luck.", isCorrect: false, explanation: "No." },
            { answerText: "Keepers are too good.", isCorrect: false, explanation: "The low corners are hard for any keeper." },
            { answerText: "The ball is too heavy.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Match the situation with the finish.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Close and with time", right: "Side-foot into the corner" },
              { left: "Far or rushed", right: "Instep drive, kept low" },
              { left: "Ball arriving fast in the box", right: "First-time, guided with the pace of the pass" },
            ],
            explanation: "The decision is faster than the shot.",
          },
        },
        {
          questionText: "To keep an instep drive low, plant the standing foot ___ the ball.",
          questionType: "fill_blank",
          payload: { accepted: ["beside", "next to", "alongside", "level with"], explanation: "A plant foot behind the ball lifts it over the bar." },
        },
        {
          questionText: "Why are breakaways missed so often?",
          answers: [
            { answerText: "The player has too much time and thinks, then changes his mind.", isCorrect: true, explanation: "Decide before the box and do not change it." },
            { answerText: "The keeper always wins one-on-ones.", isCorrect: false, explanation: "No." },
            { answerText: "The ball is harder to control at speed.", isCorrect: false, explanation: "Close control is the drill, but time is the reason given." },
            { answerText: "Breakaways are offside.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "The keeper is rushing out fast on a breakaway. What does the chapter say?",
          answers: [
            { answerText: "A keeper coming fast is a keeper you can dribble, or slide it past him early.", isCorrect: true, explanation: "A set keeper is one you shoot past." },
            { answerText: "Shoot high over him.", isCorrect: false, explanation: "Low is better; a keeper's hands are above his waist." },
            { answerText: "Stop and wait for him to set.", isCorrect: false, explanation: "That gives him the chance back." },
            { answerText: "Pass backward.", isCorrect: false, explanation: "No." },
          ],
        },
      ],
    },
    {
      title: "Movement Without the Ball",
      description:
        "An attacker has the ball for a minute a game. This chapter is about the other eighty-nine: runs that create space, runs that create chances, and the timing that keeps you onside.",
      drills: ["Give-and-Go Passing", "Through Ball Passing", "Crossing from Wide Areas", "Change of Pace Running"],
      content: [
        {
          title: "Runs That Make Space",
          body:
            "Not every run is for the ball. Some runs exist to move a defender so that a teammate has room, and an attacker who understands that is worth more than one who only runs when he wants a pass.\n\nA run toward the ball pulls a defender with you and opens the space behind. A run away from the ball, to the far side, pulls a defender wide and opens the middle. A run that crosses a teammate's path can take two defenders with it and leave him alone.\n\nThe Change of Pace Running drill is here because a run that moves a defender has to be convincing: a jog is ignored. Make the run at speed, make it look like you want the ball, and the defender has to go with you.",
        },
        {
          title: "Runs That Make Chances",
          body:
            "The runs that get you the ball are timed, not fast. A run made early is offside or arrives before the pass; a run made late arrives after the defender has recovered.\n\nThe cue is the passer's head. When the player on the ball looks up with the ball in a position to play it, that is the moment to go. The Through Ball Passing drill from Chapter 3 is run from the other side here: you are the runner, and the job is to read the passer and leave as he looks.\n\nBend the run. A straight run at goal is easy to track; a run that starts wide and bends inside, or starts inside and bends out, is a run the defender has to turn to follow, and turning is when he loses you.",
        },
        {
          title: "Staying Onside",
          body:
            "Offside is a timing problem, and the fix is the same timing as the chance-making run. Stay level with the last defender until the passer is ready, then go as the ball is played, not before.\n\nTwo habits. Keep your shoulders square to the ball when you are waiting, so you can see both the passer and the defensive line without turning. And start the run with a step backward or sideways before the forward burst: it keeps you level a beat longer and makes the forward run harder to track.\n\nA striker who is caught offside five times a game is not unlucky. He is early. Fix the timing and the flag goes away.",
        },
        {
          title: "Arriving in the Box",
          body:
            "When the ball goes wide, the attacker's job is to arrive in the box at the right spot, at the right time, and that is its own skill. The Crossing from Wide Areas drill is run with you as the target.\n\nThree spots: the near post, the penalty spot, and the far post. One attacker to each if there are three; if you are alone, the near post first and the penalty spot second, because those are where most crosses arrive.\n\nArrive late and fast rather than early and standing. A player standing in the box is marked; a player arriving at speed as the cross comes in is a player the defender has to find. Watch the crosser's body, read where the ball is going, and go.",
        },
        keyPoints([
          "Some runs move a defender so a teammate has room. Make them at speed; a jog is ignored.",
          "Runs that get you the ball are timed off the passer's head. Bend the run so the defender has to turn.",
          "Offside is a timing problem: stay level, go as the ball is played, start with a step back.",
          "In the box: near post, penalty spot, far post. Arrive late and fast.",
        ]),
      ],
      flashcards: [
        { front: "What does a run toward the ball do?", back: "Pulls a defender with you and opens the space behind." },
        { front: "The cue to make a run for the ball", back: "The passer's head coming up with the ball in a position to play." },
        { front: "Why bend a run?", back: "A defender has to turn to follow it, and turning is when he loses you." },
        { front: "The fix for offside", back: "Stay level with the last defender until the passer is ready; go as the ball is played." },
        { front: "Three spots in the box", back: "Near post, penalty spot, far post." },
        { front: "Arrive late and fast, not...", back: "Early and standing. A standing player is marked." },
      ],
      quizQuestions: [
        {
          questionText: "What does a run away from the ball to the far side do?",
          answers: [
            { answerText: "Pulls a defender wide and opens the middle.", isCorrect: true, explanation: "Not every run is for the ball." },
            { answerText: "Nothing; it wastes energy.", isCorrect: false, explanation: "It moves a defender." },
            { answerText: "Draws an offside flag.", isCorrect: false, explanation: "No." },
            { answerText: "Signals the passer to shoot.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "The cue for a run that gets you the ball is the passer's ___ coming up.",
          questionType: "fill_blank",
          payload: { accepted: ["head", "eyes"], explanation: "Leave as he looks." },
        },
        {
          questionText: "Put the onside run in order.",
          questionType: "ordering",
          payload: { items: ["Stay level with the last defender, shoulders square to the ball", "Watch for the passer to be ready", "A step back or sideways", "Burst forward as the ball is played"], explanation: "A striker caught offside five times is not unlucky; he is early." },
        },
        {
          questionText: "Why arrive in the box late and fast rather than early?",
          answers: [
            { answerText: "A player standing in the box is marked; a player arriving at speed has to be found.", isCorrect: true, explanation: "Read the crosser's body and go." },
            { answerText: "Because the referee penalises standing still.", isCorrect: false, explanation: "No." },
            { answerText: "To save energy.", isCorrect: false, explanation: "No." },
            { answerText: "It is better to arrive early.", isCorrect: false, explanation: "The chapter says the opposite." },
          ],
        },
        {
          questionText: "You are the only attacker in the box as a cross comes in. Which spots does the chapter say to take?",
          answers: [
            { answerText: "The near post first, the penalty spot second.", isCorrect: true, explanation: "That is where most crosses arrive." },
            { answerText: "The far post only.", isCorrect: false, explanation: "The far post is third." },
            { answerText: "The edge of the box.", isCorrect: false, explanation: "No." },
            { answerText: "Wherever the keeper is not looking.", isCorrect: false, explanation: "No." },
          ],
        },
      ],
    },
    {
      title: "The Decision Before the Ball",
      description:
        "Everything in this class comes together before the ball arrives. This chapter is about scanning, the three options an attacker always has, playing under pressure, and reading your own games. The last page returns to your first touch.",
      drills: ["Turn and Control Under Pressure", "1v1 Attacking Moves", "First-Time Finishing", "Two-Touch Passing Circuit"],
      content: [
        {
          title: "Scanning",
          body:
            "The best attackers look over their shoulder constantly, not just when the ball is coming. Every few seconds, a glance: where is the space, where are the defenders, where is my teammate. By the time the ball arrives, the picture is already in their head and the touch is already decided.\n\nThis is the look from Chapter 1 made into a habit for the whole game. Count your scans in a training session and you will be surprised how few there are. Then build them: a scan every time the ball moves, a scan before every pass arrives, a scan after every touch.\n\nScanning is what makes everything else in this class fast. A player who scans plays a second ahead of the one who does not, and a second is the difference between a chance and a tackle.",
        },
        {
          title: "Three Options, Always",
          body:
            "Whenever the ball arrives, an attacker has three options and should know which one before the touch: pass, dribble, shoot.\n\nIf the shot is on, shoot. Chances are rare and a shot that is on is never the wrong choice. If a teammate is in a better position, pass. If neither, and the defender in front of you can be beaten, dribble. In that order, decided during the scan.\n\nThe Turn and Control Under Pressure drill is where the three options get practised with a defender on you: receive, turn, and in the same movement already know whether the shot, the pass or the dribble is the answer. The touch from Chapter 1 sets up whichever one it is.",
        },
        {
          title: "Playing Under Pressure",
          body:
            "Pressure is a defender closing fast. It shrinks the time for everything: the scan, the touch, the decision. The answer is not to do things faster; it is to have decided earlier.\n\nThree rules under pressure. Play the simple option: the pass you can see, not the pass you hope for. Protect the ball with the body between it and the defender, from Chapter 1. And if nothing is on, keep the ball: a sideways pass that keeps possession beats a forward pass that loses it, every time.\n\nThe Two-Touch Passing Circuit is run under pressure here, with a defender chasing the ball. Two touches is the limit; a third is a tackle.",
        },
        {
          title: "Reading Your Own Games",
          body:
            "After a game, before the score, go through your touches. For each one: did I scan before it arrived, did my first touch set up the next action, did I pick the right option of the three?\n\nCount the turnovers and sort them. Lost to a bad touch, lost to a bad decision, lost to a good tackle. The first two are yours to fix, and the drill days in this class are where they get fixed: Chapter 1 for the touch, this chapter for the decision.\n\nThen count the chances you created, not just the ones you scored. A pass that put a teammate through is a chance. A run that opened space for the goal is a chance. An attacker who counts those knows his real contribution.",
        },
        {
          title: "Back to Your First Touch",
          body:
            "Go back to the First Touch drills from Chapter 1 and film them from the side, as you did then or should have. Then film a few minutes of a small-sided game.\n\nCompare. Does the ball move a yard on purpose on every touch? Does the head come up while the ball is travelling? In the game, does the touch set up the pass, the dribble or the shot, or does it stop the ball and wait?\n\nAn attacker is not somebody with tricks. He is somebody whose first touch, decision and finish are one movement. If the film shows that, you have become one. Keep scanning.",
        },
        keyPoints([
          "Scan every few seconds, not only when the ball is coming. A player who scans plays a second ahead.",
          "Three options, always, decided during the scan: shoot if it is on, pass if a teammate is better placed, dribble if the defender can be beaten.",
          "Under pressure, decide earlier: the simple option, body between ball and defender, keep possession.",
          "Read your games by touches and turnovers, and count the chances you created.",
          "The first touch, the decision and the finish are one movement. That is an attacker.",
        ]),
      ],
      flashcards: [
        { front: "When do the best attackers scan?", back: "Every few seconds, constantly, not only when the ball is coming." },
        { front: "The three options when the ball arrives", back: "Shoot, pass, dribble, in that order, decided during the scan." },
        { front: "The answer to pressure", back: "Not doing things faster; having decided earlier." },
        { front: "Three rules under pressure", back: "Play the simple option, body between ball and defender, keep possession if nothing is on." },
        { front: "How to sort turnovers", back: "Bad touch, bad decision, good tackle. The first two are yours to fix." },
        { front: "What counts as a chance you created?", back: "A pass that put a teammate through, or a run that opened the space for the goal." },
      ],
      quizQuestions: [
        {
          questionText: "What is scanning?",
          answers: [
            { answerText: "Looking over your shoulder every few seconds so the picture is in your head before the ball arrives.", isCorrect: true, explanation: "The look from Chapter 1, made into a whole-game habit." },
            { answerText: "Watching the ball at all times.", isCorrect: false, explanation: "The eyes return to the ball for the touch; the scan is between." },
            { answerText: "Reading the scoreboard.", isCorrect: false, explanation: "No." },
            { answerText: "Checking for the referee.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Put the three options in the order the chapter gives.",
          questionType: "ordering",
          payload: { items: ["Shoot if the shot is on", "Pass if a teammate is in a better position", "Dribble if the defender can be beaten"], explanation: "A shot that is on is never the wrong choice." },
        },
        {
          questionText: "Under pressure, the answer is not to do things faster but to have ___ earlier.",
          questionType: "fill_blank",
          payload: { accepted: ["decided", "decide", "made the decision", "chosen"], explanation: "Pressure shrinks the time for the scan, the touch and the decision." },
        },
        {
          questionText: "Nothing is on and a defender is closing. What does the chapter say to do?",
          answers: [
            { answerText: "Keep the ball: a sideways pass that keeps possession beats a forward pass that loses it.", isCorrect: true, explanation: "The simple option, every time." },
            { answerText: "Try the forward pass anyway.", isCorrect: false, explanation: "That is the pass you hope for, not the one you can see." },
            { answerText: "Kick it out of play.", isCorrect: false, explanation: "No." },
            { answerText: "Dribble through two defenders.", isCorrect: false, explanation: "Dribbling is a choice with a reason, and two defenders is a reason to pass." },
          ],
        },
        {
          questionText: "Which turnovers does the chapter say are yours to fix?",
          answers: [
            { answerText: "Those lost to a bad touch or a bad decision.", isCorrect: true, explanation: "A good tackle is the defender's work." },
            { answerText: "Only those lost to a good tackle.", isCorrect: false, explanation: "Those are the defender's." },
            { answerText: "None; turnovers are luck.", isCorrect: false, explanation: "No." },
            { answerText: "All of them, equally.", isCorrect: false, explanation: "The chapter sorts them into three kinds for a reason." },
          ],
        },
      ],
    },
  ],
};
