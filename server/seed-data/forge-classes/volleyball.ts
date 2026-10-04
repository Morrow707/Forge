import { keyPoints, type ForgeClassContent } from "./types";

/** Volleyball: Every Contact Counts (2026-10-04). Six chapters across the five contacts a
 * player makes, built on the Serving, Passing, Setting, Attacking, Blocking and Footwork drills
 * in the skill library. Written for a high-school player. */
export const VOLLEYBALL_CLASS: ForgeClassContent = {
  name: "Volleyball: Every Contact Counts",
  description:
    "Six chapters on the contacts that make up a rally: a serve that starts the point on your terms, a platform that passes anything, a set a hitter can use, an approach and armswing that score, a block that takes away the hitter's best shot, and reading the game so each contact arrives on time.",
  category: "Volleyball",
  readingLevel: "high_school",
  chapters: [
    {
      title: "The Serve: Starting the Point on Your Terms",
      description:
        "The serve is the only contact in volleyball nobody can touch before you. This chapter covers the toss, the float serve, serving to a target, and serving when you are tired.",
      drills: ["Float Serve Technique", "Serve Target Accuracy", "Serve Under Fatigue", "Underhand Serve Fundamentals"],
      content: [
        {
          title: "The Only Uncontested Contact",
          body:
            "Every other contact in volleyball depends on what the other team did. The serve depends on you. That makes it the one skill in the game you can own completely, and the one most players under-practise because it looks easy.\n\nA serve has three jobs, in order: get it in, make it hard to pass, and put it where the passer does not want it. A missed serve gives the point away with nobody touching the ball; a serve that is easy to pass hands the other team a perfect first contact. Only a serve that does the first two jobs is allowed to try the third.\n\nStart with the Underhand Serve Fundamentals if you need a serve you never miss. There is no shame in it, and a serve in is always better than a serve out.",
        },
        {
          title: "The Toss Is the Serve",
          body:
            "Nearly every serving error starts with the toss. A toss that drifts behind you makes the contact late and the ball long; a toss that drifts in front makes the contact early and the ball into the net. A toss that is the same every time makes the serve the same every time.\n\nFor a float serve the toss is low and in front of the hitting shoulder, barely higher than your reach, so there is almost no time for it to drift. Lift it with a flat hand rather than flicking it, and let it leave the hand without spin.\n\nPractise the toss without hitting it: toss, catch, toss, catch, until twenty in a row land in the same spot. Then add the hit.",
        },
        {
          title: "The Float Serve",
          body:
            "A float serve is hit with no spin, and a ball with no spin moves unpredictably in the air, dipping and wobbling like a knuckleball. That movement is what makes it hard to pass.\n\nThe Float Serve Technique drill works three things. The contact: a firm, open hand hitting the middle of the ball, with the wrist stiff, so no spin is added. The arm: a short, quick swing that stops at contact rather than following through over the ball. The body: a step into the serve so the power comes from the legs and the arm can stay short.\n\nA float that spins is just a slow serve. Watch the ball after you hit it: if the logo turns, the wrist moved. Fix the wrist, not the arm.",
        },
        {
          title: "Targets, and Serving Tired",
          body:
            "Once the serve is in and floating, it gets aimed. The Serve Target Accuracy drill puts cones in the zones that bother passers most: deep corners, the seam between two passers, and short in front of a passer who is standing deep.\n\nA serve to a seam makes two passers decide who takes it. A serve deep to the corner makes the pass travel farther to the setter. A short serve makes a passer who was set deep move forward and pass on the run. Each is a small problem, and small problems become bad first contacts.\n\nServing tired is its own skill, because in a match you serve after a long rally with your heart pounding. The Serve Under Fatigue drill puts the serve right after a sprint or a dig series. The routine from the toss page is what holds it together: same toss, same breath, same contact, whatever the heart is doing.",
        },
        keyPoints([
          "The serve is the one contact you own. Three jobs in order: in, hard to pass, placed.",
          "The toss is the serve. Low, in front of the hitting shoulder, no spin, the same every time.",
          "A float serve has no spin: open hand, stiff wrist, short swing, step from the legs. If the logo turns, fix the wrist.",
          "Serve to the seams, the deep corners and short. Serve tired with the same routine as serving fresh.",
        ]),
      ],
      flashcards: [
        { front: "A serve's three jobs, in order", back: "Get it in, make it hard to pass, put it where the passer does not want it." },
        { front: "Where most serving errors start", back: "The toss. Behind you: long. In front: into the net." },
        { front: "The float serve toss", back: "Low, in front of the hitting shoulder, lifted with a flat hand, no spin." },
        { front: "Why does a float serve move?", back: "No spin, so the ball dips and wobbles in the air." },
        { front: "The logo is turning on your float serve. What moved?", back: "The wrist. Keep it stiff; the hand hits the middle of the ball." },
        { front: "Three serving targets", back: "The seam between passers, the deep corners, short in front of a deep passer." },
      ],
      quizQuestions: [
        {
          questionText: "Put a serve's three jobs in the order the chapter gives.",
          questionType: "ordering",
          payload: { items: ["Get it in", "Make it hard to pass", "Put it where the passer does not want it"], explanation: "Only a serve that does the first two is allowed to try the third." },
        },
        {
          questionText: "A toss that drifts behind you makes the serve go ___.",
          questionType: "fill_blank",
          payload: { accepted: ["long", "out", "out long", "too long"], explanation: "The contact is late. A toss in front sends it into the net." },
        },
        {
          questionText: "Why does a float serve move in the air?",
          answers: [
            { answerText: "It has no spin, so it dips and wobbles unpredictably.", isCorrect: true, explanation: "A float that spins is just a slow serve." },
            { answerText: "It is hit very hard.", isCorrect: false, explanation: "Pace is not what makes it move." },
            { answerText: "The server jumps.", isCorrect: false, explanation: "That is a jump serve." },
            { answerText: "Wind in the gym.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Match the serving target with the problem it causes.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "The seam", right: "Two passers have to decide who takes it" },
              { left: "Deep corner", right: "The pass has to travel farther to the setter" },
              { left: "Short", right: "A deep passer has to pass on the run" },
            ],
            explanation: "Small problems become bad first contacts.",
          },
        },
        {
          questionText: "What holds a serve together when you are tired?",
          answers: [
            { answerText: "The same routine: same toss, same breath, same contact.", isCorrect: true, explanation: "The Serve Under Fatigue drill puts the serve right after a sprint for this reason." },
            { answerText: "Hitting it harder.", isCorrect: false, explanation: "No." },
            { answerText: "Skipping the toss.", isCorrect: false, explanation: "The toss is the serve." },
            { answerText: "Asking for a timeout.", isCorrect: false, explanation: "No." },
          ],
        },
      ],
    },
    {
      title: "The Platform: Passing Anything",
      description:
        "The pass is the contact that makes everything else possible. This chapter covers the platform, moving to the ball, serve receive, and digging a ball that was hit to score.",
      drills: ["Forearm Passing Platform", "Passing Footwork Drill", "Serve Receive Reps", "Digging Hard-Driven Balls"],
      content: [
        {
          title: "Building the Platform",
          body:
            "The platform is the two forearms held together, and the ball is passed off the flat part just above the wrists. Hands together, thumbs parallel and pointed down, elbows locked straight, shoulders rounded forward so the arms make one flat surface.\n\nThe arms do not swing. The ball comes off the platform at the angle the platform is held, so passing is about the angle, not the swing. A ball arriving fast needs no swing at all; a ball arriving slow needs the legs to add pace, not the arms.\n\nThe Forearm Passing Platform drill is hundreds of controlled contacts against a partner's toss. Boring, essential, and the thing every good passer still does first in warm-up.",
        },
        {
          title: "Feet First",
          body:
            "A pass that goes wrong usually went wrong before the contact: the passer was not behind the ball. Get the feet to the ball and the platform does the rest; reach for the ball and the platform angle is a guess.\n\nThe Passing Footwork Drill is shuffle steps: quick, low, feet never crossing, so the body stays square to the target while it moves. Arrive before the ball, stopped, with the weight forward and the knees bent. Then the pass is a small movement from a stable base.\n\nThe pass goes where the shoulders point. Face the target (the setter), not the ball, so the platform sends the ball to where it needs to go rather than back where it came from.",
        },
        {
          title: "Serve Receive",
          body:
            "Serve receive is passing with the serve's three jobs working against you. The ball is floating, it is coming to a seam, and it is deep or short. The Serve Receive Reps drill is where the platform and the feet meet the real thing.\n\nThree keys. Call it early: the word \"mine\" before the ball crosses the net, so a seam serve has one passer, not two. Read the server's contact: a stiff wrist means float, so expect movement and stay low; a snapping wrist means spin, so expect a straight, fast ball. And pass high enough: a serve receive pass that is too low gives the setter no time, and the setter's time is the hitter's set.\n\nThe target is the setter's hands, above the net, a step off it. Every pass in this drill is judged by whether the setter could set it, not by whether it was pretty.",
        },
        {
          title: "Digging",
          body:
            "A dig is a pass of a ball that was hit to score. The ball is faster, the angle is steeper, and there is no time to move the feet much. The Digging Hard-Driven Balls drill is about being ready before the hit.\n\nReady means low, stopped, weight forward, platform out in front, eyes on the hitter's shoulder and arm rather than the ball. The arm tells you where the ball is going before the ball does. A digger who watches the ball is late; a digger who watches the hitter is already there.\n\nOn contact, the platform absorbs. The ball is coming hard, so the arms give a little, the way a cushion first touch gives in soccer, and the ball comes off high and slow to the middle of the court. A dig does not have to be perfect. It has to be up, and in, and playable.",
        },
        keyPoints([
          "The platform: hands together, thumbs down, elbows locked, one flat surface. Angle, not swing.",
          "Feet to the ball before the contact, stopped, square to the target. The pass goes where the shoulders point.",
          "Serve receive: call it early, read the server's wrist, pass high to the setter's hands.",
          "Dig: ready before the hit, eyes on the hitter's arm, platform absorbs. Up, in, playable.",
        ]),
      ],
      flashcards: [
        { front: "The platform", back: "Two forearms together, thumbs down, elbows locked, shoulders rounded, one flat surface above the wrists." },
        { front: "Is passing about the swing?", back: "No. The ball comes off at the angle the platform is held. The legs add pace, never the arms." },
        { front: "Where does the pass go?", back: "Where the shoulders point. Face the setter, not the ball." },
        { front: "Three keys of serve receive", back: "Call it early, read the server's wrist, pass high to the setter's hands." },
        { front: "What do you watch when digging?", back: "The hitter's shoulder and arm. They tell you where the ball goes before the ball does." },
        { front: "What does a dig have to be?", back: "Up, in and playable. Not perfect." },
      ],
      quizQuestions: [
        {
          questionText: "Why does the chapter say passing is about the angle, not the swing?",
          answers: [
            { answerText: "The ball comes off the platform at the angle the platform is held, so a swing only adds error.", isCorrect: true, explanation: "A fast ball needs no swing; a slow ball gets pace from the legs." },
            { answerText: "Swinging is against the rules.", isCorrect: false, explanation: "No." },
            { answerText: "Because the arms are weak.", isCorrect: false, explanation: "No." },
            { answerText: "It does not; swinging is encouraged.", isCorrect: false, explanation: "The chapter says the arms do not swing." },
          ],
        },
        {
          questionText: "The pass goes where the ___ point.",
          questionType: "fill_blank",
          payload: { accepted: ["shoulders", "shoulder"], explanation: "Face the setter, not the ball." },
        },
        {
          questionText: "Match the server's wrist with what to expect.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Stiff wrist", right: "A float: movement, stay low" },
              { left: "Snapping wrist", right: "Spin: a straight, fast ball" },
            ],
            explanation: "Read the server's contact before the ball arrives.",
          },
        },
        {
          questionText: "Why is the word \"mine\" called before the ball crosses the net?",
          answers: [
            { answerText: "So a serve to the seam has one passer, not two.", isCorrect: true, explanation: "A seam serve exists to make two passers decide." },
            { answerText: "To distract the server.", isCorrect: false, explanation: "No." },
            { answerText: "Because the rules require it.", isCorrect: false, explanation: "No." },
            { answerText: "It should be called after the pass.", isCorrect: false, explanation: "After is too late." },
          ],
        },
        {
          questionText: "What should a digger's eyes be on as the hitter swings?",
          answers: [
            { answerText: "The hitter's shoulder and arm.", isCorrect: true, explanation: "The arm tells you where the ball goes before the ball does." },
            { answerText: "The ball.", isCorrect: false, explanation: "A digger who watches the ball is late." },
            { answerText: "The setter.", isCorrect: false, explanation: "No." },
            { answerText: "The floor.", isCorrect: false, explanation: "No." },
          ],
        },
      ],
    },
    {
      title: "The Set: A Ball a Hitter Can Use",
      description:
        "A set is a gift to a hitter, and a good one is the same every time. This chapter covers the hand shape, the footwork to the ball, setting off a bad pass, and the tempos a hitter needs.",
      drills: ["Overhead Set Technique", "Setter Footwork and Positioning", "Setting Off a Bad Pass", "Quick Set (Tempo) Reps"],
      content: [
        {
          title: "The Hands",
          body:
            "A set is played with the fingers, above the forehead, with both hands touching the ball at the same instant and releasing it at the same instant. The hands make the shape of the ball before it arrives: fingers spread, thumbs back, a window you could see the ball through.\n\nThe Overhead Set Technique drill is about that window and the moment of contact. The ball is caught and released in one motion, with no spin, pushed by the fingers and the extension of the arms rather than slapped by the palms. A set that spins was touched unevenly, and an uneven touch is the thing a referee calls.\n\nSoft hands come from relaxed wrists and the ball arriving at the fingertips, not the palm. If the ball is loud on your hands, it is in your palms.",
        },
        {
          title: "Feet Under the Ball",
          body:
            "A setter gets to the ball before it gets to him, and that means the feet. The Setter Footwork and Positioning drill is about arriving under the ball, stopped, square to the target, with the right foot slightly forward, before the hands ever touch it.\n\nSet from a stable base and the ball goes where you intend. Set on the move and the ball goes where the movement sends it. Most bad sets are late feet, the same as most bad passes.\n\nThe setter's home is a step off the net, right of centre, facing the left side. From there the forward set to the outside is natural and the back set to the right side is a hip extension. Get home early on every pass; a setter who is still moving when the pass arrives has already lost the quick option.",
        },
        {
          title: "Setting Off a Bad Pass",
          body:
            "Passes are not always good. A setter's value shows on the ones that are not: the pass that is too low, too tight to the net, off to the side, or so far away that only one set is possible.\n\nThe Setting Off a Bad Pass drill puts the setter in each of those positions on purpose. The rule is the same in all of them: get a hittable ball to a hitter, and if a perfect set is not possible, a high, slow set to the outside is always possible. A hitter can work with a high ball. A hitter cannot work with a set that was attempted and failed.\n\nA tight pass is the one that burns setters. The ball is on the net, the block is right there, and the temptation is to set it anyway. Step off, set it high and away from the net, and live to run the next play.",
        },
        {
          title: "Tempo",
          body:
            "Tempo is how high and how fast the set is, and it decides when the hitter has to leave. A high set gives a hitter time; a quick set gives the block no time. Both have their place.\n\nThe Quick Set (Tempo) Reps drill works the fast ball to the middle: a low, quick set delivered as the hitter is already in the air, so the block cannot form. It only works when the pass is good and the setter is home, which is why the footwork page came first.\n\nThe set and the hitter have to agree on tempo before the pass arrives. That is what the signals and the calls are for, and that is why a setter talks constantly. A tempo the hitter did not expect is a hitter under the ball with nowhere to go.",
        },
        keyPoints([
          "A set is played with the fingers above the forehead, both hands at once, no spin. Loud hands are palms.",
          "Feet under the ball, stopped, square, before the hands touch it. Get home early on every pass.",
          "Off a bad pass, a high slow set to the outside is always possible. Never set a tight ball into the block.",
          "Tempo decides when the hitter leaves. Agree it before the pass arrives.",
        ]),
      ],
      flashcards: [
        { front: "Where is a set played?", back: "Above the forehead, with the fingers, both hands touching and releasing at the same instant." },
        { front: "The ball is loud on your hands. What is wrong?", back: "It is in your palms. Soft hands take the ball at the fingertips." },
        { front: "The setter's home", back: "A step off the net, right of centre, facing the left side." },
        { front: "The rule off a bad pass", back: "Get a hittable ball to a hitter. A high, slow set to the outside is always possible." },
        { front: "What is tempo?", back: "How high and fast the set is, which decides when the hitter has to leave." },
        { front: "When does a quick set work?", back: "When the pass is good and the setter is home, delivered as the hitter is already in the air." },
      ],
      quizQuestions: [
        {
          questionText: "What causes a set to spin?",
          answers: [
            { answerText: "An uneven touch: the hands did not contact and release the ball at the same instant.", isCorrect: true, explanation: "An uneven touch is also what a referee calls." },
            { answerText: "Setting too high.", isCorrect: false, explanation: "Height does not spin a ball." },
            { answerText: "Jumping while setting.", isCorrect: false, explanation: "No." },
            { answerText: "Using the fingertips.", isCorrect: false, explanation: "The fingertips are the correct contact." },
          ],
        },
        {
          questionText: "Most bad sets, like most bad passes, come from late ___.",
          questionType: "fill_blank",
          payload: { accepted: ["feet", "footwork"], explanation: "Set from a stable base and the ball goes where you intend." },
        },
        {
          questionText: "The pass is tight on the net and the block is right there. What does the chapter say?",
          answers: [
            { answerText: "Step off, set it high and away from the net, and run the next play.", isCorrect: true, explanation: "A tight pass is the one that burns setters." },
            { answerText: "Set it quick into the middle.", isCorrect: false, explanation: "A quick set needs a good pass." },
            { answerText: "Set it anyway and hope.", isCorrect: false, explanation: "That is the temptation the chapter warns against." },
            { answerText: "Let it drop.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Match the tempo with what it gives.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "High set", right: "Gives the hitter time" },
              { left: "Quick set", right: "Gives the block no time" },
            ],
            explanation: "Both have their place, and the hitter has to know which is coming.",
          },
        },
        {
          questionText: "Why does a setter talk constantly?",
          answers: [
            { answerText: "So the setter and hitter agree on tempo before the pass arrives.", isCorrect: true, explanation: "A tempo the hitter did not expect leaves him under the ball with nowhere to go." },
            { answerText: "To distract the other team.", isCorrect: false, explanation: "No." },
            { answerText: "Because the referee requires it.", isCorrect: false, explanation: "No." },
            { answerText: "They should not; silence is better.", isCorrect: false, explanation: "The chapter says the opposite." },
          ],
        },
      ],
    },
    {
      title: "The Attack: Approach and Armswing",
      description:
        "Scoring in volleyball is an approach, a jump and an armswing that arrive together. This chapter builds all three, then the shots that beat a block.",
      drills: ["Approach and Armswing", "Approach Run Rhythm Drill", "Line and Cross-Court Hitting", "Off-Speed Shot (Tip/Roll)"],
      content: [
        {
          title: "The Approach",
          body:
            "The approach is the run-up that turns forward speed into height. The most common is four steps for a right-handed hitter: right, left, then a fast right-left that plants both feet and jumps. The first two are slow and build; the last two are fast and explode.\n\nThe Approach Run Rhythm Drill is about that rhythm, slow-slow-fast-fast, said out loud at first. The plant is heels first, feet together, and the arms swing back on the plant and forward and up on the jump. The arms are what add the last few inches.\n\nThe approach starts from off the net, behind the attack line, so there is room for all four steps. A hitter who starts at the net has no approach and no height.",
        },
        {
          title: "The Armswing",
          body:
            "In the air, the hitting arm draws back with the elbow high, like drawing a bow, and the off arm points at the ball. The hit is a whip: the elbow leads, the hand follows, the hand snaps over the top of the ball at full extension, and the arm finishes across the body.\n\nThe Approach and Armswing drill joins the two. Contact is in front of the hitting shoulder, at the highest point of the jump, with the ball slightly ahead so the hand can get over it. Contact behind the head sends the ball long; contact too far in front sends it into the net.\n\nThe snap of the wrist gives topspin, and topspin is what brings a hard-hit ball down inside the line. No snap, no spin, no control.",
        },
        {
          title: "Line and Cross-Court",
          body:
            "A hitter with one shot is a hitter the block can take away. The two basic shots are down the line, along the sideline nearest you, and cross-court, across the body to the far corner.\n\nThe Line and Cross-Court Hitting drill alternates them from the same approach. The difference is not the approach and not the armswing; it is the angle of the hand at contact and a slight turn of the shoulders. The approach has to look the same for both, or the block reads it.\n\nRead the block before you choose. Two blockers set on the cross-court angle leave the line open; a blocker reaching for the line leaves the cross-court open. The read happens as you leave the ground, in the moment before the arm comes through.",
        },
        {
          title: "Beating the Block Without Power",
          body:
            "The block is tall and the hitter is not always taller. The Off-Speed Shot (Tip/Roll) drill is the answer: a ball placed over or around the block instead of through it.\n\nThe tip is a soft push with the fingertips, from the same approach and the same arm draw, so the block jumps for a hit that never comes and the ball drops behind them. The roll shot is a slower armswing with heavy topspin that arcs over the block and dives into the court behind.\n\nBoth work because they look like the hit until the last instant. A tip the block sees coming is a free dig for the other team. Use them when the block is set and the hard hit has no angle, and use them rarely enough that the block still has to respect the hit.",
        },
        keyPoints([
          "The approach: four steps, slow-slow-fast-fast, heels-first plant, arms back and up. Start off the net.",
          "The armswing is a whip: elbow high and leading, hand snapping over the ball at full extension in front of the shoulder.",
          "Line and cross-court from the same approach. Read the block as you leave the ground.",
          "Tip and roll beat a tall block when they look like the hit until the last instant. Use them rarely.",
        ]),
      ],
      flashcards: [
        { front: "The four-step approach rhythm", back: "Slow, slow, fast, fast. The last two explode into the plant." },
        { front: "Where does the approach start?", back: "Off the net, behind the attack line, so there is room for all four steps." },
        { front: "Where is contact on an armswing?", back: "In front of the hitting shoulder, at the highest point, slightly ahead so the hand gets over the ball." },
        { front: "What gives a hard hit control?", back: "Topspin from the wrist snap, which brings the ball down inside the line." },
        { front: "What differs between line and cross-court?", back: "The hand angle at contact and a slight shoulder turn. The approach looks the same." },
        { front: "When to tip or roll", back: "When the block is set and the hard hit has no angle. Rarely, so the block still respects the hit." },
      ],
      quizQuestions: [
        {
          questionText: "Put the four-step approach in order for a right-handed hitter.",
          questionType: "ordering",
          payload: { items: ["Slow right step", "Slow left step", "Fast right step", "Fast left step into the plant and jump"], explanation: "Slow-slow-fast-fast, heels first on the plant." },
        },
        {
          questionText: "Contact behind the head sends the ball ___.",
          questionType: "fill_blank",
          payload: { accepted: ["long", "out", "out long", "over the end line"], explanation: "Contact too far in front sends it into the net." },
        },
        {
          questionText: "What brings a hard-hit ball down inside the line?",
          answers: [
            { answerText: "Topspin from the wrist snapping over the ball.", isCorrect: true, explanation: "No snap, no spin, no control." },
            { answerText: "Hitting it softer.", isCorrect: false, explanation: "Softness is the tip and roll; a hard hit needs spin." },
            { answerText: "Jumping lower.", isCorrect: false, explanation: "No." },
            { answerText: "Aiming at the net.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Two blockers are set on the cross-court angle. Where is the shot?",
          answers: [
            { answerText: "Down the line.", isCorrect: true, explanation: "The block takes away one shot and leaves the other." },
            { answerText: "Cross-court, through them.", isCorrect: false, explanation: "That is the shot they are set for." },
            { answerText: "Straight into the net.", isCorrect: false, explanation: "No." },
            { answerText: "There is no shot; let it drop.", isCorrect: false, explanation: "The line is open." },
          ],
        },
        {
          questionText: "Why do the tip and the roll work?",
          answers: [
            { answerText: "They look like the hit until the last instant, so the block jumps for a hit that never comes.", isCorrect: true, explanation: "A tip the block sees coming is a free dig." },
            { answerText: "They are hit harder than a normal spike.", isCorrect: false, explanation: "They are slower on purpose." },
            { answerText: "Blockers are not allowed to touch them.", isCorrect: false, explanation: "No." },
            { answerText: "They do not work; the chapter says never to use them.", isCorrect: false, explanation: "Use them rarely, not never." },
          ],
        },
      ],
    },
    {
      title: "The Block: Taking Away the Best Shot",
      description:
        "A block does not have to stuff the ball to win the point. It has to take away the hitter's best shot and make the rest diggable. This chapter covers footwork, timing, reading the hitter and blocking as a pair.",
      drills: ["Block Footwork - Lateral Slide", "Timing the Block Jump", "Reading Hitter Approach for Block", "Double Block Coordination"],
      content: [
        {
          title: "What a Block Is For",
          body:
            "Young blockers try to block every ball to the floor and get tooled for their trouble. A block has two jobs that come before the stuff: take away the hitter's best angle, and make the shots that get through predictable, so the diggers behind you know where to be.\n\nA block that is in the right place and loses the point to a shot it did not cover has still done something useful if the dig was there. A block that jumps in the wrong place, however high, has done nothing but open the court.\n\nThink of the block as a wall the defense stands behind. The wall's job is to be where it said it would be.",
        },
        {
          title: "Footwork at the Net",
          body:
            "Blocking footwork is lateral: the hitter is moving along the net and the blocker has to get in front of him without turning away from the net. The Block Footwork - Lateral Slide drill is shuffle steps along the net for short distances and a crossover step for longer ones, always ending square to the net with the feet set before the jump.\n\nThe ready position is hands up at shoulder height, elbows bent, knees bent, a step off the net so there is room to press over it. Hands below the net at the moment the hitter swings are hands that are late.\n\nA blocker who jumps while still moving sideways drifts into the net or into the next blocker. Arrive, set, then jump. The order never changes.",
        },
        {
          title: "Timing and the Press",
          body:
            "The block jumps after the hitter. A hitter is in the air before the blocker because the hitter is reacting to the set and the blocker is reacting to the hitter, so the timing cue is the hitter's arm drawing back. Leave as the arm goes back, and your hands are over the net as the hitter's hand meets the ball.\n\nThe Timing the Block Jump drill is run against a live hitter for this reason; a tossed ball teaches the wrong cue. Early blocks come down before the hit; late blocks arrive after it.\n\nIn the air, the hands press over the net, fingers spread, thumbs up, shoulders shrugged, so that the ball that hits the hands goes down on the hitter's side rather than off the hands and out. The press is what turns a touch into a point.",
        },
        {
          title: "Reading the Hitter, Blocking as a Pair",
          body:
            "The hitter tells you where the ball is going before he hits it. The Reading Hitter Approach for Block drill is about those tells: the angle of the approach says line or cross; the position of the ball relative to the hitting shoulder says the same; a late, slow arm says tip.\n\nRead, then set the block on the shot you are taking away. A good read with the hands in the wrong place is a wasted read.\n\nMost blocks are two blockers. The Double Block Coordination drill is about the seam: two blockers whose hands have a gap between them give the hitter a hole, and a hole is the easiest shot in the game. The outside blocker sets the line; the middle blocker closes to him, hands together, and the two of them become one wall. One call, one jump, no seam.",
        },
        keyPoints([
          "A block takes away the best shot and makes the rest diggable. The wall's job is to be where it said it would be.",
          "Lateral footwork along the net, square, feet set before the jump. Arrive, set, then jump.",
          "Jump as the hitter's arm draws back. Press over the net with fingers spread and thumbs up.",
          "Read the approach and the ball's position for line or cross. Two blockers close the seam into one wall.",
        ]),
      ],
      flashcards: [
        { front: "A block's two jobs before the stuff", back: "Take away the hitter's best angle; make the shots that get through predictable for the diggers." },
        { front: "Blocking footwork", back: "Shuffle for short, crossover for long, always ending square to the net with feet set before the jump." },
        { front: "The timing cue for the block jump", back: "The hitter's arm drawing back. Leave then, and the hands are over the net as he hits." },
        { front: "What is the press?", back: "Hands over the net, fingers spread, thumbs up, shoulders shrugged, so a touched ball goes down on the hitter's side." },
        { front: "Tells for the hitter's shot", back: "Approach angle, ball position relative to the hitting shoulder, a late slow arm for a tip." },
        { front: "What two blockers must not leave", back: "A seam between their hands. The outside sets the line, the middle closes to him." },
      ],
      quizQuestions: [
        {
          questionText: "What does the chapter say a block is for, before stuffing the ball?",
          answers: [
            { answerText: "Taking away the hitter's best angle and making the rest predictable for the diggers.", isCorrect: true, explanation: "A wall the defense stands behind." },
            { answerText: "Intimidating the hitter.", isCorrect: false, explanation: "No." },
            { answerText: "Blocking every ball to the floor.", isCorrect: false, explanation: "That is what young blockers try and get tooled for." },
            { answerText: "Resting the back row.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Put the blocker's movement in order.",
          questionType: "ordering",
          payload: { items: ["Move laterally along the net", "Arrive square with feet set", "Jump as the hitter's arm draws back", "Press over the net"], explanation: "Arrive, set, then jump. The order never changes." },
        },
        {
          questionText: "The timing cue for the block jump is the hitter's ___ drawing back.",
          questionType: "fill_blank",
          payload: { accepted: ["arm", "hitting arm", "elbow"], explanation: "A tossed ball teaches the wrong cue, so the drill is run against a live hitter." },
        },
        {
          questionText: "Match the tell with the shot it predicts.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Approach angle and ball position", right: "Line or cross-court" },
              { left: "A late, slow arm", right: "A tip" },
            ],
            explanation: "Read, then set the block on the shot you are taking away.",
          },
        },
        {
          questionText: "Why is a seam between two blockers' hands so costly?",
          answers: [
            { answerText: "It gives the hitter a hole, and a hole is the easiest shot in the game.", isCorrect: true, explanation: "The middle blocker closes to the outside blocker, hands together." },
            { answerText: "The referee calls a fault.", isCorrect: false, explanation: "No." },
            { answerText: "It is not costly; two separate blocks cover more court.", isCorrect: false, explanation: "The chapter says the opposite." },
            { answerText: "It makes the blockers collide.", isCorrect: false, explanation: "The problem is the gap, not a collision." },
          ],
        },
      ],
    },
    {
      title: "Reading the Game",
      description:
        "Every contact in this class arrives on time only if the player saw it coming. This chapter is about transition, defensive position, reading the other side, and the mind between points. The last page returns to your serve.",
      drills: ["Block-to-Transition Footwork", "Pursuit Digging Drill", "Serve Receive Pressure Drill", "Serve Target Accuracy"],
      content: [
        {
          title: "Transition",
          body:
            "Volleyball is played in transitions: from defense to offense and back, several times a rally. A player who is still landing from the block when the dig goes up has missed the attack that follows. The Block-to-Transition Footwork drill is about the landing and the retreat: land, turn, and get off the net to the attack line before the set, so the approach from Chapter 4 has its four steps.\n\nThe same is true in the other direction. A hitter who lands and admires the ball is a hitter who is not back on defense when it comes over. Land and move. Every contact ends with the next one already started.",
        },
        {
          title: "Where to Stand",
          body:
            "Defensive position is decided by the block. The diggers stand where the block is not: if the block takes the line, the diggers cover cross-court; if it takes the cross, the diggers cover the line and the tip.\n\nThat is why the block has to be where it said it would be. A digger who is behind a block that moved is a digger standing in the wrong place for a reason that was not his.\n\nThe Pursuit Digging Drill adds the hardest part: the ball that goes somewhere nobody is. Chase it. A ball that is pursued and kept alive is a point still being played, and a surprising number of them are won. A ball that is watched is a point lost.",
        },
        {
          title: "Reading the Other Side",
          body:
            "Before the rally, look across the net and ask three questions. Who is their best hitter and where is she? A good team sets its best hitter in a tight spot, and the block should be ready there. Where is the setter? Front row means she can attack; back row means she cannot, and the block has one fewer hitter to watch. Who is passing badly? Serve at that player.\n\nDuring the rally, the pass tells you the set. A bad pass means a high set to the outside, and the block can go there early. A good pass means anything is possible, and the block has to wait on the setter's hands.\n\nNone of this is complicated. It is a habit of looking, the same as the first touch in soccer or the leverage read in football, and it makes every contact arrive earlier.",
        },
        {
          title: "Between Points",
          body:
            "A volleyball match is a hundred points with a few seconds between each. What a player does in those seconds decides the next point as much as any skill.\n\nThe Serve Receive Pressure Drill puts a consequence on each pass so that the seconds between reps feel like a match. Use them the same way every time: a word to a teammate, a breath, the next position, the next read. The last point is finished, however it went.\n\nTeams that lose runs of points usually lose them between the points, not during them. One bad pass becomes two because the passer is still thinking about the first. The routine is what stops the run.",
        },
        {
          title: "Back to Your Serve",
          body:
            "In Chapter 1 you ran the Serve Target Accuracy drill for the first time. Run it again, same targets, and count: serves in, serves to the target, serves that spun.\n\nCompare with the first run. Then compare the toss on video from the side: the same spot every time, or still drifting?\n\nThe serve was the first thing in this class because it is the contact you own. If it is better now, you have learned the one lesson this whole class is about: every contact counts, and every one of them is built in the same way, feet first, the same every time, read before it arrives. Carry that into the next five.",
        },
        keyPoints([
          "Every contact ends with the next one started. Land and move; get off the net before the set.",
          "Diggers stand where the block is not. Pursue every ball; a chased ball is a point still being played.",
          "Three questions before the rally: who is their best hitter, where is their setter, who passes badly. The pass tells you the set.",
          "Points are lost between points. The same routine after every one.",
          "Repeat the serve target test. Every contact, feet first, the same every time, read before it arrives.",
        ]),
      ],
      flashcards: [
        { front: "What is transition?", back: "Moving from defense to offense and back, several times a rally. Every contact ends with the next one started." },
        { front: "Where do the diggers stand?", back: "Where the block is not. Line block means cover cross; cross block means cover line and tip." },
        { front: "Three questions before the rally", back: "Who is their best hitter, where is their setter, who is passing badly." },
        { front: "What does a bad pass tell the block?", back: "A high set to the outside is coming; go there early." },
        { front: "Where are runs of points usually lost?", back: "Between the points, not during them. The routine stops the run." },
        { front: "The lesson of the whole class", back: "Every contact counts, built the same way: feet first, the same every time, read before it arrives." },
      ],
      quizQuestions: [
        {
          questionText: "After blocking, what does the chapter say to do?",
          answers: [
            { answerText: "Land, turn, and get off the net to the attack line before the set.", isCorrect: true, explanation: "So the approach has its four steps." },
            { answerText: "Stay at the net in case of a tip.", isCorrect: false, explanation: "The diggers cover the tip; the blocker transitions." },
            { answerText: "Watch where the ball went.", isCorrect: false, explanation: "Watching is what the chapter warns against." },
            { answerText: "Call a timeout.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Diggers stand where the ___ is not.",
          questionType: "fill_blank",
          payload: { accepted: ["block", "blocker", "blockers"], explanation: "Which is why the block has to be where it said it would be." },
        },
        {
          questionText: "Match what you see with what it tells you.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Their setter is in the back row", right: "One fewer hitter for the block to watch" },
              { left: "A bad pass on their side", right: "A high set to the outside is coming" },
              { left: "A player passing badly", right: "Serve at that player" },
            ],
            explanation: "A habit of looking makes every contact arrive earlier.",
          },
        },
        {
          questionText: "Why does the chapter say to chase a ball that is going somewhere nobody is?",
          answers: [
            { answerText: "A pursued ball is a point still being played, and a surprising number of them are won.", isCorrect: true, explanation: "A watched ball is a point lost." },
            { answerText: "To show effort to the coach.", isCorrect: false, explanation: "Not the reason given." },
            { answerText: "Because the rules require a touch.", isCorrect: false, explanation: "No." },
            { answerText: "You should let it go and reset.", isCorrect: false, explanation: "The chapter says the opposite." },
          ],
        },
        {
          questionText: "Why do teams lose runs of points, according to the chapter?",
          answers: [
            { answerText: "They lose them between the points: one bad pass becomes two because the passer is still thinking about the first.", isCorrect: true, explanation: "The same routine after every point stops the run." },
            { answerText: "Because the other team serves harder.", isCorrect: false, explanation: "No." },
            { answerText: "Because of bad luck.", isCorrect: false, explanation: "No." },
            { answerText: "Because of substitutions.", isCorrect: false, explanation: "No." },
          ],
        },
      ],
    },
  ],
};
