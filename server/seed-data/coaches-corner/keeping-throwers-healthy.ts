import { q, type SeedAcademyTrack } from "./types";

/** 2026-11-22, written from Forge's own research review (server/seed-data/research-review).
 * Forge's outline and Forge's words; studies are described, never quoted. */
export const KEEPING_THROWERS_HEALTHY_TRACK: SeedAcademyTrack = {
  title: "Keeping Throwers Healthy",
  description:
    "Pitch counts, the shoulder and elbow risk factors a coach can actually change, the warm-up and strength work with trials behind it, and why a sore arm is a stop sign rather than a toughness test.",
  keyPrinciplesForAi:
    "Throwing volume and fatigue are the largest risks a coach controls for baseball and softball pitchers and other overhead athletes. Track pitches per game, per week and per year rather than innings; keep a youth pitcher under roughly one hundred innings in a calendar year; avoid year-round pitching, showcase stacking and pitching while tired or in pain; and treat a pitcher who also catches as a high-load athlete. Velocity that climbs in season relative to preseason, and hard game velocity, both add arm load. Prevention work with trials behind it includes a warm-up of stretching, dynamic mobility and balance drills for young baseball players, external-rotation strengthening for high school pitchers, which did at least as well as sleeper stretching, and shoulder control programs of external-rotation strength, scapular control and thoracic mobility done inside the warm-up about three times a week. Range-of-motion screening alone is a weak predictor. Softball windmill pitchers face similar shoulder and elbow loads, have no pitch-count rules, and need pitch and fatigue tracking too. Arm pain means stop and see a clinician; return to throwing after an injury is criteria-based and clinician-led.",
  lessons: [
    {
      lessonNumber: 1,
      title: "Volume Is the Lever: Pitches, Innings and Months",
      estMinutes: 7,
      content:
        "If a coach could change only one thing about a young pitcher's season, the research says it should be how much they throw. In a season-long study of nine- to fourteen-year-old pitchers published in 2002, about half reported elbow or shoulder pain, and pain rates rose with more pitches per game and per season. A ten-year follow-up of youth pitchers found that five percent suffered a serious throwing injury, one that ended in surgery or retirement, and that pitching more than one hundred innings in a calendar year raised that risk about three and a half times.\n\nThe details matter for how a coach keeps count. Pitch-count limits control volume better than inning limits, because an inning can be eight pitches or forty. Leagues that limited innings rather than pitches ended up throwing more pitches. Families who knew and followed published pitch guidelines had children with fewer injuries, while showcase events, where a young pitcher throws hard for scouts on top of a full season, predicted injury. In Japanese junior high players, throwing three hundred or more full-effort balls a week and playing ten or more games a month were risk factors for elbow pain.\n\nThe calendar is the other half of volume. Highly specialized high school baseball players had nearly four times the odds of an upper-limb overuse injury, and playing more than eight months of the year roughly doubled them. That is a coach's planning question as much as a parent's: an arm needs months away from competitive throwing, and a fall league plus a travel team plus a high school season leaves no room for it.\n\nOne more group carries hidden load. High school pitchers who also played catcher had nearly three times the shoulder and elbow injury risk of those who did not, because catchers throw on nearly every pitch. A pitcher's off-days are not real rest if they are spent behind the plate. The practical system is simple: write every pitch down, set per-game and per-week limits from published guidance, plan rest months into the year, and count catching as throwing.",
      flashcards: [
        { front: "Why count pitches rather than innings?", back: "An inning can be a handful of pitches or dozens; pitch limits control volume better." },
        { front: "Innings per calendar year linked to a 3.5x rise in serious injury in youth pitchers", back: "More than about 100." },
        { front: "Pitcher who also catches", back: "Nearly three times the shoulder and elbow injury risk; catching is throwing volume." },
      ],
    },
    {
      lessonNumber: 2,
      title: "Fatigue, Velocity and the Sore Arm",
      estMinutes: 6,
      content:
        "Volume explains a great deal, but the throws that do the most damage are the ones made by a tired arm. Reviews of adolescent pitchers keep finding the same pattern: the athletes who got hurt had pitched more months, more games, more innings and more pitches, and had more often pitched while fatigued or with arm pain. Pitching through pain is not grit; it is the single behavior most consistently linked with getting hurt.\n\nVelocity adds its own load. In high school pitchers aged thirteen to eighteen, throwing harder in games was a risk factor, and so was a rise in velocity during the season compared with the preseason. That is uncomfortable for a coach, because velocity is what everyone wants. The message is not to stop developing velocity; it is that a faster arm needs volume and rest managed even more carefully, and that a sudden mid-season jump in speed deserves attention rather than celebration alone.\n\nSoftball deserves the same seriousness. The windmill pitch produces shoulder and elbow loads similar to baseball pitching, with very high eccentric biceps activity, roughly double that of an overhand throw. Windmill pitchers mostly develop overuse problems at the front of the shoulder and in the biceps. High school softball pitchers' pain and fatigue rose over a single game and across a season, with measurable drops in shoulder strength as games pitched increased, and one study found more than eighty-five pitches a game raised season injury risk. As of 2023 there were no US or Canadian pitch-count rules for softball, so tracking pitches and games falls entirely to the coach.\n\nFor every thrower, the warning signs are the same: velocity or control fading in the late innings, a pitcher shaking out the arm between pitches, a drop in arm slot, and any report of pain. The response is also the same. A fatigued pitcher comes out, and a pitcher with arm pain stops throwing and is seen by a clinician. Growing athletes add a reason for caution: stress injuries to the growth plates at the shoulder and the inside of the elbow occur in young baseball players, most heal with timely rest, and the ones that cause lasting trouble are the ones found late.",
      flashcards: [
        { front: "Behavior most consistently linked with arm injury in adolescent pitchers", back: "Pitching while fatigued or with arm pain." },
        { front: "Windmill pitch load", back: "Shoulder and elbow loads similar to baseball pitching, with very high eccentric biceps activity." },
        { front: "Response to a pitcher with arm pain", back: "Stop throwing and see a clinician." },
      ],
    },
    {
      lessonNumber: 3,
      title: "The Arm-Care Work With Trials Behind It",
      estMinutes: 7,
      content:
        "Arm-care routines are everywhere, and most of them have never been tested. A few have, and they make a short, defensible program.\n\nFor young baseball players, a randomized trial gave nine- to eleven-year-olds a warm-up of five stretches including the back of the shoulder and the hip, two dynamic mobility drills and two balance exercises, every practice for a year. Shoulder and elbow throwing injuries fell by nearly half, and ball speed tended to rise rather than fall. The lesson is that the hips and balance belong in arm care, because the throw starts in the legs.\n\nFor high school pitchers, a 2022 trial compared nightly external-rotation strengthening with the popular sleeper stretch over a hundred and fifty days. Strengthening was at least as good, and the strength group's injury rate was less than half of the stretch group's. In professional pitchers, preseason weakness in external rotation and in the supraspinatus was associated with later injuries that needed surgery. Strength of the muscles that decelerate the arm is a recurring theme.\n\nHandball and volleyball add evidence from other overhead sports. A coach-delivered shoulder program added to the handball warm-up about three times a week, built from internal-rotation range, external-rotation and scapular strength, kinetic-chain work and thoracic mobility, lowered shoulder problems in elite players, and an adolescent version prevented about one shoulder injury for every nine players. Across overhead sports, programs with strength, stability and sport-specific exercises cut shoulder injuries by about half, though the certainty of that pooled figure is low. Band routines such as the Thrower's Ten are consistently linked with better rotator cuff strength and range.\n\nTwo cautions keep the program honest. Screening range of motion alone is a weak predictor: loss of internal rotation did not reach clear significance as a risk factor in pooled data, so a goniometer is not a substitute for managing volume. And weighted or light balls in the warm-up did not change later throwing velocity, so they are not a warm-up shortcut. The defensible program is short: a mobility and balance warm-up, external-rotation and scapular strength two to three times a week, and pitch counts.",
      flashcards: [
        { front: "Youth baseball warm-up that cut arm injuries by nearly half", back: "Stretches including posterior shoulder and hip, dynamic mobility drills and balance exercises, every practice." },
        { front: "External-rotation strengthening vs sleeper stretch in high school pitchers", back: "Strengthening was at least as good, with less than half the injury rate." },
        { front: "Is range-of-motion screening alone a strong predictor?", back: "No. It is a weak predictor and does not replace volume control." },
      ],
    },
    {
      lessonNumber: 4,
      title: "The Whole Chain and Coming Back to Throw",
      estMinutes: 6,
      content:
        "A throw is a chain: force starts at the ground, travels through the hips and trunk, and leaves through the arm. When the chain works, the arm is the last link that delivers energy built elsewhere. When it breaks, the shoulder and elbow are asked to make up the difference. In javelin throwers, moving energy from the torso into the throwing arm, rather than generating it at the shoulder, produced higher release speed with lower joint load. For softball pitchers, review-level guidance puts mechanics, core, hip and lower-body strength and recognizing fatigue at the center of prevention. In track throws, the published cornerstone of injury prevention is technique that keeps the chain intact, supported by leg, trunk and shoulder strength.\n\nThat makes the weight room part of arm care. Lower-body and rotational power, trunk strength and single-leg control are not separate from throwing health; they are how a thrower avoids borrowing from the arm. A coach does not need a separate arm program so much as a strength program that respects what throwing demands, with the shoulder-specific work from the previous lesson added on top.\n\nComing back after an injury follows a sequence, and the clinician owns it. The published approach to return to throwing after a shoulder or elbow problem is criteria-based: first restore range of motion, strength and control of the shoulder blade; then progress through upper-body plyometrics; then follow an interval throwing program that adds distance, effort and volume a step at a time. A modern interval program for pitchers built from workload data runs about seven months and keeps week-to-week changes small. Non-operative care of an elbow ligament injury returns most athletes to sport, and surgical reconstruction typically means about a year before a pitcher returns. Those timelines are the treating clinician's decisions.\n\nThe coach's part is to protect the plan: no extra throwing because the athlete feels good, no showcase that skips steps, honest counts at every stage, and a direct line to the clinician when something changes. Girls in high school throwing events with a prior injury were overrepresented among chronic injuries, which is the clearest reminder that the second injury is often the coach's to prevent.",
      flashcards: [
        { front: "Why strength of the legs and trunk is arm care", back: "A throw is a chain; when the lower links fail, the shoulder and elbow make up the difference." },
        { front: "Order of a return to throwing", back: "Range, strength and scapular control, then plyometrics, then an interval throwing program, all clinician-led." },
        { front: "The coach's role in a return", back: "Protect the plan: no skipped steps, honest counts, and contact with the clinician." },
      ],
    },
  ],
  quizQuestions: [
    q(0, "Why do the studies favor pitch counts over inning limits?", [
      ["An inning can hold a few pitches or many, so innings limits let volume run high", "Correct. Inning-limited leagues ended up throwing more pitches."],
      ["Innings are harder to count", "Both are easy to count; the problem is what an inning measures."],
      ["Inning limits are illegal", "Inning limits exist; they simply control volume poorly."],
      ["Pitch counts only matter for adults", "The strongest evidence comes from youth pitchers."],
    ], 0),
    q(1, "A youth pitcher is on track for 120 innings this calendar year. What does the research suggest?", [
      ["Reduce it; more than about 100 innings a year was linked to roughly 3.5 times the risk of serious injury", "Correct. Annual volume is one of the clearest risk factors."],
      ["Fine, as long as velocity is rising", "Rising velocity adds load rather than offsetting it."],
      ["Fine, if they stretch more", "Stretching does not offset annual throwing volume."],
      ["Move them to catcher on off days", "Catching adds throwing volume and raises risk further."],
    ], 0),
    q(2, "What is the most consistent behavior linked to arm injury in adolescent pitchers?", [
      ["Pitching while fatigued or in pain", "Correct. Injured pitchers had more often pitched tired or with arm pain."],
      ["Throwing curveballs in practice only", "Pitch type was associated with pain, but fatigue and pain are the strongest signals."],
      ["Warming up too long", "Warm-up length was not the problem."],
      ["Lifting weights in the offseason", "Strength work is part of prevention."],
    ], 0),
    q(3, "In high school pitchers, how did external-rotation strengthening compare with sleeper stretching?", [
      ["Strengthening was at least as good, with a lower injury rate", "Correct. The strength group's injury rate was less than half the stretch group's."],
      ["Stretching was far better", "The trial found the opposite trend."],
      ["Both made injuries more likely", "Neither increased injuries; strengthening did better."],
      ["They were never compared", "A 2022 randomized trial compared them directly."],
    ], 0),
    q(4, "Which statement about softball windmill pitchers is supported?", [
      ["Shoulder and elbow loads are similar to baseball pitching, and there were no pitch-count rules as of 2023", "Correct. Coaches have to track pitches and games themselves."],
      ["Underhand pitching places no stress on the arm", "The windmill pitch places high loads, especially on the biceps."],
      ["Softball pitchers cannot develop overuse injuries", "Overuse injuries of the front of the shoulder and biceps are common."],
      ["Fatigue does not build across a game", "Pain and fatigue rose across a game and a season."],
    ], 0),
    q(5, "What did a year-long warm-up trial in 9 to 11 year old baseball players include?", [
      ["Stretches including the back of the shoulder and the hip, dynamic mobility drills and balance exercises", "Correct. Arm injuries fell by nearly half and ball speed tended to rise."],
      ["Weighted ball throws only", "Weighted balls did not change velocity in other studies and were not this program."],
      ["Long-toss to maximum distance every day", "That would add volume rather than reduce injury."],
      ["Nothing for the lower body", "The hip and balance work were part of the program."],
    ], 0),
    q(6, "Why is a strong lower body and trunk part of arm care?", [
      ["The throw is a chain; when the legs and trunk do their share, the shoulder and elbow carry less load", "Correct. Trunk-driven javelin technique gave more speed with less joint load."],
      ["It is not; only shoulder exercises matter", "The evidence points to the whole chain."],
      ["Because heavier athletes throw harder", "Body mass is not the mechanism described."],
      ["Leg strength replaces the need for pitch counts", "Nothing replaces volume control."],
    ], 0),
    q(7, "A pitcher returning from an elbow injury feels great in week two of an interval throwing program. What should the coach do?", [
      ["Keep to the clinician's criteria-based plan without adding extra throwing", "Correct. The plan's steps protect the athlete from a second injury."],
      ["Let them pitch a full game", "Skipping steps is how a return fails."],
      ["Add a showcase to test the arm", "Showcases predicted injury even in healthy pitchers."],
      ["Stop the program and switch to sleeper stretches only", "The return sequence is clinician-led and should be followed."],
    ], 0),
  ],
};
