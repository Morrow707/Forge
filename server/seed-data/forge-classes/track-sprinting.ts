import { keyPoints, type ForgeClassContent } from "./types";

/** Track: Running Fast on Purpose (2026-10-04). Six chapters for a sprinter, built on the
 * Starts and Sprint Mechanics drills in the skill library. Written for a high-school athlete.
 * Timing in this class is a stopwatch or the track's own clock; no claim is made for any camera
 * number. */
export const TRACK_SPRINTING_CLASS: ForgeClassContent = {
  name: "Track: Running Fast on Purpose",
  description:
    "Six chapters on sprinting as a skill rather than a gift: the posture and the arms, the start, acceleration, top speed, holding it when it hurts, and racing. Each drill day is the sprint drills every fast runner still does.",
  category: "Track",
  readingLevel: "high_school",
  chapters: [
    {
      title: "Sprinting Is a Skill",
      description:
        "Fast runners are made by running correctly, thousands of times. This chapter sets up the posture, the arms and the drills that every chapter after this one builds on, and takes your baseline.",
      drills: ["Arm Swing Mechanics Drill", "A-Skip Drill", "High Knee Drill", "40-Yard Dash"],
      content: [
        {
          title: "Nobody Is Just Fast",
          body:
            "Every sprinter you have watched win was taught. The posture, the arm action, the way the foot strikes the ground: none of it is instinct. Left to themselves, people run with their shoulders high, their arms across their body and their feet landing in front of them, and all three of those are slow.\n\nThis class treats sprinting the way the other Forge classes treat a swing or a shot: as a movement with parts, each of which can be drilled and fixed. The drills look simple. They are the same drills the fastest people in the world do before every session, and the reason is that the parts never stop needing attention.\n\nThe promise of the class is not that you will be the fastest. It is that you will be faster than you are, on purpose, and know why.",
        },
        {
          title: "Posture",
          body:
            "Sprint posture is tall and slightly forward. The head is level, the eyes down the track, the chest up, the hips tall under the shoulders, and the whole body leaning a little from the ankles rather than bending at the waist.\n\nTwo faults account for most slow posture. Sitting: the hips drop behind the shoulders, the knees cannot come up, and each stride is short. Bending: the waist folds, the head goes down, and the legs are pushing the body up instead of forward.\n\nThe High Knee Drill is a posture drill before it is a knee drill. If the hips are tall, the knee comes up to hip height easily; if the hips are sitting, it cannot. Run it in front of a mirror or on film and look at the hips, not the knees.",
        },
        {
          title: "The Arms",
          body:
            "The arms set the rhythm of the legs. They swing from the shoulder, not the elbow, with the elbow bent at roughly a right angle, the hands moving from about the cheek in front to past the hip behind. Front to back, never across the body.\n\nArms that cross the chest turn the shoulders, and turned shoulders twist the hips, and twisted hips waste the stride. Arms that swing short and fast make the legs short and fast; arms that swing long and powerful make the legs do the same. The Arm Swing Mechanics Drill is run standing still, then walking, then jogging, so the pattern is learned before speed gets involved.\n\nThe hands stay relaxed. A clenched fist tenses the forearm, the forearm tenses the shoulder, and tension anywhere slows everything.",
        },
        {
          title: "The Drills, and Your Baseline",
          body:
            "The A-Skip is the drill that ties posture, arms and legs together: a skip with the knee driving up to hip height, the foot under the knee, the opposite arm driving, and the foot striking the ground under the body. Done slowly and correctly it is the whole sprint stride in miniature, which is why it is in nearly every chapter.\n\nYour baseline is two things. A 40-Yard Dash, timed with a stopwatch or the track's clock, from a standing start, best of three. And a video of the run.\n\nBe honest about the time and keep the video. Chapter 6 asks you to run it again and compare, and the video will show you what the clock cannot: whether you are running differently, not just faster.",
        },
        keyPoints([
          "Nobody is just fast. Sprinting is a movement with parts, each drilled and fixed.",
          "Posture: tall, hips under the shoulders, a lean from the ankles. Never sitting, never bending.",
          "Arms swing from the shoulder, front to back, cheek to hip, hands relaxed. They set the rhythm.",
          "The A-Skip is the stride in miniature. Baseline: a timed 40 and a video of the run.",
        ]),
      ],
      flashcards: [
        { front: "Three things people do untaught that are slow", back: "Shoulders high, arms across the body, feet landing in front of them." },
        { front: "Sprint posture", back: "Tall, head level, chest up, hips under the shoulders, a slight lean from the ankles." },
        { front: "Two posture faults", back: "Sitting (hips behind the shoulders) and bending (folding at the waist)." },
        { front: "Where do the arms swing from?", back: "The shoulder, elbow about a right angle, cheek to hip, front to back, never across." },
        { front: "Why do the hands stay relaxed?", back: "A clenched fist tenses the forearm, then the shoulder, and tension slows everything." },
        { front: "What is the A-Skip?", back: "The whole sprint stride in miniature: knee up, foot under the knee, opposite arm, strike under the body." },
      ],
      quizQuestions: [
        {
          questionText: "Which of these does the chapter say is a natural but slow way to run?",
          answers: [
            { answerText: "Arms swinging across the body.", isCorrect: true, explanation: "Crossed arms turn the shoulders, which twist the hips, which waste the stride." },
            { answerText: "A lean from the ankles.", isCorrect: false, explanation: "That is correct posture." },
            { answerText: "The foot striking under the body.", isCorrect: false, explanation: "That is correct." },
            { answerText: "Relaxed hands.", isCorrect: false, explanation: "That is correct." },
          ],
        },
        {
          questionText: "Match the posture fault with what it does.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Sitting", right: "Hips behind the shoulders, knees cannot come up, short strides" },
              { left: "Bending", right: "Waist folds, head down, legs push up instead of forward" },
            ],
            explanation: "Look at the hips, not the knees.",
          },
        },
        {
          questionText: "The arms swing from the ___, not the elbow.",
          questionType: "fill_blank",
          payload: { accepted: ["shoulder", "shoulders"], explanation: "Elbow at about a right angle, hands from the cheek to past the hip." },
        },
        {
          questionText: "Why is the High Knee Drill called a posture drill first?",
          answers: [
            { answerText: "If the hips are tall the knee comes up easily; if they are sitting it cannot.", isCorrect: true, explanation: "The drill shows the hips, not the knees." },
            { answerText: "Because it is done standing still.", isCorrect: false, explanation: "No." },
            { answerText: "Because the knees do not matter.", isCorrect: false, explanation: "They matter, but the hips decide whether they can rise." },
            { answerText: "It is not; it is only a knee drill.", isCorrect: false, explanation: "The chapter says the opposite." },
          ],
        },
        {
          questionText: "What are the two parts of your baseline?",
          answers: [
            { answerText: "A timed 40-yard dash from a standing start, best of three, and a video of the run.", isCorrect: true, explanation: "The video shows whether you run differently, not just faster." },
            { answerText: "A mile time and a bodyweight.", isCorrect: false, explanation: "No." },
            { answerText: "A vertical jump.", isCorrect: false, explanation: "No." },
            { answerText: "A 40 only.", isCorrect: false, explanation: "The video is the second part." },
          ],
        },
      ],
    },
    {
      title: "The Start",
      description:
        "Races are decided in the first steps more often than at the finish. This chapter covers the block setup, the set position, the reaction, and a standing start for when there are no blocks.",
      drills: ["Block Start Setup", "Reaction Time Starts", "Standing Start Acceleration", "Falling Start Drill"],
      content: [
        {
          title: "Blocks",
          body:
            "Starting blocks exist to give your feet something to push against. The setup is personal, but the shape is the same: the front block about two foot-lengths behind the line, the rear block about a foot-length behind that, the front pedal lower and the rear pedal steeper. Your coach will adjust it to your legs.\n\nThe Block Start Setup drill is about finding the setup and repeating it exactly, with the same measurements, before every race. A start that is set up differently each time is a different start each time.\n\nIn the blocks, the hands are just behind the line, a little wider than the shoulders, fingers bridged, the arms straight. The weight is on the hands and the front foot. The head is down and relaxed, in line with the spine.",
        },
        {
          title: "The Set Position",
          body:
            "On \"set\" the hips rise, a little above the shoulders, the front knee at about a right angle and the rear knee more open. The shins are driving into the blocks. The shoulders are slightly ahead of the hands. The whole body is loaded, like a spring held down.\n\nTwo faults. Hips too low, and the first step goes up instead of out. Hips too high, and the legs have no angle to push from. The drill is to hold the set position for a few seconds and feel the load in the legs; if it is in the arms, the hips are wrong.\n\nIn the set position the mind does one thing: wait for the sound. Not the race, not the lane next to you. The sound.",
        },
        {
          title: "Reaction and the First Step",
          body:
            "The gun fires and both feet push. The rear leg leaves first and drives forward and low; the front leg finishes its push a moment later and follows. The arms split hard, one forward and one back, and the body comes out at a low angle, driving into the track rather than standing up.\n\nThe Reaction Time Starts drill works the reaction with a partner's clap or a timer. Reaction is trainable: anticipating is a false start, but attending to the sound and only the sound takes the time between hearing it and moving down.\n\nThe First Three Steps drill, in the next chapter, is what follows. For now the whole focus is the moment of the sound and the first push.",
        },
        {
          title: "Starting Without Blocks",
          body:
            "Most sprints outside a track meet start standing: a relay exchange, a sport that is not track, a practice with no blocks. The Standing Start Acceleration drill is the same start without the hardware.\n\nFeet staggered, front foot a little behind the line, weight forward on the front foot, hips loaded, arms opposite the legs. The first step is the same low drive as from the blocks. The body still comes out at an angle, not upright.\n\nThe Falling Start Drill teaches the angle: stand tall, lean from the ankles until you have to step or fall, and then run. The lean the body finds on its own is the angle a good start comes out at. Feel it there, then take it to the blocks.",
        },
        keyPoints([
          "Blocks: front block about two foot-lengths back, rear a foot-length behind it, the same measurements every race.",
          "Set: hips a little above the shoulders, the legs loaded like a spring. Wait for the sound and only the sound.",
          "On the gun both feet push, the rear leg drives first, the arms split, the body comes out low.",
          "A standing start is the same drive without the hardware. The falling start teaches the angle.",
        ]),
      ],
      flashcards: [
        { front: "Why repeat the block setup exactly?", back: "A start set up differently each time is a different start each time." },
        { front: "The set position", back: "Hips a little above the shoulders, front knee about a right angle, shins driving into the blocks, shoulders slightly ahead of the hands." },
        { front: "Hips too low in the set", back: "The first step goes up instead of out." },
        { front: "What does the mind do in the set position?", back: "Wait for the sound. Nothing else." },
        { front: "Which leg leaves the blocks first?", back: "The rear leg, driving forward and low." },
        { front: "What does the Falling Start Drill teach?", back: "The angle a good start comes out at: the lean the body finds on its own." },
      ],
      quizQuestions: [
        {
          questionText: "In the set position, where are the hips?",
          answers: [
            { answerText: "A little above the shoulders, with the legs loaded like a spring.", isCorrect: true, explanation: "Too low and the first step goes up; too high and there is no angle to push from." },
            { answerText: "Well below the shoulders.", isCorrect: false, explanation: "That sends the first step up." },
            { answerText: "As high as possible.", isCorrect: false, explanation: "That leaves no angle to push from." },
            { answerText: "Level with the knees.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Put the start in order.",
          questionType: "ordering",
          payload: { items: ["Set: hips rise, body loaded", "The sound", "Rear leg drives forward and low", "Front leg finishes its push and follows", "Arms split, body out at a low angle"], explanation: "The whole focus is the moment of the sound and the first push." },
        },
        {
          questionText: "In the set position the mind does one thing: wait for the ___.",
          questionType: "fill_blank",
          payload: { accepted: ["sound", "gun", "signal", "start"], explanation: "Not the race, not the lane next to you." },
        },
        {
          questionText: "If the load in the set position is in your arms, what is wrong?",
          answers: [
            { answerText: "The hips are in the wrong place.", isCorrect: true, explanation: "The load should be in the legs; the arms only hold position." },
            { answerText: "The blocks are too far back.", isCorrect: false, explanation: "The chapter's test is about the hips." },
            { answerText: "Nothing; the arms should carry the weight.", isCorrect: false, explanation: "No." },
            { answerText: "The track is wet.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Why is reaction time trainable?",
          answers: [
            { answerText: "Attending to the sound and only the sound shortens the time between hearing it and moving.", isCorrect: true, explanation: "Anticipating is a false start; attending is not." },
            { answerText: "It is not; reaction is fixed at birth.", isCorrect: false, explanation: "The chapter says it is trainable." },
            { answerText: "Because you can guess the gun.", isCorrect: false, explanation: "Guessing is a false start." },
            { answerText: "Because the blocks do it for you.", isCorrect: false, explanation: "No." },
          ],
        },
      ],
    },
    {
      title: "Acceleration: The First Thirty Meters",
      description:
        "Between the start and top speed is acceleration, and it has its own mechanics. This chapter covers the drive phase, the rising body, pushing instead of reaching, and the three steps that decide it.",
      drills: ["First Three Steps Drill", "Standing Start Acceleration", "Wicket Sprint Drill", "A-Skip Drill"],
      content: [
        {
          title: "Pushing, Not Reaching",
          body:
            "Acceleration is pushing the ground away behind you. The foot lands under or slightly behind the hips, and the leg drives back and down, so that each step throws the body forward. The body stays low and angled, and the angle comes up gradually as speed builds.\n\nThe fault is reaching: the foot lands out in front of the body, which brakes the body with every step. Reaching feels like a longer stride and is a slower one. Every reach is a small stop.\n\nThe First Three Steps Drill is exactly that: three steps out of a start, filmed or watched, with one question. Did each foot land under the hips or in front of them?",
        },
        {
          title: "The Drive Phase",
          body:
            "The first ten to fifteen meters out of a start are the drive phase, and the body in it looks nothing like the body at top speed. The angle is low, the head is in line with the spine looking at the track a few meters ahead, the arms are driving in big ranges, and the steps are powerful pushes that get longer with each one.\n\nStay low longer than feels natural. Sprinters stand up too early because upright feels like running and low feels like falling, and standing up early is the most common acceleration fault at this level.\n\nThe Standing Start Acceleration drill is run to a cone at fifteen meters with the one instruction to keep driving until the cone. The body will want to rise at eight. Hold it.",
        },
        {
          title: "Rising Into Speed",
          body:
            "Somewhere around twenty to thirty meters the body is nearly upright and the stride has changed: the foot strike has moved from behind the hips to under them, the knee lift is higher, the ground contact is shorter, and the arms have shortened their range.\n\nThe transition should be smooth, the angle rising a little with every step rather than popping up at once. The Wicket Sprint Drill, small hurdles spaced so that each stride lands between them, forces the stride to lengthen gradually and the body to rise with it. If a wicket gets clipped, the stride jumped instead of growing.\n\nThe A-Skip belongs here too, because the stride the body is rising into is the one the A-Skip rehearses.",
        },
        {
          title: "Relaxation Under Effort",
          body:
            "Acceleration is maximum effort, and maximum effort tempts the body to tense: the jaw clenches, the shoulders rise, the fists close. Every one of those slows you.\n\nThe cue is effort without tension. Drive the legs and the arms as hard as you can and keep the face, the neck and the hands loose. It sounds contradictory and it is trainable: run the acceleration drills at ninety percent with a soft face until the looseness is a habit, then bring the effort up and keep the looseness.\n\nFilm it. A tense face in the drive phase is as visible as a reaching foot, and it is as costly.",
        },
        keyPoints([
          "Acceleration is pushing: the foot lands under the hips and drives back. Reaching in front is a brake.",
          "The drive phase is low, head in line with the spine, big arm ranges, longer steps. Stay low longer than feels natural.",
          "Rise gradually into top speed, the angle climbing a little every step. Wickets make the stride grow instead of jump.",
          "Effort without tension: hard legs and arms, loose face, neck and hands.",
        ]),
      ],
      flashcards: [
        { front: "Where does the foot land in acceleration?", back: "Under or slightly behind the hips, driving back and down." },
        { front: "What is reaching?", back: "The foot landing out in front of the body. It feels like a longer stride and is a slower one." },
        { front: "The most common acceleration fault at this level", back: "Standing up too early. Low feels like falling; hold it." },
        { front: "What changes as you rise into top speed?", back: "Foot strike moves under the hips, knee lift rises, ground contact shortens, arm range shortens." },
        { front: "What does a clipped wicket mean?", back: "The stride jumped instead of growing gradually." },
        { front: "Effort without tension", back: "Drive the legs and arms hard; keep the face, neck and hands loose." },
      ],
      quizQuestions: [
        {
          questionText: "Why is reaching slower even though the stride looks longer?",
          answers: [
            { answerText: "A foot landing in front of the body brakes it with every step.", isCorrect: true, explanation: "Every reach is a small stop." },
            { answerText: "Because long strides are against the rules.", isCorrect: false, explanation: "No." },
            { answerText: "It is not slower; longer is always faster.", isCorrect: false, explanation: "The chapter says the opposite." },
            { answerText: "Because the arms cannot keep up.", isCorrect: false, explanation: "The brake is the foot in front, not the arms." },
          ],
        },
        {
          questionText: "Match the phase with how the body looks.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Drive phase", right: "Low angle, head in line with spine, big arm ranges" },
              { left: "Rising into speed", right: "Nearly upright, higher knees, shorter contacts" },
            ],
            explanation: "The transition between them is gradual, never a pop up." },
        },
        {
          questionText: "The most common acceleration fault at this level is standing up too ___.",
          questionType: "fill_blank",
          payload: { accepted: ["early", "soon", "quickly", "fast"], explanation: "Upright feels like running and low feels like falling." },
        },
        {
          questionText: "What does the Wicket Sprint Drill force?",
          answers: [
            { answerText: "The stride to lengthen gradually and the body to rise with it.", isCorrect: true, explanation: "A clipped wicket means the stride jumped." },
            { answerText: "A shorter stride.", isCorrect: false, explanation: "The strides grow between the wickets." },
            { answerText: "Jumping higher.", isCorrect: false, explanation: "The wickets are small; the drill is about stride, not height." },
            { answerText: "Running slower.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "How does the chapter say to train relaxation under effort?",
          answers: [
            { answerText: "Run the drills at ninety percent with a soft face until looseness is a habit, then bring the effort up.", isCorrect: true, explanation: "Hard legs and arms, loose face, neck and hands." },
            { answerText: "Run at full effort and clench harder.", isCorrect: false, explanation: "Tension slows you." },
            { answerText: "Do not drive the arms.", isCorrect: false, explanation: "The arms drive hard; the hands stay loose." },
            { answerText: "Relaxation cannot be trained.", isCorrect: false, explanation: "The chapter says it can." },
          ],
        },
      ],
    },
    {
      title: "Top Speed",
      description:
        "Top speed is the part of the race that looks effortless and is not. This chapter covers the upright stride, the foot strike, the front-side mechanics that fast runners share, and how little of a race is actually spent here.",
      drills: ["Max Velocity Mechanics", "Wicket Sprint Drill", "High Knee Drill", "Butt Kick Drill"],
      content: [
        {
          title: "The Upright Stride",
          body:
            "At top speed the body is tall, the posture from Chapter 1 exactly: head level, chest up, hips high under the shoulders, a slight forward lean of the whole body. The arms swing cheek to hip. The knee comes up high in front, the foot comes down under the hips, and the ground contact is short and quick.\n\nThe Max Velocity Mechanics drill is runs at full speed over thirty to forty meters with a flying start, so that all the attention is on the stride and none on the acceleration. One cue per run: tall hips, or quick feet, or loose hands. Never all three.\n\nThere is no pushing harder here. Top speed is as fast as the legs cycle, and forcing it tenses the body and slows the cycle.",
        },
        {
          title: "Front Side, Not Back Side",
          body:
            "Watch a fast runner from the side and the action is in front of the body: the knee high, the foot cycling up under the hip and striking down. Watch a slow one and the action is behind: the heel kicking up toward the backside, the leg trailing.\n\nFront-side mechanics are what the High Knee Drill and the A-Skip rehearse. The Butt Kick Drill is included for the opposite reason, as a fast heel recovery that brings the foot up under the hip quickly, not as a target: a heel that swings out behind the body is a leg that takes longer to come round.\n\nThe cue is step over the knee: the foot of the swinging leg passes over the opposite knee on its way forward, which keeps the recovery tight and the action in front.",
        },
        {
          title: "The Foot Strike",
          body:
            "At top speed the foot lands on the ball of the foot, under the hips, with the ankle stiff, and leaves the ground almost immediately. The ankle acts like a spring: stiff enough to return the energy of the landing, not so stiff that it cannot absorb it.\n\nTwo faults. Landing on the heel, which happens when the foot reaches in front, and which is a brake. And a soft, collapsing ankle, which lets the heel drop to the track and keeps the foot on the ground too long.\n\nThe wicket drill shows the foot strike better than any other: the wickets force the foot to land under the body, and the sound of the strikes tells you whether the ankle is stiff. Quick, sharp contacts are right; slapping is the ankle collapsing.",
        },
        {
          title: "How Long Top Speed Lasts",
          body:
            "Here is the thing most sprinters do not know. In a 100 meters, a well-trained sprinter reaches top speed somewhere between fifty and seventy meters and holds it for a short stretch, maybe ten to twenty meters, before it begins to fade. The rest of the race is getting there and holding on.\n\nThat changes how you train. Acceleration gets you to top speed sooner, which gives you more of the race at your best; speed endurance, in the next chapter, is what keeps the fade small. Top speed itself is the smallest part of the race and the hardest to move.\n\nSo the Max Velocity drill is run in small doses, fully rested, a few runs a session. Top speed is practiced fresh or it is not practiced at all; a tired top-speed run teaches a slower stride.",
        },
        keyPoints([
          "Top speed is the Chapter 1 posture at full stride: tall, knee high, foot under the hips, short contacts. One cue per run.",
          "Front-side mechanics: the action in front of the body. Step over the knee.",
          "The foot strikes on the ball, under the hips, ankle stiff like a spring. Slapping is a collapsing ankle.",
          "Top speed is a short stretch of the race. Practice it fresh, in small doses, or not at all.",
        ]),
      ],
      flashcards: [
        { front: "How many cues per top-speed run?", back: "One. Tall hips, or quick feet, or loose hands. Never all three." },
        { front: "Front-side versus back-side mechanics", back: "Front: knee high, foot cycling under the hip. Back: heel kicking out behind, leg trailing." },
        { front: "The cue for a tight recovery", back: "Step over the knee: the swinging foot passes over the opposite knee." },
        { front: "The foot strike at top speed", back: "Ball of the foot, under the hips, ankle stiff, off the ground almost immediately." },
        { front: "What does a slapping sound mean?", back: "The ankle is collapsing and the foot is on the ground too long." },
        { front: "How long does top speed last in a 100?", back: "A short stretch, roughly ten to twenty meters, reached somewhere past fifty." },
      ],
      quizQuestions: [
        {
          questionText: "Why does the chapter say never to force top speed?",
          answers: [
            { answerText: "Top speed is as fast as the legs cycle, and forcing tenses the body and slows the cycle.", isCorrect: true, explanation: "There is no pushing harder here." },
            { answerText: "Because it is dangerous.", isCorrect: false, explanation: "Not the reason given." },
            { answerText: "Because the referee penalizes it.", isCorrect: false, explanation: "No." },
            { answerText: "It does not; force is good.", isCorrect: false, explanation: "The chapter says the opposite." },
          ],
        },
        {
          questionText: "The cue for keeping the leg recovery tight is step over the ___.",
          questionType: "fill_blank",
          payload: { accepted: ["knee", "opposite knee"], explanation: "The swinging foot passes over the opposite knee on its way forward." },
        },
        {
          questionText: "Match the foot-strike fault with its cause.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Landing on the heel", right: "The foot reached in front of the body" },
              { left: "Slapping contact", right: "A soft, collapsing ankle" },
            ],
            explanation: "The ankle is a spring: stiff enough to return energy, not too stiff to absorb it.",
          },
        },
        {
          questionText: "Why is the Butt Kick Drill included in this chapter?",
          answers: [
            { answerText: "As a fast heel recovery under the hip, not as a target; a heel swinging out behind takes longer to come round.", isCorrect: true, explanation: "The action belongs in front of the body." },
            { answerText: "Because kicking the backside is the goal at top speed.", isCorrect: false, explanation: "That is back-side mechanics." },
            { answerText: "For conditioning.", isCorrect: false, explanation: "No." },
            { answerText: "By mistake.", isCorrect: false, explanation: "It is there on purpose." },
          ],
        },
        {
          questionText: "Why is top speed practiced in small doses, fully rested?",
          answers: [
            { answerText: "A tired top-speed run teaches a slower stride.", isCorrect: true, explanation: "Practiced fresh or not at all." },
            { answerText: "Because it is boring.", isCorrect: false, explanation: "No." },
            { answerText: "To save the track.", isCorrect: false, explanation: "No." },
            { answerText: "It should be practiced tired, to build endurance.", isCorrect: false, explanation: "Endurance is the next chapter and a different session." },
          ],
        },
      ],
    },
    {
      title: "Holding On: Speed Endurance",
      description:
        "Every sprint ends with a fade. This chapter is about making it small: what the fade is, how to train against it, running the end of a race, and slowing down safely.",
      drills: ["Change of Pace Running", "Max Velocity Mechanics", "Deceleration Mechanics", "A-Skip Drill"],
      content: [
        {
          title: "What the Fade Is",
          body:
            "Nobody speeds up at the end of a 100. The runner who looks like he is coming through the field is the one slowing down least. The fade is the stride shortening, the knees dropping, the shoulders rising and the arms tightening as the body runs out of the fuel it uses for top speed.\n\nThe fade cannot be removed. It can be delayed and it can be made smaller, and that is what speed endurance training does. The sprinter who holds form through the last twenty meters beats the sprinter who was faster at sixty and fell apart.\n\nThis is also where races are lost by trying. The body feels the fade, the mind says push, and pushing is tension, and tension speeds the fade. The answer at the end of a race is the opposite of effort.",
        },
        {
          title: "Training the Hold",
          body:
            "Speed endurance is trained by running at or near top speed for longer than top speed lasts, with full recovery between runs, so that the body learns to hold the stride as the fuel runs down.\n\nThe Change of Pace Running drill is the simplest version: runs of sixty to a hundred and twenty meters with sections at full speed and sections at a controlled float, so you practice the exact thing a race asks for, keeping the stride when the effort has to drop. The Max Velocity Mechanics runs can be extended to fifty or sixty meters for the same reason, but only a few, and only rested.\n\nThe rule is quality over volume. Six good runs with full rest teach the hold. Twelve tired runs teach the fade.",
        },
        {
          title: "Running the Last Twenty",
          body:
            "At the end of a race the cues change. Not drive, not push. Relax, tall, quick.\n\nRelax the face and the hands first, because they are where tension starts. Stay tall, because the first thing the fade takes is the hips. Keep the feet quick, because a shortening stride is survivable if the cadence holds and fatal if it drops too.\n\nRun through the line, not to it. A sprinter who leans or reaches at the line has slowed in the last two strides to do it; a sprinter who runs through the line at full stride and dips the chest only on the final step gives up nothing.",
        },
        {
          title: "Slowing Down",
          body:
            "After the line, the race is not over for the body. Stopping from full speed in a few strides is where hamstrings go, and the Deceleration Mechanics drill is the answer: a gradual slow-down over twenty to thirty meters, the stride lengthening and the body rising, no sudden braking, no sitting back.\n\nPractice it after every fast run, not just in races. The body that has rehearsed slowing down does it automatically when it is tired and the mind has gone.\n\nThe A-Skip closes the session as it opens it, slowly, as a cool-down and a reminder of the stride you are trying to keep.",
        },
        keyPoints([
          "Nobody speeds up at the end. The winner slows down least. The fade is delayed and shrunk, never removed.",
          "Train the hold with near-top-speed runs longer than top speed lasts, fully rested. Quality over volume.",
          "The last twenty: relax, tall, quick. Run through the line; dip only on the final step.",
          "Slow down over twenty to thirty meters, every fast run. Sudden stops are where hamstrings go.",
        ]),
      ],
      flashcards: [
        { front: "Does anybody speed up at the end of a 100?", back: "No. The runner coming through the field is slowing down least." },
        { front: "What does trying harder do to the fade?", back: "Speeds it. Pushing is tension and tension speeds the fade." },
        { front: "How is speed endurance trained?", back: "Runs at or near top speed for longer than top speed lasts, with full recovery between them." },
        { front: "Six good runs versus twelve tired runs", back: "Six teach the hold; twelve teach the fade." },
        { front: "The three cues for the last twenty meters", back: "Relax, tall, quick." },
        { front: "Why practice slowing down?", back: "Sudden stops from full speed are where hamstrings go." },
      ],
      quizQuestions: [
        {
          questionText: "The runner who looks like he is coming through the field at the end of a 100 is actually...",
          answers: [
            { answerText: "Slowing down less than everyone else.", isCorrect: true, explanation: "Nobody speeds up at the end." },
            { answerText: "Speeding up.", isCorrect: false, explanation: "Nobody speeds up at the end." },
            { answerText: "Starting late on purpose.", isCorrect: false, explanation: "No." },
            { answerText: "Cheating.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Put the last-twenty-meters cues in the chapter's order.",
          questionType: "ordering",
          payload: { items: ["Relax the face and hands", "Stay tall", "Keep the feet quick", "Run through the line and dip on the final step"], explanation: "Not drive, not push." },
        },
        {
          questionText: "The rule for speed endurance training is quality over ___.",
          questionType: "fill_blank",
          payload: { accepted: ["volume", "quantity", "reps"], explanation: "Six good runs with full rest teach the hold; twelve tired runs teach the fade." },
        },
        {
          questionText: "What happens when a sprinter leans or reaches for the line two strides early?",
          answers: [
            { answerText: "He has slowed in the last two strides to do it.", isCorrect: true, explanation: "Run through the line at full stride; dip only on the final step." },
            { answerText: "He gains a tenth of a second.", isCorrect: false, explanation: "He loses it." },
            { answerText: "Nothing changes.", isCorrect: false, explanation: "No." },
            { answerText: "He is disqualified.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Why practice deceleration after every fast run, not just in races?",
          answers: [
            { answerText: "A body that has rehearsed slowing down does it automatically when tired and the mind has gone.", isCorrect: true, explanation: "Gradual, over twenty to thirty meters, no sudden braking." },
            { answerText: "To add distance to the session.", isCorrect: false, explanation: "No." },
            { answerText: "Because coaches like to see it.", isCorrect: false, explanation: "No." },
            { answerText: "You should stop as fast as possible to save energy.", isCorrect: false, explanation: "That is where hamstrings go." },
          ],
        },
      ],
    },
    {
      title: "Racing",
      description:
        "Training makes a runner; racing makes a sprinter. This chapter covers the race plan, the warm-up, the mind in the blocks, reading your races, and the return to your baseline.",
      drills: ["Block Start Setup", "Reaction Time Starts", "Standing Start Acceleration", "40-Yard Dash"],
      content: [
        {
          title: "The Race Plan",
          body:
            "A 100 has four parts and you now know all of them: the start, acceleration, top speed, and the hold. A race plan is one cue for each, decided before the warm-up and never changed on the line.\n\nAn example: react to the sound; drive to the cone at thirty; tall and quick through seventy; relax to the line. Four thoughts, in order, each one handed off to the next. A sprinter with a plan has something to do at every point of the race. A sprinter without one has only the lane next to him to think about, and that lane is not going to help.\n\nWrite your plan down before the meet. Then run it in the warm-up, at half effort, so the cues are already in the legs when the race starts.",
        },
        {
          title: "The Warm-Up",
          body:
            "A sprint warm-up is long and specific. A jog to raise the temperature, dynamic stretching to open the hips and the hamstrings, the drills from this class done progressively (A-Skip, High Knee, Arm Swing, the Falling Start), then a few build-up runs that rise from easy to nearly full, and finally two or three starts from the blocks at race intensity.\n\nIt ends close to the race, not an hour before. A warm-up that finishes too early is a warm-up that has to be done again. Find out when your race is called and work backward.\n\nThe Block Start Setup and Reaction Time Starts drills are on this chapter's day for the warm-up's sake: a few starts at race intensity, with the setup checked, is the last thing before the call.",
        },
        {
          title: "The Mind in the Blocks",
          body:
            "In the blocks there is one thing to think about and it is the first cue of your plan. Not the result, not the competitor, not the time you need. The sound.\n\nNerves are normal and they are useful: they are the body getting ready. A sprinter who tries to be calm in the blocks is fighting himself; a sprinter who lets the nerves be there and attends to the sound is using them.\n\nAfter the gun, the cues hand off one to the next, and the race takes care of itself. Thinking about the result during the race is the one thing that is guaranteed to slow it down.",
        },
        {
          title: "Reading Your Races",
          body:
            "After a race, before the time, think about the four parts. Did the start react to the sound or anticipate it? Did the drive hold to the cone or stand up early? Was top speed tall and quick? Did the last twenty relax or push?\n\nThen the time, and the video if there is one. The time tells you how fast; the video tells you which part. Over a season, one part is usually the one holding you back, and that is the chapter to go back to.\n\nWrite the same four lines after every race. The pattern is worth more than any single time.",
        },
        {
          title: "Back to Your Baseline",
          body:
            "In Chapter 1 you ran a 40-Yard Dash, best of three, and filmed it. Run it again, the same way, same start, same clock, same video.\n\nCompare the time. Then compare the video, part by part: the first three steps under the hips, the drive held low, the rise gradual, the stride tall and in front, the arms cheek to hip, the face loose.\n\nIf the time moved, good. If the video shows a different runner, better, because a changed stride keeps paying after a single time has been beaten. You are not just fast now. You are fast on purpose, and you know which part to work on next.",
        },
        keyPoints([
          "A race plan is one cue for each of the four parts, decided before the warm-up and never changed on the line.",
          "The warm-up is long, specific and ends close to the race. Work backward from the call.",
          "In the blocks, one thought: the sound. Nerves are the body getting ready; use them.",
          "Read every race by its four parts before the time. The pattern says which chapter to revisit.",
          "Repeat the baseline. A changed stride keeps paying after a single time is beaten.",
        ]),
      ],
      flashcards: [
        { front: "What is a race plan?", back: "One cue for each of the four parts: start, acceleration, top speed, the hold. Decided before the warm-up." },
        { front: "When should the warm-up end?", back: "Close to the race, not an hour before. Work backward from the call." },
        { front: "The one thought in the blocks", back: "The sound. Not the result, not the competitor, not the time." },
        { front: "What are nerves in the blocks?", back: "The body getting ready. Let them be there and attend to the sound." },
        { front: "What slows a race down for certain?", back: "Thinking about the result during it." },
        { front: "How to read a race", back: "The four parts first, then the time, then the video. The pattern over a season tells you the chapter to revisit." },
      ],
      quizQuestions: [
        {
          questionText: "Match each part of the race with its example cue from the chapter.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Start", right: "React to the sound" },
              { left: "Acceleration", right: "Drive to the cone at thirty" },
              { left: "Top speed", right: "Tall and quick through seventy" },
              { left: "The hold", right: "Relax to the line" },
            ],
            explanation: "Four thoughts, in order, each handed off to the next.",
          },
        },
        {
          questionText: "Put the sprint warm-up in order.",
          questionType: "ordering",
          payload: { items: ["Jog to raise the temperature", "Dynamic stretching", "The drills, progressively", "Build-up runs from easy to nearly full", "Two or three starts at race intensity"], explanation: "It ends close to the race." },
        },
        {
          questionText: "In the blocks, the one thing to think about is the ___.",
          questionType: "fill_blank",
          payload: { accepted: ["sound", "gun", "first cue", "signal"], explanation: "Not the result, not the competitor, not the time you need." },
        },
        {
          questionText: "What does the chapter say about nerves before a race?",
          answers: [
            { answerText: "They are the body getting ready; let them be there and attend to the sound.", isCorrect: true, explanation: "Fighting to be calm is fighting yourself." },
            { answerText: "They must be eliminated before the race.", isCorrect: false, explanation: "That is fighting yourself." },
            { answerText: "They mean you are not ready.", isCorrect: false, explanation: "They mean the opposite." },
            { answerText: "Only beginners get them.", isCorrect: false, explanation: "No." },
          ],
        },
        {
          questionText: "Why does the chapter say a changed stride is better than a faster time?",
          answers: [
            { answerText: "A changed stride keeps paying after a single time has been beaten.", isCorrect: true, explanation: "Fast on purpose, and knowing which part to work on next." },
            { answerText: "Because times do not matter in track.", isCorrect: false, explanation: "They matter; the stride is what moves them." },
            { answerText: "Because the video is more fun.", isCorrect: false, explanation: "No." },
            { answerText: "It does not; only the time matters.", isCorrect: false, explanation: "The chapter says the stride is the thing to check." },
          ],
        },
      ],
    },
  ],
};
