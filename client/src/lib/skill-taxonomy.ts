// Suggested chips for the free-text `skillType` field on skill_exercises --
// same pattern as MOVEMENT_TYPES/SPORTS in exercise-taxonomy.ts: a plain
// text column with canonical suggestions, but a coach can type anything.
// A skill type is deliberately reused across sports where the real-world
// vocabulary already overlaps (Shooting covers Basketball/Soccer/Lacrosse/
// Hockey; Passing covers Soccer/Volleyball/Football/Basketball) -- the
// `sports` tag on each drill, not the skill type, is what actually
// differentiates them.
export const SKILL_TYPES = [
  // Baseball/Softball
  "Hitting",
  "Fielding",
  "Throwing",
  "Catching",
  "Pitching",
  // Basketball
  "Shooting",
  "Ball Handling",
  "Post Moves",
  "Defense",
  // Soccer
  "Ball Control",
  "Dribbling",
  "Defending",
  "Goalkeeping",
  // Volleyball
  "Serving",
  "Setting",
  "Attacking",
  "Blocking",
  // Shared: Basketball/Soccer/Volleyball/Football
  "Passing",
  // Football
  "Route Running",
  "Blocking (Football)",
  "Tackling",
  "QB Mechanics",
  "Kicking",
  // Lacrosse/Hockey
  "Stick Handling",
  "Dodging",
  "Face-offs",
  "Skating",
  "Goaltending",
  // Tennis
  "Groundstrokes",
  "Serve",
  "Net Play",
  // Golf
  "Full Swing",
  "Short Game",
  "Putting",
  // Wrestling
  "Takedowns",
  "Escapes",
  "Par Terre",
  // Track & Field
  "Sprint Mechanics",
  "Starts",
  "Jumps & Throws",
  // Cross-sport
  "Footwork",
  "Agility",
];

// Fixed-position equipment grid for the skill picker's accordion, same
// "same button, same grid cell, every sport" guarantee as
// shared/exercise-family.ts's EQUIPMENT_ORDER -- generic training gear
// first (works across every sport), sport-specific implements after.
export const SKILL_EQUIPMENT = [
  "None",
  "Balls",
  "Cones",
  "Agility Ladder",
  "Resistance Band",
  "Medicine Ball",
  "Stopwatch",
  "Net",
  "Wall",
  "Partner",
  "Mirror or Camera",
  "Bat",
  "Batting Tee",
  "Glove",
  "Catcher's Gear",
  "Mound",
  "Screen",
  "Bases",
  "Basketball",
  "Soccer Ball",
  "Volleyball",
  "Football",
  "Kicking Tee",
  "Blocking Sled",
  "Lacrosse Stick",
  "Hockey Stick",
  "Puck",
  "Tennis Racquet",
  "Golf Clubs",
  "Wrestling Mat",
  "Starting Blocks",
];
