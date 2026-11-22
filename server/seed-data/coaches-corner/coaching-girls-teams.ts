import { q, type SeedAcademyTrack } from "./types";

/** 2026-11-22, written from Forge's own research review (server/seed-data/research-review).
 * Forge's outline and Forge's words; studies are described, never quoted. */
export const COACHING_GIRLS_TEAMS_TRACK: SeedAcademyTrack = {
  title: "Coaching Girls' Teams: What the Injury Data Says",
  description:
    "Where girls' injury patterns differ from boys', which differences a coach can train against, and the strength, landing and fueling habits that protect female athletes through high school.",
  keyPrinciplesForAi:
    "Girls and boys in the same sport do not get hurt the same way, and the differences point to what to train. Female team-sport athletes tear the ACL two to three times as often as males, mostly without contact, so a landing, cutting and lower-body strength warm-up two to three times a week is the single most important program for a girls' team, and it works best in middle and high school. Girls had about twice the concussion rate of boys in comparable high school sports, and in some sports such as rugby and lacrosse their head injuries come from different mechanisms, so male-derived neck and tackle protocols should not be assumed to transfer. Female distance runners have about twice the bone stress injury risk of males; adequate energy intake, calcium and vitamin D, and playing more than one sport in childhood protect bone, while low energy availability harms bone, hormones and performance. Supervised resistance training is safe for adolescent girls and reduces injury risk. Strength training is not optional for girls' teams; it is the foundation of the protection.",
  lessons: [
    {
      lessonNumber: 1,
      title: "Different Sports, Different Patterns",
      estMinutes: 6,
      content:
        "A girls' team is not a boys' team with a different roster, and the injury data make that plain. Across high-level team sports, female athletes had about twice the ACL injury rate of males, while males had more upper-limb, hip and groin and thigh injuries; ankle sprains and concussions were similar at that level. In high school basketball, the ACL injury rate among girls was more than three times the boys' rate, and season- or career-ending injuries were more common in girls' basketball, with the knee, usually the ACL, the commonest site. In high school soccer, girls' ACL rate was about three times the boys'.\n\nThe ankle shows a similar tilt. Females and younger athletes had the highest ankle sprain rates, about twice the male rate in one pooled analysis, which is an argument for starting balance and ankle work early.\n\nSome sports have patterns of their own. In US high school softball, fracture was the most common season- or career-ending diagnosis, the only girls' sport where that was true. Girls' lacrosse injuries are disproportionately non-contact, and women's lacrosse injuries come more from ball and stick contact than body contact, with more head and face injuries than in the men's game. In a large Canadian youth ice hockey cohort, girls had higher game injury risk than boys even though girls' hockey does not allow body checking. In girls' high school throwing events, practice injury rates were higher than boys', and recurrent injuries were overrepresented.\n\nA growing body adds its own pressure. Adolescent dancers became more injury-prone with age in one ballet study, and girls' jump height did not rise with training years the way boys' did, which the authors linked to training that was all skill and no supplementary conditioning. That is the theme of this track: many of the differences above are partly about what girls are trained to do, and the parts a coach controls are strength, landing control and load.\n\nNone of this is a reason to coach girls more cautiously in the sense of doing less. It is a reason to coach them more deliberately: spend the warm-up on the things their injury data says matter, and build strength as seriously as any boys' program.",
      flashcards: [
        { front: "ACL rate of female versus male team-sport athletes", back: "About two to three times higher in females." },
        { front: "Softball's unusual injury pattern", back: "Fracture was the most common season- or career-ending diagnosis among girls' high school sports." },
        { front: "The parts of the gap a coach controls", back: "Strength, landing control and training load." },
      ],
    },
    {
      lessonNumber: 2,
      title: "The Knee Program Is the Priority",
      estMinutes: 6,
      content:
        "If a girls' team does only one injury-prevention thing, it should be a neuromuscular knee program run as the warm-up. Among female athletes, ACL prevention programs cut non-contact ACL injuries by about two-thirds in pooled analyses. Put another way, a 2019 pooled analysis of young female athletes found the training roughly halved the chance of a tear, and the programs run with middle and high school girls outperformed those run with college or professional players.\n\nThe ingredients that made the biggest difference were landing stabilization and lower-body strength in every session: jumps and hops held on landing, Nordic hamstring curls, lunges and calf raises, with balance and agility work around them. Average programs ran about twenty-four minutes, roughly two and a half times a week. The Chicago public schools trial described in the knee track is the girls' coach's best argument: twenty minutes before practice, led by the team's own coaches, used at most practices, and far fewer knee and ankle injuries among the players.\n\nThe knee position to coach against is inward collapse. Female athletes who later tore an ACL landed with more of it and with far higher inward forces at the knee, which is why the program must train side-to-side control as well as depth. A coach-led warm-up focused on landing and trunk control improved landing scores and pelvic control in female basketball players who showed that collapse.\n\nIn soccer specifically, a network analysis found Sweden's Knee Control program had the clearest effect in females, while FIFA 11+ ranked first overall; evidence in female players is thinner than in males for some of the named programs, which is one more reason to pick a program and actually do it rather than wait for a perfect one.\n\nCompliance is the whole game. The teenage girls' soccer teams that ran their program most faithfully saw only a small fraction of the ACL tears that the least faithful teams saw, and every team's adherence slid as the months went by. A girls' coach who commits to the routine for the full season, every practice slot it is scheduled for, is doing the single highest-value thing available.",
      flashcards: [
        { front: "Effect of ACL programs in female athletes", back: "About two-thirds fewer non-contact ACL injuries." },
        { front: "Ingredients that strengthened the effect", back: "Landing stabilization and lower-body strength in every session." },
        { front: "Knee position to coach against", back: "Inward collapse on landing and cutting." },
      ],
    },
    {
      lessonNumber: 3,
      title: "Heads, Necks and Concussion",
      estMinutes: 6,
      content:
        "Girls had about twice the concussion rate of boys across comparable high school sports in national surveillance from 2013 to 2018. That pattern shows up sport by sport. Concussion made up about a quarter of girls' high school soccer game injuries, and more than a third of competition injuries to girls' goalkeepers. In high school girls' volleyball, liberos had a notably high share of concussions from dives and collisions. In youth rugby union, girls' concussion rate was several times the boys', the tackle caused most girls' match injuries, and girls mostly injured the head and neck where boys mostly injured the lower limb.\n\nThe mechanisms are not always the same as in boys' sports. In youth lacrosse, boys' concussions mostly came from hitting the ground and girls' from ball or stick contact. That matters for prevention: equipment rules, playing rules and practice design have to fit the sport as girls play it, and headgear in girls' lacrosse is still debated, with some concern that it could encourage more aggressive play.\n\nNeck strength is the obvious question, and the honest answer is that the evidence is male. Neck-strengthening programs cut concussions by about forty-five percent in male rugby players in the two studies that measured it, but there is no evidence yet for female rugby players or for soccer. Female university rugby players had about half the isometric neck strength of male players and showed uncontrolled head motion in most head-impact events, which is exactly why the authors cautioned that male-derived neck and tackle protocols may not transfer to girls. Neck strengthening is reasonable general training for girls in collision sports, but it should not be sold as proven concussion protection for them.\n\nWhat is solid is the response. Any suspected concussion means the athlete stops that day and is assessed by a clinician, and the return is stepwise under the clinician's direction. Teaching safe technique for the sport's real collision moments, such as tackling in rugby, diving in volleyball and goalkeeping in soccer, and enforcing the rules that protect heads, are the coach's tools. A neuromuscular warm-up in high school girls' rugby did not significantly change concussion rates, though days lost to head injury were lower in seasons that used it.",
      flashcards: [
        { front: "Concussion rate of girls versus boys in comparable high school sports", back: "About twice as high in girls." },
        { front: "Is neck strengthening proven to cut concussions in girls?", back: "No. The evidence is in male rugby; female evidence is missing." },
        { front: "Response to any suspected concussion", back: "Stop that day; a clinician assesses and leads a stepwise return." },
      ],
    },
    {
      lessonNumber: 4,
      title: "Bone, Fuel and Strength Training",
      estMinutes: 6,
      content:
        "Female runners and athletes in leanness-focused sports carry a risk that does not show up on a highlight reel. Across thirty-eight prospective studies of runners, overall injury rates were similar for women and men, but women had about twice the risk of bone stress injury. Bone stress injuries are common in runners and come from a mix of biological factors, such as energy, hormones and bone health, and mechanical ones. Female high school distance runners who did nothing but run for nine or more months of the year were about five times as likely to have low bone density as those who specialized less, and over a third of that sample had low bone density.\n\nThe central biological factor is energy availability: eating too little for the training being done. Low energy availability underlies the conditions known as relative energy deficiency in sport and the female athlete triad, and it harms bone, hormones and performance in females and males alike. An international consensus published in 2023 gives clinicians an assessment tool. A coach is not the person to assess an athlete's diet or menstrual health, but a coach is the person who notices repeated bone injuries, fatigue that does not lift, or an athlete restricting food, and who makes sure the athlete is seen by a clinician. Prevention advice from clinical reviews is consistent: adequate energy, calcium and vitamin D, screening for risk factors, and encouraging ball sports in childhood and adolescence, because varied loading builds bone.\n\nThat last point connects to strength training, which is where a coach has the most direct influence. International consensus describes supervised resistance training for young people as safe and beneficial, and resistance training in groups at higher risk, including girls, has been reported to reduce injury risk substantially. Strength underpins the knee program, the ankle program and bone health together. A girls' program that leaves out the weight room has removed the foundation the other prevention work stands on.\n\nThe practical plan for a girls' team is short: run a neuromuscular warm-up as the default, put supervised strength training into the week year-round, progress sprinting, jumping and running volume gradually, encourage more than one sport, never make food or weight a coaching topic, and refer any athlete with repeated stress injuries or signs of under-fueling to a clinician.",
      flashcards: [
        { front: "Bone stress injury risk of female versus male runners", back: "About twice as high in women." },
        { front: "Low energy availability", back: "Too little food for the training done; it harms bone, hormones and performance." },
        { front: "Is supervised resistance training safe for adolescent girls?", back: "Yes, and it is reported to reduce injury risk." },
      ],
    },
  ],
  quizQuestions: [
    q(0, "How do ACL injury rates compare between female and male team-sport athletes?", [
      ["Females tear the ACL about two to three times as often", "Correct. Mostly in non-contact landings and cuts."],
      ["Males tear it far more often", "The data show the reverse."],
      ["The rates are identical", "Female rates are consistently higher."],
      ["Only adult women are affected", "High school girls have high rates."],
    ], 0),
    q(1, "What is the single highest-value injury-prevention program for a girls' team?", [
      ["A neuromuscular landing, cutting and lower-body strength warm-up run consistently all season", "Correct. It cuts non-contact ACL injuries in females by about two-thirds."],
      ["Static stretching before games", "Stretching does not prevent these injuries."],
      ["Doing less of everything", "Less training is not the evidence-based answer."],
      ["Knee braces for everyone", "Braces are not the proven ACL prevention."],
    ], 0),
    q(2, "Which age group of female athletes benefits most from ACL prevention programs?", [
      ["Middle and high school athletes", "Correct. School-age programs did better than college or professional ones."],
      ["Only professional athletes", "Professional athletes benefited less than school-age ones."],
      ["Only those over twenty-five", "Younger athletes benefit most."],
      ["No group benefits", "All groups benefited, school-age most."],
    ], 0),
    q(3, "What does the evidence say about neck strengthening and concussion in girls?", [
      ["It cut concussions in male rugby, but there is no evidence yet in female athletes", "Correct. Male protocols may not transfer to girls."],
      ["It is proven to prevent concussions in girls' soccer", "No such evidence exists yet."],
      ["It causes concussions", "No study in the review found anything like that."],
      ["Girls have stronger necks than boys", "Female rugby players had about half the neck strength of males."],
    ], 0),
    q(4, "How did girls' concussion rates compare with boys' in comparable high school sports?", [
      ["About twice as high", "Correct. National surveillance from 2013 to 2018."],
      ["About half as high", "Girls' rates were higher."],
      ["Exactly the same", "They differed substantially."],
      ["Girls do not get concussions in non-contact sports", "Concussions occur in soccer, volleyball and softball."],
    ], 0),
    q(5, "Female runners have about twice the risk of which injury compared with male runners?", [
      ["Bone stress injury", "Correct. Overall injury rates were similar, but bone stress injury risk differed."],
      ["Achilles tendinopathy", "Males had more Achilles tendinopathy."],
      ["Hamstring strain", "That was not the reported difference."],
      ["Wrist fracture", "Wrist fracture was not the reported difference."],
    ], 0),
    q(6, "An athlete has had two stress fractures this year and seems constantly tired. What should the coach do?", [
      ["Make sure she is seen by a clinician, because low energy availability can harm bone and hormones", "Correct. Assessment belongs to the clinician; noticing belongs to the coach."],
      ["Put her on a diet", "Coaches should never make food or weight a coaching topic."],
      ["Increase her running volume", "That adds load to injured bone."],
      ["Ignore it until the season ends", "Repeated bone injuries need prompt clinical attention."],
    ], 0),
    q(7, "What role does supervised strength training play for adolescent girls?", [
      ["It is safe and reduces injury risk, and it underpins the knee, ankle and bone programs", "Correct. It is the foundation of prevention."],
      ["It is unsafe before adulthood", "International consensus calls it safe and beneficial."],
      ["It only matters for appearance", "Its purpose here is protection and performance."],
      ["It replaces the need for a warm-up", "Both are needed; strength does not replace the warm-up."],
    ], 0),
  ],
};
