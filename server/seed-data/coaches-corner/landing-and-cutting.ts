import { q, type SeedAcademyTrack } from "./types";

/** 2026-11-22, written from Forge's own research review (server/seed-data/research-review).
 * Forge's outline and Forge's words; studies are described, never quoted. */
export const LANDING_AND_CUTTING_TRACK: SeedAcademyTrack = {
  title: "Landing and Cutting: Reducing Knee and Ankle Injuries",
  description:
    "How most ACL tears and ankle sprains happen, the knee position that predicts them, and the neuromuscular programs that halve them when a team actually runs them.",
  keyPrinciplesForAi:
    "Most ACL injuries in team sports are non-contact, happening on a landing, a cut or a sudden stop, and they are far more common in games than in practice. Female athletes tear the ACL two to three times as often as males in the same sport. Landing with the knee collapsing inward, a high knee abduction moment, predicted later ACL injury in young female athletes, so training must address the frontal plane and not only how much the knee bends. Neuromuscular prevention programs that combine landing stabilization, lower-body strength such as Nordic hamstrings, lunges and calf raises, balance and agility roughly halve ACL injuries overall and cut non-contact ACL injuries in females by about two-thirds; they work best in middle and high school athletes, at about twenty minutes two to three times a week, and only when teams comply. Ankle sprains are the most common injury in many court and field sports; balance training cuts them by about a third, more in athletes with a prior sprain, and lace-up braces cut them in high school basketball. Teach quiet, controlled landings and cutting technique as skills, progress them, and do not let a program fade mid-season.",
  lessons: [
    {
      lessonNumber: 1,
      title: "How Knees and Ankles Actually Get Hurt",
      estMinutes: 6,
      content:
        "The picture most people have of an ACL tear is a collision. The data say otherwise. Across team ball sports, a little over half of ACL injuries are non-contact, and among female athletes the share is closer to two-thirds. In high school soccer, only about a third of girls' ACL tears involved contact with another player. The injury happens when an athlete lands from a jump, plants to change direction or decelerates hard, and the knee gives way under their own body's force. In overhead sports such as volleyball, landing from a jump accounted for most ACL injuries in video and case analyses.\n\nThat matters because a non-contact injury is one a coach can train against. You cannot stop every collision, but you can teach an athlete to land and cut in a position the knee tolerates, and build the strength to hold that position when it counts.\n\nGames are where the risk concentrates. ACL injuries in high school soccer happened many times more often in competition than in practice, and basketball showed a similar gap, with game rates around eight times practice rates. Games bring higher speeds, unpredictable opponents, fatigue and less attention to technique. A prevention program is essentially rehearsal for those moments.\n\nThe ankle has its own story. The lateral ankle sprain is the single most common injury in many court and field sports, more common overall than ACL injury in basketball. The strongest risk factor is a previous sprain, which raises the risk two to three times, and females and younger athletes have the highest sprain rates. A first sprain that is not rehabbed properly often becomes a series of sprains and, in some athletes, lasting instability.\n\nBoys are not exempt from any of this. Boys' football had one of the highest adolescent ACL rates of any sport, second only to girls' soccer in one review, and boys' lacrosse was close behind. Club sport participation raised adolescent ACL risk substantially. The knee and ankle program in this track belongs in every team that jumps, lands and cuts.",
      flashcards: [
        { front: "Share of ACL injuries that are non-contact in team ball sports", back: "A little over half, and nearly two-thirds in females." },
        { front: "Where ACL injuries concentrate", back: "In games, many times more often than in practice." },
        { front: "Strongest risk factor for an ankle sprain", back: "A previous ankle sprain, two to three times the risk." },
      ],
    },
    {
      lessonNumber: 2,
      title: "The Knee Position That Predicts Injury",
      estMinutes: 6,
      content:
        "In a well-known prospective study, young female athletes were screened on a drop-jump landing and then followed through their seasons. Those who later tore an ACL had landed with more inward collapse of the knee and with much higher forces pushing the knee inward, about two and a half times higher. That inward collapse, often called valgus or knee abduction, is the position to coach against, and it explains why a prevention program has to train side-to-side control of the knee, not only how deep an athlete bends.\n\nWhat a coach looks for on a landing is simple and visible from the front: knees that drift toward each other, a stiff landing with little hip and knee bend, a loud contact, the trunk tipping to one side, or weight landing on one leg when the athlete meant to land on two. The opposite, a soft and quiet landing with the hips back, the knees tracking over the middle of the feet and the chest over the knees, is the target on every rep.\n\nThe same principles apply to cutting. An athlete who plants with the foot far outside the body, the knee turned in and the trunk leaning away from the new direction loads the knee badly. Lowering the hips, keeping the knee over the foot and turning the trunk toward the new direction spreads the force across the hip and ankle.\n\nThere is a trap here. Fatigue changes landing mechanics, but studies disagree about exactly how, and reviews have not found enough consistent evidence to redesign programs around it. What is clear is that technique taught only when athletes are fresh is the technique they keep when they are fresh. Building landing and cutting quality into practice drills, not only the warm-up, is how it survives into the fourth quarter.\n\nTraining the hips and trunk is part of the knee program. A coach-led warm-up focused on landing technique and trunk control improved jump-landing scores and control of the pelvis in female basketball players whose knees collapsed inward. Strong hips and a stable trunk give the knee somewhere to send its load.",
      flashcards: [
        { front: "Landing pattern that predicted later ACL injury in young female athletes", back: "More inward knee collapse and much higher knee abduction moments." },
        { front: "What to see on a good landing", back: "Soft and quiet, hips back, knees over the middle of the feet, chest over the knees." },
        { front: "Why train landing in practice drills too", back: "Technique practiced only fresh may not hold up under game fatigue." },
      ],
    },
    {
      lessonNumber: 3,
      title: "Programs That Halve the Risk",
      estMinutes: 7,
      content:
        "Few things in youth sport injury prevention have evidence as strong as ACL prevention programs. A large overview of the pooled research found they halve all ACL injuries and cut non-contact ACL injuries in female athletes by about two-thirds. The evidence for male athletes alone is not yet sufficient to give a separate figure, though the mechanics are similar and the programs are a reasonable choice for boys' teams too.\n\nA 2019 analysis of young female athletes put the benefit in terms a parent understands: neuromuscular training lowered ACL risk from about one athlete in fifty-four to about one in a hundred and eleven. The average program ran about twenty-four minutes, about two and a half times a week, roughly eighteen hours in total over the season. Programs that included landing stabilization and lower-body strength in every session did better, and middle and high school athletes benefited more than college or professional players. That last finding is the strongest argument for starting early: the earlier the habits are built, the larger the effect.\n\nThe exercises are not exotic. Jump and hop with a stuck landing, lunges, Nordic hamstring curls, calf raises, single-leg balance, and change-of-direction drills at controlled speed cover most published programs. In soccer, FIFA 11+ ranked first for reducing ACL risk overall in a network analysis, while Sweden's Knee Control program showed the clearest effect in female players. In Chicago public high schools a coach-led twenty-minute warm-up of strengthening, plyometrics, balance and agility cut non-contact lower-limb injuries in girls' soccer and basketball by about two-thirds.\n\nThe same programs protect the ankle. Balance exercises alone reduced ankle injuries by roughly forty percent in a soccer analysis, and neuromuscular warm-ups cut youth ankle sprains by about a third.\n\nEverything depends on doing it. In adolescent female soccer teams, the most compliant third had dramatically fewer ACL injuries than the least compliant, and compliance drifted down month by month. Make the program the warm-up, keep it to around twenty minutes, run it two or three times a week, progress it every few weeks, and keep it going through the end of the season, when it is easiest to drop.",
      flashcards: [
        { front: "Effect of ACL prevention programs in female athletes", back: "About two-thirds fewer non-contact ACL injuries; all ACL injuries roughly halved overall." },
        { front: "Typical program dose in the 2019 analysis", back: "About 24 minutes, about 2.5 times a week, about 18 hours in a season." },
        { front: "Who benefits most", back: "Middle and high school athletes, more than college or professional players." },
      ],
    },
    {
      lessonNumber: 4,
      title: "Ankles: Balance, Braces and the Second Sprain",
      estMinutes: 6,
      content:
        "The ankle sprain is common enough that many coaches treat it as part of the game. It does not have to be. Balance and proprioceptive training reduces ankle sprains by about a third, for first sprains and repeat sprains alike, and in one study of high school soccer and basketball a balance program cut sprains almost in half, with the largest benefit in athletes who had sprained an ankle before. Even an unsupervised home balance-board program after a sprain cut recurrences by about a third. For an athlete with a history, balance work is not optional.\n\nThe drills are progressive: single-leg stance on firm ground, then with eyes closed, then on an unstable surface, then with a ball toss or a partner push, then hops and landings in different directions held for a count. Three or four minutes inside the warm-up covers it.\n\nBraces are the other proven tool. In high school basketball, lace-up ankle braces cut acute ankle injuries by about two-thirds, whether or not the athlete had a past injury. Tape and braces restrict rolling of the ankle, though they do not improve the ankle's sense of position, and guidelines favor braces for preventing a recurrence. A team that plays on a court can reasonably encourage braces, especially for anyone with a prior sprain.\n\nRisk factors differ between boys and girls, which gives a coach something to look for. In male athletes, higher body mass, weaker hip abduction and poorer dynamic balance were linked to sprains; in female athletes, weaker ankle dorsiflexion strength. Hip strength work and calf and shin strength work both belong in the program.\n\nThe second sprain is the one to prevent. After a sprain, an athlete should not be judged ready simply because walking no longer hurts. An international consensus lays out five areas a return should cover: pain during sport and over the following day, ankle range and strength, the athlete's own confidence, balance and control, and sport performance such as hops, agility and a full practice. A severe sprain or a suspected fracture needs a clinician, and ongoing giving-way after a sprain needs assessment rather than tape and hope.",
      flashcards: [
        { front: "Effect of balance training on ankle sprains", back: "About a third fewer sprains, with the largest benefit after a prior sprain." },
        { front: "Lace-up braces in high school basketball", back: "About two-thirds fewer acute ankle injuries." },
        { front: "Five areas a return after an ankle sprain covers", back: "Pain, ankle impairments, athlete confidence, balance and control, and sport performance." },
      ],
    },
  ],
  quizQuestions: [
    q(0, "How do most ACL injuries in team sports happen?", [
      ["Without contact, on a landing, a cut or a hard stop", "Correct. Over half are non-contact, and nearly two-thirds in females."],
      ["Almost always in a collision", "Contact injuries are the minority."],
      ["Mostly in the weight room", "Most happen in games and practices on landings and cuts."],
      ["Only in adult professional athletes", "Adolescents, especially girls, have high rates."],
    ], 0),
    q(1, "Which landing pattern predicted later ACL injury in young female athletes?", [
      ["Knees collapsing inward with high knee abduction forces", "Correct. That is why programs train side-to-side knee control."],
      ["A soft, quiet landing with the hips back", "That is the target pattern, not the risky one."],
      ["Landing on the balls of both feet", "Foot contact alone was not the predictor."],
      ["Landing too slowly", "Slow, controlled landings are not the risk."],
    ], 0),
    q(2, "In the 2019 analysis of young female athletes, what was the change in ACL risk with neuromuscular training?", [
      ["From about 1 in 54 to about 1 in 111", "Correct. Roughly halving the risk."],
      ["No change", "The analysis found a clear reduction."],
      ["From 1 in 10 to 1 in 11", "That understates both the baseline and the effect."],
      ["A complete elimination of ACL injuries", "No program eliminates them."],
    ], 0),
    q(3, "Which group benefits most from ACL prevention programs?", [
      ["Middle and high school athletes", "Correct. School-age programs reduced ACL injuries more than college or professional ones."],
      ["Professional athletes only", "Professional athletes benefited less."],
      ["Only athletes who already tore an ACL", "Prevention programs work before any injury."],
      ["Nobody under eighteen", "School-age athletes benefited most."],
    ], 0),
    q(4, "Which exercises are common to published ACL prevention programs?", [
      ["Stuck landings, lunges, Nordic hamstring curls, calf raises, balance and controlled cutting drills", "Correct. Landing stabilization and lower-body strength in every session improved the effect."],
      ["Static stretching only", "Stretching does not prevent these injuries."],
      ["Maximal depth jumps from high boxes", "High-intensity reactive work is not the core of these programs."],
      ["Upper-body machines", "The programs target landing, the lower body and balance."],
    ], 0),
    q(5, "What does balance training do for ankle sprains?", [
      ["Cuts them by about a third, with the most benefit for athletes with a prior sprain", "Correct. It helps first and repeat sprains."],
      ["Nothing", "Balance training is one of the best-supported preventions."],
      ["Only helps adult athletes", "It worked in high school soccer and basketball."],
      ["Increases sprains", "No such effect was found."],
    ], 0),
    q(6, "In high school basketball, what did lace-up ankle braces do?", [
      ["Cut acute ankle injuries by about two-thirds, with or without a prior injury", "Correct. Braces are a proven option on the court."],
      ["Improved ankle position sense in unstable ankles", "Braces restrict motion but did not improve proprioception."],
      ["Caused more knee injuries", "The trial did not report that."],
      ["Had no effect", "The effect was large."],
    ], 0),
    q(7, "An athlete's sprained ankle no longer hurts to walk on. Are they ready for full practice?", [
      ["Not on that alone; a return should also check range, strength, confidence, balance and sport tasks like hops and cuts", "Correct. The consensus covers five areas, and severe sprains need a clinician."],
      ["Yes, pain-free walking is the standard", "Walking is far below the demands of sport."],
      ["Yes, if they tape it", "Tape restricts motion but does not replace rehab."],
      ["Only after six months, always", "Return is criteria-based, not a fixed calendar."],
    ], 0),
  ],
};
