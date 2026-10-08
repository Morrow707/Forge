import { q, type SeedAcademyTrack } from "./types";

export const FACILITY_TRACK: SeedAcademyTrack = {
  title: "The Weight Room as a Facility",
  description:
    "Layout, equipment, scheduling, policies, records and the responsibilities that come with running a room full of heavy things and teenagers. The administrative side of strength coaching that nobody teaches and everybody is judged on.",
  keyPrinciplesForAi:
    "A weight room is laid out so the coach can see every athlete from anywhere, with the heaviest and most dangerous work in the most visible place and traffic flowing without crossing a lift. Equipment is bought for the program the room runs, maintained on a written schedule, and inspected before every session; a broken piece is tagged out, not used carefully. Supervision ratios, access rules, a dress code that is about safety, and a posted code of conduct are written down, taught and enforced the same way for every athlete. Records of attendance, programs, incidents, maintenance and clearances are kept because they protect athletes and the coach both. A coach's duty of care covers supervision, instruction, safe equipment and a safe environment, plus an emergency plan that has been rehearsed; the specifics of liability vary by state and employer and the coach learns their own, keeps their certifications current and never improvises in an area the law has already decided.",
  lessons: [
    {
      lessonNumber: 1,
      title: "Layout: Sightlines and Flow",
      estMinutes: 6,
      content:
        "The first rule of laying out a weight room is that the coach has to be able to see every athlete from anywhere in it. Racks, platforms and machines are arranged so that the coach's path through the room gives a line of sight to everything, with no corners behind equipment where a teenager can be out of view. The heaviest and most dangerous work, the barbell racks and platforms, sits where the coach spends most of their time, usually along the wall opposite the entrance or in the center, not tucked in a back corner.\n\nThe second rule is flow. Athletes move between stations constantly and they should never have to walk through the path of a lift to do it. Platforms get a buffer on all sides, enough that a dropped bar or a missed lift does not reach anyone. Racks are spaced so that two athletes can load plates on neighboring bars without bumping. Dumbbell areas have room to step back from the rack. The main walkway runs along the edge of the room rather than through the middle of the lifting.\n\nThe third rule is grouping. Equipment used together sits together: plates within reach of the racks that use them, medicine balls near the open space where they are thrown, the warm-up area near the door so the room fills from the front. Mirrors, if present, are placed where they help with technique and not where they create a sightline problem or a distraction. Music, if used, is at a level that lets a coach's instruction be heard across the room.\n\nFloors matter. Platforms or thick rubber under anything that can be dropped; a surface that is not slippery; nothing to trip on. Ceiling height is checked against the overhead lifts and jumps the program uses. Ventilation and temperature are part of safety, not comfort: a room at ninety degrees with no airflow is a heat illness waiting for a hard session.\n\nA coach who inherits a room laid out badly does not need a budget to improve it. Moving racks so the sightlines work, creating buffers around platforms by moving a bench, and setting a traffic rule that everyone follows are free and are usually the biggest safety improvement available.",
    },
    {
      lessonNumber: 2,
      title: "Equipment: Buying, Maintaining and Tagging Out",
      estMinutes: 6,
      content:
        "Equipment is bought for the program the room actually runs, not for the program in a catalog. A high-school room with twenty athletes per session needs racks, bars, plates, platforms and benches in numbers that let the session run in stations without long queues, before it needs a single machine. The question for every purchase is how many athletes it serves per hour and what it lets the program do that it could not do before. Durable, simple equipment from a reputable maker outlasts and outperforms anything clever.\n\nMaintenance is scheduled and written down. Bars are inspected for bent shafts, loose sleeves and worn knurling; collars and clips for grip; cable machines for frayed cables and worn pulleys; benches and racks for cracked welds, loose bolts and torn upholstery; platforms and flooring for lifting edges. A monthly checklist, signed and dated, is the record that the room was looked after, and it is also how problems are caught before an athlete finds them with a loaded bar.\n\nBefore every session, a quick walk-through: anything out of place, anything broken, anything on the floor that should not be. It takes two minutes and it is the coach's habit, not an athlete's job.\n\nA broken or suspect piece is tagged out, with a visible sign, and removed from the floor if possible, until it is repaired or replaced. It is never used carefully, or used only by the experienced athletes, or used until the new one arrives. The temptation is real when a rack is out and the session is in an hour; the answer is a different session.\n\nCleanliness is safety too. Sweat on benches and bars spreads skin infections that can take an athlete out for weeks and spread through a team. Wipe-down after use is a rule, supplies are stocked, and the room is cleaned on a schedule. A room that is clean, orderly and in good repair also teaches athletes how to treat it, which is most of the battle for keeping it that way.\n\nWhen something is bought, the manufacturer's instructions for assembly, use and inspection are kept and followed. They exist for a reason, and in the event of an injury they are the standard the coach is measured against.",
    },
    {
      lessonNumber: 3,
      title: "Rules, Supervision and Records",
      estMinutes: 7,
      content:
        "A weight room runs on written rules that everybody knows. Access: who may be in the room, when, and whether anyone may train without a coach present (for minors, the answer is no). Supervision: how many athletes one coach can watch, which depends on the work being done and the athletes' experience, and the coach's judgment is final on a given day. Conduct: no horseplay, no training through pain, collars on bars, spotters for the lifts that need them, equipment returned, phones away during lifting. Dress: closed shoes, clothing that does not catch on equipment and that lets the coach see technique. These are posted, taught at the start of the season, and enforced the same way for the star and the freshman.\n\nSupervision is active. A coach supervising a room is moving, watching, cueing and anticipating, not sitting at a desk or coaching one athlete while the other nineteen are out of sight. The room is arranged so this is possible, which is why layout came first. If the number of athletes exceeds what one coach can supervise for the work being done, the session is changed or another qualified adult is present; the work is not simply allowed to proceed.\n\nRecords are the unglamorous part and they matter more than almost anything else in this track. Attendance, so there is a record of who was in the room when. The program each athlete was on, so there is a record of what was asked of them. Injury and incident reports, written the same day, with what happened, who saw it, and what was done. Maintenance logs. Medical clearances and participation paperwork, kept where the coach can confirm they exist before an athlete trains. Emergency contact information available to the coach in an emergency. Forge keeps the programs and the attendance; the rest is the coach's filing, and it needs to exist.\n\nRecords protect athletes because they are how patterns are seen: the athlete who was in the room for every session and still got hurt, the piece of equipment that keeps appearing in incident reports, the clearance that was never on file. They protect the coach because, in the event of a serious injury, the question asked will be what the coach did, and the record is the answer. A coach who kept good records and followed their own rules is in a very different position from one who did not.",
    },
    {
      lessonNumber: 4,
      title: "Duty of Care, Emergencies and Staying Current",
      estMinutes: 6,
      content:
        "A coach responsible for athletes owes them a duty of care. In practice that covers four things: supervising the activity properly, instructing athletes correctly in what they are asked to do, providing equipment that is safe and used as intended, and keeping the environment safe. Every lesson in this track and the safety track is about one of those four. Where a coach fails one of them and an athlete is hurt as a result, the coach and the program can be held responsible, and the standard applied is what a reasonable, trained coach would have done.\n\nThe specifics of that responsibility vary by state, by employer, and by whether the coach is an employee, a volunteer or a contractor. This track cannot tell a coach their own legal position; the school's administration, the athletic director and the governing body can, and the coach should ask once a season rather than assume. Insurance, the employer's and the coach's own, is part of that conversation. The participation paperwork, the medical clearance and the waiver that Forge helps collect are also part of it; a coach who trains an athlete without the required paperwork on file has removed one of their own protections.\n\nThe emergency action plan from the safety track belongs here too, because it is the duty of care in its sharpest form. Who calls, who meets the ambulance, where the defibrillator is, who stays with the athlete, who contacts the guardian, and how the incident is recorded. It is written, posted, and rehearsed at least once a season with everyone who supervises the room. A plan that lives only in the coach's head is not a plan.\n\nStaying current is the last part. Certifications in first aid, cardiopulmonary resuscitation and defibrillator use are kept valid and the dates are known. Coaching qualifications, where the employer or governing body requires them, are maintained. Continuing education, which Coaches Corner is one form of, is how the standard of a reasonable, trained coach keeps moving and how the coach keeps up with it.\n\nNone of this is why anybody became a coach. All of it is what lets a coach keep doing the part they did become a coach for, with athletes who go home safe every day.",
    },
  ],
  quizQuestions: [
    q(0, "What is the first rule of weight room layout?", [
      ["The coach can see every athlete from anywhere in the room", "Correct. No corners behind equipment where an athlete can be out of view."],
      ["Mirrors on every wall", "Mirrors are placed where they help technique, not everywhere."],
      ["Machines in the center", "The heaviest free-weight work sits where the coach spends their time."],
      ["The loudest speakers possible", "Music stays at a level that lets instruction be heard."],
    ], 0),
    q(1, "A rack has a cracked weld and the session is in an hour. What does the track say?", [
      ["Tag it out, remove it from use, and run a different session", "Correct. A suspect piece is never used carefully or only by experienced athletes."],
      ["Use it only for light work", "Suspect equipment is not used at any load."],
      ["Let only seniors use it", "Experience does not make a cracked weld safe."],
      ["Use it until the replacement arrives", "That is the temptation the track names and refuses."],
    ], 0),
    q(2, "Why is wiping down benches and bars a safety rule rather than a courtesy?", [
      ["Sweat spreads skin infections that can take athletes out for weeks and move through a team", "Correct. Cleanliness is part of a safe environment."],
      ["It keeps the equipment shiny", "Appearance is a side effect, not the reason."],
      ["It is not a safety rule", "The track says it is."],
      ["To make the coach's job easier", "The reason is infection, not convenience."],
    ], 0),
    q(3, "May a minor train in the weight room without a coach present?", [
      ["No", "Correct. Access rules for minors require supervision."],
      ["Yes, if they are experienced", "Experience does not change the access rule for minors."],
      ["Yes, with a parent's note", "A note does not substitute for supervision."],
      ["Only for warm-ups", "No unsupervised access for minors."],
    ], 0),
    q(4, "What does active supervision look like?", [
      ["The coach moving, watching, cueing and anticipating across the whole room", "Correct. Not at a desk, not absorbed in one athlete while the rest are out of sight."],
      ["The coach at a desk with a view of the door", "That is presence, not supervision."],
      ["One athlete coached closely while others train on their own", "The others are unsupervised."],
      ["Checking in every fifteen minutes", "Supervision is continuous."],
    ], 0),
    q(5, "Which records does the track say a coach must keep?", [
      ["Attendance, programs, incident reports, maintenance logs, clearances and emergency contacts", "Correct. They protect athletes by revealing patterns and protect the coach by answering what was done."],
      ["Only personal-record lifts", "Those are nice; the safety records are the ones that matter."],
      ["None; records are the school's job", "The coach keeps the records for the room they run."],
      ["Incident reports only, and only for serious injuries", "All incidents are recorded, the same day."],
    ], 0),
    q(6, "What are the four parts of a coach's duty of care?", [
      ["Proper supervision, correct instruction, safe equipment and a safe environment", "Correct. Every lesson in this track and the safety track serves one of them."],
      ["Winning, discipline, fitness and attendance", "Those are coaching aims, not the duty of care."],
      ["Programming, nutrition, psychology and testing", "Important topics, but not the legal duty."],
      ["There is no duty of care for volunteers", "The duty exists; the specifics vary by role and state, and the coach asks their own."],
    ], 0),
    q(7, "Where does a coach learn their own legal position and insurance situation?", [
      ["From the school's administration, the athletic director and the governing body, asked once a season", "Correct. This track cannot state it; the specifics vary by state and employer."],
      ["From this track", "The track says plainly it cannot tell a coach their own legal position."],
      ["From other coaches online", "Other coaches' situations differ by state and employer."],
      ["It does not matter until something happens", "By then it is too late to ask."],
    ], 0),
  ],
};
