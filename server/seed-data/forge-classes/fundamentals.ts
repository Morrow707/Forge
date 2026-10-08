import { keyPoints, type ForgeClassContent } from "./types";

/** Fundamentals for Every Athlete (2026-10-04). Six chapters that every athlete on Forge,
 * whatever the sport, is meant to read first: warming up, sleep, fuel, lifting safely, what
 * the camera's numbers mean and do not, and reading your own progress. Written for a middle
 * schooler and useful to a senior. The camera chapter says exactly what the app's own caveat
 * says (shared/camera-accuracy-copy.ts): the video is fine, the numbers are being calibrated,
 * and no training decision rests on them. It never tells the athlete where to stand (Rule #1).
 * Drill days use the general agility, sprint and start drills from the skill library. */
export const FUNDAMENTALS_CLASS: ForgeClassContent = {
  name: "Fundamentals for Every Athlete",
  description:
    "The six things every athlete should know before the sport-specific work: how to warm up, why sleep is training, how to eat for practice, how to lift without getting hurt, what Forge's camera numbers mean, and how to read your own progress.",
  category: "Fundamentals",
  readingLevel: "middle_school",
  chapters: [
    {
      title: "Warming Up: Why, What and How Long",
      description:
        "A warm-up is not a formality before the real work. It is how a body gets ready to move fast and lift hard without getting hurt. This chapter explains what it does and gives you one you can run in ten minutes.",
      drills: ["A-Skip Drill", "High Knee Drill", "Butt Kick Drill", "Lateral Shuffle Footwork"],
      content: [
        {
          title: "What a Warm-Up Does",
          body:
            "A cold muscle is stiff and slow, and a cold brain is not ready to react. A warm-up fixes both. Ten minutes of the right movement raises your body temperature, gets blood moving into the muscles you are about to use, and wakes up the nerves that tell those muscles when to fire.\n\nThere is a second job that athletes forget. A warm-up is a rehearsal. Sprinting, jumping, cutting and lifting all use patterns your body has to find each day, and a warm-up finds them while nothing is at stake. The first full-speed sprint of practice should not be the first time your legs have moved fast that day.\n\nThe athletes who skip warm-ups are usually the ones who think they are already loose. Being young helps, but it is not a warm-up. The muscle strains that take weeks to heal mostly happen in the first few minutes of hard work, to people who were not ready for it.",
        },
        {
          title: "The Three Parts",
          body:
            "A good warm-up has three parts, and the order matters.\n\nFirst, raise the temperature. Two or three minutes of easy movement: a jog, a skip, a bike, jumping jacks. You should be breathing a little harder and feeling warmer, not tired.\n\nSecond, move the joints through their range. This is where dynamic stretches go: leg swings, walking lunges, arm circles, hip openers. Each one takes a joint to the end of where it moves and back again, several times. This is different from holding a stretch still, which belongs after training, not before it.\n\nThird, rehearse the work. Build toward the speed and the pattern of what is coming. Before sprinting, that is skips, high knees and a few runs at seventy percent. Before lifting, it is the first exercise with an empty bar and then a light weight. Before a game, it is the sport's own movements at rising speed.\n\nTen to fifteen minutes covers all three. Longer than that and you are spending energy you want for the session.",
        },
        {
          title: "Still Stretching Comes After",
          body:
            "For a long time every team sat in a circle and held stretches for thirty seconds before practice. The research caught up: holding a stretch still before explosive work makes the muscle a little weaker and slower for the next while, which is the opposite of what you want before a sprint or a jump.\n\nStill stretching is not bad. It is useful after training, when the goal is to relax and keep your range of motion, and it is useful on its own for an athlete who is genuinely tight somewhere. It just belongs at the end of the session, not the start.\n\nBefore training, keep everything moving. A leg swing takes the hamstring through the same range as a held stretch, but it does it while the muscle is working, which keeps it ready instead of switching it off.\n\nIf a coach you trust runs it differently, do it their way and ask them about it afterward. The point of this page is that you know the reason, not that you argue in the warm-up line.",
        },
        {
          title: "Your Ten-Minute Warm-Up",
          body:
            "Here is one you can run anywhere with no equipment. It is the drill day for this chapter, so you will do it on the calendar before you move on.\n\nMinutes one to three: an easy jog or a brisk walk, then twenty jumping jacks. Minutes three to six: ten leg swings each leg front to back, ten each side to side, ten walking lunges, ten arm circles each way, a slow bodyweight squat held for a breath at the bottom, five times. Minutes six to ten: twenty meters of A-skips, twenty of high knees, twenty of butt kicks, a lateral shuffle each way, then two runs of about thirty meters at seventy percent and one at ninety.\n\nAfter that you are ready for anything the session asks. If the session is lifting instead of running, swap the last part for the first lift with an empty bar.\n\nDo this before every session until it is automatic. The day you stop needing to think about it is the day it is working.",
        },
        keyPoints([
          "A warm-up raises temperature, moves the joints and rehearses the work, in that order.",
          "Ten to fifteen minutes is enough; longer spends energy you want for training.",
          "Keep everything moving before training. Held stretches belong after.",
          "The first full-speed effort of the day should never be the first fast movement of the day.",
          "Run the ten-minute warm-up before every session until it is automatic.",
        ]),
      ],
      flashcards: [
        { front: "What are the three parts of a warm-up?", back: "Raise the temperature, move the joints through their range, rehearse the work." },
        { front: "How long should a warm-up take?", back: "Ten to fifteen minutes." },
        { front: "When does still (held) stretching belong?", back: "After training, not before. Before training, keep everything moving." },
        { front: "What does a leg swing do that a held stretch doesn't?", back: "Takes the muscle through its range while it is working, so it stays ready." },
        { front: "When do most muscle strains happen?", back: "In the first few minutes of hard work, to athletes who were not warm." },
        { front: "What goes in the 'rehearse' part before sprinting?", back: "Skips, high knees, and runs building toward full speed." },
      ],
      quizQuestions: [
        {
          questionText: "Put the three parts of a warm-up in order.",
          questionType: "ordering",
          payload: { items: ["Raise the temperature", "Move the joints through their range", "Rehearse the work"], explanation: "Warm first, then range, then build toward the real speed and pattern." },
        },
        {
          questionText: "Held stretches belong ___ training.",
          questionType: "fill_blank",
          payload: { accepted: ["after"], explanation: "Holding a stretch before explosive work makes the muscle a little weaker and slower for a while." },
        },
        {
          questionText: "About how long should a warm-up take?",
          answers: [
            { answerText: "Ten to fifteen minutes", isCorrect: true, explanation: "Enough for all three parts, without spending the session's energy." },
            { answerText: "Two minutes", isCorrect: false, explanation: "Too short to raise temperature and rehearse the work." },
            { answerText: "Forty-five minutes", isCorrect: false, explanation: "That is a workout, and it uses energy you want for the session." },
            { answerText: "None if you are young", isCorrect: false, explanation: "Being young is not a warm-up." },
          ],
        },
        {
          questionText: "Match each movement to the part of the warm-up it belongs in.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Easy jog", right: "Raise the temperature" },
              { left: "Leg swings", right: "Move the joints" },
              { left: "Runs at seventy percent", right: "Rehearse the work" },
            ],
            explanation: "Temperature first, range second, rehearsal last.",
          },
        },
      ],
    },
    {
      title: "Sleep Is Training",
      description:
        "Muscles do not grow during the workout. They grow while you sleep. This chapter explains why sleep is the most important recovery tool you have, and how to get more of it on a school schedule.",
      drills: ["Single-Leg Balance and Stability", "Lateral Shuffle Footwork", "A-Skip Drill"],
      content: [
        {
          title: "Where the Gains Actually Happen",
          body:
            "A hard session does not make you stronger. It makes you tired and a little damaged, on purpose. The getting stronger part happens afterward, when the body repairs what the session broke down and builds it back a bit better than before.\n\nMost of that repair happens during sleep. Deep sleep is when the body releases the hormones that rebuild muscle and bone, and when the brain files away what you practiced, so a skill you drilled on Tuesday is more yours on Wednesday. Cut the sleep and you cut the repair, which means the session was partly wasted.\n\nThis is why coaches who seem obsessed with sleep are not being dramatic. An athlete sleeping six hours and training hard is doing the breaking-down half of training and skipping the building-up half. It shows up as flat practices, nagging soreness, getting sick more often, and a plateau that no extra work can push through.",
        },
        {
          title: "How Much, and What Counts",
          body:
            "Teenagers need more sleep than adults, not less: eight to ten hours a night is the range the research points to, and athletes in a hard training block sit at the top of it. Nine hours is a reasonable target. Most students get seven or fewer.\n\nQuality matters alongside quantity. Sleep that is broken up by a phone buzzing or a late-night scroll is less useful than the same hours taken in one stretch. The deepest, most restorative sleep comes in the first half of the night, so going to bed late and sleeping in does not fully make up for it.\n\nA nap helps when the night was short. Twenty to thirty minutes in the afternoon, not longer, and not after about four o'clock, or it steals from that night. Longer naps leave you groggy and make falling asleep later harder.\n\nWeekend catch-up sleep is better than nothing, but a body prefers a steady rhythm. Going to bed at the same time within an hour, every night, does more than one long Saturday.",
        },
        {
          title: "The Hour Before Bed",
          body:
            "Falling asleep is a skill, and the hour before bed decides it. Three things get in the way most often, and all three are fixable.\n\nScreens. The light from a phone or a laptop tells your brain it is still daytime, and the content keeps it running. The fix is boring and it works: the phone charges somewhere that is not your bed, and the last thirty minutes are a book, music, or nothing.\n\nCaffeine. Energy drinks, soda and coffee in the afternoon are still in your system at bedtime. If you use caffeine at all, keep it to the morning. Energy drinks around training are a bad idea for a lot of reasons, and sleep is one of them.\n\nA racing mind. Homework that is not done, a game tomorrow, something somebody said. Write it down. A list on paper of what you will do about it in the morning lets the brain put it down for the night.\n\nA cool, dark, quiet room finishes the job. If you share a room, an eye mask and earplugs are cheap and they work.",
        },
        {
          title: "Recovery Beyond Sleep",
          body:
            "Sleep is the big one, but a few other things help the body repair, and some popular ones do not do much.\n\nEasy movement on a rest day beats lying still. A walk, a bike ride, a light session of the balance and footwork drills in this chapter keep blood moving through sore muscles without adding more damage. That is why this chapter's drill day is deliberately light.\n\nFood right after training matters, and the next chapter covers it. Water matters all day, not just at practice.\n\nIce baths, foam rollers and massage guns feel good, and feeling good has some value, but the evidence that they speed recovery is thin. They do not replace sleep or food. If you enjoy them, use them after the important things are done, not instead of them.\n\nThe simplest way to know your recovery is working: you wake up feeling ready more mornings than not, your lifts and times keep moving, and you are not sick every month. When those slip, look at sleep first.",
        },
        keyPoints([
          "Training breaks the body down; sleep is when it builds back stronger.",
          "Teenage athletes need eight to ten hours. Nine is a good target.",
          "Phone out of the bed, caffeine only in the morning, worries written down.",
          "A twenty- to thirty-minute nap before four o'clock helps a short night.",
          "Easy movement on a rest day beats lying still. Gadgets do not replace sleep.",
        ]),
      ],
      flashcards: [
        { front: "When does a muscle actually get stronger?", back: "After the session, during repair, mostly while you sleep." },
        { front: "How many hours should a teenage athlete sleep?", back: "Eight to ten. Nine is a good target." },
        { front: "What are the three things that most often get in the way of falling asleep?", back: "Screens, caffeine, and a racing mind." },
        { front: "What are the rules for a nap?", back: "Twenty to thirty minutes, before about four o'clock." },
        { front: "What should a rest day look like?", back: "Easy movement, not lying still. A walk, a bike, light footwork." },
        { front: "What do ice baths and massage guns replace?", back: "Nothing. They are extras after sleep and food, not instead of them." },
      ],
      quizQuestions: [
        {
          questionText: "Teenage athletes should aim for about ___ hours of sleep a night.",
          questionType: "fill_blank",
          payload: { accepted: ["nine", "9", "eight to ten", "8 to 10", "8-10"], explanation: "The research range is eight to ten; nine is a good target in a hard block." },
        },
        {
          questionText: "Which of these does the most for recovery?",
          answers: [
            { answerText: "Sleep", isCorrect: true, explanation: "Most repair and skill learning happens during sleep." },
            { answerText: "An ice bath", isCorrect: false, explanation: "Feels good; the evidence that it speeds recovery is thin." },
            { answerText: "A massage gun", isCorrect: false, explanation: "An extra, after sleep and food." },
            { answerText: "Lying still all day", isCorrect: false, explanation: "Easy movement beats lying still on a rest day." },
          ],
        },
        {
          questionText: "Match the problem to its fix.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Phone in bed", right: "Charge it somewhere else" },
              { left: "Afternoon energy drink", right: "Caffeine only in the morning" },
              { left: "Racing mind", right: "Write it down" },
            ],
            explanation: "Each of the three sleep thieves has a boring fix that works.",
          },
        },
        {
          questionText: "A nap is most useful when it is:",
          answers: [
            { answerText: "Twenty to thirty minutes, before about four o'clock", isCorrect: true, explanation: "Short and early, so it does not steal from that night." },
            { answerText: "Two hours after dinner", isCorrect: false, explanation: "Late and long naps make falling asleep harder." },
            { answerText: "As long as possible", isCorrect: false, explanation: "Long naps leave you groggy and cost you that night." },
            { answerText: "Skipped; naps are for little kids", isCorrect: false, explanation: "A short nap is a real recovery tool after a short night." },
          ],
        },
      ],
    },
    {
      title: "Fuel: Eating for Practice",
      description:
        "Food is what training is made of. This chapter is not a diet. It is how to eat enough, at the right times, so you have energy for practice and material to rebuild with afterward.",
      drills: ["Change of Pace Running", "Standing Start Acceleration", "5-10-5 Pro Agility Footwork"],
      content: [
        {
          title: "Enough Comes First",
          body:
            "The biggest food problem for young athletes is not what they eat. It is that they do not eat enough. A growing body plus a training schedule needs more food than most people guess, and an athlete who is under-fueled gets tired early, stops improving, gets hurt more, and in some cases stops growing the way they should.\n\nSigns you are not eating enough: you are hungry all the time or, strangely, never hungry; you are tired in class after a normal night's sleep; your training has stalled; you get sick a lot; you are losing weight without trying. If several of those are true, the answer is more food, not a harder session.\n\nBreakfast is the meal athletes skip most, and it is the one that sets up the day. Something with protein and carbohydrate, even if it is small and fast: eggs and toast, yogurt and fruit, a sandwich on the way out the door. Skipping it means arriving at afternoon practice already behind.",
        },
        {
          title: "Carbs, Protein, and Why Both",
          body:
            "Carbohydrates are the fuel for hard work. Bread, rice, pasta, potatoes, oats, fruit, milk. When you sprint, jump or lift, your muscles are burning carbohydrate, and a body with its stores topped up can go harder for longer. Athletes who cut carbs to look a certain way are cutting the fuel for their own sport.\n\nProtein is the building material. Meat, fish, eggs, dairy, beans, nuts. Training breaks muscle down; protein is what rebuilds it. A serving the size of your palm at each meal, and something with protein in the hour after training, covers most athletes without any powder.\n\nFat is not the enemy either. Nuts, avocado, olive oil, the fat in dairy and meat, all carry vitamins and keep hormones working. A very low-fat diet is a problem for a growing athlete, especially a girl.\n\nThe simplest plate: half of it carbohydrate, a quarter protein, a quarter vegetables or fruit, with a little fat somewhere in there. On a hard training day, more of the first part.",
        },
        {
          title: "Around Training",
          body:
            "Timing is simpler than the internet makes it sound.\n\nTwo to three hours before practice, a real meal. One hour before, if you are hungry, something small and mostly carbohydrate: a banana, a granola bar, crackers, a piece of toast. Eating a big meal right before practice makes you sluggish; eating nothing makes you flat by the second half.\n\nDuring a session under about ninety minutes, water is all you need. In a long, hot session or a tournament day, a sports drink or something with sugar and salt helps keep you going.\n\nWithin an hour after training, eat. This is the window when the body is most ready to rebuild, and it needs both carbohydrate to refill the tank and protein to repair. Chocolate milk is a famous answer because it is both, and cheap. A sandwich, a bowl of cereal, or dinner itself works just as well.\n\nWater all day. By the time you feel thirsty you are already a little behind. Pale yellow is the color you are aiming for.",
        },
        {
          title: "What Not to Fall For",
          body:
            "Supplements are sold hard to teenage athletes, and almost none of them do anything that food does not do better. Protein powder is just food in a tub; it is not magic and most athletes eating three meals do not need it. Pre-workouts and energy drinks are stimulants, and stimulants in a growing body around training are a bad idea. Anything that promises fast muscle or fast fat loss is where contaminated and banned substances show up most, and a positive test ends seasons.\n\nThe rule on Forge, and in every sensible program, is simple: no supplement for an athlete under eighteen without a doctor and a parent in the conversation. A coach who tells you otherwise is wrong.\n\nCutting weight to make a class, in wrestling or any sport, is a conversation with a coach and a parent, never something to figure out alone from the internet. Done badly, it costs strength, bone, and sometimes health.\n\nAnd the quiet one: if you ever find yourself afraid of food, hiding what you eat, or unable to stop thinking about your body, tell an adult you trust. It is common in sport, it is treatable, and it is not a weakness.",
        },
        keyPoints([
          "Most young athletes' food problem is not eating enough. Breakfast is the meal that sets up the day.",
          "Carbohydrate is fuel, protein is building material, fat is not the enemy.",
          "A real meal two to three hours before, something small an hour before, and food within an hour after.",
          "Water all day; a sports drink only for long, hot sessions.",
          "No supplement under eighteen without a doctor and a parent. Food does the job.",
        ]),
      ],
      flashcards: [
        { front: "What is the most common food problem for young athletes?", back: "Not eating enough." },
        { front: "What is carbohydrate for?", back: "Fuel for hard work: sprinting, jumping, lifting." },
        { front: "What is protein for?", back: "Rebuilding the muscle that training broke down." },
        { front: "When should you eat after training?", back: "Within an hour, with both carbohydrate and protein." },
        { front: "What color should your urine be if you are drinking enough?", back: "Pale yellow." },
        { front: "What is the rule on supplements under eighteen?", back: "None without a doctor and a parent in the conversation." },
      ],
      quizQuestions: [
        {
          questionText: "Match the food group to its job.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Carbohydrate", right: "Fuel for hard work" },
              { left: "Protein", right: "Building material" },
              { left: "Fat", right: "Carries vitamins and keeps hormones working" },
            ],
            explanation: "All three have a job; cutting any one of them costs a growing athlete.",
          },
        },
        {
          questionText: "Put the day's eating around an afternoon practice in order.",
          questionType: "ordering",
          payload: { items: ["Breakfast", "A real meal two to three hours before", "Something small an hour before", "Water during", "Food within an hour after"], explanation: "Fuel before, water during, rebuild after." },
        },
        {
          questionText: "After training, you should eat within about one ___.",
          questionType: "fill_blank",
          payload: { accepted: ["hour"], explanation: "The hour after training is when the body is most ready to refill and rebuild." },
        },
        {
          questionText: "A seventeen-year-old wants to start a pre-workout powder. What does this class say?",
          answers: [
            { answerText: "Not without a doctor and a parent in the conversation", isCorrect: true, explanation: "No supplement under eighteen without both. Pre-workouts are stimulants and a contamination risk." },
            { answerText: "Fine if a teammate uses it", isCorrect: false, explanation: "A teammate is not a doctor." },
            { answerText: "Fine if it is from a big brand", isCorrect: false, explanation: "Brand size does not change the rule or the risk." },
            { answerText: "Only on game days", isCorrect: false, explanation: "A stimulant on game day is the worst version of the idea." },
          ],
        },
      ],
    },
    {
      title: "Lifting Without Getting Hurt",
      description:
        "Strength training is one of the best things a young athlete can do, and it is safe when it is done right. This chapter covers the rules that keep it that way: technique before weight, the lifts that need a spotter, and when to stop.",
      drills: ["Deceleration and Stick Landing", "Single-Leg Balance and Stability", "Box Drill Agility"],
      content: [
        {
          title: "Is Lifting Safe for Young Athletes?",
          body:
            "Yes, and the old worry that it stunts growth was never supported by the research. Supervised strength training in teenagers makes them stronger, protects their joints, strengthens bone, and lowers their injury rate in their sport. Every major sports medicine body agrees.\n\nThe word doing the work in that sentence is supervised. The injuries that do happen in weight rooms are almost all from one of three things: lifting a weight you have not earned, lifting with bad technique, or messing around. All three are choices, and all three are preventable.\n\nSo the question is not whether to lift. It is how. Start with your bodyweight and an empty bar, learn the movements until they are the same every rep, and add weight slowly. An athlete who spends a month getting the squat right with light weight is ahead of the one who loaded the bar on day one, and will still be lifting when the other one is in a boot.",
        },
        {
          title: "Technique Before Weight, Every Time",
          body:
            "The rule that keeps you safe is simple to say and hard to live by: the weight goes up only when the technique is right. Not mostly right. Right.\n\nFor a squat that means the heels stay down, the knees track over the toes, the chest stays up and the back stays flat through the whole rep. For a deadlift it means a flat back from start to finish, the bar close to the legs, and the hips and shoulders rising together. For a press it means the bar moves in a straight line and the lower back does not arch to help. Your coach will give you the cues; the drills in this chapter, landing and balancing on one leg, are where the control comes from.\n\nFilm yourself. Forge's camera keeps the video of every set, and watching your own squat from the outside teaches you more than any description. Compare it to how your coach showed you, and fix one thing at a time.\n\nIf a rep looks different from the last one because the weight is heavy, the weight is too heavy. Take some off. Nobody good is impressed by a bad rep with a big number on it.",
        },
        {
          title: "Spotters, Collars and Racks",
          body:
            "Some lifts can trap you under a bar. The bench press and the back squat are the two, and they have rules that are not optional.\n\nA bench press always has a spotter, a person standing at your head ready to help the bar up. Never bench alone, never bench with the collars off if you have no spotter, and tell your spotter how many reps you are going for before you start. A squat uses a rack with the safety bars set just below the bottom of your rep, so a missed lift lands on the rack and not on you.\n\nCollars on every bar, every set. A plate sliding off one end tips the bar and sends the other plates after it.\n\nKnow how to bail. In a squat, if the rep is not coming up, you push the bar back onto the safeties or step forward and let it go behind you. Practice this with an empty bar so it is automatic. In a bench, you say so and the spotter takes it; you do not try to be a hero.\n\nAnd the plain one: no fooling around in a room full of heavy things. Your coach will send you out, and they are right to.",
        },
        {
          title: "Pain, Soreness and When to Stop",
          body:
            "Soreness and pain are different, and learning the difference is part of becoming an athlete.\n\nSoreness is the dull, both-sides ache that shows up a day or two after a hard session, especially a new one. It is normal, it fades in a few days, and easy movement helps it. Pain is sharp, or on one side only, or in a joint rather than a muscle, or it changes how you move. Pain is a reason to stop and tell somebody.\n\nNever train through pain to look tough. An injury you keep training on takes far longer to heal than one you rest for a week. Tell your coach the same day; a coach would always rather hear about it early.\n\nThe weight room has other stop signs. Dizziness or feeling faint: stop, sit, drink, tell someone. Feeling off in a way you cannot explain: stop. A piece of equipment that looks wrong, a bent bar, a frayed cable, a cracked bench: do not use it, tell the coach.\n\nEvery session, every athlete, every weight: these rules do not relax when you get stronger. The strongest lifters you will ever meet are the most careful ones, which is why they are still lifting.",
        },
        keyPoints([
          "Supervised strength training is safe for young athletes and lowers injury in their sport.",
          "Weight goes up only when technique is right. A bad rep means the weight is too heavy.",
          "Bench with a spotter, squat in a rack with safeties set, collars on every bar.",
          "Know how to bail; practice it with an empty bar.",
          "Soreness is normal and fades. Pain is sharp or one-sided: stop and tell your coach the same day.",
        ]),
      ],
      flashcards: [
        { front: "Does lifting stunt growth?", back: "No. The research never supported it; supervised lifting strengthens bone and lowers injury." },
        { front: "When does the weight on the bar go up?", back: "Only when the technique is right, every rep." },
        { front: "Which two lifts can trap you under a bar?", back: "Bench press and back squat." },
        { front: "What are the bench press rules?", back: "Always a spotter, collars on, tell the spotter your rep target." },
        { front: "Soreness vs. pain?", back: "Soreness is dull, both sides, fades in days. Pain is sharp, one-sided or in a joint: stop and tell someone." },
        { front: "What do you do with a cracked bench or a frayed cable?", back: "Don't use it. Tell the coach." },
      ],
      quizQuestions: [
        {
          questionText: "The weight on the bar goes up only when the ___ is right.",
          questionType: "fill_blank",
          payload: { accepted: ["technique", "form"], explanation: "A rep that looks different because the weight is heavy means the weight is too heavy." },
        },
        {
          questionText: "Which lift always needs a spotter?",
          answers: [
            { answerText: "Bench press", isCorrect: true, explanation: "A missed bench can trap you under the bar; a spotter is not optional." },
            { answerText: "Bodyweight squat", isCorrect: false, explanation: "No bar, no trap." },
            { answerText: "Walking lunge", isCorrect: false, explanation: "You can put the weight down." },
            { answerText: "Calf raise", isCorrect: false, explanation: "Not a lift that traps you." },
          ],
        },
        {
          questionText: "Match the sign to what you do.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Dull ache on both sides, two days after a new session", right: "Normal soreness; easy movement helps" },
              { left: "Sharp pain on one side in a joint", right: "Stop and tell your coach today" },
              { left: "Feeling dizzy mid-set", right: "Stop, sit, drink, tell someone" },
            ],
            explanation: "Soreness fades; pain and dizziness are stop signs.",
          },
        },
        {
          questionText: "Put the steps for learning a new lift in the safe order.",
          questionType: "ordering",
          payload: { items: ["Bodyweight only", "Empty bar", "Light weight, same technique every rep", "Add weight slowly"], explanation: "Earn the weight. The athlete who learns it light first is still lifting later." },
        },
      ],
    },
    {
      title: "What Forge's Camera Numbers Mean, and Don't",
      description:
        "Forge can film a set and work out numbers from the video: how fast the bar moved, how high you jumped, how far you ran. This chapter explains what those numbers are, why they are still being calibrated, and how to use them without being fooled by them.",
      drills: ["40-Yard Dash", "Standing Start Acceleration", "Reactive Start Drill"],
      content: [
        {
          title: "What the Camera Is Doing",
          body:
            "When you film a set on Forge, two separate things happen. The first is simple: the video is recorded and saved, and you or your coach can watch it back. That part works, and it is the most useful part. Watching your own squat or your own sprint start from the outside is how technique gets fixed.\n\nThe second thing is harder. The app looks at the video and tries to measure it: it finds your body, finds the bar or the ball, follows them from frame to frame, and turns that into numbers. Bar speed, range of motion, jump height, the time between two points on a sprint.\n\nTo turn pixels into inches and seconds the app has to work out how big things are and how far away the phone is, from the video alone. It uses rulers it can find in the picture, like the size of a plate or the width of your grip, and a model of a human body. That is a real measurement, and it is also an estimate built on other estimates. Which brings us to the next page.",
        },
        {
          title: "Why the Numbers Are Being Calibrated",
          body:
            "A measurement is only worth trusting once it has been checked against something known to be right. Forge is in the middle of doing that: filming sets with a sensor on the bar at the same time, and comparing what the camera said with what the sensor said, lift after lift. Some lifts have been through that many times. Others have not been checked yet at all.\n\nUntil that work is done, the app says so next to every camera number. You will see a note that the metrics are not accurate yet and are still being calibrated. That note is not a bug and it is not false modesty. It means exactly what it says: the video is fine, the number next to it might be off, and sometimes it is off by a lot.\n\nSo the rule for now is the one the app itself gives you: do not make a training decision based on a camera number. Do not add weight because the bar speed looked good, do not cut a set because it looked slow, do not pick a starter from a sprint time the phone produced. Those decisions come from your coach, the weight on the bar and the stopwatch, for now.",
        },
        {
          title: "What You Can Use Them For",
          body:
            "None of that makes the camera useless. It makes it a tool with a job, and the job right now is comparison, not measurement.\n\nTrends over time from the same setup are more trustworthy than any single number. If you film your squat the same way every week and the speed number creeps up across a month, something is probably improving, even if the exact figure is wrong. One session's number on its own means much less.\n\nThe video with the numbers drawn on it is a teaching tool. Seeing where the bar path wandered, or where in the jump your arms were, tells you something true even when the inches are off.\n\nAnd every set you film helps the calibration. The app keeps a record of what it saw and what it was unsure about, and that record is what gets compared with the sensor. You can film from wherever you are; the app works with whatever it is given and never refuses a set for the way it was filmed. There is no wrong angle to film from.\n\nWhat you should not do is compare your camera number with a teammate's and treat the gap as real. Two phones, two setups, two sets of guesses.",
        },
        {
          title: "Reading the Note Next to a Number",
          body:
            "Every place in Forge that shows a camera number also shows the note about calibration, and some screens let you dismiss it after you have read it. Dismissing the note does not make the number better. It means you have been told.\n\nIf a coach, a parent or a recruiter asks about a Forge camera number, the honest answer is the one on this page: it is an estimate from video, it is being calibrated against sensors, and the video itself is the reliable part. Say that before you say the number.\n\nWhen calibration is finished for a lift, the note will come off that lift's numbers, and this chapter will be updated to say so. Until you see that, treat the number as a rough guide and the video as the truth.\n\nThe short version to remember: film everything, watch the video, keep the numbers for trends, and never let a camera number decide what you lift or who plays.",
        },
        keyPoints([
          "The video is recorded and saved, and it is the most useful part. Watch it.",
          "The numbers are estimates built from the video, and they are still being calibrated against sensors.",
          "Do not make a training decision from a camera number. The note next to it says so for a reason.",
          "Trends from the same setup mean more than any single number. Never compare across phones.",
          "Film from wherever you are. The app never refuses a set, and every set helps calibration.",
        ]),
      ],
      flashcards: [
        { front: "What part of filming a set on Forge is reliable right now?", back: "The video itself. Watch it back." },
        { front: "What is the app doing when it produces a bar speed number?", back: "Estimating size and distance from the video, then measuring. An estimate built on estimates." },
        { front: "What does 'being calibrated' mean?", back: "The camera's numbers are being compared with a sensor on the bar, lift by lift, until they are trusted." },
        { front: "Should you add weight because the camera said the bar was fast?", back: "No. No training decision from a camera number until calibration is done." },
        { front: "What are camera numbers good for right now?", back: "Trends from the same setup, teaching from the video, and helping calibration." },
        { front: "Is there a wrong angle to film from?", back: "No. Film from wherever you are; the app never refuses a set." },
      ],
      quizQuestions: [
        {
          questionText: "Which part of a filmed set is the trustworthy part right now?",
          answers: [
            { answerText: "The video", isCorrect: true, explanation: "The video is recorded and saved normally. The numbers from it are still being calibrated." },
            { answerText: "The bar speed number", isCorrect: false, explanation: "An estimate that is still being checked against sensors." },
            { answerText: "The jump height", isCorrect: false, explanation: "Same: an estimate, still being calibrated." },
            { answerText: "None of it", isCorrect: false, explanation: "The video is real and useful." },
          ],
        },
        {
          questionText: "The camera's numbers are being ___ against a sensor on the bar.",
          questionType: "fill_blank",
          payload: { accepted: ["calibrated", "checked", "compared"], explanation: "Filming with a sensor at the same time and comparing, lift after lift." },
        },
        {
          questionText: "Match each use of a camera number to whether this class allows it.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Watching a trend from the same setup over a month", right: "Allowed" },
              { left: "Adding weight because the speed looked good", right: "Not allowed" },
              { left: "Comparing your number with a teammate's phone", right: "Not allowed" },
            ],
            explanation: "Trends and teaching, yes. Training decisions and cross-phone comparisons, no.",
          },
        },
        {
          questionText: "A recruiter asks about your Forge sprint time. What do you say first?",
          answers: [
            { answerText: "That it is an estimate from video, still being calibrated, and the video is the reliable part", isCorrect: true, explanation: "Say that before the number." },
            { answerText: "The number, with confidence", isCorrect: false, explanation: "That leaves out the thing they most need to know." },
            { answerText: "Nothing; refuse to share the video", isCorrect: false, explanation: "The video is the useful, honest part." },
            { answerText: "That Forge's camera is a certified timing system", isCorrect: false, explanation: "It is not, and this class says so plainly." },
          ],
        },
      ],
    },
    {
      title: "Reading Your Own Progress",
      description:
        "Forge keeps a record of everything you log. This chapter is about how to read it: what a good week looks like, what a plateau means, and how to tell the difference between a bad day and a real problem.",
      drills: ["40-Yard Dash", "5-10-5 Pro Agility Footwork", "Standing Start Acceleration", "Single-Leg Balance and Stability"],
      content: [
        {
          title: "Log Everything, Honestly",
          body:
            "Progress you cannot see is progress you cannot steer. Every set you log in Forge, the weight, the reps, how it felt, becomes a line in a story you can read back a month later. The athletes who improve most are usually the ones with the most complete logs, not because logging makes you stronger, but because it makes you notice.\n\nHonesty is the whole value. A set you logged at a weight you did not actually lift, or reps you did not finish, poisons every comparison after it. Log the miss. Log the day you cut the session short. Log the bodyweight even when you do not like it. Your log is for you and your coach, nobody else, and a true record of a bad week is worth more than a flattering one.\n\nAdd a word about how it felt. Forge gives you a place for it. \"Easy\", \"heavy\", \"tired\", \"best ever\" takes two seconds and tells you more later than the numbers alone.",
        },
        {
          title: "What a Good Week Looks Like",
          body:
            "Progress in training is slow and bumpy, not a straight line. A good week is not every number going up. It is most numbers holding or moving a little, over weeks, with some days worse than the last and the trend still pointing the right way.\n\nFor strength, look at the same lift at the same reps a month apart, not day to day. If the weight is up, or the same weight felt easier, that is progress. For speed and jumps, the same: same test, same conditions, weeks apart. One fast day in a row of slow ones is a fast day, not a new level.\n\nBodyweight for a growing athlete should mostly go up. That is you growing. A number that is dropping while you train hard is a sign to look at food and sleep, not something to be pleased about.\n\nThe Forge strength profile compares your hand-logged lifts with other athletes your age, and it shows you a percentile rather than a rank on purpose. It is one way to see where you stand. It is never the point of training, and it never uses camera numbers, for the reasons in the last chapter.",
        },
        {
          title: "Plateaus and Bad Days",
          body:
            "Every athlete hits a stretch where nothing moves. That is a plateau, it is normal, and it is usually fixed by one of a short list of things. Not enough sleep. Not enough food. The same program for too long. Too much, too soon, with no easy week. A nagging injury you have been ignoring. Go down the list with your coach before you decide you have stopped improving.\n\nA bad day is different from a plateau. Everybody has days when the bar feels heavy and the legs feel slow: a late night, a test, a cold coming on. One bad day means nothing. Log it, note why, and move on. Three bad days in a row is a pattern, and patterns are what the log is for.\n\nWhat a plateau is not: a reason to add a supplement, double the sessions, or copy an older athlete's program off the internet. Those make the real cause worse. The fix is nearly always more sleep, more food, a planned easy week, or a change your coach makes to the program.",
        },
        {
          title: "Setting Goals You Control",
          body:
            "A goal like \"make varsity\" is fine to want, but you cannot control it, so it is a bad thing to measure a week by. The goals that work are the ones you fully own: train four times this week, hit every warm-up, sleep nine hours five nights out of seven, log every set honestly.\n\nAdd a few measurable targets with dates: squat a certain weight for three reps by the end of the block, take a tenth off a sprint time by the end of the season. Write them down in Forge or on paper, and look at them every week. A goal in your head drifts.\n\nWhen you hit one, set the next one slightly harder, not much harder. When you miss one, ask why with your coach, adjust it, and keep going. Missing a goal and adjusting is how the goal system is supposed to work; it is not failing.\n\nThe last thing this class asks: go back to the first numbers you logged, the sprint time or the lift, and compare them with where you are now. That gap, whatever size it is, is yours. Keep the log going and come back in another month.",
        },
        keyPoints([
          "Log everything, honestly, with a word about how it felt. A true bad week beats a flattering one.",
          "Progress is bumpy. Compare the same lift or test weeks apart, not day to day.",
          "A plateau is usually sleep, food, the same program too long, too much too soon, or an injury.",
          "One bad day means nothing. Three in a row is a pattern.",
          "Set goals you control, with dates, written down, reviewed weekly. Adjusting a missed goal is the system working.",
        ]),
      ],
      flashcards: [
        { front: "Why log honestly?", back: "A set you did not really lift poisons every comparison after it." },
        { front: "How do you measure strength progress?", back: "Same lift, same reps, weeks apart. Not day to day." },
        { front: "What should a growing athlete's bodyweight mostly do?", back: "Go up. Dropping while training hard means look at food and sleep." },
        { front: "Name three common causes of a plateau.", back: "Not enough sleep, not enough food, the same program too long (also: too much too soon, an ignored injury)." },
        { front: "What is a bad day versus a pattern?", back: "One bad day is nothing. Three in a row is a pattern." },
        { front: "What makes a goal a good one?", back: "You control it, it has a date, it is written down and reviewed weekly." },
      ],
      quizQuestions: [
        {
          questionText: "Which of these is a goal you fully control?",
          answers: [
            { answerText: "Train four times this week and log every set", isCorrect: true, explanation: "Entirely yours to do." },
            { answerText: "Make varsity", isCorrect: false, explanation: "Fine to want; a coach decides it, so it is a bad way to measure a week." },
            { answerText: "Win the meet", isCorrect: false, explanation: "Other people are in the race." },
            { answerText: "Be the strongest on the team", isCorrect: false, explanation: "Depends on everybody else." },
          ],
        },
        {
          questionText: "One bad day means nothing; ___ bad days in a row is a pattern.",
          questionType: "fill_blank",
          payload: { accepted: ["three", "3"], explanation: "Patterns are what the log is for." },
        },
        {
          questionText: "Put the steps for handling a plateau in order.",
          questionType: "ordering",
          payload: { items: ["Check sleep and food", "Check whether the program has gone unchanged too long", "Check for an injury you have been ignoring", "Ask your coach to change the program"], explanation: "The simple causes first, then the program, with the coach." },
        },
        {
          questionText: "Match the sign to what it most likely means.",
          questionType: "matching",
          payload: {
            pairs: [
              { left: "Same weight feels easier than a month ago", right: "Progress" },
              { left: "Bodyweight dropping while training hard", right: "Look at food and sleep" },
              { left: "One slow sprint after a late night", right: "A bad day, log it and move on" },
            ],
            explanation: "Read the trend and the reason, not the single number.",
          },
        },
      ],
    },
  ],
};
