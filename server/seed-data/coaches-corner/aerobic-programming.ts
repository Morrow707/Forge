import { q, type SeedAcademyTrack } from "./types";

export const AEROBIC_PROGRAMMING_TRACK: SeedAcademyTrack = {
  title: "Aerobic Endurance Programming",
  description:
    "For the distance runner, the swimmer, the rower and the midfielder: how to build an aerobic engine with the right mix of easy volume, threshold work and intervals, and how to keep strength in the plan.",
  keyPrinciplesForAi:
    "Aerobic endurance is built mostly on easy volume, with a smaller share of harder work at and above the threshold where effort stops being sustainable; most athletes do their easy work too hard and their hard work too easy, and fixing that is the first intervention. Intensity is set by feel and breathing, by pace on a known course, or by heart rate, and a coach picks the simplest one the athlete can use honestly. The week is a few easy sessions, one threshold session, one interval session at most, and a long session, built up gradually, with volume rising before intensity. Strength training belongs in an endurance athlete's week: it improves economy and protects tendons, and two short sessions of heavy, low-rep work do not add bulk. Taper by cutting volume and keeping some intensity. Watch for the same under-recovery signals as any athlete, and in endurance athletes watch especially for low energy availability, because the volume and the culture both push toward it.",
  lessons: [
    {
      lessonNumber: 1,
      title: "Easy Is Easy, Hard Is Hard",
      estMinutes: 6,
      content:
        "The aerobic engine is built mostly on volume at an intensity the athlete can sustain comfortably, with a smaller share of harder work layered on top. The most common fault in a developing endurance athlete's training is that the easy days are not easy, because effort feels like progress, and so the hard days cannot be hard, because the athlete arrives at them tired. The result is a lot of medium-intensity work that builds the engine slowly and leaves the athlete flat.\n\nThe fix is a clear separation. Easy work is a pace at which the athlete can hold a conversation in full sentences, breathing through the nose is possible for much of it, and the session could be repeated tomorrow. This is where the bulk of the volume goes, because it is where the body builds capillaries, aerobic enzymes and the heart's capacity with the least recovery cost. Hard work is at or above the threshold where breathing becomes labored and the effort could not be held for more than something like an hour, or short intervals above that. Hard days are hard, they are few, and they are followed by easy days.\n\nA rough split that works for most developing athletes is roughly four-fifths of the weekly time easy and one-fifth hard. The precise ratio matters less than the honesty of the categories. An athlete who runs every session at the same medium pace is doing neither.\n\nIntensity can be set three ways and a coach picks the simplest the athlete can use truthfully. Feel and breathing, the talk test, costs nothing and works for most. Pace on a known course, from a recent time trial, works for runners and swimmers with a measured distance. Heart rate works for athletes with a monitor and a coach who knows that heart rate drifts upward with heat, dehydration and fatigue, so a number alone is not the whole story. Whichever is used, the easy zone has to be genuinely easy, which usually feels embarrassingly slow to a competitive teenager. Say that out loud so they stop fighting it.",
    },
    {
      lessonNumber: 2,
      title: "The Sessions and the Week",
      estMinutes: 7,
      content:
        "An endurance week is built from a handful of session types, and their arrangement matters more than any one of them.\n\nEasy sessions are the foundation: thirty to sixty minutes at conversational pace, three to five of them a week depending on the athlete's age and training age. They are not junk. They are the engine.\n\nThe long session is one easy session stretched: the longest single effort of the week, built up gradually over a block, at an easy pace throughout. It develops the body's ability to spare its limited carbohydrate and run on fat, and it is where the aerobic adaptation is largest per session. One a week, and never the day before a hard session.\n\nThe threshold session is sustained work at the edge of what can be held: twenty to forty minutes total, either continuous or in long pieces with short rests, at a pace the athlete could race for roughly an hour. It raises the pace the athlete can sustain and it is the most sport-specific session for anything from the mile up. One a week.\n\nThe interval session is shorter pieces above threshold, two to five minutes each with roughly equal rest, at close to the pace of a race lasting ten to fifteen minutes. It raises the ceiling of the aerobic system. One a week at most, and for a younger or newer athlete, none for the first block while the base is built.\n\nA week for a developing athlete: easy, threshold, easy, easy or off, intervals or a second threshold, easy, long. Hard days separated by at least one easy day. Volume rises first across a block, by no more than something like ten percent a week, and intensity is added once the volume is in place. A lighter week every third or fourth lets the adaptation land.\n\nFor the field-sport athlete who needs an aerobic base but not a runner's engine, the same structure applies at a smaller scale: two or three easy sessions and one threshold or interval session in the off-season, with the sport's own game-shaped conditioning taking over as the season approaches. The energy systems track covers the handover.",
    },
    {
      lessonNumber: 3,
      title: "Strength for the Endurance Athlete",
      estMinutes: 6,
      content:
        "Endurance athletes and their coaches often avoid the weight room, out of a fear of bulk or a belief that the time is better spent on volume. The evidence runs the other way. Heavy, low-repetition strength work improves economy, the energy cost of holding a pace, in runners, cyclists and rowers, and it strengthens the tendons and bones that endurance volume wears down. It does not add meaningful muscle mass at the doses an endurance athlete uses, because the volume is low and the endurance training itself blunts growth.\n\nThe program is short and heavy, not long and light. Two sessions a week of thirty to forty minutes: a squat or single-leg pattern, a hinge, a push, a pull, and some trunk work, in the strength range of three to six reps at loads that are genuinely heavy for the athlete, with full rests. Explosive work, low-level plyometrics and jumps, adds stiffness in the tendons that returns energy on every stride. High-repetition circuits with light weights, the thing most endurance athletes do if they lift at all, train none of this.\n\nPlacement in the week follows the same logic as everywhere else: strength work goes after an easy session or on its own, never immediately before the key threshold or interval session, and the heavy day is kept away from the long day. In-season, one session a week at the same intensity and lower volume holds what was built.\n\nThe coach should expect resistance and answer it with specifics. Economy improvements of a few percent from a strength block are the difference between places in a race. Tendon injuries, the plague of endurance athletes, drop with strength work. And the female endurance athlete, who is at the highest risk of stress fractures and low bone density, benefits most of all from loading the skeleton. Two short sessions a week is the dose; it costs little and it is one of the best-supported interventions in the sport.",
    },
    {
      lessonNumber: 4,
      title: "Tapering, Monitoring and the Fuel Problem",
      estMinutes: 6,
      content:
        "A taper is the reduction of training before a key competition so that fatigue drops faster than fitness. For endurance athletes the pattern is well established: cut the volume substantially over the final one to three weeks, by something like forty to sixty percent at its deepest, while keeping some sessions at race intensity so the athlete stays sharp. Cutting intensity as well as volume leaves the athlete flat; cutting nothing leaves them tired. The length depends on the event and the athlete; a two-week taper for a championship is a reasonable starting point and the athlete's own history refines it.\n\nMonitoring an endurance athlete uses the same signals as any athlete, with a few that are specific. Resting heart rate on waking, trended. Heart rate at a standard easy pace: if it climbs over weeks, the athlete is accumulating fatigue. Sleep, mood and appetite. Pace at a fixed easy effort drifting slower. A simple weekly log of these, kept by the athlete and read by the coach, catches a decline before a race does.\n\nThe fuel problem deserves its own paragraph because endurance sport is where it concentrates. The volume is high, the culture rewards leanness, and the athletes are often conscientious to a fault. Low energy availability, the state in which food does not cover training and living, is common, under-recognized, and damaging: bone density, hormones, immunity, iron status and performance all decline, and in girls the menstrual cycle changes or stops. The signs are in the fueling track; the specific endurance warnings are frequent stress fractures, recurring illness, a plateau or decline despite good training, and an athlete who is getting thinner while training hard. The coach does not manage this; the coach notices early, says something, and refers to a physician and a dietitian who know athletes. Iron in particular is worth a conversation with a physician for any endurance athlete, and especially a female one, who is unusually fatigued.\n\nThe last word is on patience. The aerobic engine takes years to build and responds to consistency more than to any single heroic block. An athlete who trains sensibly for three years beats one who trains brilliantly for three months and then is hurt.",
    },
  ],
  quizQuestions: [
    q(0, "What is the most common fault in a developing endurance athlete's training?", [
      ["Easy days too hard, so hard days cannot be hard", "Correct. The result is medium-intensity work that builds the engine slowly and leaves the athlete flat."],
      ["Too much rest", "Rest is rarely the problem; intensity discipline is."],
      ["Too many intervals", "Intervals are usually too few and too slow because the athlete arrives tired."],
      ["Running on the wrong surface", "Surface matters a little; intensity distribution matters a lot."],
    ], 0),
    q(1, "What is the simplest honest test of easy pace?", [
      ["Full-sentence conversation is possible", "Correct. The talk test costs nothing and works for most athletes."],
      ["The athlete feels like they are working", "Feeling like work is usually the medium zone, not easy."],
      ["Heart rate alone", "Heart rate drifts with heat and fatigue; it needs context."],
      ["It is the pace of the last race", "Race pace is far above easy."],
    ], 0),
    q(2, "Which session raises the pace an athlete can sustain for an event from the mile up?", [
      ["The threshold session", "Correct. Sustained work at the edge of what can be held is the most race-specific session."],
      ["The easy session", "Easy work builds the base, not the sustainable race pace."],
      ["Sprinting", "Sprinting trains speed, not sustained pace."],
      ["Stretching", "Mobility does not raise sustainable pace."],
    ], 0),
    q(3, "How should volume and intensity be added across a block?", [
      ["Volume first, gradually, then intensity once the volume is in place", "Correct. Something like ten percent a week, with a lighter week every third or fourth."],
      ["Both at once, as fast as possible", "That is how injuries and overreaching happen."],
      ["Intensity first", "Intensity on a thin base is poorly tolerated."],
      ["Neither; keep everything constant", "The engine grows with progressive volume."],
    ], 0),
    q(4, "What kind of strength work benefits an endurance athlete?", [
      ["Short, heavy, low-rep sessions twice a week, with some explosive work", "Correct. It improves economy and protects tendons without adding bulk."],
      ["High-repetition light circuits", "That trains none of the qualities that help."],
      ["No strength work; it adds bulk", "At endurance doses it does not add meaningful mass."],
      ["Daily long bodyweight sessions", "Volume is not the point; intensity is."],
    ], 0),
    q(5, "Which athlete benefits most from loading the skeleton, according to the track?", [
      ["The female endurance athlete, at highest risk of stress fractures and low bone density", "Correct. Strength work is one of the best-supported interventions for her."],
      ["The sprinter", "Sprinters benefit, but the track names the female endurance athlete as benefiting most."],
      ["No one; endurance athletes should avoid loading", "The evidence runs the other way."],
      ["Only male rowers", "Rowers benefit, but the bone argument applies most strongly elsewhere."],
    ], 0),
    q(6, "What does a taper cut, and what does it keep?", [
      ["Cuts volume substantially; keeps some race-intensity work", "Correct. Fatigue drops faster than fitness, and the athlete stays sharp."],
      ["Cuts everything", "Cutting intensity too leaves the athlete flat."],
      ["Cuts intensity, keeps volume", "That keeps the fatigue and loses the sharpness."],
      ["Changes nothing", "The athlete arrives tired."],
    ], 0),
    q(7, "An endurance athlete is getting thinner while training hard, has had two stress fractures and is plateauing. What does the coach do?", [
      ["Notice early, say something, and refer to a physician and a dietitian who know athletes", "Correct. Low energy availability is common in endurance sport and the coach does not manage it alone."],
      ["Add volume to break the plateau", "The plateau is likely under-fueling; more volume deepens it."],
      ["Praise the leanness", "A comment on the body, and the wrong message entirely."],
      ["Wait and see", "Early action changes the outcome; waiting costs bone and seasons."],
    ], 0),
  ],
};
