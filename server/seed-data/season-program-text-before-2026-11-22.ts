/**
 * THE SEASON PROGRAMS' TEXT AS FIRST SHIPPED (2026-11-22), BEFORE THE AGE LINES CAME OUT. FROZEN.
 *
 * Scott, 2026-11-22: "underage athletes can do whatever they want, as an exercise professional, age
 * doesn't matter in the weight room, its about weight room proficiency". The audience lines in
 * server/seed-data/season-programs/ said "Not for athletes under 14" and "(14 and older)"; they now
 * name the sport and, where a program loads a barbell, the proficiency rule instead.
 *
 * Production already holds those programs (created once by exact name, never re-synced), so the
 * one-shot in server/seed-season-programs.ts rewrites a stored description or layer note ONLY when
 * it still equals what this OLD text produced. An admin's own edit is never overwritten. This file
 * holds only the fields that changed, keyed by program name, and is never edited again.
 */
export type SeasonProgramTextBefore = {
  audience?: string;
  girlsTeamNote?: string;
  positionNotes?: Record<string, string>;
};

export const SEASON_PROGRAM_TEXT_BEFORE_2026_11_22: Readonly<Record<string, SeasonProgramTextBefore>> = {
  "American Football Off-Season": {
    "audience": "For high school athletes in american football. Not for athletes under 14."
  },
  "American Football Pre-Season": {
    "audience": "For high school athletes in american football. Not for athletes under 14."
  },
  "American Football In-Season": {
    "audience": "For high school athletes in american football. Not for athletes under 14."
  },
  "American Football Post-Season": {
    "audience": "For high school athletes in american football. Not for athletes under 14."
  },
  "Rugby Off-Season": {
    "audience": "For high school athletes in rugby. Not for athletes under 14."
  },
  "Rugby Pre-Season": {
    "audience": "For high school athletes in rugby. Not for athletes under 14."
  },
  "Rugby In-Season": {
    "audience": "For high school athletes in rugby. Not for athletes under 14."
  },
  "Rugby Post-Season": {
    "audience": "For high school athletes in rugby. Not for athletes under 14."
  },
  "Wrestling Off-Season": {
    "audience": "For high school athletes in wrestling. Not for athletes under 14."
  },
  "Wrestling Pre-Season": {
    "audience": "For high school athletes in wrestling. Not for athletes under 14."
  },
  "Wrestling In-Season": {
    "audience": "For high school athletes in wrestling. Not for athletes under 14."
  },
  "Wrestling Post-Season": {
    "audience": "For high school athletes in wrestling. Not for athletes under 14."
  },
  "Ice Hockey Off-Season": {
    "audience": "For high school athletes in ice hockey. Not for athletes under 14."
  },
  "Ice Hockey Pre-Season": {
    "audience": "For high school athletes in ice hockey. Not for athletes under 14."
  },
  "Ice Hockey In-Season": {
    "audience": "For high school athletes in ice hockey. Not for athletes under 14."
  },
  "Ice Hockey Post-Season": {
    "audience": "For high school athletes in ice hockey. Not for athletes under 14."
  },
  "Lacrosse Off-Season": {
    "audience": "For high school athletes in lacrosse. Not for athletes under 14."
  },
  "Lacrosse Pre-Season": {
    "audience": "For high school athletes in lacrosse. Not for athletes under 14."
  },
  "Lacrosse In-Season": {
    "audience": "For high school athletes in lacrosse. Not for athletes under 14."
  },
  "Lacrosse Post-Season": {
    "audience": "For high school athletes in lacrosse. Not for athletes under 14."
  },
  "Field Hockey Off-Season": {
    "audience": "For high school athletes in field hockey. Not for athletes under 14."
  },
  "Field Hockey Pre-Season": {
    "audience": "For high school athletes in field hockey. Not for athletes under 14."
  },
  "Field Hockey In-Season": {
    "audience": "For high school athletes in field hockey. Not for athletes under 14."
  },
  "Field Hockey Post-Season": {
    "audience": "For high school athletes in field hockey. Not for athletes under 14."
  },
  "Cheer and Dance Off-Season": {
    "audience": "For high school athletes in cheer and dance (cheerleading and dance teams). Not for athletes under 14."
  },
  "Cheer and Dance Pre-Season": {
    "audience": "For high school athletes in cheer and dance (cheerleading and dance teams). Not for athletes under 14."
  },
  "Cheer and Dance In-Season": {
    "audience": "For high school athletes in cheer and dance (cheerleading and dance teams). Not for athletes under 14."
  },
  "Cheer and Dance Post-Season": {
    "audience": "For high school athletes in cheer and dance (cheerleading and dance teams). Not for athletes under 14."
  },
  "Basketball Off-Season": {
    "audience": "For high school basketball players, boys and girls, guards and posts."
  },
  "Basketball Pre-Season": {
    "audience": "For high school basketball players, boys and girls, guards and posts."
  },
  "Basketball In-Season": {
    "audience": "For high school basketball players, boys and girls, guards and posts."
  },
  "Basketball Post-Season": {
    "audience": "For high school athletes finishing a basketball season."
  },
  "Volleyball Off-Season": {
    "audience": "For high school volleyball players: setters, attackers and liberos."
  },
  "Volleyball Pre-Season": {
    "audience": "For high school volleyball players: setters, attackers and liberos."
  },
  "Volleyball In-Season": {
    "audience": "For high school volleyball players: setters, attackers and liberos."
  },
  "Volleyball Post-Season": {
    "audience": "For high school athletes finishing a volleyball season."
  },
  "Soccer Off-Season": {
    "audience": "For high school soccer players: field players and goalkeepers, boys and girls."
  },
  "Soccer Pre-Season": {
    "audience": "For high school soccer players: field players and goalkeepers, boys and girls."
  },
  "Soccer In-Season": {
    "audience": "For high school soccer players: field players and goalkeepers, boys and girls."
  },
  "Soccer Post-Season": {
    "audience": "For high school athletes finishing a soccer season."
  },
  "Tennis Off-Season": {
    "audience": "For high school tennis players, singles and doubles."
  },
  "Tennis Pre-Season": {
    "audience": "For high school tennis players, singles and doubles."
  },
  "Tennis In-Season": {
    "audience": "For high school tennis players, singles and doubles."
  },
  "Tennis Post-Season": {
    "audience": "For high school athletes finishing a tennis season."
  },
  "Golf Off-Season": {
    "audience": "For high school golfers."
  },
  "Golf Pre-Season": {
    "audience": "For high school golfers."
  },
  "Golf In-Season": {
    "audience": "For high school golfers."
  },
  "Golf Post-Season": {
    "audience": "For high school athletes finishing a golf season."
  },
  "Baseball Off-Season": {
    "audience": "For high school baseball players: pitchers, catchers and position players."
  },
  "Baseball Pre-Season": {
    "audience": "For high school baseball players: pitchers, catchers and position players."
  },
  "Baseball In-Season": {
    "audience": "For high school baseball players: pitchers, catchers and position players."
  },
  "Baseball Post-Season": {
    "audience": "For high school athletes finishing a baseball season."
  },
  "Softball Off-Season": {
    "audience": "For high school softball players: pitchers, catchers and position players."
  },
  "Softball Pre-Season": {
    "audience": "For high school softball players: pitchers, catchers and position players."
  },
  "Softball In-Season": {
    "audience": "For high school softball players: pitchers, catchers and position players."
  },
  "Softball Post-Season": {
    "audience": "For high school athletes finishing a softball season."
  },
  "Track Sprints and Hurdles Off-Season": {
    "audience": "For high school athletes (14 and older) in the 100 m, 200 m, 400 m and hurdles, coached or training on their own."
  },
  "Track Sprints and Hurdles Pre-Season": {
    "audience": "For high school athletes (14 and older) in the 100 m, 200 m, 400 m and hurdles, coached or training on their own."
  },
  "Track Sprints and Hurdles In-Season": {
    "audience": "For high school athletes (14 and older) in the 100 m, 200 m, 400 m and hurdles, coached or training on their own."
  },
  "Track Sprints and Hurdles Post-Season": {
    "audience": "For high school athletes (14 and older) in the 100 m, 200 m, 400 m and hurdles, coached or training on their own."
  },
  "Track Jumps Off-Season": {
    "audience": "For high school athletes (14 and older) in the long jump, triple jump, high jump and pole vault, coached or training on their own.",
    "girlsTeamNote": "High school girls in the jumps have more ankle sprains and more practice injuries, so the landing and balance work gets a little more time. Keep landing work at 15-20 minutes, 2-3 times a week, counting practice warm-ups."
  },
  "Track Jumps Pre-Season": {
    "audience": "For high school athletes (14 and older) in the long jump, triple jump, high jump and pole vault, coached or training on their own.",
    "girlsTeamNote": "High school girls in the jumps have more ankle sprains and more practice injuries, so the landing and balance work gets a little more time. Keep landing work at 15-20 minutes, 2-3 times a week, counting practice warm-ups."
  },
  "Track Jumps In-Season": {
    "audience": "For high school athletes (14 and older) in the long jump, triple jump, high jump and pole vault, coached or training on their own.",
    "girlsTeamNote": "High school girls in the jumps have more ankle sprains and more practice injuries, so the landing and balance work gets a little more time. Keep landing work at 15-20 minutes, 2-3 times a week, counting practice warm-ups."
  },
  "Track Jumps Post-Season": {
    "audience": "For high school athletes (14 and older) in the long jump, triple jump, high jump and pole vault, coached or training on their own."
  },
  "Track Throws Off-Season": {
    "audience": "For high school athletes (14 and older) in the shot put, discus and javelin, coached or training on their own."
  },
  "Track Throws Pre-Season": {
    "audience": "For high school athletes (14 and older) in the shot put, discus and javelin, coached or training on their own."
  },
  "Track Throws In-Season": {
    "audience": "For high school athletes (14 and older) in the shot put, discus and javelin, coached or training on their own."
  },
  "Track Throws Post-Season": {
    "audience": "For high school athletes (14 and older) in the shot put, discus and javelin, coached or training on their own."
  },
  "Cross Country and Distance Off-Season": {
    "audience": "For high school athletes (14 and older) in cross country and the 800 m through 3200 m, coached or training on their own.",
    "girlsTeamNote": "High school girls in cross country have higher injury and re-injury rates and twice the bone stress injuries. Extra balance and landing work in the warm-up helps; so do eating enough for the training, playing other sports through the year, and asking a clinician about missed periods. Aim for 15-20 minutes of this work 2-3 times a week, counting practice warm-ups."
  },
  "Cross Country and Distance Pre-Season": {
    "audience": "For high school athletes (14 and older) in cross country and the 800 m through 3200 m, coached or training on their own.",
    "girlsTeamNote": "High school girls in cross country have higher injury and re-injury rates and twice the bone stress injuries. Extra balance and landing work in the warm-up helps; so do eating enough for the training, playing other sports through the year, and asking a clinician about missed periods. Aim for 15-20 minutes of this work 2-3 times a week, counting practice warm-ups."
  },
  "Cross Country and Distance In-Season": {
    "audience": "For high school athletes (14 and older) in cross country and the 800 m through 3200 m, coached or training on their own.",
    "girlsTeamNote": "High school girls in cross country have higher injury and re-injury rates and twice the bone stress injuries. Extra balance and landing work in the warm-up helps; so do eating enough for the training, playing other sports through the year, and asking a clinician about missed periods. Aim for 15-20 minutes of this work 2-3 times a week, counting practice warm-ups."
  },
  "Cross Country and Distance Post-Season": {
    "audience": "For high school athletes (14 and older) in cross country and the 800 m through 3200 m, coached or training on their own."
  },
  "Swimming Off-Season": {
    "audience": "For high school athletes (14 and older) in swimming, coached or training on their own.",
    "positionNotes": {
      "Distance": "Shoulder pain in teenage swimmers tracks weekly yardage; avoid sudden jumps in volume."
    }
  },
  "Swimming Pre-Season": {
    "audience": "For high school athletes (14 and older) in swimming, coached or training on their own.",
    "positionNotes": {
      "Distance": "Shoulder pain in teenage swimmers tracks weekly yardage; avoid sudden jumps in volume."
    }
  },
  "Swimming In-Season": {
    "audience": "For high school athletes (14 and older) in swimming, coached or training on their own.",
    "positionNotes": {
      "Distance": "Shoulder pain in teenage swimmers tracks weekly yardage; avoid sudden jumps in volume."
    }
  },
  "Swimming Post-Season": {
    "audience": "For high school athletes (14 and older) in swimming, coached or training on their own."
  },
  "Rowing Off-Season": {
    "audience": "For high school athletes (14 and older) in rowing, coached or training on their own."
  },
  "Rowing Pre-Season": {
    "audience": "For high school athletes (14 and older) in rowing, coached or training on their own."
  },
  "Rowing In-Season": {
    "audience": "For high school athletes (14 and older) in rowing, coached or training on their own."
  },
  "Rowing Post-Season": {
    "audience": "For high school athletes (14 and older) in rowing, coached or training on their own."
  },
  "Full-Body Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Full-Body Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Lower-Body Day Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Lower-Body Day Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Upper-Body Day Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Upper-Body Day Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Sprint Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Sprint Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Plyometric and Jumping Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Plyometric and Jumping Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Change-of-Direction Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Change-of-Direction Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Throwing and Overhead Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Throwing and Overhead Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Olympic Lifting Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Olympic Lifting Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Ankle-Focused Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Ankle-Focused Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Knee-Focused Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Knee-Focused Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Hip and Groin-Focused Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Hip and Groin-Focused Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Shoulder-Focused Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Shoulder-Focused Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Back and Trunk-Focused Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Back and Trunk-Focused Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Wrist and Elbow-Focused Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Wrist and Elbow-Focused Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Neck-Focused (Contact Sports) Warm-Up (Quick)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Neck-Focused (Contact Sports) Warm-Up (Full)": {
    "audience": "For high school athletes (not for under-14s) of any sport who want a structured warm-up before training."
  },
  "Football Game-Day Warm-Up": {
    "audience": "For high school athletes on a football team, on game or meet day."
  },
  "Rugby Game-Day Warm-Up": {
    "audience": "For high school athletes on a rugby team, on game or meet day."
  },
  "Wrestling Game-Day Warm-Up": {
    "audience": "For high school athletes on a wrestling team, on game or meet day."
  },
  "Ice Hockey Game-Day Warm-Up": {
    "audience": "For high school athletes on a ice hockey team, on game or meet day."
  },
  "Lacrosse Game-Day Warm-Up": {
    "audience": "For high school athletes on a lacrosse team, on game or meet day."
  },
  "Field Hockey Game-Day Warm-Up": {
    "audience": "For high school athletes on a field hockey team, on game or meet day."
  },
  "Cheer and Dance Game-Day Warm-Up": {
    "audience": "For high school athletes on a cheer and dance team, on game or meet day."
  },
  "Basketball Game-Day Warm-Up": {
    "audience": "For high school athletes on a basketball team, on game or meet day."
  },
  "Volleyball Game-Day Warm-Up": {
    "audience": "For high school athletes on a volleyball team, on game or meet day."
  },
  "Soccer Game-Day Warm-Up": {
    "audience": "For high school athletes on a soccer team, on game or meet day."
  },
  "Tennis Game-Day Warm-Up": {
    "audience": "For high school athletes on a tennis team, on game or meet day."
  },
  "Golf Game-Day Warm-Up": {
    "audience": "For high school athletes on a golf team, on game or meet day."
  },
  "Baseball Game-Day Warm-Up": {
    "audience": "For high school athletes on a baseball team, on game or meet day."
  },
  "Softball Game-Day Warm-Up": {
    "audience": "For high school athletes on a softball team, on game or meet day."
  },
  "Track Sprints and Hurdles Game-Day Warm-Up": {
    "audience": "For high school athletes on a track sprints and hurdles team, on game or meet day."
  },
  "Track Jumps Game-Day Warm-Up": {
    "audience": "For high school athletes on a track jumps team, on game or meet day."
  },
  "Track Throws Game-Day Warm-Up": {
    "audience": "For high school athletes on a track throws team, on game or meet day."
  },
  "Cross Country and Distance Game-Day Warm-Up": {
    "audience": "For high school athletes on a cross country and distance team, on game or meet day."
  },
  "Swimming Game-Day Warm-Up": {
    "audience": "For high school athletes on a swimming team, on game or meet day."
  },
  "Rowing Game-Day Warm-Up": {
    "audience": "For high school athletes on a rowing team, on game or meet day."
  },
  "Shoulder Return to Training": {
    "audience": "For high school athletes coming back to training after a shoulder injury, once a clinician has cleared them to start."
  },
  "Elbow Return to Training": {
    "audience": "For high school athletes coming back to training after a elbow injury, once a clinician has cleared them to start."
  },
  "Wrist Return to Training": {
    "audience": "For high school athletes coming back to training after a wrist injury, once a clinician has cleared them to start."
  },
  "Back and Trunk Return to Training": {
    "audience": "For high school athletes coming back to training after a back and trunk injury, once a clinician has cleared them to start."
  },
  "Hip and Groin Return to Training": {
    "audience": "For high school athletes coming back to training after a hip and groin injury, once a clinician has cleared them to start."
  },
  "Knee Return to Training": {
    "audience": "For high school athletes coming back to training after a knee injury, once a clinician has cleared them to start."
  },
  "Ankle Return to Training": {
    "audience": "For high school athletes coming back to training after a ankle injury, once a clinician has cleared them to start."
  },
  "Neck Return to Training": {
    "audience": "For high school athletes coming back to training after a neck injury, once a clinician has cleared them to start."
  }
};
