import { keyPoints, type ForgeClassContent } from "./types";

/** Basketball: Becoming a Shooter (2026-10-04). Six chapters, each with a drill day from the
 * basketball Shooting and Ball Handling drills in the skill library, a quiz of mixed shapes
 * and a set of flashcards. Written for a high-school player. */
export const BASKETBALL_SHOOTING_CLASS: ForgeClassContent = {
  name: "Basketball: Becoming a Shooter",
  description:
    "Six chapters on becoming a shooter the defense has to guard: a repeatable form, feet that are ready before the ball arrives, shots off the dribble, finishing at the rim, free throws under pressure, and taking the right shot in a game.",
  category: "Basketball",
  readingLevel: "high_school",
  chapters: [
    {
      title: "What Makes a Shot Go In",
      description:
        "Shooters are made, not born, and they are made by repeating one shot until it is theirs. This chapter breaks the shot into the parts that matter and sets your baseline.",
      drills: ["Form Shooting - Close Range", "Mikan Drill", "Free Throw Routine Reps"],
      content: [
        {
          title: "One Shot, Repeated",
          body:
            "The best shooters do not have a different shot for every situation. They have one shot, and they have taken it so many times that it comes out the same whether the gym is empty or the game is on the line.\n\nThat is the whole idea behind this class. Every chapter adds a situation: the catch, the dribble, the rim, the free-throw line, the defender. But the shot inside each situation is the same shot. If the form changes when the situation changes, it is not yours yet.\n\nSo we start close. Form shooting from three feet looks like nothing, and it is where every shooter at every level still begins their warm-up. It is where the shot gets built, and where it gets fixed when it breaks.",
        },
        {
          title: "The Parts of the Shot",
          body:
            "Break a shot into parts and you can fix the parts.\n\n**Base.** Feet about shoulder-width, knees bent, weight slightly forward on the balls of the feet. The power comes from the legs, not the arm.\n\n**Pocket.** The ball sits in the shooting hand with the fingers spread, the wrist cocked back, the elbow under the ball. The off hand is on the side of the ball as a guide, and it does nothing else.\n\n**Lift.** The legs push, the ball rises in a straight line past the face, and the elbow extends toward the rim.\n\n**Release.** The wrist snaps, the ball rolls off the index and middle fingers, and the arm finishes high with the fingers pointing at the basket. Hold it. The follow-through is the last thing you control, so it is the first thing to check.",
        },
        {
          title: "Arc, Line and Soft Hands",
          body:
            "A shot can be on line and still miss, and it can be off line and still go in. The reason is arc. A flat shot sees a small target; a shot with a high arc sees the whole rim. Most misses on a flat shot are long or short, which is the arc telling you it never had a chance.\n\nThe cue for arc is a high release and a full follow-through: fingers in the rim, elbow above the eyes. The cue for line is the elbow under the ball and the ball traveling straight past the face, not around it.\n\nSoft hands come from the fingertips. A ball shot off the palm comes out flat and hard. A ball shot off the fingertips has backspin, and backspin is what makes a shot that touches the rim fall in instead of bouncing out.",
        },
        {
          title: "Your Baseline",
          body:
            "Before you change anything, measure where you are. Three numbers, and a video.\n\n- Fifty form shots from five feet, one hand, and count the makes.\n- Twenty-five free throws and count the makes.\n- Twenty-five catch-and-shoot jump shots from a spot you like, about fifteen feet, and count the makes.\n\nFilm the free throws, from wherever you have room, and remember the spot. You will come back to this video in Chapter 6 and compare the form, not just the count.\n\nBe honest with the numbers. A baseline that is padded cheats only you, and the whole point of the last chapter is to see how far you moved.",
        },
        keyPoints([
          "One shot, repeated, in every situation. If the form changes with the situation, it is not yours yet.",
          "The parts: base, pocket, lift, release. Fix the parts, not the whole.",
          "Arc gives the ball a bigger target; a high release and a held follow-through give you arc.",
          "Fingertips give backspin; backspin turns rim shots into makes.",
          "Baseline: fifty form shots, twenty-five free throws, twenty-five catch-and-shoot, and a video from wherever you have room.",
        ]),
      ],
      flashcards: [
        { front: "What do the best shooters have?", back: "One shot, taken so many times it comes out the same in an empty gym or on the last possession." },
        { front: "The four parts of the shot", back: "Base, pocket, lift, release." },
        { front: "What does the off hand do?", back: "Guides the side of the ball and nothing else." },
        { front: "Why does arc matter?", back: "A flat shot sees a small target; a high arc sees the whole rim." },
        { front: "Where does backspin come from?", back: "The fingertips. A ball shot off the palm comes out flat and hard." },
        { front: "The last thing you control on a shot", back: "The follow-through. So it is the first thing to check." },
      ],
      quizQuestions: [
        {
          questionText: "What is the main idea of this class, according to the first page?",
          answers: [
            { answerText: "One shot, repeated until it comes out the same in every situation.", isCorrect: true, explanation: "Every chapter adds a situation; the shot inside it stays the same." },
            { answerText: "A different shot for every situation.", isCorrect: false, explanation: "The chapter says the opposite." },
            { answerText: "Shooting as many threes as possible.", isCorrect: false, explanation: "Shot selection is Chapter 6, and it is about the right shot, not the most." },
            { answerText: "Shooting is a natural talent.", isCorrect: false, explanation: "Shooters are made, not born." },
          ],
        },
        {
          questionText: "Put the four parts of the shot in order.",
          questionType: "ordering",
          payload: { items: ["Base", "Pocket", "Lift", "Release"], explanation: "Feet and knees, then the ball in the pocket, then the lift, then the release and follow-through." },
        },
        {
          questionText: "A ball shot off the fingertips has ___, which makes a shot that touches the rim fall in.",
          questionType: "fill_blank",
          payload: { accepted: ["backspin", "back spin", "spin"], explanation: "A ball off the palm comes out flat and hard." },
        },
        {
          questionText: "Why does a shot with a high arc go in more often?",
          answers: [
            { answerText: "It sees more of the rim, so the target is bigger.", isCorrect: true, explanation: "A flat shot sees a small target, and most of its misses are long or short." },
            { answerText: "It is harder for defenders to block.", isCorrect: false, explanation: "True sometimes, but not the reason the chapter gives." },
            { answerText: "It travels faster.", isCorrect: false, explanation: "Arc is about the target, not speed." },
            { answerText: "Referees count it as more points.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "What is the job of the off hand during a shot?",
          answers: [
            { answerText: "Guide the side of the ball and do nothing else.", isCorrect: true, explanation: "Thumbing the ball with the off hand sends it off line." },
            { answerText: "Push the ball toward the rim with the shooting hand.", isCorrect: false, explanation: "The shooting hand does the shooting." },
            { answerText: "Hold the ball from underneath.", isCorrect: false, explanation: "The shooting hand is under the ball; the off hand is on the side." },
            { answerText: "Point at the defender.", isCorrect: false, explanation: "No." },
          ],
        },
      ],
    },
    {
      title: "Feet First: The Catch and the Spot-Up",
      description:
        "Most shots in a game are decided before the ball arrives. This chapter is about footwork: being ready on the catch, the hop and the one-two, and shooting from spots the way a game asks you to.",
      drills: ["Catch-and-Shoot Reps", "Spot-Up Shooting Circuit", "Corner Three Reps"],
      content: [
        {
          title: "Ready Before the Ball Arrives",
          body:
            "A catch-and-shoot is not catch, then shoot. It is be ready, catch, shoot, and the first part is what separates shooters from players who can shoot.\n\nBefore the pass comes, the feet are already turning toward the basket, the knees are already bent, and the hands are already up and showing a target. The ball lands in the shooting pocket, not at the waist. From there the shot is the same shot as Chapter 1, just with a pass in front of it.\n\nA shooter who has to gather after the catch has given the defender a full step. At the high-school level that step is the difference between an open shot and a contested one.",
        },
        {
          title: "The Hop and the One-Two",
          body:
            "There are two ways to get the feet set on the catch, and good shooters have both.\n\n**The hop.** A small two-footed jump timed with the catch, landing with both feet square to the rim at the same time. Quick, balanced, and it works when the pass is on target and you are facing the basket.\n\n**The one-two.** The inside foot lands first, then the outside foot steps into the shot. Slower by a hair, but it lets you square up from an angle and it gives you a pivot if the shot is not there.\n\nThe Catch-and-Shoot Reps drill works both: ten with the hop, ten with the one-two, from each side. The test is the same for each: when the ball arrives, are the feet already done?",
        },
        {
          title: "Spots and the Corner",
          body:
            "A game does not ask you to shoot from anywhere. It asks you to shoot from four or five places, over and over: the corners, the wings, the top, the elbows. The Spot-Up Shooting Circuit rotates through those spots so that the shot from each one becomes familiar: the angle of the backboard, the distance, the way the feet set up.\n\nThe corner three is its own skill. On college and pro courts it is the shortest three on the floor; on most high-school courts the line is one even arc, so it is no closer, but the backboard is at a strange angle and the sideline is right behind your heels. Corner Three Reps is about catching with the feet already behind the line, square to the rim, and shooting without a look down. A shooter who has to check the line is not ready.\n\nTrack your makes by spot. Every shooter has a favorite spot and a weak one, and the weak one is where the next week of practice goes.",
        },
        {
          title: "Reading the Pass",
          body:
            "Not every pass is a shot. The ball arrives high, low, late, or with a defender closing, and the shooter decides in the time it takes the ball to travel.\n\nThree reads:\n\n- Pass on target, defender late: shoot. The feet are set; the shot is the Chapter 1 shot.\n- Pass on target, defender closing hard: shot fake, one dribble, then the pull-up from Chapter 3.\n- Pass off target: catch it, square up with a one-two, and either shoot if the window is still there or move the ball.\n\nThe decision has to be made before the catch, not after it. A shooter who catches and then thinks has already lost the window.",
        },
        keyPoints([
          "Be ready, catch, shoot. The feet turn, the knees bend and the hands show a target before the pass.",
          "The hop sets both feet at once; the one-two squares up from an angle and leaves a pivot. Have both.",
          "A game asks for shots from four or five spots. Know each one, and know your weak one.",
          "The corner three: feet behind the line before the catch, no look down.",
          "Read the pass before the catch: shoot, fake-and-dribble, or square up and move it.",
        ]),
      ],
      flashcards: [
        { front: "What is a catch-and-shoot really?", back: "Be ready, catch, shoot. The first part separates shooters from players who can shoot." },
        { front: "The hop", back: "A small two-footed jump timed with the catch, landing square to the rim." },
        { front: "The one-two", back: "Inside foot lands, outside foot steps into the shot. Squares up from an angle and leaves a pivot." },
        { front: "Why is the corner three its own skill?", back: "The shortest three on a college or pro court (no closer on a high-school arc), a strange backboard angle, and the sideline right behind the heels." },
        { front: "What do you track in the spot-up circuit?", back: "Makes by spot, so you know your weak spot and where next week's practice goes." },
        { front: "When is the read on a pass made?", back: "Before the catch. A shooter who catches and then thinks has lost the window." },
      ],
      quizQuestions: [
        {
          questionText: "Match the footwork with when it fits best.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "The hop", right: "Pass on target, facing the basket, need to be quick" },
              { left: "The one-two", right: "Coming from an angle, may need a pivot" },
            ],
            explanation: "Good shooters have both and choose by the catch.",
          },
        },
        {
          questionText: "What has already happened before the pass arrives, on a good catch-and-shoot?",
          answers: [
            { answerText: "The feet are turning toward the basket, the knees are bent, and the hands are up showing a target.", isCorrect: true, explanation: "The ball then lands in the pocket and the shot is the Chapter 1 shot." },
            { answerText: "Nothing; the shooter reacts to the pass.", isCorrect: false, explanation: "Reacting after the catch gives the defender a step." },
            { answerText: "The shooter has already jumped.", isCorrect: false, explanation: "The jump comes with the shot, not before the ball." },
            { answerText: "The shooter has checked the three-point line.", isCorrect: false, explanation: "The feet are set behind the line before the catch; checking it is a sign you were not ready." },
          ],
        },
        {
          questionText: "On a college or pro court, the corner three is the ___ three on the floor.",
          questionType: "fill_blank",
          payload: { accepted: ["shortest", "closest", "short"], explanation: "Those lines run straight near the sideline, so the corner is closer to the rim. A high-school arc is one even curve, so there the corner is no closer; the sideline behind your heels is the same either way." },
        },
        {
          questionText: "The pass is on target but the defender is closing hard. What is the read?",
          answers: [
            { answerText: "Shot fake, one dribble, pull-up.", isCorrect: true, explanation: "The window for the set shot is gone; the pull-up from Chapter 3 is the answer." },
            { answerText: "Shoot anyway.", isCorrect: false, explanation: "That is the read when the defender is late, not closing." },
            { answerText: "Hold the ball and wait.", isCorrect: false, explanation: "Holding the ball lets the defense set." },
            { answerText: "Pass it back where it came from.", isCorrect: false, explanation: "Moving the ball is the read for an off-target pass with no window." },
          ],
        },
        {
          questionText: "Why track makes by spot?",
          answers: [
            { answerText: "Every shooter has a weak spot, and that is where the next week of practice goes.", isCorrect: true, explanation: "A game asks for shots from four or five places; know each one." },
            { answerText: "To prove you are better than your teammates.", isCorrect: false, explanation: "No." },
            { answerText: "Because coaches only count corner shots.", isCorrect: false, explanation: "No." },
            { answerText: "Tracking is not recommended.", isCorrect: false, explanation: "The chapter asks you to track it." },
          ],
        },
      ],
    },
    {
      title: "Shots Off the Dribble",
      description:
        "When the catch-and-shoot is taken away, the shooter creates. This chapter covers the pull-up, the step-back and the handle that gets you to them, without letting the shot itself change.",
      drills: ["Off-the-Dribble Pull-Up", "Step-Back Jumper", "Change-of-Pace Attack Dribble", "Crossover Series"],
      content: [
        {
          title: "The Handle Serves the Shot",
          body:
            "Every move in this chapter exists for one reason: to get the feet set and the ball in the pocket with enough space to shoot the same shot as Chapter 1. The dribble is not the point. The shot is the point.\n\nThat changes how you practice handling. A crossover that looks great and leaves you off balance is useless to a shooter. A plain change of pace that gets a defender back on his heels and gives you a clean pull-up is gold. The Change-of-Pace Attack Dribble and the Crossover Series are in this chapter's drill day so that the moves get practiced into a shot, not on their own.\n\nOne rule: the last dribble is the hardest. A hard last dribble brings the ball up into the pocket on its own, so the hands do not have to go hunting for it.",
        },
        {
          title: "The Pull-Up",
          body:
            "The pull-up jump shot is one or two dribbles, a stop, and the shot. The stop is everything.\n\nOff the last dribble the feet land in a one-two or a hop, square to the rim, under control. The body goes up, not forward: a pull-up that drifts toward the basket is a shot that goes long and a landing that invites a charge call. Jump and land in the same spot.\n\nThe Off-the-Dribble Pull-Up drill works it from both hands, both directions, with the same count: dribble, dribble, stop, shoot. Make the stop quiet. If you can hear your feet, you are landing too hard to shoot off them.",
        },
        {
          title: "The Step-Back",
          body:
            "The step-back creates space backward instead of forward. Drive one way, plant the inside foot, and push off it to land behind where you were, square and ready.\n\nThe mistake is fading: pushing back during the shot instead of before it. A step-back that fades is a shot going short. Land first, then shoot straight up. The Step-Back Jumper drill has you freeze for a beat on the landing early on, until the body learns that the move and the shot are two separate things.\n\nThe step-back is a tool for a specific moment: a defender crowding you, no lane to the basket, your feet in rhythm. It is not a shot to live on at this level. A pull-up is the bread and butter; the step-back is the counter when the pull-up is taken away.",
        },
        {
          title: "Keeping the Shot the Same",
          body:
            "Film ten catch-and-shoot jumpers and ten pull-ups from the same spot and compare them. The release, the arc, the follow-through should look identical. If they do not, the dribble is changing the shot, and the fix is in the stop, not in the shot.\n\nCommon tells:\n\n- The ball comes from the hip instead of the pocket: the last dribble was soft.\n- The shot drifts forward: the stop was not a stop.\n- The elbow flares: the body was turned at the stop and the arm is compensating.\n\nEach of them is a footwork problem wearing a shooting problem's clothes. Fix the feet and the shot comes back.",
        },
        keyPoints([
          "The handle serves the shot. A move that leaves you off balance is useless to a shooter.",
          "The last dribble is the hardest: it brings the ball into the pocket on its own.",
          "The pull-up is decided by the stop. Go up, not forward; land where you jumped.",
          "The step-back: land first, then shoot straight up. A counter, not a diet.",
          "If the pull-up looks different from the catch-and-shoot, fix the feet, not the shot.",
        ]),
      ],
      flashcards: [
        { front: "Why does a shooter practice handling?", back: "To get the feet set and the ball in the pocket with space for the same shot as Chapter 1." },
        { front: "The rule about the last dribble", back: "It is the hardest dribble. It brings the ball up into the pocket on its own." },
        { front: "What matters most on a pull-up?", back: "The stop. Square, under control, up not forward, land where you jumped." },
        { front: "The step-back mistake", back: "Fading: pushing back during the shot instead of before it. Land first, then shoot straight up." },
        { front: "When is the step-back the right tool?", back: "Defender crowding you, no lane, feet in rhythm. A counter when the pull-up is taken away." },
        { front: "Pull-up looks different from the catch-and-shoot. Where is the fix?", back: "In the feet and the stop, not in the shot." },
      ],
      quizQuestions: [
        {
          questionText: "What is the point of every dribble move in this chapter?",
          answers: [
            { answerText: "To get the feet set and the ball in the pocket with space to shoot the same shot.", isCorrect: true, explanation: "The dribble is not the point; the shot is." },
            { answerText: "To look good on film.", isCorrect: false, explanation: "A move that leaves you off balance is useless to a shooter." },
            { answerText: "To run the clock down.", isCorrect: false, explanation: "No." },
            { answerText: "To draw a foul.", isCorrect: false, explanation: "Not what the chapter says." },
          ],
        },
        {
          questionText: "The last dribble before a pull-up should be the ___ one.",
          questionType: "fill_blank",
          payload: { accepted: ["hardest", "hard", "strongest"], explanation: "A hard last dribble brings the ball up into the pocket on its own." },
        },
        {
          questionText: "Put the pull-up in order.",
          questionType: "ordering",
          payload: { items: ["Hard last dribble", "Quiet stop, feet square", "Go straight up", "Land where you jumped"], explanation: "The stop is everything; a pull-up that drifts goes long." },
        },
        {
          questionText: "What does a step-back that fades do to the shot?",
          answers: [
            { answerText: "Sends it short, because the push-back happened during the shot instead of before it.", isCorrect: true, explanation: "Land first, then shoot straight up." },
            { answerText: "Sends it long.", isCorrect: false, explanation: "That is a pull-up that drifts forward." },
            { answerText: "Nothing; fading is the point of the move.", isCorrect: false, explanation: "The move and the shot are two separate things." },
            { answerText: "Makes it a travel.", isCorrect: false, explanation: "A fade is a shooting fault, not a rules problem." },
          ],
        },
        {
          questionText: "Match the tell on film with its cause.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Ball comes from the hip", right: "Soft last dribble" },
              { left: "Shot drifts forward", right: "The stop was not a stop" },
              { left: "Elbow flares", right: "Body turned at the stop" },
            ],
            explanation: "Each is a footwork problem wearing a shooting problem's clothes.",
          },
        },
      ],
    },
    {
      title: "Finishing at the Rim",
      description:
        "Not every shot is a jump shot. This chapter covers the layup with either hand, the floater over a big, and finishing through contact, with the same lesson underneath: balance first.",
      drills: ["Mikan Drill", "Floater/Runner Finishing", "Change-of-Pace Attack Dribble", "Contested Shot Reps"],
      content: [
        {
          title: "Both Hands, Both Feet",
          body:
            "A finisher who can only go right is a finisher the defense can take away by standing on the left. The Mikan Drill is the cure, and it is why it has been in every gym for seventy years: right hand off the left foot, left hand off the right foot, over and over, close to the rim, using the backboard.\n\nThe details matter. The ball goes up with the outside hand, high, soft, off the square on the backboard. The inside knee drives up. The eyes are on the spot on the glass, not on the defender.\n\nDo it until the off hand feels normal. It takes longer than you want it to, and there is no shortcut.",
        },
        {
          title: "The Floater",
          body:
            "Between the layup and the jump shot there is the floater: a soft, high, one-handed shot released early, before a shot-blocker can get to it. It is the small guard's answer to the tall defender.\n\nThe Floater/Runner Finishing drill works it off one foot and off two. Off one foot it is a runner, taken on the move with the inside foot. Off two it is a floater, with a quick stop and a quicker release. Both are released high, with arc, and both are soft: the ball should drop into the rim, not hit it.\n\nThe common fault is shooting it like a jump shot, flat and hard. A floater is thrown, almost, with the fingers under the ball and a high arm. Practise it from four to ten feet and keep the arc.",
        },
        {
          title: "Finishing Through Contact",
          body:
            "At the rim, somebody is going to touch you. A finisher who expects the contact finishes through it; a finisher who is surprised by it finishes short.\n\nThe cues: a strong last step, the ball held in two hands until the last moment, the body square to the rim rather than turned away from the defender, and the shoulders staying level through the bump. Contested Shot Reps puts a partner's hand on you so the bump stops being a surprise.\n\nTwo honest notes. First, a finish through contact is not a finish into contact: driving your shoulder into a set defender is a charge, and the drill is about taking a bump, not delivering one. Second, nothing in this class teaches you to draw fouls. It teaches you to make the shot whether the whistle comes or not.",
        },
        {
          title: "Reading the Rim Protector",
          body:
            "The decision at the rim is made two steps out, the same way the catch-and-shoot read is made before the catch.\n\n- Rim protector back and waiting: the floater, released early, over him.\n- Rim protector stepping up to meet you: the layup off the far side of the rim, using the glass, away from his hand.\n- Rim protector late or out of position: the strong finish, high and through.\n\nThe Change-of-Pace Attack Dribble is in this chapter because the read often starts there: a slow dribble that gets the defender to relax, then the burst that gets you two steps out with the choice already made.",
        },
        keyPoints([
          "Both hands, both feet. The Mikan Drill until the off hand feels normal; there is no shortcut.",
          "The floater is high, soft and early, thrown almost, with the fingers under the ball.",
          "Expect the contact: strong last step, two hands until the last moment, shoulders level. Through, never into.",
          "Read the rim protector two steps out: floater over, layup away, or strong through.",
        ]),
      ],
      flashcards: [
        { front: "Why does the Mikan Drill matter?", back: "A finisher who can only go one way can be taken away by standing on the other side." },
        { front: "Mikan footwork", back: "Right hand off the left foot, left hand off the right foot, high and soft off the square." },
        { front: "What is a floater for?", back: "Scoring over a tall defender: released early and high, before a shot-blocker can get to it." },
        { front: "The common floater fault", back: "Shooting it like a jump shot, flat and hard. It is thrown, almost, with arc." },
        { front: "Cues for finishing through contact", back: "Strong last step, two hands until the last moment, square to the rim, shoulders level." },
        { front: "When is the decision at the rim made?", back: "Two steps out, reading where the rim protector is." },
      ],
      quizQuestions: [
        {
          questionText: "In the Mikan Drill, the right-handed layup goes up off which foot?",
          answers: [
            { answerText: "The left foot.", isCorrect: true, explanation: "Outside hand, inside foot: right hand off the left foot, left hand off the right." },
            { answerText: "The right foot.", isCorrect: false, explanation: "That is the opposite foot; the inside knee drives up." },
            { answerText: "Both feet.", isCorrect: false, explanation: "A two-foot finish is a different skill; the Mikan is one foot." },
            { answerText: "It does not matter.", isCorrect: false, explanation: "The footwork is the point of the drill." },
          ],
        },
        {
          questionText: "A floater is released ___ and high, before a shot-blocker can get to it.",
          questionType: "fill_blank",
          payload: { accepted: ["early", "soon", "quickly", "quick"], explanation: "It is the small guard's answer to the tall defender." },
        },
        {
          questionText: "Match the rim protector's position with the finish.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Back and waiting", right: "Floater, released early, over him" },
              { left: "Stepping up to meet you", right: "Layup off the far side, using the glass" },
              { left: "Late or out of position", right: "Strong finish, high and through" },
            ],
            explanation: "The decision is made two steps out.",
          },
        },
        {
          questionText: "What is the difference between finishing through contact and finishing into contact?",
          answers: [
            { answerText: "Through contact means taking a bump and making the shot; into contact means driving your shoulder into a set defender, which is a charge.", isCorrect: true, explanation: "The drill is about taking a bump, not delivering one." },
            { answerText: "There is no difference.", isCorrect: false, explanation: "The chapter draws the line clearly." },
            { answerText: "Into contact draws more fouls, so it is better.", isCorrect: false, explanation: "The class does not teach drawing fouls; it teaches making the shot whether the whistle comes or not." },
            { answerText: "Through contact is only for big players.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Why is the Change-of-Pace Attack Dribble on this chapter's drill day?",
          answers: [
            { answerText: "Because the read at the rim often starts with a slow dribble that relaxes the defender, then a burst.", isCorrect: true, explanation: "The burst gets you two steps out with the choice already made." },
            { answerText: "Because it is a shooting drill.", isCorrect: false, explanation: "It is a handling drill that sets up the finish." },
            { answerText: "Because it is easy.", isCorrect: false, explanation: "No." },
            { answerText: "It is not; the chapter says to skip it.", isCorrect: false, explanation: "It is on the drill day on purpose." },
          ],
        },
      ],
    },
    {
      title: "The Free Throw and Pressure",
      description:
        "The free throw is the only shot in basketball nobody guards, and it is still missed. This chapter is about the routine, the breath, and how to practice pressure so a game is not the first time you feel it.",
      drills: ["Free Throw Routine Reps", "Form Shooting - Close Range", "Contested Shot Reps"],
      content: [
        {
          title: "The Same Thing Every Time",
          body:
            "A free throw is the Chapter 1 shot from fifteen feet with nobody in front of you. The reason it gets missed is not the shot. It is everything around the shot: the stoppage, the crowd, the score, the thinking.\n\nThe routine is the answer. A routine is a short, fixed sequence you do before every free throw, in practice and in games, so that the body is doing something familiar when the mind wants to do something new. Pick one: the same number of dribbles, the same spin of the ball, the same breath, the same look at the rim, the same shot. The Free Throw Routine Reps drill is nothing but that sequence, repeated until you could do it asleep.\n\nThe content of the routine does not matter much. That it never changes matters completely.",
        },
        {
          title: "Breath and the Eyes",
          body:
            "Two parts of the routine do more work than the rest.\n\nThe breath. One slow breath out before the shot drops the shoulders, slows the heart a little, and gives the mind one thing to do instead of ten. Put it in the same place in the routine every time, usually right before the look at the rim.\n\nThe eyes. Pick a spot on the rim, the back of it or the front, and look at nothing else from that moment to the release. Shooters who miss free throws late in games are usually looking at the rim and seeing the scoreboard. The spot gives the eyes a job.\n\nNeither of these is a trick. They are the two parts of the shot a nervous body changes first, pinned down.",
        },
        {
          title: "Practising Pressure",
          body:
            "You cannot make practice feel like a game, but you can make it cost something, and cost is what pressure is.\n\nSome ways:\n\n- Shoot free throws tired, at the end of practice, not fresh at the start.\n- Shoot in sets of two, the way a game gives them to you, with a sprint or a drill between sets.\n- Put a consequence on a miss: a line to run, a partner who gets the next set.\n- Keep a running count of makes in a row, and try to beat it. The miss that ends a streak is the closest thing practice has to a game miss.\n\nThe Contested Shot Reps drill belongs here for the same reason: a hand in your face is a kind of pressure, and the shot has to stay the same under it.",
        },
        {
          title: "After a Miss",
          body:
            "Every shooter misses. What separates them is the next shot.\n\nAfter a miss, the routine is the rescue. The body wants to change something, to aim, to shoot harder, to fix it. The routine says no: same dribbles, same breath, same spot, same shot. The miss was one shot; the routine is a thousand.\n\nWrite down what the miss was, if you can: short, long, left, right. Over a season a pattern shows up, and the pattern is what you take to form shooting from five feet, where the shot gets fixed. Not at the line, not in the game. At five feet, with one hand, where it was built.",
        },
        keyPoints([
          "The free throw is missed because of everything around the shot. The routine is the answer.",
          "What the routine contains matters little. That it never changes matters completely.",
          "The breath drops the shoulders; a spot on the rim gives the eyes a job. Both pin down what nerves change first.",
          "Pressure is cost. Shoot tired, in pairs, with a consequence, chasing a streak.",
          "After a miss, the routine is the rescue. Fix the pattern at five feet, not at the line.",
        ]),
      ],
      flashcards: [
        { front: "Why is the free throw missed?", back: "Not the shot. Everything around it: the stoppage, the crowd, the score, the thinking." },
        { front: "What is a free-throw routine?", back: "A short fixed sequence before every free throw, in practice and games, so the body does something familiar." },
        { front: "The two parts of the routine that do the most work", back: "The breath out before the shot, and a spot on the rim for the eyes." },
        { front: "What is pressure, for practice purposes?", back: "Cost. A consequence on a miss, a streak to protect, free throws when tired." },
        { front: "What does the routine do after a miss?", back: "Rescues the next shot. Same dribbles, same breath, same spot, same shot." },
        { front: "Where does a free-throw pattern get fixed?", back: "At five feet, one hand, where the shot was built. Not at the line." },
      ],
      quizQuestions: [
        {
          questionText: "What does the chapter say matters about a free-throw routine?",
          answers: [
            { answerText: "That it never changes. What it contains matters much less.", isCorrect: true, explanation: "The body does something familiar when the mind wants to do something new." },
            { answerText: "That it has exactly three dribbles.", isCorrect: false, explanation: "The number is yours to pick." },
            { answerText: "That it is different in games than in practice.", isCorrect: false, explanation: "The opposite: the same in both." },
            { answerText: "That it takes at least ten seconds.", isCorrect: false, explanation: "Short and fixed." },
          ],
        },
        {
          questionText: "The two parts of the routine that do the most work are the breath and the ___.",
          questionType: "fill_blank",
          payload: { accepted: ["eyes", "spot", "spot on the rim", "look", "focus"], explanation: "A spot on the rim gives the eyes a job, so they do not see the scoreboard." },
        },
        {
          questionText: "Which of these is a way the chapter suggests to practice pressure?",
          answers: [
            { answerText: "Shoot free throws tired, in pairs, with a consequence on a miss.", isCorrect: true, explanation: "Pressure is cost, and cost can be built into practice." },
            { answerText: "Shoot fifty in a row fresh at the start of practice.", isCorrect: false, explanation: "Fresh at the start is the opposite of what the chapter asks." },
            { answerText: "Imagine a crowd.", isCorrect: false, explanation: "The chapter is about real cost, not imagination." },
            { answerText: "Skip free throws in practice so games feel special.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Put the chapter's advice after a miss in order.",
          questionType: "ordering",
          payload: {
            items: ["Run the same routine for the next shot", "Write down what the miss was (short, long, left, right)", "Look for the pattern over a season", "Fix the pattern at five feet with one hand"],
            explanation: "The miss was one shot; the routine is a thousand. The fix happens where the shot was built.",
          },
        },
        {
          questionText: "Why is the Contested Shot Reps drill on this chapter's drill day?",
          answers: [
            { answerText: "A hand in your face is a kind of pressure, and the shot has to stay the same under it.", isCorrect: true, explanation: "Same lesson as the free throw: the shot does not change with the situation." },
            { answerText: "Because free throws are contested.", isCorrect: false, explanation: "Nobody guards a free throw." },
            { answerText: "Because it is a rest drill.", isCorrect: false, explanation: "No." },
            { answerText: "By mistake.", isCorrect: false, explanation: "It is there on purpose." },
          ],
        },
      ],
    },
    {
      title: "Game Shots and Shot Selection",
      description:
        "A great practice shooter who takes bad shots is not a great shooter. This chapter is about the shots a game gives you, the ones it does not, reading the defense, and coming back to your Chapter 1 baseline.",
      drills: ["Spot-Up Shooting Circuit", "Off-the-Dribble Pull-Up", "Catch-and-Shoot Reps", "Pressure Dribbling vs. Defender"],
      content: [
        {
          title: "A Good Shot",
          body:
            "A good shot has three things: you are on balance, you are in your range, and the shot is open enough that the defender cannot change it. Miss any one and it is a bad shot, however good it looks when it goes in.\n\nThat last part is the hard one. A bad shot that goes in is still a bad shot, because over a season the bad shots go in less often than the good ones and the difference is the game. Shooters who last are the ones who can tell the difference while the ball is still in their hands.\n\nYour range is not where you can reach. It is where you make a good percentage with your normal form. Find it in the spot-up circuit and be honest about it. Range grows with reps, not with ambition.",
        },
        {
          title: "Reading the Defender",
          body:
            "The defender tells you which shot to take, if you look.\n\n- Defender back, hands down: the catch-and-shoot. He has given you the shot.\n- Defender closing hard, high hands: shot fake, one dribble, pull-up or drive. He has given you the drive.\n- Defender square and close, on balance: move the ball. He has given you nothing, and the next pass will find somebody he cannot guard.\n\nThe Pressure Dribbling vs. Defender drill is in this chapter so that the read gets practiced against a live body. Reads are learned against people, not cones.",
        },
        {
          title: "Shot Selection Is a Team Skill",
          body:
            "The right shot depends on the score, the clock, who is hot and who is not. Up ten with two minutes left, the good shot is a late one. Down three with ten seconds, the good shot is a three. The same open fifteen-footer is a great shot in the first quarter and a bad one with twenty seconds on the shot clock in a tie game, because the better shot was still coming.\n\nA shooter who understands this is a shooter a coach trusts, and a shooter a coach trusts gets more shots. That is the whole bargain.\n\nKnow your team's rules: who takes the last shot, what the good shot is in each situation. If you do not know, ask. A shooter who does not know the rules is guessing, and guessing is a bad shot.",
        },
        {
          title: "Scouting Yourself",
          body:
            "After a game, before the stat sheet, run through your shots. For each one: was I on balance, was I in my range, was it open enough? Then: did I take the shots the defense gave me, or the ones I wanted?\n\nCount the good shots and the bad ones. The makes and misses matter less than that ratio, and the ratio is the thing you can change.\n\nA shooter who takes only good shots and makes forty percent of them is worth more to a team than one who takes anything and makes forty-five, because the first one's percentage is real and the second one's comes with the bad shots that cost possessions.",
        },
        {
          title: "Back to Your Baseline",
          body:
            "In Chapter 1 you counted fifty form shots, twenty-five free throws and twenty-five catch-and-shoot jumpers, and you filmed the free throws. Do all of it again, from the same spot.\n\nCompare the counts. Then compare the videos: the release point, the arc, the follow-through, side by side. Then compare something the numbers do not show: does the shot look the same from the catch, off the dribble and at the line?\n\nIf it does, you have a shot. Not a finished one; nobody has a finished one. But one that is yours, that you can take into any situation and trust. That is what a shooter is. Now go take ten thousand more.",
        },
        keyPoints([
          "A good shot: on balance, in your range, open enough. A bad shot that goes in is still a bad shot.",
          "The defender tells you the shot: back means shoot, closing means fake and go, square and close means move it.",
          "Shot selection is a team skill. Know the rules for the situation; a shooter a coach trusts gets more shots.",
          "Scout yourself by the ratio of good shots to bad, not by makes and misses.",
          "Repeat the baseline. One shot, the same from the catch, off the dribble and at the line.",
        ]),
      ],
      flashcards: [
        { front: "The three things in a good shot", back: "On balance, in your range, open enough that the defender cannot change it." },
        { front: "Is a bad shot that goes in a good shot?", back: "No. Over a season bad shots go in less often, and the difference is the game." },
        { front: "What is your range?", back: "Where you make a good percentage with your normal form. Not where you can reach." },
        { front: "Defender closing hard with high hands", back: "Shot fake, one dribble, pull-up or drive. He has given you the drive." },
        { front: "Why is shot selection a team skill?", back: "The right shot depends on score, clock and who is hot. A shooter a coach trusts gets more shots." },
        { front: "What do you count when scouting yourself?", back: "Good shots versus bad shots. The ratio is the thing you can change." },
      ],
      quizQuestions: [
        {
          questionText: "Which of these is NOT one of the three things in a good shot?",
          answers: [
            { answerText: "It went in.", isCorrect: true, explanation: "A bad shot that goes in is still a bad shot." },
            { answerText: "You are on balance.", isCorrect: false, explanation: "That is one of the three." },
            { answerText: "You are in your range.", isCorrect: false, explanation: "That is one of the three." },
            { answerText: "The shot is open enough that the defender cannot change it.", isCorrect: false, explanation: "That is one of the three." },
          ],
        },
        {
          questionText: "Match the defender's position with the shot he gives you.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Back, hands down", right: "Catch-and-shoot" },
              { left: "Closing hard, high hands", right: "Fake, one dribble, pull-up or drive" },
              { left: "Square and close, on balance", right: "Move the ball" },
            ],
            explanation: "Reads are learned against people, not cones.",
          },
        },
        {
          questionText: "Your range is where you make a good percentage with your normal ___.",
          questionType: "fill_blank",
          payload: { accepted: ["form", "shot", "mechanics", "shooting form"], explanation: "Not where you can reach. Range grows with reps, not ambition." },
        },
        {
          questionText: "Why is a shooter who takes only good shots and makes 40% worth more than one who takes anything and makes 45%?",
          answers: [
            { answerText: "The first percentage is real; the second comes with bad shots that cost possessions.", isCorrect: true, explanation: "The ratio of good shots to bad is the thing a shooter can change." },
            { answerText: "Because 40 is a rounder number.", isCorrect: false, explanation: "No." },
            { answerText: "It is not; the higher percentage is always better.", isCorrect: false, explanation: "The chapter argues the opposite." },
            { answerText: "Because coaches do not read percentages.", isCorrect: false, explanation: "Coaches read what the percentage is made of." },
          ],
        },
        {
          questionText: "When you repeat the baseline in this chapter, what are you checking beyond the counts?",
          answers: [
            { answerText: "Whether the shot looks the same from the catch, off the dribble and at the line.", isCorrect: true, explanation: "One shot, in every situation. That is what a shooter is." },
            { answerText: "Whether you can shoot from half court.", isCorrect: false, explanation: "Range is where you make a good percentage, not where you can reach." },
            { answerText: "Whether your teammates improved.", isCorrect: false, explanation: "The baseline is yours." },
            { answerText: "Nothing; the counts are all that matter.", isCorrect: false, explanation: "The video comparison is the point of filming the baseline." },
          ],
        },
      ],
    },
  ],
};
