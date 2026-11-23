/**
 * THE EXLIB LIBRARY, 2026-11-23. Generated from the outside exercise spreadsheet Scott handed over
 * ("ExLib 1.0": 1,471 strength and conditioning exercises, each with a YouTube demo), matched row by
 * row against the Forge library with the sheet's own abbreviations spelled out. Scott: "if we have
 * it great works done, copy the video over ... add the exercises we are missing such as the iso
 * holds, and their videos".
 *
 * - EXLIB_VIDEOS_FOR_EXISTING: a Forge exercise or skill drill the sheet already has, and the
 *   sheet's video for it (server/exlib-videos.ts writes it, once).
 * - EXLIB_EXERCISES: what the sheet has and Forge did not, created once by name under the library
 *   owner, Forge-official, with the sheet's video. Instructions are Forge's own words.
 *
 * Loading equipment (barbell, dumbbell, kettlebell, bodyweight) is the same exercise when Forge has
 * one plain entry for the movement; a bracketed variation (isometric hold, eccentric, chains,
 * banded ...) and equipment that changes the movement (landmine, Smith machine, flywheel ...) are
 * their own exercises. Two rows named exercises the 2026-11-22 review retired (Sissy Squat,
 * Decline Bench Press) and were left out; the sheet's testing protocols are not exercises.
 * Generated, so edit by regenerating, not by hand.
 */

export type ExLibVideoForExisting = { name: string; kind: "exercise" | "skill"; url: string; from: string };

export type ExLibExercise = {
  name: string;
  category: "strength" | "conditioning" | "olympic" | "accessory" | "mobility" | "plyometric";
  muscleGroup: string;
  secondaryMuscles?: string[];
  equipment: string;
  movementType: string;
  laterality: "bilateral" | "unilateral";
  instructions: string;
  videoUrl?: string;
};

export const EXLIB_VIDEOS_FOR_EXISTING: readonly ExLibVideoForExisting[] = [
 {
  "name": "90/90 Hip Switch",
  "kind": "exercise",
  "url": "https://youtu.be/rN1ybRcySZc",
  "from": "90-90 Transitions"
 },
 {
  "name": "Ab Wheel Rollout",
  "kind": "exercise",
  "url": "https://youtu.be/lmui4rXagzM",
  "from": "Ab Rollout"
 },
 {
  "name": "Acceleration Sprint Series (10-20 m, Full Rest)",
  "kind": "skill",
  "url": "https://www.youtube.com/watch?v=BaPy0CDouQk",
  "from": "Sprint 5m"
 },
 {
  "name": "Adductor Squeeze (Isometric Ball)",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=_h0djdkjRdI",
  "from": "PB Adductor [IsoHold]"
 },
 {
  "name": "Ankle Dorsiflexion Mobilization",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=XJPur9D0gps",
  "from": "Wall Ankle Mobility Dorsiflexion"
 },
 {
  "name": "Approach Jump",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=hkiLowP7QFg",
  "from": "Approach Vertical Jump"
 },
 {
  "name": "Arnold Press",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=oVqJSA0aj74",
  "from": "DB Arnold Press"
 },
 {
  "name": "Assault Bike Intervals",
  "kind": "exercise",
  "url": "https://youtu.be/gbAuH5d5zWE",
  "from": "AirBike Conditioning"
 },
 {
  "name": "Back Extension",
  "kind": "exercise",
  "url": "https://youtu.be/C4bMFMKK8iM",
  "from": "Machine Hyperextension"
 },
 {
  "name": "Back Squat",
  "kind": "exercise",
  "url": "https://youtu.be/wj6TWVuO7BA",
  "from": "BB Back Squat"
 },
 {
  "name": "Band Pull-Apart",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=NHm-n9xb2MY",
  "from": "Band Pullapart"
 },
 {
  "name": "Banded Ankle Eversion",
  "kind": "exercise",
  "url": "https://youtu.be/aiyuayn7tLI",
  "from": "Banded Ankle Eversion"
 },
 {
  "name": "Banded Ankle Inversion",
  "kind": "exercise",
  "url": "https://youtu.be/HF1LTaxPmMQ",
  "from": "Banded Ankle Inversion"
 },
 {
  "name": "Barbell Bulgarian Split Squat",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=24chxgChn7E",
  "from": "BB RFESS"
 },
 {
  "name": "Barbell Curl",
  "kind": "exercise",
  "url": "https://youtu.be/w85DAElkKk8",
  "from": "BB Bicep Curl"
 },
 {
  "name": "Barbell Good Morning",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=_WV2ODQkqMc",
  "from": "BB Good Morning"
 },
 {
  "name": "Barbell Reverse Lunge",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=UhuJXhB-r5g",
  "from": "BB Reverse Lunge"
 },
 {
  "name": "Barbell Shoulder Press",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=SghcupXGdHA",
  "from": "BB Military Press"
 },
 {
  "name": "Battle Ropes",
  "kind": "exercise",
  "url": "https://youtu.be/0HV1Cn5G17w",
  "from": "BattleRope Conditioning"
 },
 {
  "name": "Bear Crawl",
  "kind": "exercise",
  "url": "https://youtu.be/xgcwHgzJsXg",
  "from": "Bear Crawl"
 },
 {
  "name": "Belt Squat",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=HvzGaj44cn8",
  "from": "Russian Belt Squat"
 },
 {
  "name": "Bench Press",
  "kind": "exercise",
  "url": "https://youtu.be/PQfV-j_jbDw",
  "from": "BB Bench Press"
 },
 {
  "name": "Bent-Over Row",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=PuLk6q2oT5g",
  "from": "BB Standing Bent Over Row"
 },
 {
  "name": "Bird Dog",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=deu5FcPCeMI",
  "from": "Birddog"
 },
 {
  "name": "Bounding",
  "kind": "exercise",
  "url": "https://youtu.be/a1cGESn3EfE",
  "from": "Bounding"
 },
 {
  "name": "Box Jump",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=OYWJ0XjA_jY",
  "from": "Box Jump [ECC-CON]"
 },
 {
  "name": "Box Squat",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=RuAuM_uFPXQ",
  "from": "BB Back Box Squat"
 },
 {
  "name": "Broad Jump",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=xjmx8IxHYWg",
  "from": "Standing Long Jump/Broad Jump"
 },
 {
  "name": "Bulgarian Split Squat",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=zR5vaC01vrU",
  "from": "DB RFESS"
 },
 {
  "name": "Cable Fly",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=1ISK4q8hvmU",
  "from": "Cable Fly"
 },
 {
  "name": "Chest-Supported Row",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=vx6JEH0VErA",
  "from": "DB Bench Bent Over Row"
 },
 {
  "name": "Chin-Up",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=y7RDafigol0",
  "from": "Chin Up"
 },
 {
  "name": "Copenhagen Adduction (Short Lever)",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=g9ZDrmhxl-0",
  "from": "CAE [Knee]"
 },
 {
  "name": "Copenhagen Plank",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=75Ftu1TNIbY",
  "from": "CAE"
 },
 {
  "name": "Couch Stretch",
  "kind": "exercise",
  "url": "https://youtu.be/XUSbk7Jb6VE",
  "from": "Wall Quad Stretch"
 },
 {
  "name": "Countermovement Jump",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=M3m3DMNBSzg",
  "from": "CMJ (HoH)"
 },
 {
  "name": "Curtsy Lunge",
  "kind": "exercise",
  "url": "https://youtu.be/qGqqr2VNYd4",
  "from": "DB Curtsy Lunge"
 },
 {
  "name": "Dead Bug",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=gyrGE-c0o10",
  "from": "Dead Bug"
 },
 {
  "name": "Deadlift",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=dG8c1mJkpV8",
  "from": "BB Conventional Deadlift"
 },
 {
  "name": "Depth Jump",
  "kind": "exercise",
  "url": "https://youtu.be/3IWuxb47J30",
  "from": "Depth Jump"
 },
 {
  "name": "Dip",
  "kind": "exercise",
  "url": "https://youtu.be/-hzIadBRnqQ",
  "from": "BW Dips"
 },
 {
  "name": "Drop Landing and Stick (Two-Foot)",
  "kind": "exercise",
  "url": "https://youtu.be/tzkxuksWrAA",
  "from": "Altitude Landing"
 },
 {
  "name": "Dumbbell Bench Press",
  "kind": "exercise",
  "url": "https://youtu.be/jyK7yFL9-z8",
  "from": "DB Bench Press"
 },
 {
  "name": "Dumbbell Box Step-Up",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=UOCx7g9YGGw",
  "from": "DB Step Up 2-arm]"
 },
 {
  "name": "Dumbbell Curl",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=LH4--W5v870",
  "from": "DB Bicep Curl"
 },
 {
  "name": "Dumbbell Pullover",
  "kind": "exercise",
  "url": "https://youtu.be/YNaFDhCgavQ",
  "from": "DB Pullover"
 },
 {
  "name": "Dumbbell Romanian Deadlift",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=vzMGgTUA3LU",
  "from": "DB RDL [2-arm]"
 },
 {
  "name": "Dumbbell Shoulder Press",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=-yK45bXXAJ0",
  "from": "DB Military Press"
 },
 {
  "name": "Face Pull",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=jhMyvi43_7Q",
  "from": "Cable Face Pull"
 },
 {
  "name": "Falling Start Drill",
  "kind": "skill",
  "url": "https://www.youtube.com/watch?v=zCZfY3FQHjU",
  "from": "Sprint Start [Falling]"
 },
 {
  "name": "Farmer's Carry",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=72oDhpXscCo",
  "from": "UB Carry"
 },
 {
  "name": "Floor Press",
  "kind": "exercise",
  "url": "https://youtu.be/KSn4YSpjXPA",
  "from": "BB Floor Press"
 },
 {
  "name": "Flying 20 Sprint",
  "kind": "skill",
  "url": "https://www.youtube.com/watch?v=O_CHnmfTw4s",
  "from": "Flying 5m"
 },
 {
  "name": "Front Squat",
  "kind": "exercise",
  "url": "https://youtu.be/EC_ciN6PN0o",
  "from": "BB Front Squat"
 },
 {
  "name": "Glute Bridge",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=HJfFBUjin-U",
  "from": "BW Glute Bridge"
 },
 {
  "name": "Glute Ham Raise",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=_AYruNVqRCs",
  "from": "GHR"
 },
 {
  "name": "Goblet Squat",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=mF7VifB20Xg",
  "from": "KB Goblet Squat"
 },
 {
  "name": "Hammer Curl",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=rL26GcHSje8",
  "from": "DB Seated Alternating Hammer Curl"
 },
 {
  "name": "Hang Clean",
  "kind": "exercise",
  "url": "https://youtu.be/mrejP1Z2znw",
  "from": "Clean [Hang]"
 },
 {
  "name": "Hang Power Clean",
  "kind": "exercise",
  "url": "https://youtu.be/cW6tD325ENE",
  "from": "Power Clean [Hang]"
 },
 {
  "name": "Hang Power Snatch",
  "kind": "exercise",
  "url": "https://youtu.be/yo0ydIUIER8",
  "from": "Power Snatch [Hang]"
 },
 {
  "name": "Hang Snatch",
  "kind": "exercise",
  "url": "https://youtu.be/e2sMrF7IOSQ",
  "from": "Snatch [Hang]"
 },
 {
  "name": "Hanging Leg Raise",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=Kc5bH20s-OE",
  "from": "Hanging Leg Raise"
 },
 {
  "name": "Hex Bar Deadlift",
  "kind": "exercise",
  "url": "https://youtu.be/CdMZ-PpWZGs",
  "from": "UB Deadlift"
 },
 {
  "name": "Hex Bar Jump",
  "kind": "exercise",
  "url": "https://youtu.be/WiIBKovokNY",
  "from": "UB CMJ"
 },
 {
  "name": "High Knees",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=zWKFPhhx1Vo",
  "from": "High Knees"
 },
 {
  "name": "Hip Thrust",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=2bC4tvJN5iU",
  "from": "BB Hip Thrust"
 },
 {
  "name": "Hip Turn and Open-Gate Drill",
  "kind": "skill",
  "url": "https://youtu.be/DNNb0JT9Oq8",
  "from": "Hip Turns"
 },
 {
  "name": "Hollow Body Hold",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=kWn_VnlDteQ",
  "from": "Hollow Body Hold"
 },
 {
  "name": "Incline Barbell Bench Press",
  "kind": "exercise",
  "url": "https://youtu.be/xBnhQCog7Kk",
  "from": "BB Incline Bench Press"
 },
 {
  "name": "Incline Dumbbell Press",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=EQADzxY9MxQ",
  "from": "DB Incline Bench Press"
 },
 {
  "name": "Inverted Row",
  "kind": "exercise",
  "url": "https://youtu.be/CYv9tkmDmPU",
  "from": "Bar Inverted Row"
 },
 {
  "name": "Jump-Land-Stick (Two Feet to One)",
  "kind": "skill",
  "url": "https://youtu.be/03CxqRC25V0",
  "from": "Soft Mat 2-1 Landings"
 },
 {
  "name": "Kettlebell Swing",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=EVimy2HY91E",
  "from": "KB Swing"
 },
 {
  "name": "Kneeling Hip Flexor Stretch",
  "kind": "exercise",
  "url": "https://youtu.be/qikH3cd9KjI",
  "from": "Hip Flexor Stretch"
 },
 {
  "name": "Landmine Press",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=Xik8zBtMCVk",
  "from": "Landmine Press"
 },
 {
  "name": "Landmine Squat",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=zQ99Qg9dupY",
  "from": "Landmine Squat"
 },
 {
  "name": "Lat Pulldown",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=l3Zo-81YAa8",
  "from": "Machine Lat Pulldown"
 },
 {
  "name": "Lateral Bound",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=GrEPtPg99B8",
  "from": "Heiden"
 },
 {
  "name": "Lateral Lunge",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=Y4QME7_0Ufk",
  "from": "BW Lateral Lunge"
 },
 {
  "name": "Lateral Raise",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=c20_1VgvQeA",
  "from": "DB Lateral Delt Raise"
 },
 {
  "name": "Lateral Shuffle",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=BB7TNtWQx88",
  "from": "Lateral Shuffle"
 },
 {
  "name": "Leg Extension",
  "kind": "exercise",
  "url": "https://youtu.be/5UvWt-ONdH8",
  "from": "Machine Leg Extension"
 },
 {
  "name": "Leg Press",
  "kind": "exercise",
  "url": "https://youtu.be/ivGq3CmHhOs",
  "from": "LPM Leg Press"
 },
 {
  "name": "Leg Swings (Front-Back and Side)",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=PuDH0llsJuA&t=4s",
  "from": "Leg Swings"
 },
 {
  "name": "Machine Chest Press",
  "kind": "exercise",
  "url": "https://youtu.be/eOB1_RI5eLM",
  "from": "Machine Chest Press"
 },
 {
  "name": "Machine Shoulder Press",
  "kind": "exercise",
  "url": "https://youtu.be/w3f_0MiibuE",
  "from": "Machine Shoulder Press"
 },
 {
  "name": "Med Ball Chest Pass",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=fYfeSf4e6nE",
  "from": "MB Chest Throw"
 },
 {
  "name": "Medicine Ball Rotational Throw",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=h_Tw7gsqc6c",
  "from": "MB Lateral Side Toss"
 },
 {
  "name": "Medicine Ball Slam",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=NYl5cKoc4es",
  "from": "MB OH Slam"
 },
 {
  "name": "Nordic Hamstring Curl",
  "kind": "exercise",
  "url": "https://youtu.be/nl4f4qYsygc",
  "from": "NHE"
 },
 {
  "name": "Open Book Stretch",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=RKcUKREbRNk",
  "from": "Side Lying Shoulder Openers"
 },
 {
  "name": "Overhead Carry",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=0BBTPd6YZH0",
  "from": "KB OH Carry"
 },
 {
  "name": "Overhead Squat",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=hE6wqYlhp_w",
  "from": "BB OH Squat"
 },
 {
  "name": "Overhead Tricep Extension",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=zpBYhztDdY8",
  "from": "DB Triceps Extensions"
 },
 {
  "name": "Pike Push-Up",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=Dp3wtQ5Z5tI",
  "from": "Pike Press"
 },
 {
  "name": "Plank",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=JDZPcU8lSHE",
  "from": "Plank"
 },
 {
  "name": "Planned 45-Degree Cut",
  "kind": "exercise",
  "url": "https://youtu.be/oCe_m2P91QA",
  "from": "COD 45 degrees"
 },
 {
  "name": "Prone Y-Raise",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=byUu9Mg2NKk",
  "from": "DB Prone Trap Raise"
 },
 {
  "name": "Pull-Up",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=eX349bGDznU",
  "from": "Pull Up"
 },
 {
  "name": "Push Press",
  "kind": "exercise",
  "url": "https://youtu.be/VAsATm0kLtk",
  "from": "BB Push Press"
 },
 {
  "name": "Rack Pull",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=TESfIYQ1xBs",
  "from": "BB Rack Pull"
 },
 {
  "name": "Rear Delt Fly",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=HGXUg4isyaQ",
  "from": "DB Prone Rear Delt Raise"
 },
 {
  "name": "Renegade Row",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=VZq2q2sBwLM",
  "from": "DB Plank Row [Floor]"
 },
 {
  "name": "Repeated Broad Jump",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=nZKaoDZbvP4",
  "from": "SLJ [Continuous]"
 },
 {
  "name": "Reverse Barbell Curl",
  "kind": "exercise",
  "url": "https://youtu.be/DuwAUUCAiCQ",
  "from": "BB Standing Reverse Bicep Curl"
 },
 {
  "name": "Reverse Crunch",
  "kind": "exercise",
  "url": "https://youtu.be/OW7lpPvN1Cw",
  "from": "Reverse Crunch"
 },
 {
  "name": "Reverse Lunge",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=-qcHu8JrjLU",
  "from": "DB Reverse Lunge"
 },
 {
  "name": "Romanian Deadlift",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=5DVOxs2j-VA",
  "from": "BB RDL"
 },
 {
  "name": "Rowing Machine Intervals",
  "kind": "exercise",
  "url": "https://youtu.be/hKCHPd09WAk",
  "from": "Rowing Conditioning"
 },
 {
  "name": "Russian Twist",
  "kind": "exercise",
  "url": "https://youtu.be/Rvppan95a34",
  "from": "MB Russian Twist"
 },
 {
  "name": "Safety Bar Squat",
  "kind": "exercise",
  "url": "https://youtu.be/lTqasUddDGE",
  "from": "SSB Back Squat"
 },
 {
  "name": "Seated Cable Row",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=KKTlCgd8lsU",
  "from": "Cable Low Row"
 },
 {
  "name": "Seated Calf Raise",
  "kind": "exercise",
  "url": "https://youtu.be/W3oPzCSVzAI",
  "from": "DB Seated Calf Raise"
 },
 {
  "name": "Seated Leg Curl",
  "kind": "exercise",
  "url": "https://youtu.be/3gij9BNIlO8",
  "from": "Machine Seated Leg Curl"
 },
 {
  "name": "Serratus Wall Slide",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=q7he4q2hqF0",
  "from": "Wall Serratus Slides"
 },
 {
  "name": "Side Plank",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=Zc2QOqL-NSA",
  "from": "Side Plank"
 },
 {
  "name": "Side-Lying Dumbbell External Rotation",
  "kind": "exercise",
  "url": "https://youtu.be/Z3xj7tWjNwU",
  "from": "DB Side Lying ER"
 },
 {
  "name": "Side-Lying Hip Abduction",
  "kind": "exercise",
  "url": "https://youtu.be/HA8Oq52kjXc",
  "from": "Bumper Side Lying Abduction"
 },
 {
  "name": "Single-Arm Dumbbell Row",
  "kind": "exercise",
  "url": "https://youtu.be/l8yrEJC7QIE",
  "from": "DB Supported SA Row"
 },
 {
  "name": "Single-Arm Overhead Press",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=7wdLgI_nJBs",
  "from": "DB SA OH Press"
 },
 {
  "name": "Single-Leg Balance on Foam or Wobble Board",
  "kind": "exercise",
  "url": "https://youtu.be/wh2p550PmSQ",
  "from": "Balance Board (Foot Training)"
 },
 {
  "name": "Single-Leg Calf Raise",
  "kind": "exercise",
  "url": "https://youtu.be/2mO10oPf3iA",
  "from": "SL Wall Calf Raise"
 },
 {
  "name": "Single-Leg Hip Thrust",
  "kind": "exercise",
  "url": "https://youtu.be/BIuWZ_uJS6g",
  "from": "BW SL Hip Thrust"
 },
 {
  "name": "Single-Leg Hop",
  "kind": "exercise",
  "url": "https://youtu.be/1rl0GvGZ_ps",
  "from": "Horizontal Hop"
 },
 {
  "name": "Single-Leg Leg Extension",
  "kind": "exercise",
  "url": "https://youtu.be/PWSGxOP4Suw",
  "from": "Machine SL Leg Extension"
 },
 {
  "name": "Single-Leg Leg Press",
  "kind": "exercise",
  "url": "https://youtu.be/9T51VdVSxgQ",
  "from": "LPM Single Leg Press"
 },
 {
  "name": "Single-Leg RDL to Row",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=_qOkk_fQR68",
  "from": "DB SL RDL Row"
 },
 {
  "name": "Single-Leg Romanian Deadlift",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=DA8GRA0hfr0",
  "from": "DB SL RDL [2-arm]"
 },
 {
  "name": "Skater Squat",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=66xc3KeOyRc",
  "from": "Skater Squat"
 },
 {
  "name": "Sled Drag",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=r88vQlPWozc",
  "from": "Sled Backward Drag/Walk"
 },
 {
  "name": "Sled Row",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=HWtD9LFSK0w",
  "from": "Sled Row [2-arm]"
 },
 {
  "name": "Sled Sprint",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=MkU2G6Pb9CI",
  "from": "Resisted Sprint [Sled]"
 },
 {
  "name": "Snatch-Grip Deadlift",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=Pz91MWi0jaQ",
  "from": "BB Snatch Grip Deadlift"
 },
 {
  "name": "Split Jerk",
  "kind": "exercise",
  "url": "https://youtu.be/PK3G1suZTB8",
  "from": "Split Jerk"
 },
 {
  "name": "Sprint-to-Stop Deceleration Drill",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=L4ClQsP6QbE",
  "from": "Deceleration 5m"
 },
 {
  "name": "Squat Jump",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=PEg4OpbNfQk",
  "from": "Squat Jump"
 },
 {
  "name": "Standing Calf Raise",
  "kind": "exercise",
  "url": "https://youtu.be/zU1Mzno3GIE",
  "from": "Straight Knee Calf Raise [Floor]"
 },
 {
  "name": "Standing Quad Stretch",
  "kind": "exercise",
  "url": "https://youtu.be/0uQKu6b88LE",
  "from": "Quad (Rectus Femoris) Stretch"
 },
 {
  "name": "Standing Start Acceleration",
  "kind": "skill",
  "url": "https://www.youtube.com/watch?v=Pa91gkW3XCA",
  "from": "Sprint Start [2-point]"
 },
 {
  "name": "Step-Down",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=5m8kcuia6Pg",
  "from": "BW Step Down"
 },
 {
  "name": "Suitcase Carry",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=hvI8XposZNk",
  "from": "KB Suitcase Carry [1-arm]"
 },
 {
  "name": "Sumo Deadlift",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=xBTuATYFjP0",
  "from": "BB Sumo Deadlift"
 },
 {
  "name": "T-Bar Row",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=ZJ3XpfTHfj8",
  "from": "Landmine Standing Bent Over Row"
 },
 {
  "name": "Tibialis Raise",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=D7C_aSqrlkg",
  "from": "Tibialis Raise"
 },
 {
  "name": "Trap Bar Squat",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=GHWbYAqu_Ak",
  "from": "UB Squat"
 },
 {
  "name": "Tricep Rope Pushdown",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=ruWK0gaJchQ",
  "from": "Cable Triceps Pressdown"
 },
 {
  "name": "Tuck Jump",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=pBjbceUtFeI",
  "from": "Tuck Jumps"
 },
 {
  "name": "Walking Lunge",
  "kind": "exercise",
  "url": "https://youtu.be/wRr6G7vxU8w",
  "from": "DB Walking Lunge"
 },
 {
  "name": "Wall Sit",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=9_2hKH1lldY",
  "from": "Wall Sit [Isometric]"
 },
 {
  "name": "Wicket Sprint Drill",
  "kind": "skill",
  "url": "https://www.youtube.com/watch?v=XOvwUEyKs6w",
  "from": "Wicket Run [Sprint]"
 },
 {
  "name": "World's Greatest Stretch",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=DwNHW7UGJCo",
  "from": "Spiderman with Hip Lift & Reach"
 },
 {
  "name": "Zercher Squat",
  "kind": "exercise",
  "url": "https://www.youtube.com/watch?v=I7rcspj6bis",
  "from": "BB Zercher Squat"
 }
];

export const EXLIB_EXERCISES: readonly ExLibExercise[] = [
 {
  "name": "Heel-Elevated Back Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Set up as for a back squat with the heels raised on a wedge or small plates. Squat down keeping the torso upright and let the knees travel forward over the toes, then drive back up.",
  "videoUrl": "https://youtu.be/L4SEKNDl3B4"
 },
 {
  "name": "Back Squat (Chains)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Back squat with chains hung on each end of the bar, so the load grows as you stand up. Squat to depth and drive hard through the top.",
  "videoUrl": "https://youtu.be/PY9pSVg1iSM"
 },
 {
  "name": "Back Squat (Banded)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Back squat with bands anchored low and looped over the bar ends, so tension rises as you stand. Control the descent and drive through the top against the band.",
  "videoUrl": "https://youtu.be/tvFJfjLBjF8"
 },
 {
  "name": "Back Squat (Eccentric Tempo)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Back squat lowered on a slow, counted tempo to the bottom, then driven up at normal speed. Keep the same depth and position on every rep.",
  "videoUrl": "https://youtu.be/5cMZ4YGtId4"
 },
 {
  "name": "Back Squat (Eccentric Drop)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "From the top of a back squat, drop quickly into the bottom and stop dead in a strong position. Pause briefly, then stand back up.",
  "videoUrl": "https://youtu.be/aIIeLqU--TA"
 },
 {
  "name": "Back Squat (Supramaximal Eccentric)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Load the bar heavier than you can stand up with and lower it slowly into the bottom of a back squat; spotters or safety pins take the bar back up. Use only with a trained spotting set-up.",
  "videoUrl": "https://youtu.be/uqnl2XS6b_A"
 },
 {
  "name": "Back Squat (Isometric at Bottom)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Squat to the bottom of a back squat and hold that position still for the time set, then stand up. Stay braced and keep the knees out over the feet during the hold.",
  "videoUrl": "https://youtu.be/MsdvAILzwfQ"
 },
 {
  "name": "Back Squat (Isometric Hold)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Squat to the depth set and hold the bar still in that position for the time set, braced and balanced over the mid-foot. Stand up to finish.",
  "videoUrl": "https://youtu.be/c7tPj784UkQ"
 },
 {
  "name": "Heel-Elevated Front Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Set up as for a front squat with the heels raised on a wedge or small plates. Squat deep with an upright torso and the elbows high, letting the knees travel forward, then drive up.",
  "videoUrl": "https://youtu.be/DpHJvGLncEo"
 },
 {
  "name": "Front Squat (Chains)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Front squat with chains hung on each end of the bar, so the load grows as you stand up. Keep the elbows high and drive through the top.",
  "videoUrl": "https://youtu.be/CuiUCQ_r8n0"
 },
 {
  "name": "Half Back Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Back squat to roughly half depth, with the thighs well above parallel, then drive back up. Use the same depth on every rep, set with a box or pins if needed.",
  "videoUrl": "https://www.youtube.com/watch?v=eSEKmzz_nKY"
 },
 {
  "name": "Quarter Back Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Back squat through only the top quarter of the range, bending the knees a short way and driving hard back to standing. Keep the depth the same on every rep.",
  "videoUrl": "https://www.youtube.com/watch?v=9nMif9NYDOA"
 },
 {
  "name": "Box Squat (Seated)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings",
   "Adductors"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Squat back to a box and sit fully onto it, letting the legs relax for a moment while the torso stays braced. Drive up off the box from that dead stop.",
  "videoUrl": "https://youtu.be/fBqyatxQVEY"
 },
 {
  "name": "Staggered Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Stand with one foot a half step behind the other, the front foot carrying most of the weight and the back foot on its toes. Squat straight down and stand back up, keeping the front heel planted. Switch the front foot each set.",
  "videoUrl": "https://youtu.be/5FETTGGKhYA"
 },
 {
  "name": "Staggered Squat (Supramaximal Eccentric)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "In a staggered stance, lower a load heavier than you can stand up with slowly into the bottom; spotters or safety pins return the bar to the top. Use only with a trained spotting set-up.",
  "videoUrl": "https://youtu.be/gJ_rO_XzWx0"
 },
 {
  "name": "Floating-Heel Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Stand on the balls of the feet with the heels just off the floor and squat down and up without letting the heels touch. Keep the knees travelling forward and the torso upright.",
  "videoUrl": "https://www.youtube.com/watch?v=lGcTF3ab_9I"
 },
 {
  "name": "Floating-Heel Box Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "With the heels held just off the floor, squat down to touch a box and stand back up without letting the heels come down. Move slowly enough to stay balanced on the balls of the feet.",
  "videoUrl": "https://www.youtube.com/watch?v=u_IERcEdduc"
 },
 {
  "name": "Goblet Box Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Dumbbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Hold a weight at the chest and squat back to touch a box, then stand back up. Keep the chest up and the knees out over the feet.",
  "videoUrl": "https://youtu.be/USg6b5g2GjI"
 },
 {
  "name": "Heel-Elevated Goblet Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Dumbbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Stand with the heels raised on a wedge or plates and hold the weight at the chest. Squat straight down with the knees travelling forward over the toes and the torso upright, then stand back up.",
  "videoUrl": "https://www.youtube.com/watch?v=qNGR90Td6VQ"
 },
 {
  "name": "Landmine Squat to Press",
  "category": "conditioning",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Quads",
   "Shoulders",
   "Glutes"
  ],
  "equipment": "Landmine",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold the end of a landmine bar at the chest and squat down. Drive up out of the squat and use that drive to press the bar up and forward to lockout, then bring it back to the chest.",
  "videoUrl": "https://www.youtube.com/watch?v=AOCP98167AQ"
 },
 {
  "name": "Landmine Overhead Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Shoulders",
   "Core",
   "Glutes"
  ],
  "equipment": "Landmine",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Press the end of a landmine bar to lockout overhead and hold it there. Squat down and stand back up with the arm locked and the torso upright.",
  "videoUrl": "https://youtu.be/zVmoyg1YhSk"
 },
 {
  "name": "TRX Overhead Squat",
  "category": "mobility",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Shoulders",
   "Core"
  ],
  "equipment": "TRX",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Hold the suspension straps overhead with the arms straight and lean back slightly. Squat as deep as you can with the arms staying up and the torso upright, then stand.",
  "videoUrl": "https://youtu.be/lcQOJY7dwh0"
 },
 {
  "name": "TRX Vertical Squat (Assisted)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "TRX",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Hold the suspension straps and squat down with the torso vertical, letting the knees travel far forward over the toes. Use the straps only as much as you need to stay balanced, then stand.",
  "videoUrl": "https://youtu.be/xu6qtHSnFyA"
 },
 {
  "name": "Heel-Elevated Vertical Squat",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "With the heels raised on a wedge, squat down keeping the torso vertical and letting the knees travel far forward over the toes. Stand back up under control.",
  "videoUrl": "https://www.youtube.com/watch?v=JoIkaYh7Ssw"
 },
 {
  "name": "Heel-Elevated Vertical Squat (Dowel-Assisted)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "With the heels raised, hold a dowel planted in front for balance and squat down with the torso vertical and the knees travelling forward. Use the dowel for balance only.",
  "videoUrl": "https://youtu.be/aSFa6N7N4zs"
 },
 {
  "name": "TRX Sissy Squat",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Hip Flexors"
  ],
  "equipment": "TRX",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Hold the suspension straps, rise onto the toes and lean back in a straight line from knees to shoulders as the knees travel forward and down. Use the straps for support and return to the start.",
  "videoUrl": "https://www.youtube.com/watch?v=rv7LxZihJvQ"
 },
 {
  "name": "Sissy Squat (Banded, Eccentric Tempo)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Hip Flexors"
  ],
  "equipment": "Band",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "With a band set up for support, lower into a sissy squat on a slow, counted tempo, knees forward and body straight from knee to shoulder. Return to the start and repeat.",
  "videoUrl": "https://youtu.be/NeprDhiUaQY"
 },
 {
  "name": "Pin Squat (Isometric Push)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Set the bar under the safety pins at the depth chosen and squat up into them, pushing as hard as you can against the pins for the time set. Stay braced and keep the position still.",
  "videoUrl": "https://www.youtube.com/watch?v=VScUF2j4htw"
 },
 {
  "name": "Pin Staggered Squat (Isometric Push)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "In a staggered stance, set the bar under the safety pins and push up into them as hard as you can for the time set, most of the weight through the front foot. Switch the front foot each set.",
  "videoUrl": "https://youtu.be/gBafb0F9obU"
 },
 {
  "name": "Heel-Elevated Wall Squat",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "With the heels raised on a wedge and the back sliding against a wall, squat down and back up. Keep the back on the wall and the knees tracking over the feet.",
  "videoUrl": "https://www.youtube.com/watch?v=VfSdqnzN8tk"
 },
 {
  "name": "Bodyweight Squat",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Stand with the feet about shoulder width apart, squat down with the chest up and the knees out over the feet, then stand back up.",
  "videoUrl": "https://youtu.be/J1zc3bjr8Es"
 },
 {
  "name": "Bodyweight Squat (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Squat to the depth set and hold still for the time set with the chest up and the knees out over the feet. Stand up to finish.",
  "videoUrl": "https://www.youtube.com/watch?v=EkxTV8zD0QA"
 },
 {
  "name": "Bodyweight Squat (Oscillation)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Sink into the bottom of a squat and make small, quick pulses up and down a few centimetres for the time set. Stay deep the whole time with the chest up.",
  "videoUrl": "https://youtu.be/XqkblCC6yYE"
 },
 {
  "name": "Machine Perfect Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Machine",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Set up in the squat machine with the pads on the shoulders and the feet on the platform. Squat down along the machine's path to full depth and drive back up.",
  "videoUrl": "https://youtu.be/aakijuP2aII"
 },
 {
  "name": "Machine Perfect Squat (Explosive)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Machine",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Using a moderate load in the squat machine, lower under control and drive up as fast as you can on every rep.",
  "videoUrl": "https://youtu.be/wwokrqmK-n4"
 },
 {
  "name": "Machine Perfect Squat (Two-Up, One-Down Eccentric)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Machine",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "In the squat machine, stand up with both legs, then shift onto one leg and lower slowly on that leg alone. Put both feet back down at the bottom and alternate the lowering leg.",
  "videoUrl": "https://youtu.be/kfxIrePRfoM"
 },
 {
  "name": "Smith Machine Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Smith Machine",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Set up under the Smith machine bar with the feet slightly in front of it. Squat down to depth along the bar's fixed path and drive back up.",
  "videoUrl": "https://youtu.be/GzePGu_D8z0"
 },
 {
  "name": "Smith Machine Squat (Isometric Hold)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Smith Machine",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Squat down in the Smith machine to the depth set and hold the bar still for the time set, braced. Stand up to finish.",
  "videoUrl": "https://youtu.be/4b-a_0UPQ-k"
 },
 {
  "name": "Smith Machine Staggered Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Smith Machine",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "In the Smith machine, stand with one foot a half step behind the other and most of the weight on the front foot. Squat down and stand up, switching the front foot each set.",
  "videoUrl": "https://youtu.be/wI2rNvkdDks"
 },
 {
  "name": "Smith Machine Staggered Squat (Isometric Hold)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Smith Machine",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "In a staggered stance in the Smith machine, squat to the depth set and hold still for the time set, most of the weight on the front foot. Switch feet each set.",
  "videoUrl": "https://youtu.be/U3eo01yv7us"
 },
 {
  "name": "Split Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Barbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand in a long split stance with both feet on the floor. Lower straight down until the back knee is just above the floor, then drive up through the front foot. Keep the torso tall and the front knee tracking over the foot.",
  "videoUrl": "https://www.youtube.com/watch?v=VHX2NeoC6L0"
 },
 {
  "name": "Split Squat (Chains)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Barbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Split squat with chains hung on each end of the bar, so the load grows as you stand. Lower until the back knee is just above the floor and drive up through the front foot.",
  "videoUrl": "https://youtu.be/xxjMXb1GZNM"
 },
 {
  "name": "Pin Split Squat (Eccentric Only)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Barbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "From the top of a split squat, lower the bar slowly until it settles on the safety pins at the bottom. Re-rack from the top or step out and reset rather than standing it up.",
  "videoUrl": "https://www.youtube.com/watch?v=5Hj6hfuOGek"
 },
 {
  "name": "Pin Split Squat (Concentric Only)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Barbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Set the bar on the safety pins at the bottom of a split squat, get under it in position and drive it up from a dead stop. Return it to the pins and reset each rep.",
  "videoUrl": "https://youtu.be/s9Pskv_sTpY"
 },
 {
  "name": "Split Squat (Isometric Hold)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Set up in a split stance and lower until the back knee is just above the floor. Hold that position for the time set, torso tall and front heel down, then switch legs.",
  "videoUrl": "https://youtu.be/yMY-QVoYUys"
 },
 {
  "name": "Zercher Front-Foot-Elevated Split Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Hold the bar in the crooks of the elbows with the front foot raised on a low step. Lower until the back knee is near the floor and drive up through the front foot, torso tall.",
  "videoUrl": "https://www.youtube.com/watch?v=aSBOSvBK3kY"
 },
 {
  "name": "Trap Bar Split Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Trap Bar",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand inside a trap bar in a split stance, holding the handles at your sides. Lower until the back knee is just above the floor and drive up through the front foot.",
  "videoUrl": "https://youtu.be/kjGBIXFn20k"
 },
 {
  "name": "Trap Bar Bulgarian Split Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Trap Bar",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand inside a trap bar with the back foot on a bench behind you. Lower until the back knee is near the floor and drive up through the front foot.",
  "videoUrl": "https://www.youtube.com/watch?v=R9Vla4qQOGk"
 },
 {
  "name": "Trap Bar Rolling Staggered Drop and Catch",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Trap Bar",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Holding a trap bar in a staggered stance, rise onto the balls of the feet and drop quickly into a quarter squat, catching the load and stopping dead. Reset to the top and repeat.",
  "videoUrl": "https://youtu.be/118EPWtdFlI"
 },
 {
  "name": "Penultimate-Step Split Squat",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Dumbbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "In a split stance that mirrors the long, low step before a jump, lower into a deep split squat with the front knee travelling forward. Drive back up through the front foot.",
  "videoUrl": "https://youtu.be/h477sTDMyu4"
 },
 {
  "name": "Bulgarian Split Squat (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Dumbbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "With the back foot on a bench, drop quickly into the bottom of the split squat and stop dead with the front knee over the foot. Reset to the top and repeat.",
  "videoUrl": "https://www.youtube.com/watch?v=PZw6Mluc_Yc"
 },
 {
  "name": "Bulgarian Split Squat (Isometric Oscillation)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Dumbbell",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "With the back foot on a bench, sink into the bottom of the split squat and make small, quick pulses up and down a few centimetres for the time set. Stay deep the whole time and keep the front heel planted.",
  "videoUrl": "https://youtu.be/8LYyqdhdcTA"
 },
 {
  "name": "Bulgarian Split Squat (Strike)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Dumbbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "With the back foot on a bench, drop fast from the top into the bottom of the split squat and stop hard, then drive up quickly. Keep the front knee over the foot through the stop.",
  "videoUrl": "https://youtu.be/xMTly9Js6Lk"
 },
 {
  "name": "Front-Foot-Elevated Split Squat (Hamstring Bias)",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Quads"
  ],
  "equipment": "Kettlebell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "With the front foot on a low step, hinge the torso forward slightly and keep the front shin more vertical as you lower. Drive back up through the front heel.",
  "videoUrl": "https://youtu.be/uY_cS1B958o"
 },
 {
  "name": "Landmine Split Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Landmine",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Hold the end of a landmine bar at the chest in a split stance. Lower until the back knee is just above the floor and drive up through the front foot.",
  "videoUrl": "https://www.youtube.com/watch?v=4Mn8TT9f0bo"
 },
 {
  "name": "Landmine Split Squat (Eccentric Drop)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Landmine",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Holding a landmine bar at the chest in a split stance, drop quickly into the bottom and stop dead. Reset to the top and repeat.",
  "videoUrl": "https://www.youtube.com/watch?v=W50Ccfq9fUQ"
 },
 {
  "name": "Landmine Bulgarian Split Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Landmine",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Hold the end of a landmine bar at the chest with the back foot on a bench. Lower until the back knee is near the floor and drive up through the front foot.",
  "videoUrl": "https://youtu.be/TV6tLsv123Q"
 },
 {
  "name": "Landmine Lateral Split Squat",
  "category": "strength",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Quads",
   "Glutes"
  ],
  "equipment": "Landmine",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Hold the end of a landmine bar at the chest in a wide side stance. Shift and sit into one hip with the other leg straight, then push back to the middle.",
  "videoUrl": "https://youtu.be/C_VrcJdDhjg"
 },
 {
  "name": "Bulgarian Split Squat (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Dumbbell",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "With the back foot on a bench, lower to the depth set and hold still for the time set with the torso tall and the front heel down. Switch legs.",
  "videoUrl": "https://youtu.be/gtqi7--DpOs"
 },
 {
  "name": "Pin Split Squat (Isometric Push)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "In a split stance, set the bar under the safety pins at the depth chosen and push up into them as hard as you can for the time set. Switch legs.",
  "videoUrl": "https://www.youtube.com/watch?v=K33dN1OCf00"
 },
 {
  "name": "Smith Machine Split Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Smith Machine",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Set up in a split stance under the Smith machine bar. Lower until the back knee is just above the floor and drive up through the front foot.",
  "videoUrl": "https://youtu.be/f_PxHR6V2ak"
 },
 {
  "name": "Smith Machine Split Squat (Isometric Hold)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Smith Machine",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "In a split stance in the Smith machine, lower to the depth set and hold still for the time set. Switch legs.",
  "videoUrl": "https://youtu.be/INiXevalS9E"
 },
 {
  "name": "Smith Machine Bulgarian Split Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Smith Machine",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "With the back foot on a bench behind the Smith machine, lower until the back knee is near the floor and drive up through the front foot.",
  "videoUrl": "https://youtu.be/cdm1cz8G0Ys"
 },
 {
  "name": "Smith Machine Bulgarian Split Squat (Isometric Hold)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Smith Machine",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "With the back foot on a bench in the Smith machine, lower to the depth set and hold still for the time set. Switch legs.",
  "videoUrl": "https://youtu.be/gU2xN4sjfic"
 },
 {
  "name": "Terminal Knee Extension",
  "category": "accessory",
  "muscleGroup": "Quads",
  "equipment": "Band",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Loop a band behind the knee with it anchored in front, start with the knee slightly bent and straighten it fully against the band. Squeeze at lockout and return under control.",
  "videoUrl": "https://www.youtube.com/watch?v=TyUqyXWzCQA"
 },
 {
  "name": "Reverse Terminal Knee Extension",
  "category": "accessory",
  "muscleGroup": "Quads",
  "equipment": "Band",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Loop a band behind the knee with it anchored in front, then bend the knee forward against the pull and return to straight under control. Keep the hips still and the foot flat.",
  "videoUrl": "https://youtu.be/gSMMTneGmrc"
 },
 {
  "name": "Stability Ball Quad Kick",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Stability Ball",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Kneel or sit with the shin resting on a stability ball and straighten the knee to kick the ball forward. Return under control and repeat on the same leg.",
  "videoUrl": "https://www.youtube.com/watch?v=Hgmp2XTB3hY"
 },
 {
  "name": "Reverse Nordic",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Hip Flexors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Kneel tall with the feet anchored and lean the whole body back in a straight line from knees to shoulders as far as you can control. Pull back up to tall kneeling without bending at the hips.",
  "videoUrl": "https://www.youtube.com/watch?v=pF07CIXX0eQ"
 },
 {
  "name": "TRX Fallback",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "TRX",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Hold the suspension straps and kneel or stand facing the anchor, then let the knees bend and lean back in a straight line from knees to shoulders. Pull back to the start using the legs.",
  "videoUrl": "https://youtu.be/HJhx74gZvwg"
 },
 {
  "name": "Banded Moonwalk",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "With a band pulling you forward from the waist, sit into a quarter squat and walk backward in small steps, staying on the balls of the feet. Keep the knees bent the whole way.",
  "videoUrl": "https://youtu.be/BG0ue77FnCI"
 },
 {
  "name": "Kettlebell Leg Extension",
  "category": "accessory",
  "muscleGroup": "Quads",
  "equipment": "Kettlebell",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Sit on a high bench with a kettlebell hooked over the foot and straighten the knee fully. Lower under control and repeat.",
  "videoUrl": "https://youtu.be/e9-obbYIExw"
 },
 {
  "name": "Kettlebell Leg Extension (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "equipment": "Kettlebell",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Sit on a high bench with a kettlebell hooked over the foot, straighten the knee and hold it locked out for the time set. Lower under control.",
  "videoUrl": "https://youtu.be/-BGG1xZQklI"
 },
 {
  "name": "Resisted Backward Walk",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Sled",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Face the resistance holding the handles and walk backward in short steps, staying low with the knees bent and pushing through the balls of the feet.",
  "videoUrl": "https://www.youtube.com/watch?v=qxkbjlrf9To"
 },
 {
  "name": "Single-Leg Box Squat (Eccentric Only)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "On one leg, lower slowly until you touch the box, then use both legs to stand back up. Keep the knee tracking over the foot all the way down.",
  "videoUrl": "https://www.youtube.com/watch?v=KamBiWLfCp0"
 },
 {
  "name": "Single-Leg Zercher Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Hold the bar in the crooks of the elbows and stand on one leg with the other held forward. Squat down under control and stand back up on the same leg.",
  "videoUrl": "https://www.youtube.com/watch?v=Afs8SbxEv18"
 },
 {
  "name": "Safety Bar Single-Leg Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Safety Squat Bar",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "With a safety squat bar on the back, stand on one leg with the other held off the floor and squat down under control, then stand back up.",
  "videoUrl": "https://www.youtube.com/watch?v=bASUJEwcuXY"
 },
 {
  "name": "Safety Bar Single-Leg Heel-Elevated Squat (Knee Drive)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hip Flexors"
  ],
  "equipment": "Safety Squat Bar",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "With a safety squat bar on the back and the working heel raised, squat down on one leg and drive the other knee up as you stand. Finish tall on the working leg.",
  "videoUrl": "https://youtu.be/WsFXtnb-1Is"
 },
 {
  "name": "Trap Bar Single-Leg Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Trap Bar",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Stand inside a trap bar on one leg with the other off the floor, squat down under control and stand back up.",
  "videoUrl": "https://www.youtube.com/watch?v=jk9cjFZENIc"
 },
 {
  "name": "Single-Leg Box Squat (Two-Up, One-Down Eccentric)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Dumbbell",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Stand up from the box with both legs, then shift onto one leg and lower slowly to the box on that leg alone. Alternate the lowering leg or finish one side.",
  "videoUrl": "https://www.youtube.com/watch?v=Wexcm8P0BLk"
 },
 {
  "name": "Single-Leg Box Squat",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Dumbbell",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Stand on one leg in front of a box with the other leg held forward. Sit back under control until you touch the box, then stand back up on the same leg without rocking.",
  "videoUrl": "https://youtu.be/oz1x-YENdWI"
 },
 {
  "name": "Single-Leg Squat",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Dumbbell",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Stand on one leg with the other held off the floor. Squat down as deep as you can control, keeping the knee tracking over the foot, then stand back up.",
  "videoUrl": "https://youtu.be/QGx_OSh-a9g"
 },
 {
  "name": "Landmine Skater Squat",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Landmine",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Hold the end of a landmine bar at the chest, stand on one leg and lower the back knee toward the floor behind you. Stand back up on the working leg.",
  "videoUrl": "https://youtu.be/LY8XFO48tIo"
 },
 {
  "name": "Landmine Single-Leg Squat (Step Behind)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Landmine",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Hold the landmine bar at the chest and place the free foot lightly behind you for balance. Squat down mostly on the front leg and stand back up.",
  "videoUrl": "https://youtu.be/gL09UJmAN1A"
 },
 {
  "name": "Skater Squat (Assisted)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Hold a post, strap or rack for balance and lower into a skater squat, back knee toward the floor. Use the support only as much as you need to stand back up.",
  "videoUrl": "https://www.youtube.com/watch?v=xBLzBZbmmxA"
 },
 {
  "name": "Pistol Squat (Assisted)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Hold a post, strap or rack and squat to full depth on one leg with the other held straight in front. Use the support only as much as you need.",
  "videoUrl": "https://www.youtube.com/watch?v=qlcqaRJu-dY"
 },
 {
  "name": "Pistol Squat (Elevated)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Stand on one leg on a box or bench with the other leg hanging off the side and squat down as deep as you can control. Stand back up on the same leg.",
  "videoUrl": "https://www.youtube.com/watch?v=VrkZLI1Dgz4"
 },
 {
  "name": "Pistol Squat",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Stand on one leg with the other held straight in front and squat all the way down. Stand back up on the same leg without the free foot touching.",
  "videoUrl": "https://youtu.be/MBK8wdzLzdc"
 },
 {
  "name": "Heel-Elevated Pistol Squat",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "With the working heel raised on a wedge, squat down on one leg with the other held in front, letting the knee travel forward. Stand back up on the same leg.",
  "videoUrl": "https://youtu.be/aMc0gYDqNEc"
 },
 {
  "name": "Pin Single-Leg Squat (Isometric Push)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "On one leg, set the bar under the safety pins at the depth chosen and push up into them as hard as you can for the time set. Switch legs.",
  "videoUrl": "https://youtu.be/7rN4EaEZsus"
 },
 {
  "name": "High Box Single-Leg Squat",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Box",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Stand on one leg in front of a high box and sit back until you touch it, then stand back up on the same leg.",
  "videoUrl": "https://www.youtube.com/watch?v=Hh7v8x5Rk7w"
 },
 {
  "name": "High Box Single-Leg Squat (Eccentric Only)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Box",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "On one leg, lower slowly to a high box, then use both legs to stand back up. Keep the knee tracking over the foot.",
  "videoUrl": "https://www.youtube.com/watch?v=mTlSCHuTJTk"
 },
 {
  "name": "Floating-Heel Box Skater Squat (Knees Over Toes)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Box",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Stand on one leg on a box with the heel just off it and lower into a skater squat, letting the knee travel well past the toes. Stand back up without the heel coming down.",
  "videoUrl": "https://youtu.be/tubO89D7A-w"
 },
 {
  "name": "Single-Leg Floating-Heel Box Vertical Squat",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Stand on one leg on a box with the heel just off it and squat down keeping the torso vertical and the knee travelling forward. Stand back up without the heel coming down.",
  "videoUrl": "https://youtu.be/gKo9fzE72As"
 },
 {
  "name": "Single-Leg Belt Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Machine",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Set up in a belt squat with the load on the hips and stand on one leg. Squat down under control and stand back up on the same leg.",
  "videoUrl": "https://www.youtube.com/watch?v=Jd502wO29Go"
 },
 {
  "name": "Bowler Squat",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Stand on one leg, then hinge and bend the knee while reaching the free leg back and across behind you, like a bowler's finish. Stand back up on the working leg.",
  "videoUrl": "https://www.youtube.com/watch?v=rROgq_XBYX0"
 },
 {
  "name": "Single-Leg Squat (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Squat on one leg to the depth set and hold still for the time set, knee tracking over the foot. Switch legs.",
  "videoUrl": "https://www.youtube.com/watch?v=nXNaTitpJqc"
 },
 {
  "name": "TRX Single-Leg Vertical Squat (Assisted)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "TRX",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Hold the suspension straps and squat on one leg with the torso vertical and the knee travelling forward. Use the straps only as much as you need to stay balanced.",
  "videoUrl": "https://youtu.be/Kg2SCxaetJg"
 },
 {
  "name": "Smith Machine Single-Leg Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Smith Machine",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Under the Smith machine bar, stand on one leg with the other off the floor, squat down under control and stand back up.",
  "videoUrl": "https://youtu.be/5x0dYwKAiWY"
 },
 {
  "name": "Smith Machine Single-Leg Squat (Isometric Hold)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Smith Machine",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "On one leg in the Smith machine, squat to the depth set and hold still for the time set. Switch legs.",
  "videoUrl": "https://youtu.be/vqYu2dkUBLs"
 },
 {
  "name": "Smith Machine Squat (Two-Up, One-Down Eccentric)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Smith Machine",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Stand up with both legs in the Smith machine, then shift onto one leg and lower slowly on it alone. Put both feet down at the bottom and alternate the lowering leg.",
  "videoUrl": "https://youtu.be/At5WqXgEGog"
 },
 {
  "name": "Barbell Forward Lunge",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Barbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Step forward into a long stride and lower until the back knee is just above the floor. Push off the front foot back to standing and alternate legs or finish one side.",
  "videoUrl": "https://www.youtube.com/watch?v=dNkVURmVLxQ"
 },
 {
  "name": "Barbell Forward Lunge (Deceleration)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Barbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Step forward quickly and brake hard into the bottom of the lunge, stopping the body in one step with the front knee over the foot. Hold the stop for a beat, then push back to standing.",
  "videoUrl": "https://www.youtube.com/watch?v=flUYzQfM8CE"
 },
 {
  "name": "Barbell Lunge Drop to Stance",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Barbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand tall with feet together, then let the body drop quickly into a split stance and catch it in the bottom of the lunge. Stick the landing for a beat before standing back up.",
  "videoUrl": "https://www.youtube.com/watch?v=WAjZhJWr0ZY"
 },
 {
  "name": "Barbell Lunge Drop to Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Barbell",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Drop quickly from standing into a lunge, and as soon as you catch the bottom, jump straight up. Land softly back in the lunge and reset.",
  "videoUrl": "https://www.youtube.com/watch?v=cgaeibYHCmY"
 },
 {
  "name": "Barbell Lunge Drop to Switch",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Barbell",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Drop quickly from standing into a lunge, then jump and switch legs in the air to land in the opposite lunge. Land softly and in control before the next rep.",
  "videoUrl": "https://www.youtube.com/watch?v=Unp2e2Qvm9s"
 },
 {
  "name": "Barbell Momentum Lunge",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Barbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Step back into a reverse lunge, then drive straight through into a forward lunge on the same leg without touching down in between. Keep the torso tall and move with control through the middle.",
  "videoUrl": "https://www.youtube.com/watch?v=iTPsUKnpOjQ"
 },
 {
  "name": "Barbell Step-Through Lunge",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Barbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Step back into a reverse lunge, then swing the same leg through and step forward into a forward lunge without stopping in between. Keep the torso tall and the front knee tracking over the foot.",
  "videoUrl": "https://www.youtube.com/watch?v=5OtBV1d7hHQ"
 },
 {
  "name": "Safety Bar Lateral Lunge",
  "category": "strength",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Glutes",
   "Quads"
  ],
  "equipment": "Safety Squat Bar",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "With a safety squat bar on the back, step wide to one side and sit into that hip with the other leg straight. Push back to the start.",
  "videoUrl": "https://youtu.be/cVCfxdXiY7E"
 },
 {
  "name": "Trap Bar Reverse Lunge",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Trap Bar",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand inside a trap bar holding the handles and step back into a reverse lunge, back knee just above the floor. Drive back to standing through the front foot.",
  "videoUrl": "https://youtu.be/QHdZHNBq5Zg"
 },
 {
  "name": "Trap Bar Forward Lunge",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Trap Bar",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand inside a trap bar holding the handles and step forward into a lunge, back knee just above the floor. Push back to standing off the front foot.",
  "videoUrl": "https://youtu.be/9tl9SnqfsTg"
 },
 {
  "name": "Forward Lunge",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Dumbbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Step forward into a long stride and lower until the back knee is just above the floor. Push off the front foot back to standing and alternate legs or finish one side.",
  "videoUrl": "https://www.youtube.com/watch?v=Q8cEtcPd3js"
 },
 {
  "name": "Forward Lunge (Deceleration)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Dumbbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Step forward quickly and brake hard into the bottom of the lunge, stopping the body in one step with the front knee over the foot. Hold the stop for a beat, then push back to standing.",
  "videoUrl": "https://www.youtube.com/watch?v=49x2xu_kf3E"
 },
 {
  "name": "Step-Through Lunge",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Dumbbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Step back into a reverse lunge, then swing the same leg through and step forward into a forward lunge without stopping in between. Keep the torso tall and the front knee tracking over the foot.",
  "videoUrl": "https://youtu.be/UIVxq9N1qdE"
 },
 {
  "name": "Lunge Drop to Stance",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Dumbbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand tall with feet together, then let the body drop quickly into a split stance and catch it in the bottom of the lunge. Stick the landing for a beat before standing back up.",
  "videoUrl": "https://youtu.be/j9uTsXj7TeU"
 },
 {
  "name": "Lunge Drop to Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Drop quickly from standing into a lunge, and as soon as you catch the bottom, jump straight up. Land softly back in the lunge and reset.",
  "videoUrl": "https://youtu.be/0sUvq_ZHwZw"
 },
 {
  "name": "Lunge Drop to Switch",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Drop quickly from standing into a lunge, then jump and switch legs in the air to land in the opposite lunge. Land softly and in control before the next rep.",
  "videoUrl": "https://youtu.be/-mCmRz8Njyk"
 },
 {
  "name": "Momentum Lunge",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Dumbbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Step back into a reverse lunge, then drive straight through into a forward lunge on the same leg without touching down in between. Keep the torso tall and move with control through the middle.",
  "videoUrl": "https://youtu.be/lFG612R0ZNQ"
 },
 {
  "name": "Contract-Relax Lunge",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Quads",
   "Glutes"
  ],
  "equipment": "Kettlebell",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Sink into a long lunge holding a light kettlebell, press the back knee and front foot into the floor for a few seconds, then relax and sink a little deeper. Repeat for the rounds set.",
  "videoUrl": "https://youtu.be/NRevdHQGujI"
 },
 {
  "name": "Contract-Relax Lunge (Alternating)",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Quads",
   "Glutes"
  ],
  "equipment": "Kettlebell",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Sink into a long lunge, press into the floor for a few seconds, then relax and sink deeper. Step through and repeat on the other leg, alternating each round.",
  "videoUrl": "https://youtu.be/BVKUrdZK4tY"
 },
 {
  "name": "Lateral Lunge (Slant Board)",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Glutes",
   "Quads"
  ],
  "equipment": "Dumbbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Step out wide with the lunging foot on a slant board and sit into that hip, the other leg straight. Push back to the middle and repeat.",
  "videoUrl": "https://youtu.be/tdYegPAxlMg"
 },
 {
  "name": "Lateral Lunge (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Glutes",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Step out wide into a lateral lunge and hold the bottom position, hips back, the lunging knee over the foot and the other leg straight. Hold for the time set, then switch sides.",
  "videoUrl": "https://youtu.be/Isd2XIPfeY4"
 },
 {
  "name": "Lateral Lunge (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Glutes",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "From standing, drop quickly into a lateral lunge and stop dead in the bottom position, hips back and the knee over the foot. Hold the stop for a moment, then push back to standing.",
  "videoUrl": "https://youtu.be/PZSjQjTWKFg"
 },
 {
  "name": "Slider Lateral Lunge",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Glutes",
   "Quads"
  ],
  "equipment": "Slider",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand with one foot on a slider and a weight held at the chest. Slide that foot out to the side as you sit the hips back over the planted leg, then pull the slider back in to stand.",
  "videoUrl": "https://www.youtube.com/watch?v=ArFjvaxIZM4"
 },
 {
  "name": "Lunge (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Set up in a split stance and lower until both knees are bent near 90 degrees. Hold that position with the torso tall and the front foot flat for the time set, then switch legs.",
  "videoUrl": "https://youtu.be/AtBck1_jbro"
 },
 {
  "name": "Reverse Lunge to Step-Up",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand facing a box, step back into a reverse lunge, then drive the same leg forward and up onto the box and stand tall on it. Step down and repeat on the same leg for the reps set.",
  "videoUrl": "https://youtu.be/Vwq7obc0YiM"
 },
 {
  "name": "Shock Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Kettlebell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Holding a weight, step off a low box and land on one leg in a split or lunge position. Stick the landing with the knee over the foot and hold it still before stepping out.",
  "videoUrl": "https://youtu.be/ncgniBGSYsc"
 },
 {
  "name": "Landmine Reverse Lunge",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Landmine",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Hold the end of a landmine bar at the chest with both hands. Step back into a reverse lunge, lowering the back knee toward the floor, then drive through the front foot to stand.",
  "videoUrl": "https://youtu.be/9XDaHTbQ8so"
 },
 {
  "name": "Landmine Forward Lunge",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Landmine",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Hold the end of a landmine bar at the chest. Step forward into a lunge, lowering the back knee toward the floor, then push off the front foot back to standing.",
  "videoUrl": "https://www.youtube.com/watch?v=cy-2VRQQh7U"
 },
 {
  "name": "Landmine Reverse Lunge to Press",
  "category": "conditioning",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Quads",
   "Shoulders",
   "Glutes"
  ],
  "equipment": "Landmine",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hold the end of a landmine bar at the shoulder. Step back into a reverse lunge, and as you drive back to standing press the bar up and away, then lower it to the shoulder.",
  "videoUrl": "https://youtu.be/AAuk37ULyKY"
 },
 {
  "name": "Landmine Lateral Lunge",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Glutes",
   "Quads"
  ],
  "equipment": "Landmine",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Hold the end of a landmine bar at the chest. Step out wide to the side and sit the hips back over that leg with the other leg straight, then push back to the middle.",
  "videoUrl": "https://www.youtube.com/watch?v=nfvlCgcYLjA"
 },
 {
  "name": "Landmine Lateral Lunge (Mobility)",
  "category": "mobility",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Glutes",
   "Hip Flexors"
  ],
  "equipment": "Landmine",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Holding the end of a landmine bar at the chest for balance, shift slowly side to side from one lateral lunge to the other. Sink only as deep as you can keep the heels down and the straight leg long.",
  "videoUrl": "https://youtu.be/Z5m2GrCfcJs"
 },
 {
  "name": "Lunge (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "From a split stance, drop quickly into the bottom of the lunge and stop dead, front knee over the foot and torso tall. Hold the stop for a moment, then stand back up.",
  "videoUrl": "https://youtu.be/gSuL0GsINIE"
 },
 {
  "name": "Lunge Deceleration",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Jog or skip a few steps, then plant into a forward lunge and stop all your momentum in one step. Hold the lunge still with the front knee over the foot before walking back.",
  "videoUrl": "https://youtu.be/4WhMcFVfh0s"
 },
 {
  "name": "Lateral Lunge (Front and Behind)",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Glutes",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Step out into a lateral lunge with the foot landing slightly ahead of the other, push back, then step out again with it landing slightly behind. Alternate the two angles for the reps set.",
  "videoUrl": "https://www.youtube.com/watch?v=5gVVwMqQQHc"
 },
 {
  "name": "Sprint Lunge (A Position)",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hip Flexors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Step back into a lunge, then drive up off the front foot and bring the back knee up to hip height, toes pulled up, standing tall on the front leg. Hold that sprint position briefly before the next rep.",
  "videoUrl": "https://www.youtube.com/watch?v=gafyQfGYJ1Y"
 },
 {
  "name": "Reverse Lunge (A Position)",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hip Flexors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Step back into a reverse lunge, then drive the back knee up to hip height as you stand, finishing balanced on the front leg with the toes of the raised foot pulled up. Pause there, then repeat.",
  "videoUrl": "https://www.youtube.com/watch?v=PZlfQn7WMs0"
 },
 {
  "name": "Banded Forward Lunge",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Band",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "With a band anchored behind you and looped around the hips or held at the chest, step forward into a lunge against the band's pull. Push back to standing under control.",
  "videoUrl": "https://www.youtube.com/watch?v=1ZLxMgTGwGI"
 },
 {
  "name": "Banded Reverse Lunge",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Band",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "With a band anchored in front of you and looped around the hips or held at the chest, step back into a reverse lunge. Drive through the front foot to stand against the band.",
  "videoUrl": "https://www.youtube.com/watch?v=FHc9AWYEKGM"
 },
 {
  "name": "Banded Lateral Lunge",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Glutes",
   "Quads"
  ],
  "equipment": "Band",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "With a band anchored to one side and looped around the hips, step out into a lateral lunge, sitting the hips back over the working leg. Push back to the middle without letting the band pull you over.",
  "videoUrl": "https://www.youtube.com/watch?v=MiWFcHUwUds"
 },
 {
  "name": "Anti-Rotation Lunge (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Core",
   "Obliques",
   "Glutes"
  ],
  "equipment": "Sandbag",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Hold a loaded tube or sandbag out to one side of the body. Drop quickly into a lunge and stop dead without letting the torso turn toward the load, then stand back up.",
  "videoUrl": "https://youtu.be/TuLuqkzNPVo"
 },
 {
  "name": "Overhead Lunge (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Shoulders",
   "Core",
   "Glutes"
  ],
  "equipment": "Sandbag",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Hold a loaded tube or sandbag overhead with the arms locked. Drop quickly into a lunge and stop dead with the load still over the head and the torso tall, then stand back up.",
  "videoUrl": "https://youtu.be/UQ5MgwCRDxY"
 },
 {
  "name": "Deep Lunge (Isometric Hold)",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Quads",
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Take a long split stance and sink as low as you can, the back knee just off the floor and the front shin angled forward. Hold the bottom position for the time set, then switch legs.",
  "videoUrl": "https://www.youtube.com/watch?v=cKiJJbakxdo"
 },
 {
  "name": "Barbell Step-Up (A Position)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hip Flexors"
  ],
  "equipment": "Barbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "With a barbell on the back, step up onto a box and drive the free knee up to hip height, toes pulled up. Pause balanced in that position, then step back down.",
  "videoUrl": "https://www.youtube.com/watch?v=AjmXB7Rczvc"
 },
 {
  "name": "Barbell Step-Up (Low Box)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Barbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "With a barbell on the back, place one foot on a low box and push through that foot to stand tall on it. Step down under control and repeat.",
  "videoUrl": "https://www.youtube.com/watch?v=JtuQzZz_G90"
 },
 {
  "name": "Power Step-Up (One Arm)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Dumbbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Holding one dumbbell in one hand, place a foot on a box and drive up hard, bringing the other knee up fast. Keep the torso square against the uneven load, then step down and repeat.",
  "videoUrl": "https://youtu.be/5E5kdafDzFY"
 },
 {
  "name": "Overhead Step-Up",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Shoulders",
   "Core",
   "Glutes"
  ],
  "equipment": "Dumbbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Press a dumbbell or pair of dumbbells overhead and keep the arms locked. Step up onto a box and stand tall, then step back down with the weight still overhead.",
  "videoUrl": "https://www.youtube.com/watch?v=ck5Dpv4ZLag"
 },
 {
  "name": "Lateral Step-Up",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Dumbbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand beside a box and place the near foot on it. Push through that foot to stand on the box, bringing the other foot up beside it, then lower back down under control.",
  "videoUrl": "https://www.youtube.com/watch?v=TH_CbInWB8M"
 },
 {
  "name": "Reverse Step-Up",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Dumbbell",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand with your back to a box and reach one foot back onto it. Push through that foot to stand on the box, then step back down under control.",
  "videoUrl": "https://youtu.be/-PRGyFIe9Cg"
 },
 {
  "name": "Power Step-Up",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hip Flexors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Place one foot on a box and drive through it hard, bringing the other knee up fast so you finish tall or leave the box briefly. Land back on the box foot, step down and repeat.",
  "videoUrl": "https://youtu.be/Ng9NE-lp4_A"
 },
 {
  "name": "Step-Up (Limited Range of Motion)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Use a low step so the working knee bends only a little. Push through that foot to stand tall on the step, then lower back down slowly.",
  "videoUrl": "https://www.youtube.com/watch?v=5QsEaHs7eBg"
 },
 {
  "name": "Step-Down (Walking)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Walk along a low step or a row of steps, lowering off each one slowly onto the opposite heel and stepping on. Keep the standing knee over the foot as you lower.",
  "videoUrl": "https://www.youtube.com/watch?v=66qz9QlOfI4"
 },
 {
  "name": "Curtsy Step-Up",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand beside a box and cross one leg in front to place that foot on it. Push through it to stand tall on the box, then cross back down under control.",
  "videoUrl": "https://youtu.be/jGDbr8VkbV8"
 },
 {
  "name": "Peterson Step-Up",
  "category": "accessory",
  "muscleGroup": "Quads",
  "equipment": "Bodyweight",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand on a low step on one foot with the heel raised. Lower the other foot toward the floor by bending the standing knee forward, then straighten it to rise back up, keeping the heel up the whole time.",
  "videoUrl": "https://youtu.be/w-bw3nR9kn4"
 },
 {
  "name": "Banded Step-Up (A Position)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hip Flexors"
  ],
  "equipment": "Band",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "With a band anchored low and looped around the working leg or hips, step up onto a box and drive the free knee up to hip height. Pause balanced in that position, then step back down.",
  "videoUrl": "https://www.youtube.com/watch?v=1Q5uXuKZPa0"
 },
 {
  "name": "Single-Leg Wall Sit",
  "category": "accessory",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Slide down a wall into a wall sit, then lift one foot off the floor. Hold with the standing knee over the foot for the time set, then switch legs.",
  "videoUrl": "https://www.youtube.com/watch?v=bUD8fyRFBhI"
 },
 {
  "name": "Wall Slide Quad Extension",
  "category": "accessory",
  "muscleGroup": "Quads",
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand with your back against a wall and slide down into a shallow knee bend. Straighten one knee out in front of you and hold it locked out for the time set, then switch legs.",
  "videoUrl": "https://youtu.be/ewSwMMF7ABU"
 },
 {
  "name": "Leg Press (Two-Up, One-Down Eccentric)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Machine",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Press the sled up with both legs, then take one foot off and lower the sled slowly with the other leg alone. Put both feet back on to press up again and alternate the lowering leg.",
  "videoUrl": "https://youtu.be/j0Mu-QOLoRY"
 },
 {
  "name": "Leg Extension (Two-Up, One-Down Eccentric)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "equipment": "Machine",
  "movementType": "Press",
  "laterality": "unilateral",
  "instructions": "Straighten both legs to lift the pad, then take one leg off and lower the pad slowly with the other alone. Lift with both again and alternate the lowering leg.",
  "videoUrl": "https://youtu.be/obsjkAHjgu0"
 },
 {
  "name": "Single-Leg Leg Extension (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "equipment": "Machine",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "On a leg extension machine, straighten one leg and hold the pad up with the knee locked out for the time set. Lower slowly and switch legs.",
  "videoUrl": "https://youtu.be/qsyAVyURfLo"
 },
 {
  "name": "Kettlebell Single-Leg Extension",
  "category": "accessory",
  "muscleGroup": "Quads",
  "equipment": "Kettlebell",
  "movementType": "Press",
  "laterality": "unilateral",
  "instructions": "Sit tall on a bench with a kettlebell hooked over one foot. Straighten that knee to lift the bell, then lower it slowly.",
  "videoUrl": "https://www.youtube.com/watch?v=jI8Dh2CCKFU"
 },
 {
  "name": "Kettlebell Single-Leg Extension (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Quads",
  "equipment": "Kettlebell",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Sit tall on a bench with a kettlebell hooked over one foot. Straighten that knee and hold the bell up with the leg locked out for the time set, then switch legs.",
  "videoUrl": "https://www.youtube.com/watch?v=6w0x79NOdUc"
 },
 {
  "name": "Deadlift (Banded)",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back",
   "Back"
  ],
  "equipment": "Barbell",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Set up a deadlift with a band anchored under the feet or platform and looped over the bar ends, so it pulls harder as you stand. Drive the floor away and finish tall against the band.",
  "videoUrl": "https://youtu.be/XOg9Zcb2PwY"
 },
 {
  "name": "Romanian Deadlift (Isometric Hold)",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hinge into the bottom of a Romanian deadlift, hips back, back flat and the weight close to the legs. Hold that position for the time set, then stand up.",
  "videoUrl": "https://youtu.be/frqlEu6zAWI"
 },
 {
  "name": "Romanian Deadlift (Eccentric Drop)",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back"
  ],
  "equipment": "Barbell",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "From standing, push the hips back fast into the bottom of a Romanian deadlift and stop dead with the back flat. Hold the stop briefly, then stand back up.",
  "videoUrl": "https://youtu.be/baRHpCWfcIs"
 },
 {
  "name": "Romanian Deadlift (Banded)",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back"
  ],
  "equipment": "Barbell",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Perform a Romanian deadlift with a band anchored under the feet and looped over the bar, so the pull gets harder as you stand. Keep the bar close and the back flat throughout.",
  "videoUrl": "https://youtu.be/vGm0ryaKpY8"
 },
 {
  "name": "Romanian Deadlift (Chains)",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back"
  ],
  "equipment": "Barbell",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Hang chains from the bar ends and perform a Romanian deadlift, the load growing as more chain lifts off the floor near the top. Keep the bar close and the back flat throughout.",
  "videoUrl": "https://youtu.be/D2yP_0W_PMI"
 },
 {
  "name": "Snatch-Grip Romanian Deadlift",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Back",
   "Traps"
  ],
  "equipment": "Barbell",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Hold the bar with a wide snatch grip and push the hips back, sliding the bar down the thighs with a flat back. Stand back up by driving the hips forward.",
  "videoUrl": "https://www.youtube.com/watch?v=MjK6JXuztxM"
 },
 {
  "name": "Staggered-Stance Romanian Deadlift",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Barbell",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Stand with one foot slightly back on its toes for balance and most of the weight on the front leg. Push the hips back and lower the weight along the front leg with a flat back, then stand up.",
  "videoUrl": "https://www.youtube.com/watch?v=hCT-AY9acS0"
 },
 {
  "name": "Glute Bridge (Feet Elevated)",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the feet on a bench or box. Drive the hips up until the body is straight from shoulders to knees, squeeze, then lower under control.",
  "videoUrl": "https://www.youtube.com/watch?v=L111J2zzJhk"
 },
 {
  "name": "Bench Glute Ham Raise",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bench",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Kneel on a padded bench with the ankles hooked under a loaded barbell or held down. Lower the body forward under control by straightening at the knees, then pull back up with the hamstrings.",
  "videoUrl": "https://www.youtube.com/watch?v=gFGXSnv0Zio"
 },
 {
  "name": "Safety Squat Bar Seated Good Morning",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Lower Back",
   "Glutes"
  ],
  "equipment": "Safety Squat Bar",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Sit on a bench with a safety squat bar on the back and the feet wide. Hinge forward from the hips with a flat back as far as you can control, then sit back up tall.",
  "videoUrl": "https://youtu.be/xbgIOj2CqXk"
 },
 {
  "name": "Trap Bar Romanian Deadlift",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back"
  ],
  "equipment": "Trap Bar",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Stand inside a trap bar holding the handles, knees soft. Push the hips back and lower the bar along the legs with a flat back, then drive the hips forward to stand.",
  "videoUrl": "https://www.youtube.com/watch?v=rO26j011Owc"
 },
 {
  "name": "Kettlebell Deadlift",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Quads"
  ],
  "equipment": "Kettlebell",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Stand over a kettlebell placed between the feet. Push the hips back, grip the handle with a flat back, and stand up tall, then lower it back between the feet.",
  "videoUrl": "https://www.youtube.com/watch?v=-obR8VAuDSg"
 },
 {
  "name": "Kettlebell Romanian Deadlift",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Kettlebell",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Hold a kettlebell in front of the thighs, knees soft. Push the hips back and lower the bell along the legs with a flat back, then drive the hips forward to stand.",
  "videoUrl": "https://www.youtube.com/watch?v=oAAJZnt72tg"
 },
 {
  "name": "Dumbbell Romanian Deadlift (Banded)",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back"
  ],
  "equipment": "Dumbbell",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Stand on a band and hold its ends with the dumbbells. Hinge into a Romanian deadlift, then stand up against the band's growing pull, keeping the back flat.",
  "videoUrl": "https://youtu.be/exrQ0di5pko"
 },
 {
  "name": "Supine Hamstring Bridge (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Kettlebell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the heels on a box, knees slightly bent and a kettlebell on the hips. Press the heels down to lift the hips and hold the bridge for the time set.",
  "videoUrl": "https://youtu.be/4Nh7uAoIh4g"
 },
 {
  "name": "Dumbbell Good Morning",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Lower Back",
   "Glutes"
  ],
  "equipment": "Dumbbell",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Hold a dumbbell across the upper chest or behind the neck, knees soft. Push the hips back and lower the torso with a flat back, then drive the hips forward to stand tall.",
  "videoUrl": "https://www.youtube.com/watch?v=YZfK1nQLDrI"
 },
 {
  "name": "Kettlebell Swing (Banded)",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Core"
  ],
  "equipment": "Kettlebell",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Perform a kettlebell swing with a band anchored to the floor and looped through the handle, so the bell is pulled back down faster. Snap the hips through on every rep and keep the back flat.",
  "videoUrl": "https://youtu.be/Sa76iPEsMnA"
 },
 {
  "name": "Alternating Single-Arm Kettlebell Swing",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Core",
   "Forearms"
  ],
  "equipment": "Kettlebell",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Swing a kettlebell with one hand, and at the top of each swing pass the handle to the other hand. Snap the hips through on every rep and keep the shoulders square.",
  "videoUrl": "https://youtu.be/YGRhZ9wpEPA"
 },
 {
  "name": "Landmine Romanian Deadlift",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Landmine",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Stand facing the end of a landmine bar and hold it with both hands in front of the hips. Push the hips back and lower the bar with a flat back, then stand tall.",
  "videoUrl": "https://youtu.be/WWfy6BxyDkE"
 },
 {
  "name": "Dowel Romanian Deadlift",
  "category": "mobility",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Hold a dowel along the spine touching the head, upper back and tailbone. Push the hips back and lower the torso without losing any of the three contacts, then stand up.",
  "videoUrl": "https://www.youtube.com/watch?v=9j2FFd2dVgI"
 },
 {
  "name": "Staggered-Stance Dowel Romanian Deadlift",
  "category": "mobility",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Hold a dowel along the spine and stand with one foot slightly back on its toes. Hinge over the front leg without the dowel leaving the head, upper back or tailbone, then stand up.",
  "videoUrl": "https://www.youtube.com/watch?v=maiC7AoRblM"
 },
 {
  "name": "Smith Machine Romanian Deadlift",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Smith Machine",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Hold the Smith machine bar in front of the thighs, knees soft. Push the hips back and lower the bar along the legs with a flat back, then stand tall.",
  "videoUrl": "https://youtu.be/_4zgBkSaSH4"
 },
 {
  "name": "Smith Machine Romanian Deadlift (Isometric Hold)",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Smith Machine",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hinge to the bottom of a Romanian deadlift on the Smith machine, hips back and back flat, and hold there for the time set. Stand up to finish.",
  "videoUrl": "https://youtu.be/Xt9fwx_YCIg"
 },
 {
  "name": "Dowel Good Morning",
  "category": "mobility",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Lower Back",
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Hold a dowel across the upper back. Push the hips back and lower the torso, keeping the dowel in contact with the back so the spine stays straight, then stand tall.",
  "videoUrl": "https://www.youtube.com/watch?v=3UoyO-n1U68"
 },
 {
  "name": "Harop Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Kneel with the ankles held down and the hips bent forward. Lower the body under control, then pull back up with the hamstrings while extending the hips so you finish kneeling upright.",
  "videoUrl": "https://youtu.be/NJxqYHUGHiI"
 },
 {
  "name": "Nordic Hamstring Curl (Banded)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Band",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Kneel with the ankles held and a band anchored in front looped around the chest. Lower the body forward as slowly as you can with the hips straight, letting the band take some of the weight, then return.",
  "videoUrl": "https://www.youtube.com/watch?v=AqeT289UygA"
 },
 {
  "name": "Nordic Hamstring Curl (Eccentric Overload)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Kneel with the ankles held and an extra load held at the chest. Lower the body forward as slowly as you can with the hips straight, then use the hands to push back up.",
  "videoUrl": "https://youtu.be/k9_S0ia19MY"
 },
 {
  "name": "Machine Nordic Hamstring Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Machine",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Kneel on the machine with the ankles locked under the pads. Lower the body forward as slowly as you can with the hips straight, then return to upright.",
  "videoUrl": "https://youtu.be/EzS3nJKV270"
 },
 {
  "name": "Razor Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Kneel with the ankles held. Lower the body forward slowly, and near the bottom bend at the hips, then pull the body back up with the hamstrings while straightening the hips to finish upright."
 },
 {
  "name": "GHD Harop Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Set up on a glute-ham developer with the hips bent forward over the pad. Pull up with the hamstrings while extending the hips so you finish with the body upright and straight, then lower under control.",
  "videoUrl": "https://www.youtube.com/watch?v=FZmM4bxY62U"
 },
 {
  "name": "GHD Nordic Hamstring Curl (Eccentric Tempo)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Kneel on a glute-ham developer with the feet locked in. Lower the body forward at the slow count set with the hips straight, then return to upright.",
  "videoUrl": "https://www.youtube.com/watch?v=regM7-CgToE"
 },
 {
  "name": "GHD Nordic Hamstring Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Kneel on a glute-ham developer with the feet locked in. Lower the body forward as slowly as you can with the hips straight, then pull back up to upright.",
  "videoUrl": "https://www.youtube.com/watch?v=DHZp0kuTPac"
 },
 {
  "name": "GHD Nordic Hamstring Curl (Weighted Vest)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Wearing a weighted vest, kneel on a glute-ham developer with the feet locked in. Lower the body forward as slowly as you can with the hips straight, then pull back up.",
  "videoUrl": "https://youtu.be/Q-A-sJTPVWw"
 },
 {
  "name": "GHD Razor Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Kneel on a glute-ham developer with the feet locked in. Lower forward, bend at the hips near the bottom, then pull back up with the hamstrings while straightening the hips to finish upright.",
  "videoUrl": "https://www.youtube.com/watch?v=lKzE5XAdV4c"
 },
 {
  "name": "GHD Razor Curl (Weighted Vest)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Wearing a weighted vest, kneel on a glute-ham developer with the feet locked in. Lower forward, bend at the hips near the bottom, then pull back up while straightening the hips.",
  "videoUrl": "https://youtu.be/HyV3oFR1PH8"
 },
 {
  "name": "Glute Ham Raise (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "On a glute-ham developer, let the body drop forward quickly from upright and stop it dead partway down with the hamstrings. Hold the stop briefly, then pull back up.",
  "videoUrl": "https://www.youtube.com/watch?v=SIJSNCQIvao"
 },
 {
  "name": "Glute Ham Raise (Perturbations)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Hold a water-filled bag at the chest on a glute-ham developer. Lower and raise under control while the shifting water tries to pull you off line, keeping the body straight.",
  "videoUrl": "https://youtu.be/ZMoTF16cMDk"
 },
 {
  "name": "Glute Ham Raise (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "GHD",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "On a glute-ham developer, lower the body to the angle set and hold it there with the hips straight for the time set. Pull back up to finish.",
  "videoUrl": "https://www.youtube.com/watch?v=rYhIx6oNRqM"
 },
 {
  "name": "Glute Ham Raise (Isometric Hold at Top)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "GHD",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "On a glute-ham developer, pull up to the top with the knees bent and the body upright. Hold that top position for the time set, then lower under control.",
  "videoUrl": "https://youtu.be/9zSGKM-HTNw"
 },
 {
  "name": "GHD Reverse Hyper",
  "category": "accessory",
  "muscleGroup": "Lower Back",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Lie face down on the glute-ham developer pad with the hips at its edge and the legs hanging. Raise the straight legs until they line up with the body, then lower them under control.",
  "videoUrl": "https://www.youtube.com/watch?v=n95v3YXD1gg"
 },
 {
  "name": "Band Good Morning",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Lower Back",
   "Glutes"
  ],
  "equipment": "Band",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Stand on a band with the other end looped behind the neck. Push the hips back and lower the torso with a flat back, then drive the hips forward to stand against the band.",
  "videoUrl": "https://www.youtube.com/watch?v=8ZKlEt3LnLI"
 },
 {
  "name": "Hip Thrust (Two-Up, One-Down Eccentric)",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Set up a hip thrust with the upper back on a bench. Drive the hips up with both feet, then lift one foot and lower the hips slowly on the other leg alone, alternating the lowering leg.",
  "videoUrl": "https://youtu.be/yP8P5tpHTkk"
 },
 {
  "name": "Hip Thrust (Feet Elevated)",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Rest the upper back on a bench and the feet on a second bench or box. Drive the hips up until the body is straight from shoulders to knees, squeeze, then lower.",
  "videoUrl": "https://www.youtube.com/watch?v=TQ4z_SGyofU"
 },
 {
  "name": "Machine Hip Thrust",
  "category": "strength",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Machine",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Set up in the hip thrust machine with the pad across the hips and the feet flat. Drive the hips up until the body is straight from shoulders to knees, squeeze, then lower.",
  "videoUrl": "https://youtu.be/7ZCizXRCem8"
 },
 {
  "name": "Machine Hip Thrust (Banded)",
  "category": "strength",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Machine",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Perform a machine hip thrust with bands added so the resistance grows near the top. Drive the hips all the way up, squeeze, then lower under control.",
  "videoUrl": "https://youtu.be/IxteayL5rkc"
 },
 {
  "name": "Smith Machine Hip Thrust",
  "category": "strength",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Smith Machine",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Sit with the upper back on a bench and the Smith machine bar padded across the hips. Drive the hips up until the body is straight from shoulders to knees, squeeze, then lower.",
  "videoUrl": "https://youtu.be/LzmrFPi9KVg"
 },
 {
  "name": "Smith Machine Hip Thrust (Isometric Hold)",
  "category": "strength",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Smith Machine",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Drive the Smith machine bar up into the top of a hip thrust and hold it there, hips fully extended, for the time set. Lower under control.",
  "videoUrl": "https://youtu.be/Slu42QUAYNA"
 },
 {
  "name": "Isometric Mid-Thigh Pull",
  "category": "strength",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Hamstrings",
   "Glutes",
   "Back"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Set a barbell in a rack against the pins at mid-thigh height and take a deadlift grip with the torso upright and knees bent. Pull as hard as you can into the immovable bar for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=6U9YgO6NgPs"
 },
 {
  "name": "Ring Hamstring Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Rings",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the heels in rings hanging low. Lift the hips into a bridge and pull the heels toward the hips, then straighten the legs under control without dropping the hips.",
  "videoUrl": "https://www.youtube.com/watch?v=mro2ofODnJ8"
 },
 {
  "name": "Slider Hamstring Curl (Eccentric Tempo)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Slider",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the heels on sliders and the hips lifted into a bridge. Slide the heels away at the slow count set while keeping the hips up, then reset.",
  "videoUrl": "https://www.youtube.com/watch?v=wIQMT-JW7iI"
 },
 {
  "name": "Slider Hamstring Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Slider",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the heels on sliders and lift the hips into a bridge. Slide the heels away until the legs are nearly straight, then pull them back in, keeping the hips up.",
  "videoUrl": "https://youtu.be/QiHDhxwqEwI"
 },
 {
  "name": "Slider Hamstring Curl (Rotation)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Obliques"
  ],
  "equipment": "Slider",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Lie on your back with the heels on sliders in a bridge. Slide one heel out on an angle across the body while the hips stay level, pull it back in, and alternate sides.",
  "videoUrl": "https://youtu.be/gtiY5qXYj88"
 },
 {
  "name": "TRX Hamstring Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "TRX",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the heels in the suspension trainer foot cradles. Lift the hips into a bridge and pull the heels toward the hips, then straighten the legs under control.",
  "videoUrl": "https://youtu.be/vmtrXSEoucI"
 },
 {
  "name": "Glute Bridge Walkout",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Lift into a glute bridge, then walk the heels away in small steps until the legs are nearly straight and walk them back in. Keep the hips up the whole time.",
  "videoUrl": "https://www.youtube.com/watch?v=j5INdJlc40c"
 },
 {
  "name": "Foam Roller Glute Bridge Walkout",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Foam Roller",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the heels on a foam roller and lift into a bridge. Roll the heels out in small steps until the legs are nearly straight and back in, keeping the hips up.",
  "videoUrl": "https://www.youtube.com/watch?v=tGoD9o7OpII"
 },
 {
  "name": "Stability Ball Glute Bridge",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Core"
  ],
  "equipment": "Stability Ball",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the heels on a stability ball and the legs straight. Drive the hips up until the body is in a straight line, hold the ball still, then lower.",
  "videoUrl": "https://youtu.be/Oyw3wXQtXB4"
 },
 {
  "name": "Stability Ball Glute Bridge Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Stability Ball",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the heels on a stability ball and lift into a bridge. Pull the ball toward the hips by bending the knees, then roll it back out, keeping the hips up.",
  "videoUrl": "https://youtu.be/yMZlSZROFTc"
 },
 {
  "name": "Stability Ball Hamstring Kick",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Stability Ball",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one heel on a stability ball and the hips lifted. Quickly pull the ball in and push it back out with that heel for the reps set, keeping the hips up, then switch legs.",
  "videoUrl": "https://www.youtube.com/watch?v=TN_Pf6AusW4"
 },
 {
  "name": "Machine Supine Hamstring Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "equipment": "Machine",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Lie on your back on the machine with the legs straight and the pad behind the ankles. Curl the heels down and toward the hips, then straighten the legs under control.",
  "videoUrl": "https://youtu.be/qN_jfudNM_Y"
 },
 {
  "name": "Banded Supine Hamstring Tantrum",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Lie on your back with a band looped from an anchor around both ankles, legs straight. Curl the heels toward the hips against the band in fast, short alternating kicks for the time set. Keep the hips down and the reps quick.",
  "videoUrl": "https://youtu.be/791IA2clG4M"
 },
 {
  "name": "Banded Prone Hamstring Tantrum",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Lie face down with a band looped from an anchor around both ankles. Curl the heels toward the glutes in fast, short alternating kicks for the time set. Keep the hips pressed into the floor.",
  "videoUrl": "https://youtu.be/gvV53VyZ91o"
 },
 {
  "name": "Single-Leg Romanian Deadlift (Chains)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Hold a barbell with chains hanging from each end and balance on one leg. Hinge at the hip with the free leg reaching back until the torso is near parallel, then stand tall as the chains lift off the floor. Keep the hips square to the ground.",
  "videoUrl": "https://youtu.be/vs3zDyq33Q4"
 },
 {
  "name": "Single-Leg Romanian Deadlift (Supramaximal Eccentric)",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Load the bar heavier than you can lift on one leg and lower it slowly into a single-leg Romanian deadlift, hips back and back flat. Use both legs or a partner to bring the bar back up. Take three to five seconds on every lowering.",
  "videoUrl": "https://youtu.be/nQHwG3Jtb0A"
 },
 {
  "name": "Single-Leg Romanian Deadlift (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Dumbbell",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Stand tall on one leg holding the load, then drop quickly into the bottom of a single-leg Romanian deadlift and stop hard, hips back and back flat. Stand back up with control and reset before the next drop.",
  "videoUrl": "https://youtu.be/O1ffYJeM3K8"
 },
 {
  "name": "Single-Leg Glute Bridge",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one foot flat near your hips and the other leg lifted. Drive through the planted heel to raise the hips until the body is straight from shoulder to knee, then lower with control. Keep the pelvis level the whole time.",
  "videoUrl": "https://www.youtube.com/watch?v=MtQhljPAGcY"
 },
 {
  "name": "Single-Leg Glute Bridge (Isometric Push)",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Set up for a single-leg glute bridge under a barbell pinned or strapped so it cannot rise. Drive the hips up into the bar as hard as you can for the time set. Keep the pelvis level and push through the planted heel.",
  "videoUrl": "https://youtu.be/uOKCH1hmv-s"
 },
 {
  "name": "Single-Leg Bench Glute Ham Raise",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bench",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one heel on a bench, the knee bent, and a load across the hips if used. Drive the heel down and pull toward the bench to lift the hips, then lower with control. Keep the other leg lifted and the hips level.",
  "videoUrl": "https://www.youtube.com/watch?v=layglByTFnE"
 },
 {
  "name": "Single-Leg Supine Hamstring Bridge (Isometric Push)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one heel on a bench and a barbell fixed across the hips so it cannot rise. Press the heel down and drive the hips up into the bar as hard as you can for the time set. Keep the knee slightly bent and the hips level.",
  "videoUrl": "https://www.youtube.com/watch?v=YsZUKqnZelM"
 },
 {
  "name": "Single-Leg Supine Hamstring Bridge (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one heel on a bench or box and the other leg lifted, a load across the hips if used. Press the heel down to lift the hips and hold the top position for the time set. Keep the hips level and the knee slightly bent.",
  "videoUrl": "https://youtu.be/ZhYGCx7VlGM"
 },
 {
  "name": "Single-Leg Wall Glute Bridge March",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Lie on your back with the feet on a wall, knees bent, and lift the hips into a bridge. Take one foot off the wall and march, alternating legs while the hips stay up and level. Keep pressing the planted foot into the wall.",
  "videoUrl": "https://www.youtube.com/watch?v=9kfgx5EWvz4"
 },
 {
  "name": "Safety Bar Rear-Foot-Elevated Good Morning",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back"
  ],
  "equipment": "Safety Squat Bar",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "With a safety squat bar on the back, set the rear foot on a bench as for a split squat. Hinge forward at the front hip with a soft knee until you feel a deep stretch, then drive the hip forward to stand. Keep the back flat and the weight over the front foot.",
  "videoUrl": "https://youtu.be/__cJDPcAFnU"
 },
 {
  "name": "Single-Leg Romanian Deadlift (One Arm)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Dumbbell",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Hold a dumbbell in one hand and balance on one leg. Hinge at the hip with the free leg reaching back until the torso is near parallel, then stand tall. Keep the shoulders and hips square despite the one-sided load.",
  "videoUrl": "https://www.youtube.com/watch?v=JeUbdLVsgxc"
 },
 {
  "name": "Single-Leg Kettlebell Swing",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Core"
  ],
  "equipment": "Kettlebell",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Stand on one leg with the kettlebell hanging between your hands and the free foot lightly off the floor or behind you. Hinge back and snap the hip forward to swing the bell to chest height, then let it fall back into the hinge. Keep the standing knee soft and the hips square.",
  "videoUrl": "https://www.youtube.com/watch?v=-Awcu9iu7g4"
 },
 {
  "name": "Landmine Single-Leg Romanian Deadlift",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Landmine",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Stand beside the end of a landmine bar holding it in the hand opposite the standing leg. Hinge at the hip with the free leg reaching back until the torso is near parallel, then stand tall. Let the bar's arc guide the hinge while the hips stay square.",
  "videoUrl": "https://youtu.be/0EwQ-_dZix0"
 },
 {
  "name": "Landmine Single-Leg Romanian Deadlift (Two-Up, One-Down Eccentric)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Landmine",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Stand up from the bottom of a landmine Romanian deadlift on both legs, then lift one foot and lower slowly on the other leg. Return to both feet to stand again. Take three to five seconds on every lowering.",
  "videoUrl": "https://youtu.be/pDHikEBn5gM"
 },
 {
  "name": "Landmine Single-Leg Glute Bridge",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Landmine",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Lie on your back with the end of a landmine bar padded across the hips and one foot planted. Drive through the heel to raise the hips and the bar until the body is straight from shoulder to knee, then lower with control. Keep the pelvis level.",
  "videoUrl": "https://youtu.be/VQpcwNCyX5c"
 },
 {
  "name": "Landmine Single-Leg Hip Thrust",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Landmine",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Set the upper back on a bench with the end of a landmine bar padded across the hips and one foot planted. Drive through the heel to lock the hips out, then lower with control. Keep the ribs down and the pelvis level.",
  "videoUrl": "https://youtu.be/pD9CrDDfP_0"
 },
 {
  "name": "Landmine Kneeling Hip Extension",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Landmine",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee with the end of a landmine bar hooked behind the working thigh or held at the hip. Sit the hips back toward the heel, then drive them forward to full extension against the bar. Squeeze the glute at the top without arching the low back.",
  "videoUrl": "https://www.youtube.com/watch?v=8BFSrpF_5do"
 },
 {
  "name": "Single-Leg Romanian Deadlift (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hinge on one leg into the bottom of a single-leg Romanian deadlift, torso near parallel and the free leg reaching back, and hold for the time set. Keep the hips square and the standing knee soft.",
  "videoUrl": "https://www.youtube.com/watch?v=z41nsMCzd9s"
 },
 {
  "name": "Sprinter Romanian Deadlift",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Hip Flexors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Balance on one leg and hinge into a single-leg Romanian deadlift with the arms in a running position. Stand up and drive the free knee forward and up into a sprint posture. Keep the standing hip level and finish tall.",
  "videoUrl": "https://www.youtube.com/watch?v=G5bQB4R67Z8"
 },
 {
  "name": "Single-Leg Rotational Romanian Deadlift",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Obliques"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Balance on one leg and hinge forward, rotating the torso so the opposite hand reaches across toward the standing foot. Stand back up and unwind to face forward. Move the rotation from the hip, not by rounding the back.",
  "videoUrl": "https://youtu.be/ISSKOylfO6o"
 },
 {
  "name": "Smith Machine Single-Leg Romanian Deadlift",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Smith Machine",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Stand on one leg holding the Smith machine bar in front of the thighs. Hinge at the hip with the free leg reaching back until you feel a deep stretch, then stand tall. Keep the bar close to the legs and the hips square.",
  "videoUrl": "https://youtu.be/HJo0AzrLJQk"
 },
 {
  "name": "Smith Machine Single-Leg Romanian Deadlift (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Smith Machine",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hinge on one leg into the bottom of a single-leg Romanian deadlift holding the Smith machine bar, and hold for the time set. Keep the back flat and the hips square.",
  "videoUrl": "https://youtu.be/jCBTOoVGo3M"
 },
 {
  "name": "Single-Leg Romanian Deadlift (Isometric Push)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Set a barbell under safety pins at mid-shin height and stand on one leg in a single-leg Romanian deadlift position. Pull the bar up into the pins as hard as you can for the time set. Keep the back flat and the hips square.",
  "videoUrl": "https://youtu.be/_RYPOazP9xE"
 },
 {
  "name": "Aqua Bag Single-Leg Romanian Deadlift (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Sandbag",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Hold a water-filled bag and balance on one leg. Drop quickly into the bottom of a single-leg Romanian deadlift and stop hard while the water settles, then stand tall with control. Keep the hips square as the load shifts.",
  "videoUrl": "https://youtu.be/DIBF2DRjtOY"
 },
 {
  "name": "Single-Leg Harop Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Set one foot in a glute-ham developer or under an anchor with the other leg free, starting tall on the knee. Hinge forward at the hip, then curl the body back up through the hamstring while extending the hip to finish upright. Keep the movement smooth from hinge to curl.",
  "videoUrl": "https://www.youtube.com/watch?v=KSP4dXEp5lw"
 },
 {
  "name": "Single-Leg Harop Curl (Partner)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Kneel with one ankle held down by a partner and the other leg free. Hinge forward at the hip, then curl back up through the hamstring while extending the hip to finish upright. Keep the movement smooth from hinge to curl.",
  "videoUrl": "https://youtu.be/Q0i_YhGx_jY"
 },
 {
  "name": "Single-Leg Nordic Hamstring Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Kneel with one ankle anchored and the other leg lifted, body straight from knee to head. Lower forward as slowly as you can through the anchored leg, catch yourself with the hands, and push back up. Keep the hips extended throughout."
 },
 {
  "name": "Single-Leg Razor Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Start tall on one knee with that ankle anchored and the other leg free. Lower the body forward until it is near parallel to the floor, then curl back up through the hamstring to tall kneeling. Keep a straight line from knee to head."
 },
 {
  "name": "Single-Leg Glute Ham Raise",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Set one foot in the glute-ham developer with the other leg free. Lower the body forward from the knee, then pull back up through the hamstring to upright. Keep the hips extended and the body in one line.",
  "videoUrl": "https://www.youtube.com/watch?v=41uK-Xr9dvk"
 },
 {
  "name": "Aqua Bag Single-Leg Glute Ham Raise (Perturbations)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Set one foot in the glute-ham developer holding a water-filled bag at the chest. Lower and rise through a single-leg glute-ham raise while the bag's shifting water pulls you off line. Keep the body straight and the hips extended.",
  "videoUrl": "https://youtu.be/llCH2KOoZDM"
 },
 {
  "name": "Aqua Bag Single-Leg Glute Ham Raise (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Set one foot in the glute-ham developer holding a water-filled bag at the chest. Drop quickly forward from upright and stop hard partway down, then pull back up. Keep the hips extended as the water settles.",
  "videoUrl": "https://youtu.be/B_nMJobkfMc"
 },
 {
  "name": "GHD Single-Leg Harop Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Set one foot in the glute-ham developer with the hips on the pad and the other leg free. Hinge down over the pad, extend the hip, then curl the body up through the hamstring to upright. Keep the movement smooth from hinge to curl.",
  "videoUrl": "https://youtu.be/0Z9i_KgZ8K0"
 },
 {
  "name": "GHD Single-Leg Nordic Hamstring Curl (Eccentric Only)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Kneel on the glute-ham developer pad with one ankle locked and the other leg free. Lower forward as slowly as you can through the locked leg, then use the hands to return to the start. Keep the hips extended the whole way down.",
  "videoUrl": "https://youtu.be/CRUanVpb7ps"
 },
 {
  "name": "GHD Single-Leg Razor Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Set one foot in the glute-ham developer, kneeling tall on the pad with the other leg free. Lower forward until the body is near parallel, then curl back up through the hamstring. Keep a straight line from knee to head."
 },
 {
  "name": "Slider Single-Leg Hamstring Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Slider",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one heel on a slider and the other leg lifted, and bridge the hips up. Slide the heel out until the leg is nearly straight, then pull it back in under the knee. Keep the hips up the whole set.",
  "videoUrl": "https://youtu.be/rtN7EUhMb2E"
 },
 {
  "name": "Slider Single-Leg Hamstring Curl (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Slider",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Bridge up on one heel set on a slider, slide out partway and hold the position for the time set. Keep the hips up and level.",
  "videoUrl": "https://www.youtube.com/watch?v=pfKqjGphduk"
 },
 {
  "name": "Slider Single-Leg Hamstring Curl (Eccentric Only)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Slider",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Bridge up with both heels on sliders, lift one foot, and slide the working heel out as slowly as you can until the leg is nearly straight. Return with both legs. Keep the hips up as the leg lengthens.",
  "videoUrl": "https://www.youtube.com/watch?v=PaUye2YBTx0"
 },
 {
  "name": "Single-Leg Glute Bridge (Elevated)",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one foot on a box or bench and the other leg lifted. Drive through the heel to raise the hips until the body is straight from shoulder to knee, then lower with control. Keep the pelvis level.",
  "videoUrl": "https://youtu.be/7Cjpy6OpMAo"
 },
 {
  "name": "Stability Ball Single-Leg Glute Bridge",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Core"
  ],
  "equipment": "Stability Ball",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one heel on a stability ball and the other leg lifted. Press the heel into the ball to lift the hips until the body is straight, then lower with control. Keep the ball still and the hips level.",
  "videoUrl": "https://youtu.be/Gb4eNFIeaOo"
 },
 {
  "name": "Stability Ball Single-Leg Glute Bridge Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Stability Ball",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one heel on a stability ball and bridge the hips up. Curl the ball toward the hips with the heel, then roll it back out while the hips stay up. Keep the other leg lifted and the hips level.",
  "videoUrl": "https://youtu.be/89XqQw4uCIk"
 },
 {
  "name": "Single-Leg Glute Bridge (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Bridge up on one leg until the body is straight from shoulder to knee and hold the top for the time set. Keep the pelvis level and squeeze through the planted heel.",
  "videoUrl": "https://www.youtube.com/watch?v=90YJHs2MawY"
 },
 {
  "name": "Foam Roller Single-Leg Glute Bridge (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Core"
  ],
  "equipment": "Foam Roller",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one foot on a foam roller and the other leg lifted. Bridge the hips up and hold the top for the time set without letting the roller move. Keep the pelvis level.",
  "videoUrl": "https://www.youtube.com/watch?v=8TRXsGl_kHw"
 },
 {
  "name": "Single-Leg Hip Thrust Jump",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Set the upper back on a bench with one foot planted. Drive the hip up so fast that the foot leaves the floor, land softly on the same foot, and reset. Make every rep a quick, full hip extension.",
  "videoUrl": "https://www.youtube.com/watch?v=iOPaK3ZCf_E"
 },
 {
  "name": "Single-Leg Hip Thrust (Elevated)",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Set the upper back on a bench and the working foot on a box or step, the other leg lifted. Drive through the heel to lock the hips out, then lower into the deeper range. Keep the ribs down and the pelvis level.",
  "videoUrl": "https://www.youtube.com/watch?v=ePcsecVH0VE"
 },
 {
  "name": "Machine Single-Leg Hip Thrust",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Machine",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Set up in the hip thrust machine with the pad over the hips and one foot on the platform. Drive through the heel to lock the hips out, then lower with control. Keep the pelvis level.",
  "videoUrl": "https://youtu.be/CZWYshKyH5E"
 },
 {
  "name": "Smith Machine Single-Leg Hip Thrust",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Smith Machine",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Set the upper back on a bench with the Smith machine bar padded across the hips and one foot planted. Drive through the heel to lock the hips out, then lower with control. Keep the ribs down and the pelvis level.",
  "videoUrl": "https://youtu.be/YwVjdacah7w"
 },
 {
  "name": "Smith Machine Single-Leg Hip Thrust (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Smith Machine",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Thrust the Smith machine bar up on one leg and hold the hips locked out for the time set. Keep the ribs down and the pelvis level.",
  "videoUrl": "https://youtu.be/axGHkJRngH8"
 },
 {
  "name": "Single-Leg Back Extension",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back"
  ],
  "equipment": "Machine",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Set up on the back extension bench with one foot under the anchor and the other leg free. Lower the torso by hinging at the hip, then raise it until the body is in a straight line. Lead with the hip, not by arching the low back.",
  "videoUrl": "https://youtu.be/sX00IiQGUKY"
 },
 {
  "name": "Single-Leg Glute Ham Raise with Bumper Plate (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "GHD",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Set one foot in the glute-ham developer holding a bumper plate at the chest. Drop quickly forward from upright and stop hard partway down, then pull back up. Keep the hips extended throughout.",
  "videoUrl": "https://youtu.be/-LdyQdoL_jM"
 },
 {
  "name": "Single-Leg Bench Glute Ham Raise (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bench",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one heel on a bench and bridge the hips up, the other leg lifted. Hold the top position for the time set. Keep pulling the heel toward the bench and the hips level.",
  "videoUrl": "https://www.youtube.com/watch?v=aVreY-C7Few"
 },
 {
  "name": "Aqua Bag Single-Leg Elevated Supine Hamstring Bridge (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Sandbag",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one heel on a box and a water-filled bag across the hips. Bridge up and hold the top position for the time set while the water shifts. Keep the hips level.",
  "videoUrl": "https://youtu.be/1A8mlLQ3FTg"
 },
 {
  "name": "Hamstring Glider",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Slider",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Kneel with the feet anchored and the knees on sliders or a smooth surface. Let the knees slide back as the body lowers toward the floor, catch yourself with the hands, and pull the knees back in through the hamstrings. Keep the hips extended.",
  "videoUrl": "https://youtu.be/ho5BJvqCCGE"
 },
 {
  "name": "Hamstring Glider (Partner)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Slider",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Kneel on sliders with a partner holding the ankles. Let the knees slide back as the body lowers, catch yourself with the hands, and pull back in through the hamstrings. Keep the hips extended.",
  "videoUrl": "https://youtu.be/XnB62v7joWk"
 },
 {
  "name": "Rings Single-Leg Hamstring Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Rings",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one heel in a low ring strap and the other leg lifted. Bridge the hips up and curl the heel toward the hips, then extend the leg back out. Keep the hips up the whole set.",
  "videoUrl": "https://www.youtube.com/watch?v=Keg7f11kmso"
 },
 {
  "name": "Hamstring Drop (Partner)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Lie face down with the knees bent to ninety degrees while a partner pushes the heels toward the floor. Resist and stop the drop as early as you can, then return the legs to the start. Keep the hips pressed into the floor.",
  "videoUrl": "https://youtu.be/BwtBOk1osL8"
 },
 {
  "name": "Single-Leg Box Hamstring Bridge (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Box",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one heel on a box and the other leg lifted. Press the heel down to lift the hips and hold the top position for the time set. Keep the hips level.",
  "videoUrl": "https://youtu.be/jscq2JGOF1w"
 },
 {
  "name": "Single-Leg Box Hamstring Bridge (March)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Box",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Bridge up with both heels on a box, then march, lifting one foot at a time while the hips stay up and level. Keep pressing the planted heel into the box.",
  "videoUrl": "https://youtu.be/bFnuQcV-jcc"
 },
 {
  "name": "Single-Leg Box Hamstring Bridge (Switch)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Box",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Bridge up on one heel set on a box, then quickly switch to the other heel without letting the hips drop. Keep the switches crisp and the pelvis level.",
  "videoUrl": "https://youtu.be/9NcU7NK9l_Q"
 },
 {
  "name": "Single-Leg Box Hamstring Bridge (Catch)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Box",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hold the bridge with the hips up, lift the heel just off the box, then drop it back and catch the position firmly on one leg. Keep the hips from sagging on each catch.",
  "videoUrl": "https://youtu.be/1aDxWeNrooI"
 },
 {
  "name": "Single-Leg Box Hamstring Bridge (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Box",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Bridge up on one heel set on a box, let the hips drop quickly, and stop them hard partway down. Drive back up and reset before the next drop.",
  "videoUrl": "https://youtu.be/jhcIMIn9Ea4"
 },
 {
  "name": "Single-Leg Box Hamstring Bridge (Eccentric Tempo)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Box",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Bridge up on one heel set on a box, then lower the hips slowly over three to five seconds. Drive back up and repeat. Keep the pelvis level on the way down.",
  "videoUrl": "https://youtu.be/UUEQxuwUn7Y"
 },
 {
  "name": "Single-Leg Hamstring Catch",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one heel on the floor and the hips bridged up. Lift the heel slightly, let the hips fall, and catch the bridge position sharply as the heel returns. Keep the reps quick and the hips level.",
  "videoUrl": "https://www.youtube.com/watch?v=l5EvTwpcCd0"
 },
 {
  "name": "Single-Leg Hamstring Catch (Elevated)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Bench",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one heel on a bench and the hips bridged up. Lift the heel slightly, let the hips fall, and catch the bridge sharply as the heel lands back on the bench. Keep the hips level.",
  "videoUrl": "https://www.youtube.com/watch?v=Kcj65x1UbUg"
 },
 {
  "name": "Box Hamstring Catch",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Box",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Lie on your back with both heels on a box and the hips bridged up. Lift the heels slightly, let the hips fall, and catch the bridge sharply as the heels land. Keep the reps quick.",
  "videoUrl": "https://www.youtube.com/watch?v=q-5_jX5H8qg"
 },
 {
  "name": "Banded Single-Leg Supine Hamstring Tantrum",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Lie on your back with a band looped from an anchor around one ankle, the leg straight. Curl the heel toward the hip against the band in fast, short kicks for the time set. Keep the hips down.",
  "videoUrl": "https://youtu.be/jmWHVCtttRw"
 },
 {
  "name": "Banded Single-Leg Hamstring Catch",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Band",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Set up for a single-leg hamstring catch with a band pulling the planted foot away from you. Let the hips fall and catch the bridge sharply against the band's pull. Keep the hips level.",
  "videoUrl": "https://youtu.be/nf8MH6vcmg8"
 },
 {
  "name": "Banded Oscillating Standing Hamstring Tantrum (Hip Flexion)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Stand on one leg with a band looped around the other ankle from an anchor. Make fast, short oscillating movements in hip flexion against the band for the time set. Keep the standing hip level and the trunk still.",
  "videoUrl": "https://youtu.be/ajYD_ISDo6s"
 },
 {
  "name": "Banded Oscillating Standing Hamstring Tantrum (Hip Extension)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Stand on one leg with a band looped around the other ankle from an anchor. Make fast, short oscillating movements in hip extension against the band for the time set. Keep the standing hip level and the trunk still.",
  "videoUrl": "https://youtu.be/RxbX7EhL6uE"
 },
 {
  "name": "Banded Oscillating Standing Hamstring Tantrum (Knee Flexion)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Stand on one leg with a band looped around the other ankle from an anchor. Make fast, short oscillating movements in knee flexion against the band for the time set. Keep the standing hip level and the trunk still.",
  "videoUrl": "https://youtu.be/mAtq5yfOEmA"
 },
 {
  "name": "Medicine Ball Single-Leg Elevated Supine Hamstring Hold and Throw",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Lie on your back with one heel on a box and bridge the hips up. Hold the bridge while you throw and catch a medicine ball with a partner or a wall. Keep the hips level with every throw.",
  "videoUrl": "https://youtu.be/OuRo3rf78k8"
 },
 {
  "name": "Medicine Ball Single-Leg Romanian Deadlift (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Hold a medicine ball and balance on one leg. Drop quickly into the bottom of a single-leg Romanian deadlift and stop hard, then stand tall with control. Keep the hips square.",
  "videoUrl": "https://youtu.be/g48rYCdn0OE"
 },
 {
  "name": "Single-Leg Romanian Deadlift to Box A-Position",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Hip Flexors"
  ],
  "equipment": "Plate",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Hold a plate and hinge into a single-leg Romanian deadlift. Stand up and drive the free knee up into an A-position, placing that foot on a box in front of you. Finish tall over the standing leg.",
  "videoUrl": "https://youtu.be/cQD1dovPAes"
 },
 {
  "name": "Stability Ball Leg Extension",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Stability Ball",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the heels on a stability ball, knees bent and hips bridged up. Roll the ball out until the legs are nearly straight while the hips stay up, then curl it back in. Keep the hips from dropping as the legs lengthen.",
  "videoUrl": "https://www.youtube.com/watch?v=B3nC0dULTLs"
 },
 {
  "name": "Seated Leg Curl (Two-Up, One-Down Eccentric)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "equipment": "Machine",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Curl the pad down with both legs on the seated leg curl, then take one leg off and return the pad slowly with the other. Take three to five seconds on every lowering.",
  "videoUrl": "https://youtu.be/qzkKF821lHM"
 },
 {
  "name": "Lying Leg Curl (Two-Up, One-Down Eccentric)",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "equipment": "Machine",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Curl the pad up with both legs on the lying leg curl, then take one leg off and lower the pad slowly with the other. Take three to five seconds on every lowering.",
  "videoUrl": "https://youtu.be/Nvp2fWeG9Z8"
 },
 {
  "name": "Single-Leg Lying Leg Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "equipment": "Machine",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Set up on the lying leg curl with the pad behind one ankle. Curl the heel toward the glute, then lower with control. Keep the hips pressed into the pad.",
  "videoUrl": "https://youtu.be/Kce29l-QLuE"
 },
 {
  "name": "Single-Leg Seated Leg Curl",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "equipment": "Machine",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Sit in the seated leg curl with the pad behind one ankle. Curl the leg down and back as far as it goes, then return with control. Keep the thigh pinned under the pad.",
  "videoUrl": "https://youtu.be/9djdSUC_S-A"
 },
 {
  "name": "Flywheel Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Flywheel",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Stand on the flywheel platform with the strap attached to a harness or bar. Squat up hard to spin the wheel, then resist its pull as you lower and brake near the bottom. Push harder each rep to build the load.",
  "videoUrl": "https://youtu.be/0sKViugtu_s"
 },
 {
  "name": "Flywheel Squat (Supported)",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Flywheel",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Hold a fixed support in front of you while squatting on the flywheel platform. Squat up hard, then resist the wheel's pull on the way down. Use the support for balance, not to pull yourself up.",
  "videoUrl": "https://youtu.be/qWT535AouY0"
 },
 {
  "name": "Flywheel Zercher Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Flywheel",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Hold the flywheel bar in the crook of the elbows. Squat up hard to spin the wheel, then resist its pull as you lower. Keep the torso upright and the elbows high.",
  "videoUrl": "https://youtu.be/JdRlfZko7fI"
 },
 {
  "name": "Flywheel Split Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Flywheel",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand in a split stance on the flywheel platform with the strap attached to a harness. Drive up hard through the front leg, then resist the wheel's pull as you lower. Keep the front heel down.",
  "videoUrl": "https://www.youtube.com/watch?v=3Kf6-5VHoms"
 },
 {
  "name": "Flywheel Lateral Split Squat",
  "category": "strength",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Quads",
   "Glutes"
  ],
  "equipment": "Flywheel",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Stand wide on the flywheel platform with the strap attached to a harness. Shift into one leg and drive back up hard, then resist the wheel's pull as you sit back into that hip. Keep the other leg straight.",
  "videoUrl": "https://www.youtube.com/watch?v=KxwKsTyp3sI"
 },
 {
  "name": "Flywheel Bulgarian Split Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Flywheel",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Set the rear foot on a bench behind the flywheel platform with the strap attached to a harness. Drive up hard through the front leg, then resist the wheel's pull as you lower. Keep the front heel down.",
  "videoUrl": "https://www.youtube.com/watch?v=DCwJgqEvka8"
 },
 {
  "name": "Flywheel Single-Leg Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Flywheel",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Stand on one leg on the flywheel platform with the strap attached to a harness. Squat up hard to spin the wheel, then resist its pull as you lower. Keep the knee tracking over the foot.",
  "videoUrl": "https://youtu.be/RhDP4g5EpQw"
 },
 {
  "name": "Flywheel Single-Leg Rhythm Squat",
  "category": "strength",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Flywheel",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Stand on one leg on the flywheel platform and squat through a short range in a quick, steady rhythm. Brake the wheel each time near the bottom and drive straight back up. Keep the knee over the foot.",
  "videoUrl": "https://youtu.be/L-f294HMlF8"
 },
 {
  "name": "Flywheel Romanian Deadlift",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back"
  ],
  "equipment": "Flywheel",
  "movementType": "Hinge",
  "laterality": "bilateral",
  "instructions": "Stand on the flywheel platform holding the bar or handles. Drive the hips forward hard to stand, then resist the wheel's pull as you hinge back. Keep the back flat and the knees soft.",
  "videoUrl": "https://www.youtube.com/watch?v=zgYq99woNqw"
 },
 {
  "name": "Flywheel Staggered Romanian Deadlift",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes"
  ],
  "equipment": "Flywheel",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Stand on the flywheel platform with one foot slightly back on its toes, weight on the front leg. Drive the hips forward hard to stand, then resist the wheel's pull as you hinge back. Keep the hips square.",
  "videoUrl": "https://youtu.be/gN2X5LlnH94"
 },
 {
  "name": "Flywheel Squat to Romanian Deadlift",
  "category": "strength",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Quads",
   "Hamstrings",
   "Glutes"
  ],
  "equipment": "Flywheel",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "On the flywheel platform, squat up hard, then let the wheel pull you down into a Romanian deadlift hinge and brake there. Drive back up and repeat. Keep the back flat in both positions.",
  "videoUrl": "https://www.youtube.com/watch?v=pymp6bBZTpk"
 },
 {
  "name": "Flywheel Prone Leg Curl",
  "category": "strength",
  "muscleGroup": "Hamstrings",
  "equipment": "Flywheel",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Lie face down with the flywheel strap attached at the ankle. Curl the heel toward the glute hard, then resist the wheel's pull as the leg straightens. Keep the hips pressed down.",
  "videoUrl": "https://youtu.be/rjV-q9-AwTw"
 },
 {
  "name": "Flywheel Calf Raise",
  "category": "strength",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Flywheel",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Stand on the flywheel platform with the strap attached to a harness. Rise hard onto the balls of the feet, then resist the wheel's pull as the heels lower. Keep the knees straight.",
  "videoUrl": "https://www.youtube.com/watch?v=HIUP2ptb8NA"
 },
 {
  "name": "Flywheel Calf Raise (Two-Up, One-Down Eccentric)",
  "category": "strength",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Flywheel",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "On the flywheel platform, rise onto the balls of both feet, then lift one foot and resist the wheel's pull on the other as the heel lowers. Return to both feet to rise again.",
  "videoUrl": "https://youtu.be/0x3lc95lJ-I"
 },
 {
  "name": "Flywheel Single-Leg Calf Raise",
  "category": "strength",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Flywheel",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Stand on one leg on the flywheel platform with the strap attached to a harness. Rise hard onto the ball of the foot, then resist the wheel's pull as the heel lowers.",
  "videoUrl": "https://youtu.be/T3wXWTGcgHU"
 },
 {
  "name": "Trap Bar Calf Raise",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Trap Bar",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Stand inside a trap bar holding the handles at arm's length. Rise onto the balls of the feet as high as possible, then lower with control. Keep the knees straight and the body tall.",
  "videoUrl": "https://youtu.be/i_rzcYkqWFA"
 },
 {
  "name": "Loaded Altitude Drop Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Dumbbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Hold dumbbells and step off a box. Land on both feet and stick the landing in an athletic position, hips back and knees over the toes. Absorb the landing quietly and hold it for a moment.",
  "videoUrl": "https://youtu.be/h_VF3jDQado"
 },
 {
  "name": "Bent-Knee Calf Raise",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Stand with the knees bent and held at the same angle, a hand on a wall for balance and a load held if used. Rise onto the balls of the feet as high as possible, then lower with control. Do not let the knees straighten as you rise.",
  "videoUrl": "https://www.youtube.com/watch?v=yibwlj8cexY"
 },
 {
  "name": "Bent-Knee Calf Raise (Elevated)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Stand with the balls of the feet on a step and the knees bent and held there. Lower the heels into a full stretch, then rise as high as possible. Keep the knee angle fixed.",
  "videoUrl": "https://www.youtube.com/watch?v=0bFt5jnavt0"
 },
 {
  "name": "Standing Calf Raise (Elevated)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Stand with the balls of the feet on a step and the knees straight. Lower the heels into a full stretch, then rise as high as possible. Pause briefly at the top.",
  "videoUrl": "https://youtu.be/xvIDdLEPaU4"
 },
 {
  "name": "Standing Calf Raise (Tennis Ball)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Stand with a tennis ball squeezed between the heels and the knees straight. Rise onto the balls of the feet as high as possible, then lower with control. Keep the ball in place so the ankles stay straight.",
  "videoUrl": "https://www.youtube.com/watch?v=vpkCboigGLE"
 },
 {
  "name": "Standing Calf Raise (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Rise high onto the balls of the feet, then drop the heels quickly and stop them hard before they touch down. Rise again and reset before the next drop. Keep the knees straight.",
  "videoUrl": "https://www.youtube.com/watch?v=OSIZrX2krRE"
 },
 {
  "name": "Floating-Heel Soleus Calf Raise",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Stand with the knees bent and the heels just off the floor, weight on the balls of the feet. Raise and lower the heels through a small range without letting them touch down. Keep the knees bent the whole set.",
  "videoUrl": "https://youtu.be/_MF85wBpxFQ"
 },
 {
  "name": "Smith Machine Calf Raise",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Smith Machine",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Stand under the Smith machine bar with the balls of the feet on a step and the knees straight. Rise as high as possible, then lower into a full stretch. Pause briefly at the top.",
  "videoUrl": "https://youtu.be/qXAhNcIY35k"
 },
 {
  "name": "Smith Machine Seated Calf Raise",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Smith Machine",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Sit with the Smith machine bar padded across the knees and the balls of the feet on a step. Raise the heels as high as possible, then lower into a full stretch.",
  "videoUrl": "https://youtu.be/68PsidRhTFw"
 },
 {
  "name": "Leg Press Calf Raise (Bent Knee)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Machine",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Sit in the leg press with the balls of the feet on the bottom edge of the platform and the knees bent. Press the platform away by pointing the toes, then lower slowly into a full stretch. Keep the knee angle fixed so the work stays at the ankle.",
  "videoUrl": "https://youtu.be/2AgVKLIlaaI"
 },
 {
  "name": "Acceleration-Angle Calf Raise (Isometric Push)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Lean into a wall in an acceleration posture, body in a straight line and one knee driven up. Press the ball of the standing foot into the floor as hard as you can for the time set. Keep the heel just off the ground.",
  "videoUrl": "https://youtu.be/z16jOpvZqTE"
 },
 {
  "name": "Floating-Heel Soleus Calf Raise (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Stand with the knees bent and the heels just off the floor, and hold that position for the time set. Keep the knees bent and the weight on the balls of the feet.",
  "videoUrl": "https://youtu.be/XH5RhhHtXlc"
 },
 {
  "name": "Seated Calf Raise (Isometric Push)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Machine",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Set the seated calf raise so the pad cannot rise, or pin it in place. Press the balls of the feet down into the platform as hard as you can for the time set. Keep the heels just off the bottom position.",
  "videoUrl": "https://youtu.be/KsXCm_nPg-s"
 },
 {
  "name": "Split-Stance Calf Raise (Elevated)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Stand in a split stance with the front foot's ball on a step and the load on the back or in the hands. Lower the front heel into a stretch, then rise as high as possible. Keep most of the weight on the front leg.",
  "videoUrl": "https://www.youtube.com/watch?v=HG1OFV5WHCA"
 },
 {
  "name": "Single-Leg Calf Raise (Slant Board)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Stand on one leg on a slant board set on a step so the heel can drop. Lower the heel into a full stretch, then rise as high as possible. Keep the knee straight.",
  "videoUrl": "https://youtu.be/1keSQ53DyfE"
 },
 {
  "name": "Single-Leg Calf Raise (Two-Up, One-Down Eccentric)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Rise onto the balls of both feet, lift one foot off, and lower slowly on the other leg. Return to both feet to rise again. Take three to five seconds on every lowering.",
  "videoUrl": "https://www.youtube.com/watch?v=swnxDcey4eQ"
 },
 {
  "name": "Single-Leg Calf Raise (Bent Knee)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Stand on one leg with the knee bent and held at that angle, a hand on a support and a load held if used. Rise onto the ball of the foot as high as possible, then lower with control. Keep the knee bend constant throughout.",
  "videoUrl": "https://youtu.be/WbQ0x79f94I"
 },
 {
  "name": "Single-Leg Seated Calf Raise",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Dumbbell",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Sit with one foot's ball on a step and a dumbbell resting on that knee. Raise the heel as high as possible, then lower into a full stretch.",
  "videoUrl": "https://youtu.be/nzeOpdWz1yo"
 },
 {
  "name": "Single-Leg Seated Calf Raise (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Dumbbell",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Sit with a dumbbell on one knee and raise that heel, then hold the top position for the time set.",
  "videoUrl": "https://youtu.be/SR-TdwfAduA"
 },
 {
  "name": "Single-Leg Calf Raise Isometric March",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Hip Flexors"
  ],
  "equipment": "Dumbbell",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Rise onto the balls of the feet holding dumbbells, then march by lifting one knee at a time while the standing heel stays up. Keep the body tall and the heels high.",
  "videoUrl": "https://youtu.be/-Ddb7Fc5tD0"
 },
 {
  "name": "Lateral Tiptoe Walk",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Glutes"
  ],
  "equipment": "Dumbbell",
  "movementType": "Carry",
  "laterality": "bilateral",
  "instructions": "Hold dumbbells at the sides and rise onto the balls of the feet. Walk sideways in short steps without letting the heels drop, then return the other way. Stay tall.",
  "videoUrl": "https://youtu.be/9B3Nbqs84Xk"
 },
 {
  "name": "Loaded Single-Leg Altitude Drop Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Dumbbell",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Hold dumbbells and step off a low box. Land on one foot and stick the landing, hips back and the knee over the toes. Absorb the landing quietly and hold it for a moment.",
  "videoUrl": "https://www.youtube.com/watch?v=p5jTqSD4GzY"
 },
 {
  "name": "Landmine Split Squat Calf Raise",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Ankle"
  ],
  "equipment": "Landmine",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Hold the end of a landmine bar at the shoulder in a split squat position. Rise onto the ball of the front foot, then lower the heel with control while holding the split squat. Keep the torso tall.",
  "videoUrl": "https://www.youtube.com/watch?v=ckHyT0xTwE0"
 },
 {
  "name": "Single-Leg Calf Raise (Bent Knee, Elevated)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Stand on one leg with the ball of the foot on a step and the knee bent and held there. Lower the heel into a full stretch, then rise as high as possible. Keep the knee bend constant.",
  "videoUrl": "https://www.youtube.com/watch?v=ipyYioCrzKU"
 },
 {
  "name": "Single-Leg Calf Raise (Bent Knee, Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand on one leg with the knee bent, rise onto the ball of the foot, and hold the top for the time set. Keep the knee bend constant.",
  "videoUrl": "https://www.youtube.com/watch?v=b-9joc6guME"
 },
 {
  "name": "Single-Leg Calf Raise (Elevated)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Stand on one leg with the ball of the foot on a step and the knee straight. Lower the heel into a full stretch, then rise as high as possible.",
  "videoUrl": "https://www.youtube.com/watch?v=vtwmJw0tLvY"
 },
 {
  "name": "Single-Leg Calf Raise (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand on one leg with the knee straight, rise onto the ball of the foot, and hold the top for the time set.",
  "videoUrl": "https://youtu.be/i7JDVkbXyYo"
 },
 {
  "name": "Split Squat Floating-Heel Calf Raise (Elevated)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Hold the bottom of a split squat with the front foot's ball on a step and the heel just off it. Raise and lower the front heel through a small range without letting it touch down. Keep the split squat position steady.",
  "videoUrl": "https://youtu.be/uz7E0vb-5WY"
 },
 {
  "name": "Split Squat Floating-Heel Calf Raise (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hold the bottom of a split squat with the front heel just off the floor, and keep it there for the time set. Keep the weight on the ball of the front foot.",
  "videoUrl": "https://www.youtube.com/watch?v=cYim07i3XzM"
 },
 {
  "name": "Single-Leg Floating-Heel Soleus Calf Raise",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Stand on one leg with the knee bent and the heel just off the floor. Raise and lower the heel through a small range without letting it touch down. Keep the knee bent the whole set.",
  "videoUrl": "https://youtu.be/uYIkBSnWgWA"
 },
 {
  "name": "Single-Leg Calf Raise (Isometric Push)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand on one leg under a barbell set against safety pins so it cannot rise. Press up through the ball of the foot into the pins as hard as you can for the time set. Keep the heel just off the floor.",
  "videoUrl": "https://youtu.be/VenfzdIEyTw"
 },
 {
  "name": "Smith Machine Single-Leg Calf Raise (Isometric Push)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Smith Machine",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand on one leg under a locked Smith machine bar. Press up through the ball of the foot into the bar as hard as you can for the time set. Keep the heel just off the floor.",
  "videoUrl": "https://youtu.be/oSyv5srFmhA"
 },
 {
  "name": "Sprint Start Ankle Isometric Push",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Set up in a sprint-start stance with the ball of the front foot against a wall or fixed object. Push the forefoot hard into it without letting the heel drop, hold for the time set, then switch sides.",
  "videoUrl": "https://youtu.be/pTe55LssKts"
 },
 {
  "name": "Smith Machine Seated Single-Leg Calf Raise",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Smith Machine",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Sit with the Smith bar padded across one thigh just above the knee and the ball of that foot on a plate. Lower the heel all the way down, then rise as high as you can and pause at the top.",
  "videoUrl": "https://youtu.be/JmbulHeSwws"
 },
 {
  "name": "Leg Press Single-Leg Calf Raise (Bent Knee)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Machine",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Sit in the leg press with the ball of one foot on the bottom edge of the platform and the knee kept bent. Let the heel travel back as far as it goes, then press through the forefoot to full ankle extension.",
  "videoUrl": "https://youtu.be/_y-ijJ9rWC8"
 },
 {
  "name": "Smith Machine Single-Leg Calf Raise",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Smith Machine",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Stand on one foot with the ball of the foot on a plate and the Smith bar across your upper back, knee straight. Lower the heel fully, then rise as high as you can and pause before lowering.",
  "videoUrl": "https://youtu.be/Egs7f0YUR6U"
 },
 {
  "name": "Leg Press Single-Leg Calf Raise",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Machine",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Sit in the leg press with the ball of one foot on the bottom edge of the platform and the knee straight. Let the heel travel back, then press through the forefoot to full ankle extension and pause.",
  "videoUrl": "https://youtu.be/QwDm5DqXM7M"
 },
 {
  "name": "Cable Ankle Drive",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Cable",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Attach an ankle strap from a low cable around the ball of one foot so the cable pulls the toes up. Drive the foot down and point it through the full ankle range, then let it return under control.",
  "videoUrl": "https://www.youtube.com/watch?v=oEneJ2ByFsI"
 },
 {
  "name": "Cable Ankle Strike Drive",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Cable",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Set up as for the cable ankle drive. Drive the foot down fast, as if striking the ground in a sprint, then let the cable bring it back up slowly before the next rep.",
  "videoUrl": "https://www.youtube.com/watch?v=mGMauEkdH00"
 },
 {
  "name": "Cable Ankle Drive (Isometric Hold, High Position)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Cable",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Set up as for the cable ankle drive and point the foot to the top of its range. Hold that position against the cable for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=qu63Vj9g3zU"
 },
 {
  "name": "Cable Ankle Drive (Isometric Hold, Middle Position)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Cable",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Set up as for the cable ankle drive and hold the foot halfway through its range against the cable for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=rel1oq6xTM0"
 },
 {
  "name": "Cable Ankle Drive (Isometric Hold, Low Position)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Cable",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Set up as for the cable ankle drive and hold the foot near the start of its range, toes pulled up, against the cable for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=8WWXbVbq1vk"
 },
 {
  "name": "Split Squat Calf Raise",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads"
  ],
  "equipment": "Plate",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Take a split squat stance with the ball of the front foot on a plate and hold the bottom of the split squat. Raise the front heel as high as you can, then lower it to the plate.",
  "videoUrl": "https://youtu.be/vU5SHSFYiwQ"
 },
 {
  "name": "Split Squat Calf Raise (Dorsiflexion)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Ankle"
  ],
  "equipment": "Plate",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Take a split squat stance with the ball of the front foot on a plate and hold the bottom of the split squat. Let the front heel drop below the plate as far as it goes, then rise as high as you can.",
  "videoUrl": "https://youtu.be/ZZ91DMoYcxQ"
 },
 {
  "name": "Jammer Arm Drive (A-Position)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Hip Flexors"
  ],
  "equipment": "Machine",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Hold the jammer arms with the body leaning forward and one knee driven up in an A-position. Drive through the ball of the standing foot to push the arms forward, keeping the lean and the knee high.",
  "videoUrl": "https://youtu.be/ycJ1wpQWAUI"
 },
 {
  "name": "Wall Ankle Isometric Push",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Lean into a wall on one leg with the heel just off the floor. Push the ball of the foot hard into the floor and hold the ankle angle for the time set.",
  "videoUrl": "https://youtu.be/g_CXU9fGMwA"
 },
 {
  "name": "Jammer Arm Calf Raise (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Machine",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Stand under the loaded jammer arms and rise onto the balls of the feet. Hold the top of the calf raise against the load for the time set.",
  "videoUrl": "https://youtu.be/v4as_lUHX1M"
 },
 {
  "name": "Single-Leg Calf Raise (Bent-Knee Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand on one foot on the edge of a step with the knee slightly bent. Rise partway up and hold, heel off the step and knee kept bent, for the time set.",
  "videoUrl": "https://youtu.be/Ubf8i40DoVw"
 },
 {
  "name": "Single-Leg Seated Calf Raise (Isometric Push)",
  "category": "accessory",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Machine",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Sit in the seated calf raise with one foot on the platform and the pad locked so it cannot move. Push the forefoot up into the pad as hard as you can and hold for the time set.",
  "videoUrl": "https://youtu.be/OkboUGPXyN8"
 },
 {
  "name": "Tibialis Raise (Decline)",
  "category": "accessory",
  "muscleGroup": "Ankle",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Stand with the heels on a slant board, toes pointing down the slope and the back against a wall. Pull the toes up as high as they go, then lower slowly.",
  "videoUrl": "https://youtu.be/Co4XO6fXhVs"
 },
 {
  "name": "Banded Tibialis Raise",
  "category": "accessory",
  "muscleGroup": "Ankle",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Sit with a band anchored low in front of you and looped over the top of one foot. Pull the toes up toward the shin against the band, then let them return slowly.",
  "videoUrl": "https://youtu.be/3sGyWDwSFLo"
 },
 {
  "name": "Copenhagen Plank (Hip Lifts)",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Obliques",
   "Core"
  ],
  "equipment": "Bench",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Set up in a Copenhagen plank with the top leg on the bench. Lower the hips toward the floor and lift them back up in line with the shoulders for the reps set.",
  "videoUrl": "https://www.youtube.com/watch?v=U-_m80jkVFw"
 },
 {
  "name": "Copenhagen Plank (A-Position Hold)",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Hip Flexors",
   "Obliques"
  ],
  "equipment": "Bench",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hold a Copenhagen plank with the top leg on the bench and drive the bottom knee up to hip height. Keep the hips level and hold for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=m-7ofLLeQVs"
 },
 {
  "name": "Copenhagen Plank (A-Position Knee Drive)",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Hip Flexors",
   "Obliques"
  ],
  "equipment": "Bench",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Hold a Copenhagen plank with the top leg on the bench. Drive the bottom knee up to hip height and lower it for the reps set, keeping the hips level.",
  "videoUrl": "https://www.youtube.com/watch?v=lssNWL8f5J0"
 },
 {
  "name": "Copenhagen Plank (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Obliques"
  ],
  "equipment": "Bench",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Lift into a Copenhagen plank with the top leg on the bench, then lower the hips to the floor as slowly as you can. Reset and repeat for the reps set.",
  "videoUrl": "https://youtu.be/2-EboH4bXHI"
 },
 {
  "name": "Kalenius Copenhagen",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Obliques",
   "Core"
  ],
  "equipment": "Bench",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Lie on your side with the top leg on a bench and the bottom leg on the floor. Squeeze the top leg down into the bench to lift the hips, then raise the bottom leg up to meet the bench, and lower under control.",
  "videoUrl": "https://youtu.be/Rhw1Oxt6VHE"
 },
 {
  "name": "Banded Copenhagen Adduction",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Obliques"
  ],
  "equipment": "Band",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Lie on your side with a band anchored at ankle height looped around the top ankle. Pull the leg down and across against the band, then let it return slowly.",
  "videoUrl": "https://youtu.be/peAe0DmT5Yo"
 },
 {
  "name": "Adductor Isometric Push",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Lie or stand with the inside of one knee or ankle against a fixed post or bench. Press the leg in toward the midline as hard as you can and hold for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=T5UsTtmCktI"
 },
 {
  "name": "Stability Ball Adductor Squeeze",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Stability Ball",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Lie on your back with knees bent and a stability ball between the knees. Squeeze the ball, relax, and repeat for the reps set.",
  "videoUrl": "https://youtu.be/peYrYmBj_P4"
 },
 {
  "name": "Cable Hip Adduction",
  "category": "accessory",
  "muscleGroup": "Adductors",
  "equipment": "Cable",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Stand side-on to a low cable with the strap on the near ankle. Pull the leg in and across in front of the standing leg, then let it return slowly.",
  "videoUrl": "https://www.youtube.com/watch?v=wC6gvDxn4Mw"
 },
 {
  "name": "Cable Hip Abduction",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "equipment": "Cable",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Stand side-on to a low cable with the strap on the far ankle. Lift the leg out to the side without leaning, then let it return slowly.",
  "videoUrl": "https://youtu.be/2tSqrloPnCg"
 },
 {
  "name": "Cable Hip Abduction (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "equipment": "Cable",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Set up as for the cable hip abduction and lift the leg out to the side. Hold it there against the cable for the time set without leaning.",
  "videoUrl": "https://youtu.be/xOTjwn12XVg"
 },
 {
  "name": "Banded Hip Abduction",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "equipment": "Band",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Sit on a box with a band around the thighs just above the knees. Push the knees out against the band, pause, and return slowly.",
  "videoUrl": "https://youtu.be/8QBtXm_Z1-E"
 },
 {
  "name": "Banded X-Walk",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads"
  ],
  "equipment": "Band",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Stand on a band and cross it in front of you, holding an end in each hand. Step forward and out on a diagonal, alternating legs, keeping tension on the band.",
  "videoUrl": "https://youtu.be/k_llAiZAjME"
 },
 {
  "name": "Elevated Side Plank with Hip Abduction",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Obliques",
   "Adductors"
  ],
  "equipment": "Bench",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Hold a side plank with the feet on a bench. Lift the top leg up and lower it for the reps set while the hips stay high.",
  "videoUrl": "https://youtu.be/heK-b78PP7E"
 },
 {
  "name": "Mermaid Plank (Low)",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Sit on one hip with the knees bent and the legs folded to the side, forearm on the floor. Lift the hips off the floor and hold, keeping the knees down.",
  "videoUrl": "https://www.youtube.com/watch?v=gSz-jv9Krt8"
 },
 {
  "name": "Mermaid Plank (High)",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Glutes",
   "Core",
   "Shoulders"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Set up as for the low mermaid plank but on a straight arm. Lift the hips off the floor and hold, keeping the knees down.",
  "videoUrl": "https://www.youtube.com/watch?v=z54iLKKAeG0"
 },
 {
  "name": "Bench Side Bend",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Bench",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Lie sideways across a bench with the hip supported and the feet anchored. Lower the upper body toward the floor, then bend sideways back up past level.",
  "videoUrl": "https://youtu.be/PQuqYiJ6xYw"
 },
 {
  "name": "Bench Side Bend (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Bench",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Set up as for the bench side bend and hold the body level with the bench for the time set.",
  "videoUrl": "https://youtu.be/Qk1C6dtxCOo"
 },
 {
  "name": "Bench Side Bend (Elbow-Supported Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Adductors"
  ],
  "equipment": "Bench",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Set up across the bench sideways with the lower elbow resting on a support. Hold the body straight and level for the time set.",
  "videoUrl": "https://youtu.be/zFKruj2qWZ0"
 },
 {
  "name": "Banded Hip Pops",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "equipment": "Band",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Stand in a quarter squat with a band around the knees. Snap one knee out against the band as fast as you can, return, and repeat for the reps set.",
  "videoUrl": "https://youtu.be/uY15ZWKdrl8"
 },
 {
  "name": "Cable Knee Drive",
  "category": "accessory",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Cable",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Stand facing away from a low cable with the strap on one ankle. Drive the knee up to hip height, then let it return under control.",
  "videoUrl": "https://www.youtube.com/watch?v=lQPgwhOqB_8"
 },
 {
  "name": "Banded Knee Drive",
  "category": "accessory",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Band",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Stand with a band anchored behind you and looped around one foot. Drive the knee up to hip height against the band, then return under control.",
  "videoUrl": "https://youtu.be/_gjB10tBPEg"
 },
 {
  "name": "Pike Plank Leg Lift",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Bodyweight",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "From a plank, push the hips up into a pike. Lift one leg straight up behind you and lower it, alternating legs for the reps set.",
  "videoUrl": "https://youtu.be/MkgyFi_Ppw4"
 },
 {
  "name": "Single-Leg Bench Hip Flexor Raise",
  "category": "accessory",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Bench",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Sit on the end of a bench, lean back slightly and hold on. Lift one knee toward the chest and lower it slowly, keeping the torso still.",
  "videoUrl": "https://www.youtube.com/watch?v=m8WehFNDtJs"
 },
 {
  "name": "Hip Flexor Isometric Hold",
  "category": "accessory",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand tall on one leg and lift the other knee above hip height. Hold it there without leaning back for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=kLsIsx8dlko&t=5s"
 },
 {
  "name": "Seated Psoas Raise",
  "category": "accessory",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Sit tall on the floor with the legs straight and hands beside the hips. Lift one straight leg off the floor as high as it goes, then lower it slowly.",
  "videoUrl": "https://www.youtube.com/watch?v=4rIwPfyZIRM"
 },
 {
  "name": "Seated Psoas Raise (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Sit tall on the floor with the legs straight. Lift one straight leg off the floor and hold it there for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=ES_yljn8AjU"
 },
 {
  "name": "Single-Leg Bench Hip Flexor Sit-Up",
  "category": "accessory",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Abs"
  ],
  "equipment": "Bench",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Lie on a bench with one leg hooked under the end for support. Sit up by pulling through the hip, then lower slowly.",
  "videoUrl": "https://youtu.be/QphLUWu0NBk"
 },
 {
  "name": "Banded Prone Psoas Kick",
  "category": "accessory",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Band",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Lie face down with a band anchored behind you looped around one foot. Pull the knee forward and up toward the chest against the band, then return slowly.",
  "videoUrl": "https://youtu.be/c5yaQ0ooHTw"
 },
 {
  "name": "Supine Hip Flexor Bug",
  "category": "accessory",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Kettlebell",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Lie on your back with the hips and knees at ninety degrees and a kettlebell held over the chest. Lower one leg toward the floor and bring it back, keeping the low back down.",
  "videoUrl": "https://youtu.be/F_MhVZH9j9o"
 },
 {
  "name": "Half-Kneeling Psoas Raise",
  "category": "accessory",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee with the other foot forward. Lift the front foot off the floor by pulling the knee up, then lower it, keeping the torso tall.",
  "videoUrl": "https://www.youtube.com/watch?v=xfXvuaNPUSU"
 },
 {
  "name": "Banded Supine Hip Flexor March",
  "category": "accessory",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Band",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Lie on your back with a band around both feet. Drive one knee up to the chest against the band while the other leg stays straight, and alternate.",
  "videoUrl": "https://youtu.be/6zB18bkRevs"
 },
 {
  "name": "Balance Board Walk (Forward)",
  "category": "mobility",
  "muscleGroup": "Ankle",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Walk forward step by step along a balance board or beam, placing each foot softly. Keep the eyes forward and the ankles doing the work.",
  "videoUrl": "https://www.youtube.com/watch?v=xO1rzh2aQmk"
 },
 {
  "name": "Balance Board Walk (Backward)",
  "category": "mobility",
  "muscleGroup": "Ankle",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Walk backward step by step along a balance board or beam, placing each foot softly. Keep the eyes forward and the ankles doing the work.",
  "videoUrl": "https://www.youtube.com/watch?v=iB66NOt1R2Q"
 },
 {
  "name": "Balance Board Walk (Lateral)",
  "category": "mobility",
  "muscleGroup": "Ankle",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Step sideways along a balance board or beam, placing each foot softly. Keep the eyes forward and the ankles doing the work.",
  "videoUrl": "https://www.youtube.com/watch?v=lLLDhQcX5IQ"
 },
 {
  "name": "Single-Knee Kneeling Balance (Foam)",
  "category": "mobility",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Hip Flexors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee on a foam pad with the other foot lifted. Stay tall and steady for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=7JHNtm_QNX4"
 },
 {
  "name": "Single-Leg Balance with Ball Catch (Foam)",
  "category": "mobility",
  "muscleGroup": "Ankle",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand on one foot on a foam pad. Catch and return a ball tossed to you while keeping the standing foot still.",
  "videoUrl": "https://www.youtube.com/watch?v=Rw7Rta8Jz9A"
 },
 {
  "name": "Foam Roller Balance",
  "category": "mobility",
  "muscleGroup": "Ankle",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Foam Roller",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Stand with both feet across a foam roller on the floor. Find your balance and hold it, keeping the knees soft.",
  "videoUrl": "https://youtu.be/Mxuk_ADsZSI"
 },
 {
  "name": "Half Foam Roller Balance",
  "category": "mobility",
  "muscleGroup": "Ankle",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Foam Roller",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand on one foot on a half foam roller, flat side down. Hold your balance with the foot still and the knee soft.",
  "videoUrl": "https://youtu.be/jc9iFtr-b5I"
 },
 {
  "name": "Barbell Squat Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves",
   "Hamstrings"
  ],
  "equipment": "Barbell",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a light barbell on the upper back, sit into a half squat and pause, then jump straight up as high as possible with no dip first. Land softly and reset before the next rep; keep the load light enough that the jump stays fast.",
  "videoUrl": "https://www.youtube.com/watch?v=et-wAt62VsU"
 },
 {
  "name": "Barbell Countermovement Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves",
   "Hamstrings"
  ],
  "equipment": "Barbell",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a light barbell on the upper back, dip quickly into a quarter squat and jump straight up as high as possible. Land softly on both feet and reset before the next rep; keep the load light enough that the jump stays fast.",
  "videoUrl": "https://www.youtube.com/watch?v=sjqzyQ09j_E"
 },
 {
  "name": "Hex Bar Squat Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Trap Bar",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a light trap bar and sit into a half squat. Pause, then jump straight up from the pause without dipping first, and land softly back in the squat.",
  "videoUrl": "https://youtu.be/qT6q2hdC6-Y"
 },
 {
  "name": "Hex Bar Squat to Box Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Trap Bar",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Do a set of trap bar squats, set the bar down, and go straight into box jumps. Land softly on the box and step down between jumps.",
  "videoUrl": "https://youtu.be/5Gmv9N2t9yk"
 },
 {
  "name": "Hex Bar Jump to Countermovement Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Trap Bar",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Do a trap bar jump, set the bar down, and immediately do a bodyweight countermovement jump. Land softly each time.",
  "videoUrl": "https://youtu.be/y3m-587zpQM"
 },
 {
  "name": "Dumbbell Squat Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves",
   "Hamstrings"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a light dumbbell in each hand at the sides, sit into a half squat and pause, then jump straight up as high as possible with no dip first. Land softly and reset before the next rep; keep the load light enough that the jump stays fast.",
  "videoUrl": "https://youtu.be/K1Jfu_A-RUI"
 },
 {
  "name": "Dumbbell Countermovement Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves",
   "Hamstrings"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a light dumbbell in each hand at the sides, dip quickly into a quarter squat and jump straight up as high as possible. Land softly on both feet and reset before the next rep; keep the load light enough that the jump stays fast.",
  "videoUrl": "https://www.youtube.com/watch?v=_zRp0_pe-iY"
 },
 {
  "name": "Dumbbell Countermovement Jump to Countermovement Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Do a countermovement jump holding light dumbbells, set them down, and immediately do one without them. Land softly each time.",
  "videoUrl": "https://www.youtube.com/watch?v=G__zHbIck9c"
 },
 {
  "name": "Dumbbell Squat to Box Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Do a set of dumbbell squats, set the dumbbells down, and go straight into box jumps. Land softly on the box and step down between jumps.",
  "videoUrl": "https://youtu.be/YEsrccQv1dU"
 },
 {
  "name": "Smith Machine Squat Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Smith Machine",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Set a light Smith bar on the upper back and sit into a half squat. Pause, then jump straight up from the pause and land softly with the bar on the back.",
  "videoUrl": "https://youtu.be/Mv6tgqropVg"
 },
 {
  "name": "Smith Machine Countermovement Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Smith Machine",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Set a light Smith bar on the upper back. Dip quickly and jump straight up, landing softly with the bar on the back.",
  "videoUrl": "https://youtu.be/NlswiI-K3tI"
 },
 {
  "name": "Hang Power Clean (High Hang)",
  "category": "olympic",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Glutes",
   "Traps",
   "Quads"
  ],
  "equipment": "Barbell",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Start standing with the bar at mid-thigh. Dip slightly, then extend hips and knees fast, pull yourself under, and catch the bar on the shoulders in a quarter squat.",
  "videoUrl": "https://youtu.be/RCN8c_WgIHI"
 },
 {
  "name": "Clean High Pull (Hang)",
  "category": "olympic",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Traps",
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Barbell",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Start standing with the bar above the knees. Hinge slightly, then extend hips and knees fast and pull the bar high with the elbows up and out.",
  "videoUrl": "https://youtu.be/n5B_c7wgI3o"
 },
 {
  "name": "Hang Split Snatch",
  "category": "olympic",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Shoulders",
   "Quads",
   "Glutes"
  ],
  "equipment": "Barbell",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Start standing with the bar above the knees in a snatch grip. Extend fast and pull under, catching the bar overhead in a split stance, then bring the feet together.",
  "videoUrl": "https://youtu.be/uhIBRIqq71M"
 },
 {
  "name": "Hex Bar High Pull",
  "category": "olympic",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Traps",
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Trap Bar",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Stand inside a trap bar with the handles above the knees. Extend hips and knees fast and pull the handles high, finishing on the toes with the shoulders shrugged.",
  "videoUrl": "https://youtu.be/G0cNSb-jukg"
 },
 {
  "name": "Single-Arm Dumbbell Snatch",
  "category": "olympic",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Shoulders",
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Dumbbell",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Start with a dumbbell between the feet in one hand. Extend the hips fast and pull the dumbbell up close to the body, punching it overhead to a locked arm in one motion.",
  "videoUrl": "https://youtu.be/hmg7-yIuDRs"
 },
 {
  "name": "Single-Leg Clean to Box",
  "category": "olympic",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Glutes",
   "Hip Flexors"
  ],
  "equipment": "Dumbbell",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Stand on one leg holding a light weight and hinge forward. Extend the hip fast, bring the weight up to the shoulder, and drive the free knee up to step onto a box.",
  "videoUrl": "https://www.youtube.com/watch?v=ZyNMGyuYzro"
 },
 {
  "name": "Single-Leg Clean to Wall",
  "category": "olympic",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Glutes",
   "Hip Flexors"
  ],
  "equipment": "Sandbag",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Stand on one leg facing a wall, holding a weighted tube or sandbag, and hinge forward. Extend the hip fast, bring the load up, and drive the free knee up toward the wall.",
  "videoUrl": "https://youtu.be/Fr5SmDJ6C-Q"
 },
 {
  "name": "Jammer Arm Banded Acceleration Drive",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Machine",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hold the jammer arms in an acceleration lean with a band adding resistance. Drive the arms forward while stepping powerfully through the ground, keeping the body angle.",
  "videoUrl": "https://youtu.be/6ww9bcKcxwg"
 },
 {
  "name": "Bench Press (Eccentric Tempo)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Barbell",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Bench press with a slow, counted lowering to the chest, then press up at normal speed.",
  "videoUrl": "https://youtu.be/r95c8kDzdDM"
 },
 {
  "name": "Bench Press (Supramaximal Eccentric)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Barbell",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Load the bar heavier than you can press and lower it slowly to the chest with spotters or safety pins taking it back up. Only with spotters.",
  "videoUrl": "https://youtu.be/7Qb59jRPY0s"
 },
 {
  "name": "Bench Press (Eccentric Drop)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Barbell",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Hold the bar at lockout, then let it drop quickly toward the chest and stop it hard just above, before pressing back up.",
  "videoUrl": "https://youtu.be/1tP-Bm4k8K0"
 },
 {
  "name": "Bench Press (Isometric Hold)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lower the bar to the position set and hold it there, still and under control, for the time set before re-racking.",
  "videoUrl": "https://youtu.be/Fi3Jvslimp8"
 },
 {
  "name": "Bench Press (Bottom Isometric Hold)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lower the bar to just above the chest and hold it still for the time set, then press up.",
  "videoUrl": "https://youtu.be/xm2QhURHn6E"
 },
 {
  "name": "Bench Press (Isometric Pin Push)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Set the bar under safety pins at the height chosen. Press up into the pins as hard as you can and hold for the time set.",
  "videoUrl": "https://youtu.be/fThVBd-Y7eQ"
 },
 {
  "name": "Bench Press (Banded)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Barbell",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Bench press with bands attached from the bar to the bench or floor so the load rises as the bar goes up. Control the bar down against the band.",
  "videoUrl": "https://youtu.be/h3SXsVglivA"
 },
 {
  "name": "Bench Press (Chains)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Barbell",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Bench press with chains hung from the bar so more links leave the floor as the bar goes up. Press fast through the top.",
  "videoUrl": "https://youtu.be/qDTUD8Sy0jY"
 },
 {
  "name": "Single-Arm Dumbbell Bench Press",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Obliques"
  ],
  "equipment": "Dumbbell",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Lie on a bench with one dumbbell. Lower it to the side of the chest and press it back up while keeping the body from twisting off the bench.",
  "videoUrl": "https://youtu.be/ymxnJWx_XJo"
 },
 {
  "name": "Dumbbell Bench Press (Alternating)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Dumbbell",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lie on a bench with both dumbbells pressed up. Lower and press one dumbbell at a time while the other stays locked out.",
  "videoUrl": "https://www.youtube.com/watch?v=tH7oVdj03xw"
 },
 {
  "name": "Single-Arm Dumbbell Floor Press",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Obliques"
  ],
  "equipment": "Dumbbell",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Lie on the floor with one dumbbell. Lower until the upper arm touches the floor, then press back up without rolling.",
  "videoUrl": "https://www.youtube.com/watch?v=rkmjFb3nmJg"
 },
 {
  "name": "Kettlebell Floor Press (One Arm Holding)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Kettlebell",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Lie on the floor with a kettlebell in each hand pressed up. Hold one at lockout while the other lowers until the upper arm touches the floor and presses back up.",
  "videoUrl": "https://www.youtube.com/watch?v=YAk8T5yQ9Y0"
 },
 {
  "name": "Single-Arm Incline Dumbbell Press",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Shoulders",
   "Triceps"
  ],
  "equipment": "Dumbbell",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Lie on an incline bench with one dumbbell. Lower it to the upper chest and press back up without twisting.",
  "videoUrl": "https://www.youtube.com/watch?v=QyDbgdz-Urg"
 },
 {
  "name": "Incline Dumbbell Press (Alternating)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Shoulders",
   "Triceps"
  ],
  "equipment": "Dumbbell",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lie on an incline bench with both dumbbells pressed up. Lower and press one at a time while the other stays locked out.",
  "videoUrl": "https://www.youtube.com/watch?v=kgJTOky3HYo"
 },
 {
  "name": "Decline Dumbbell Press",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Dumbbell",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lie on a decline bench with the feet locked in. Lower the dumbbells to the lower chest and press them back up.",
  "videoUrl": "https://www.youtube.com/watch?v=cYijZnkA5OY"
 },
 {
  "name": "Single-Arm Decline Dumbbell Press",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Obliques"
  ],
  "equipment": "Dumbbell",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Lie on a decline bench with one dumbbell. Lower it to the lower chest and press back up without twisting.",
  "videoUrl": "https://www.youtube.com/watch?v=WV_qQX-trss"
 },
 {
  "name": "Floor Press (Single-Leg Bridge)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Glutes",
   "Triceps"
  ],
  "equipment": "Dumbbell",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Lie with the shoulders on the floor or a bench, one foot planted and the other leg lifted, hips held up in a bridge. Press the dumbbells without letting the hips drop.",
  "videoUrl": "https://youtu.be/qTQ8lm1DW6s"
 },
 {
  "name": "Foam Roller Dumbbell Press",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Core",
   "Triceps"
  ],
  "equipment": "Foam Roller",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lie lengthwise on a foam roller with the head and hips supported. Press the dumbbells up and lower them while staying balanced on the roller.",
  "videoUrl": "https://www.youtube.com/watch?v=1P1yScXBkys"
 },
 {
  "name": "Landmine Chest Press",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Shoulders",
   "Triceps"
  ],
  "equipment": "Landmine",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Stand facing the landmine holding the end of the bar at the chest with both hands. Press it forward and up to arm's length, then bring it back to the chest.",
  "videoUrl": "https://www.youtube.com/watch?v=Vs-Dnci8BTM"
 },
 {
  "name": "Landmine Single-Arm Chest Press",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Shoulders",
   "Obliques"
  ],
  "equipment": "Landmine",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Stand in a staggered stance holding the end of the landmine at the chest in one hand. Press it forward to arm's length without rotating, then return.",
  "videoUrl": "https://www.youtube.com/watch?v=qBB8bVsxIf4"
 },
 {
  "name": "Cable Single-Arm Chest Press",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Obliques",
   "Triceps"
  ],
  "equipment": "Cable",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Stand facing away from a cable set at chest height, handle in one hand. Press forward to arm's length without letting the torso turn, then return.",
  "videoUrl": "https://www.youtube.com/watch?v=4i91EGAc_W0"
 },
 {
  "name": "Push-Up (Eccentric Only)",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lower slowly from the top of a push-up to the floor, then reset on the knees and return to the top.",
  "videoUrl": "https://www.youtube.com/watch?v=pze4RCess6A"
 },
 {
  "name": "Push-Up (Bottom Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lower to just above the floor and hold the bottom of the push-up for the time set, body straight.",
  "videoUrl": "https://www.youtube.com/watch?v=bS9JWDYr9IY"
 },
 {
  "name": "Push-Up (Eccentric Tempo)",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lower to the floor for a slow, counted descent, then press up at normal speed.",
  "videoUrl": "https://www.youtube.com/watch?v=ClejkAkLjNU"
 },
 {
  "name": "Push-Up (Eccentric Drop)",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "From the top of a push-up, drop quickly toward the floor and stop just above it, then press back up.",
  "videoUrl": "https://www.youtube.com/watch?v=Sm10bHehIu8"
 },
 {
  "name": "Yoga Push-Up",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Shoulders",
   "Triceps"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Do a push-up, then push the hips up and back into a downward-dog position. Return to the plank and repeat.",
  "videoUrl": "https://www.youtube.com/watch?v=Y9-LgIxOLCg"
 },
 {
  "name": "Push-Up (Incline)",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Do a push-up with the hands on a bench or box. Keep the body in a straight line.",
  "videoUrl": "https://www.youtube.com/watch?v=ZR4AZozL0Ws"
 },
 {
  "name": "Push-Up (Decline)",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Do a push-up with the feet on a bench or box. Keep the body straight and lower the chest to the floor.",
  "videoUrl": "https://www.youtube.com/watch?v=C3JHT8rWzy8"
 },
 {
  "name": "Push-Up (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lower to the position set and hold it, body straight, for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=SEOwdJ8E-eE"
 },
 {
  "name": "Push-Up (Swaying)",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "From the bottom of a push-up, shift the chest toward one hand and then the other before pressing up.",
  "videoUrl": "https://www.youtube.com/watch?v=3NiWqUcyPWo"
 },
 {
  "name": "Spiderman Push-Up",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Obliques",
   "Hip Flexors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "As you lower into a push-up, bring one knee up toward the elbow on the same side. Press up and alternate sides.",
  "videoUrl": "https://www.youtube.com/watch?v=5jg2yonET1Y"
 },
 {
  "name": "Push-Up (Explosive)",
  "category": "plyometric",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lower under control, then push up hard enough that the hands leave the floor. Land softly and go again.",
  "videoUrl": "https://www.youtube.com/watch?v=-qv-z95iDbI"
 },
 {
  "name": "Push-Up (Lateral Take-Off)",
  "category": "plyometric",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Push up explosively and move the hands sideways in the air, landing a hand-width over. Alternate directions.",
  "videoUrl": "https://youtu.be/qeRsLVAkGS0"
 },
 {
  "name": "Push-Up (Clap)",
  "category": "plyometric",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Push up explosively, clap the hands in the air, and land softly back in the push-up.",
  "videoUrl": "https://www.youtube.com/watch?v=DOQOaIYxdRA"
 },
 {
  "name": "Push-Up (Band-Assisted Explosive)",
  "category": "plyometric",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Set a band from above under the chest to take some of the weight. Push up explosively so the hands leave the floor.",
  "videoUrl": "https://youtu.be/TgO9-0qJbqY"
 },
 {
  "name": "Slider Push-Up",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Shoulders",
   "Core"
  ],
  "equipment": "Slider",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Start in a push-up with one hand on a slider. Slide that hand out to the side as you lower, then pull it back in as you press up.",
  "videoUrl": "https://www.youtube.com/watch?v=2DmT_lgII3U"
 },
 {
  "name": "Ring Push-Up",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Shoulders",
   "Core"
  ],
  "equipment": "Rings",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Hold rings set low, body straight. Lower until the hands reach the chest, keeping the rings steady, then press back up.",
  "videoUrl": "https://www.youtube.com/watch?v=GFLCk4diOL4"
 },
 {
  "name": "Ring Dip",
  "category": "strength",
  "muscleGroup": "Triceps",
  "secondaryMuscles": [
   "Chest",
   "Shoulders"
  ],
  "equipment": "Rings",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Support yourself on the rings with straight arms. Lower until the shoulders are just below the elbows, then press back up with the rings close to the body.",
  "videoUrl": "https://youtu.be/1nZvdSBjwQs"
 },
 {
  "name": "Single-Arm Box Push-Up (Two-Up, One-Down Eccentric)",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Box",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "With the hands on a box, lower slowly on one arm, then put the other hand down and press up with both.",
  "videoUrl": "https://www.youtube.com/watch?v=AbzqipJ9D6Y"
 },
 {
  "name": "Single-Arm Box Push-Up",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Box",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Place one hand on a box with the feet wide. Lower the chest to the box and press back up on one arm without twisting.",
  "videoUrl": "https://www.youtube.com/watch?v=rGGINZLArQY"
 },
 {
  "name": "Single-Arm Push-Up",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Set up with the feet wide and one hand under the chest. Lower and press up on one arm with the hips square to the floor.",
  "videoUrl": "https://youtu.be/ndslq0xwgl8"
 },
 {
  "name": "Bench Push-Off",
  "category": "plyometric",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Bench",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Place the hands on a bench in a push-up. Lower and push off hard enough for the hands to leave the bench, then catch and repeat.",
  "videoUrl": "https://www.youtube.com/watch?v=YmiQLqifp9U"
 },
 {
  "name": "Single-Arm Push-Up Catch",
  "category": "plyometric",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "From a push-up position with one hand on the floor, lower and push off explosively with that hand, then catch yourself softly on the same hand and go straight into the next rep. Keep the body in one straight line throughout.",
  "videoUrl": "https://www.youtube.com/watch?v=yduCARoT2rU"
 },
 {
  "name": "Wall Push-Off",
  "category": "plyometric",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Stand an arm's length from a wall, lean in and let your body fall toward it, catch yourself with both hands and push off explosively back to standing. Keep the body straight and the push quick.",
  "videoUrl": "https://www.youtube.com/watch?v=2DhKLaXqw6Q"
 },
 {
  "name": "Single-Arm Wall Push-Off",
  "category": "plyometric",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Stand an arm's length from a wall, lean in and catch yourself on one hand, then push off explosively back to standing. Keep the trunk square to the wall and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=Gu2wD9ifkCc"
 },
 {
  "name": "Band Chest Press",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Band",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Anchor a band behind you at chest height, hold a handle in each hand and press both hands straight forward until the arms are long. Return slowly to the start with the elbows just below shoulder height.",
  "videoUrl": "https://www.youtube.com/watch?v=W1nIBzMfZOs"
 },
 {
  "name": "Band Single-Arm Chest Press",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders",
   "Core"
  ],
  "equipment": "Band",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Anchor a band behind you at chest height and press one handle straight forward from a staggered stance without letting the trunk twist. Return under control and switch sides.",
  "videoUrl": "https://www.youtube.com/watch?v=2uTeceOaDi0"
 },
 {
  "name": "Band Fly",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Shoulders"
  ],
  "equipment": "Band",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Anchor a band behind you at chest height, hold the ends with the arms open and the elbows soft, and bring the hands together in front of the chest in a wide arc. Open back slowly to the start.",
  "videoUrl": "https://www.youtube.com/watch?v=Hr0NQ-6mFPE"
 },
 {
  "name": "Band Explosive Shoulder Press",
  "category": "plyometric",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Triceps"
  ],
  "equipment": "Band",
  "movementType": "Press",
  "laterality": "bilateral",
  "instructions": "Stand on a band with the handles at the shoulders and press overhead as fast as you can to full lockout. Lower under control and reset before each rep.",
  "videoUrl": "https://www.youtube.com/watch?v=VqXeRAEPfXY"
 },
 {
  "name": "Machine Chest Press (Two-Up, One-Down Eccentric)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Machine",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Press the handles out with both arms, then let go with one hand and lower the load slowly with the other. Alternate the lowering arm each rep.",
  "videoUrl": "https://youtu.be/5gPp3QQ9EKY"
 },
 {
  "name": "Machine Single-Arm Chest Press",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Machine",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Sit tall in the chest press machine and press one handle forward to full reach without letting the trunk rotate. Return slowly and switch arms after the set.",
  "videoUrl": "https://youtu.be/5Odnf7VqCtQ"
 },
 {
  "name": "Machine Supine Press",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Machine",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lie on the machine with the handles over the chest and press them up to straight arms. Lower under control until the hands are just above the chest.",
  "videoUrl": "https://youtu.be/st_FTWJRhxw"
 },
 {
  "name": "Machine Single-Arm Supine Press",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders",
   "Core"
  ],
  "equipment": "Machine",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Lie on the machine and press one handle up to a straight arm while keeping the shoulders flat on the pad. Lower under control and switch arms after the set.",
  "videoUrl": "https://youtu.be/iSeoOsJ1yKg"
 },
 {
  "name": "Bench Press (Isometric Push)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Set the pins in a rack at the chosen height, lie on the bench and press the bar up into the pins as hard as you can for the time set. Keep the shoulders pinned to the bench and the feet driving into the floor.",
  "videoUrl": "https://youtu.be/pZWwUV3_hdg"
 },
 {
  "name": "Smith Machine Bench Press",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Smith Machine",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lie on a bench under the Smith machine bar, unhook it and lower it to the lower chest. Press back up to straight arms along the fixed track.",
  "videoUrl": "https://youtu.be/qBoYhqaG3wE"
 },
 {
  "name": "Smith Machine Bench Press (Isometric Hold)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Smith Machine",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lower the Smith machine bar to the chosen height above the chest and hold it there for the time set. Keep the shoulders pinned and the bar still.",
  "videoUrl": "https://youtu.be/nx-gUw33J-c"
 },
 {
  "name": "Smith Machine Bench Throw",
  "category": "plyometric",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Smith Machine",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lie under a light Smith machine bar, lower it to the chest and press so fast that the bar leaves your hands, then catch it and lower into the next rep. Use the machine's safety stops.",
  "videoUrl": "https://www.youtube.com/watch?v=_iiQJ2vJuNU"
 },
 {
  "name": "Chest-Supported Row (Chains)",
  "category": "strength",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps"
  ],
  "equipment": "Barbell",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Lie face down on a high bench with chains hung on the bar so the load grows as you pull. Row the bar up to the bench and lower it under control.",
  "videoUrl": "https://www.youtube.com/watch?v=Fj9-_br_ios"
 },
 {
  "name": "Bent-Over Row (Chains)",
  "category": "strength",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps",
   "Lower Back"
  ],
  "equipment": "Barbell",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Hinge over with chains hung on the barbell so the load grows near the top, and row the bar to the lower ribs. Keep the back flat and lower under control.",
  "videoUrl": "https://youtu.be/XkCWTDkK_lg"
 },
 {
  "name": "Trap Bar Staggered-Stance Bent-Over Row",
  "category": "strength",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps",
   "Hamstrings"
  ],
  "equipment": "Trap Bar",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Stand inside a trap bar with one foot slightly ahead of the other, hinge over with a flat back and row the handles up to the hips. Lower under control and switch the front foot between sets.",
  "videoUrl": "https://www.youtube.com/watch?v=Yz0uB5PWphM"
 },
 {
  "name": "Landmine Chest-Supported Row",
  "category": "strength",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps"
  ],
  "equipment": "Landmine",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Lie chest down on an incline bench beside the end of a landmine bar and row the sleeve up toward the bench. Lower it under control without lifting the chest.",
  "videoUrl": "https://www.youtube.com/watch?v=mpQFr29koJQ"
 },
 {
  "name": "Landmine Staggered-Stance Rotational Row",
  "category": "strength",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Obliques",
   "Lats",
   "Glutes"
  ],
  "equipment": "Landmine",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "From a staggered stance beside the landmine, hold the end of the bar in one hand, rotate the trunk toward it and then row as you turn back to square. Let the hips and trunk drive the turn and switch sides after the set.",
  "videoUrl": "https://youtu.be/zS1XhlJIh2E"
 },
 {
  "name": "Chest-Supported Row (One Arm)",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps"
  ],
  "equipment": "Dumbbell",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Lie chest down on an incline bench and row one dumbbell up beside the ribs while the other arm hangs or holds the bench. Lower under control and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=marg7ETZ0PE"
 },
 {
  "name": "Dumbbell Romanian Deadlift to Bent-Over Row",
  "category": "strength",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Hamstrings",
   "Back",
   "Glutes"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hinge into a Romanian deadlift with a dumbbell in each hand, pause at the bottom and row both dumbbells to the ribs, then lower them and stand back up. Keep the back flat through the whole rep.",
  "videoUrl": "https://www.youtube.com/watch?v=_M5oPVbxys0"
 },
 {
  "name": "Dumbbell Single-Arm Romanian Deadlift to Row",
  "category": "strength",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Hamstrings",
   "Back",
   "Obliques"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hold one dumbbell, hinge into a Romanian deadlift, row it to the ribs at the bottom and lower it before standing back up. Keep the shoulders square and switch hands after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=-R09WlAqdEQ"
 },
 {
  "name": "Bench Plank Row",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Core",
   "Lats",
   "Biceps"
  ],
  "equipment": "Dumbbell",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Hold a high plank with one hand on a bench and a dumbbell in the other hand, and row the dumbbell to the ribs without letting the hips turn. Lower under control and switch sides after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=tnAXyszgBnU"
 },
 {
  "name": "Bench Bird Dog Row",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Core",
   "Glutes",
   "Lats"
  ],
  "equipment": "Dumbbell",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Kneel on a bench on one knee and one hand, reach the free leg straight back, and row a dumbbell with the free hand. Keep the hips level and switch sides after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=u-FsCoKiWnw"
 },
 {
  "name": "Bent-Over Row (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps",
   "Lower Back"
  ],
  "equipment": "Dumbbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hinge over with a flat back, row the weights to the ribs and hold them there for the time set before lowering. Keep the shoulder blades pulled back during the hold.",
  "videoUrl": "https://www.youtube.com/watch?v=kSVRwa-lcGw"
 },
 {
  "name": "Prone T-Raise (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Dumbbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lie face down on an incline bench, raise light dumbbells out to the sides into a T with the thumbs up, and hold the top position for the time set. Keep the neck long and the shoulder blades drawn back.",
  "videoUrl": "https://youtu.be/rQu4uEE-bqM"
 },
 {
  "name": "Bent-Over Cuban Press",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Dumbbell",
  "movementType": "Press",
  "laterality": "bilateral",
  "instructions": "Hinge over with light dumbbells, row the elbows up to shoulder height, rotate the forearms forward and up, then press the dumbbells out in front of you. Reverse each step slowly back to the start.",
  "videoUrl": "https://youtu.be/4QRpIHm5j0k"
 },
 {
  "name": "Sled Row (One Arm)",
  "category": "conditioning",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps",
   "Core"
  ],
  "equipment": "Sled",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Face the sled holding one strap, sit back into an athletic stance and row the sled toward you hand over hand with one arm. Keep the trunk square and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=a5EjwDIw3oI"
 },
 {
  "name": "Sled Row (Alternating Arms)",
  "category": "conditioning",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps",
   "Core"
  ],
  "equipment": "Sled",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Face the sled holding a strap in each hand and row it toward you one arm at a time, alternating left and right. Keep the hips low and the trunk square.",
  "videoUrl": "https://www.youtube.com/watch?v=zVsH8nl34kQ"
 },
 {
  "name": "TRX Row",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps",
   "Core"
  ],
  "equipment": "TRX",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Hold the straps and lean back with straight arms and a straight body, then row the chest up to the hands. Lower under control; walk the feet forward to make it harder.",
  "videoUrl": "https://www.youtube.com/watch?v=gAv_MeoKyWw"
 },
 {
  "name": "TRX Row (One-Arm Bias)",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps",
   "Core"
  ],
  "equipment": "TRX",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Row on the straps with one arm doing most of the work and the other hand only lightly helping. Keep the body straight and the chest square, and switch sides after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=z9YpgPpeK28"
 },
 {
  "name": "TRX Single-Arm Row",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps",
   "Core"
  ],
  "equipment": "TRX",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Hold one handle and lean back with a straight arm, then row the chest up to the hand without letting the body twist open. Lower under control and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=Qir2udr_ayU"
 },
 {
  "name": "TRX Butterfly Row",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Shoulders"
  ],
  "equipment": "TRX",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Lean back on the straps with the palms facing down and row with the elbows flared wide at shoulder height. Squeeze the shoulder blades together at the top and lower under control.",
  "videoUrl": "https://youtu.be/1YRe951ZeCo"
 },
 {
  "name": "Ring Row",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps",
   "Core"
  ],
  "equipment": "Rings",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Hold the rings and lean back with straight arms and a straight body, then row the chest up to the rings. Lower under control and keep the rings steady.",
  "videoUrl": "https://youtu.be/xXHkY8qRjeI"
 },
 {
  "name": "Ring Row (One-Arm Bias)",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps",
   "Core"
  ],
  "equipment": "Rings",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Row on the rings with one arm doing most of the work and the other hand only lightly helping. Keep the body straight and the chest square, and switch sides after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=hHJuhu3RGLg"
 },
 {
  "name": "Band Row",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Anchor a band at chest height, hold the ends and row the hands to the ribs while squeezing the shoulder blades together. Return slowly to straight arms.",
  "videoUrl": "https://www.youtube.com/watch?v=o2kP24pSN9U"
 },
 {
  "name": "Band Single-Arm Row",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps",
   "Core"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Anchor a band at chest height and row one handle to the ribs from a staggered stance without letting the trunk twist. Return slowly and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=aSe2IheDeZw"
 },
 {
  "name": "Band High Row",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Shoulders"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Anchor a band at chest height and row with the elbows out at 90 degrees, level with the shoulders. Squeeze the shoulder blades together and return slowly.",
  "videoUrl": "https://www.youtube.com/watch?v=muONE6HIc7g"
 },
 {
  "name": "Band Single-Arm Rotational Row with Weight Shift",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Obliques",
   "Glutes",
   "Lats"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Hold one end of an anchored band with the weight on the front foot, then shift onto the back foot as you rotate and row the hand to the ribs. Reverse the shift on the way back and switch sides after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=SZJgagw56KI"
 },
 {
  "name": "Band Face Pull",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Traps"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Anchor a band at face height and pull the ends toward your forehead, elbows high and hands finishing beside the ears. Return slowly to straight arms.",
  "videoUrl": "https://www.youtube.com/watch?v=pHazaocW6Ys"
 },
 {
  "name": "TRX Face Pull",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Core"
  ],
  "equipment": "TRX",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Lean back on the straps and pull your body up as the hands come to the forehead, elbows high and wide. Keep the body straight and lower under control.",
  "videoUrl": "https://www.youtube.com/watch?v=3VXa2nhUneU"
 },
 {
  "name": "TRX Y-Raise",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Core"
  ],
  "equipment": "TRX",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Lean back on the straps with straight arms and raise them overhead into a Y, pulling the body up as you go. Keep the body straight and lower under control.",
  "videoUrl": "https://www.youtube.com/watch?v=OgRZojxeENY"
 },
 {
  "name": "TRX T-Raise",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Core"
  ],
  "equipment": "TRX",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Lean back on the straps with straight arms in front and open them out to the sides into a T, pulling the body up as you go. Keep the body straight and lower under control.",
  "videoUrl": "https://www.youtube.com/watch?v=8M1lIZHsKv4"
 },
 {
  "name": "Band Straight-Arm Row Walkout",
  "category": "accessory",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Hold an anchored band with straight arms, pull it down to your thighs and keep it there as you walk backward against the growing tension. Walk back in slowly without letting the arms bend.",
  "videoUrl": "https://www.youtube.com/watch?v=NwkF8Ocp0ZE"
 },
 {
  "name": "Prone Trap Hold (U-Shape)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Traps",
   "Back"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lie face down with the arms bent into a U beside the head and lift them just off the floor. Hold for the time set, keeping the neck long and the shoulder blades drawn down.",
  "videoUrl": "https://www.youtube.com/watch?v=QgycDiu_3Bo"
 },
 {
  "name": "Prone Trap Hold (V-Shape)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Traps",
   "Back"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lie face down with straight arms overhead in a V and lift them just off the floor, thumbs up. Hold for the time set, keeping the neck long and the shoulder blades drawn down.",
  "videoUrl": "https://www.youtube.com/watch?v=QypJQE12OzY"
 },
 {
  "name": "Prone Trap Hold with Stick",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Traps",
   "Back"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lie face down holding a stick with both hands overhead and lift it just off the floor. Hold for the time set without arching the lower back.",
  "videoUrl": "https://www.youtube.com/watch?v=1Cfpa2HUtLA"
 },
 {
  "name": "Cable Single-Arm Row",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps",
   "Core"
  ],
  "equipment": "Cable",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Stand facing a cable set at chest height in a staggered stance and row one handle to the ribs without letting the trunk twist. Return slowly to a straight arm and switch sides after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=vc-q4mwoU9A"
 },
 {
  "name": "Seated Cable Row (One Arm)",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps"
  ],
  "equipment": "Cable",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Sit at the low cable with one handle and row it to the ribs while keeping the chest tall and the shoulders square. Return slowly and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=v20UNTs3238"
 },
 {
  "name": "Barbell Shoulder Press (Banded)",
  "category": "strength",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Triceps"
  ],
  "equipment": "Barbell",
  "movementType": "Press",
  "laterality": "bilateral",
  "instructions": "Press a barbell overhead with bands anchored low and looped over the sleeves so the load grows toward lockout. Brace the trunk and finish with the bar over the middle of the foot.",
  "videoUrl": "https://youtu.be/NOS6xUj5fTQ"
 },
 {
  "name": "Push Press (Banded)",
  "category": "strength",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Triceps",
   "Quads"
  ],
  "equipment": "Barbell",
  "movementType": "Press",
  "laterality": "bilateral",
  "instructions": "Dip and drive the bar overhead with bands anchored low and looped over the sleeves so the load grows toward lockout. Keep the dip short and upright.",
  "videoUrl": "https://youtu.be/h7e6HKkEu2Y"
 },
 {
  "name": "Decline Dumbbell Shoulder Press",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Triceps",
   "Chest"
  ],
  "equipment": "Dumbbell",
  "movementType": "Press",
  "laterality": "bilateral",
  "instructions": "Lie back on a decline bench and press the dumbbells from the shoulders in line with the torso until the arms are straight. Lower under control to shoulder level.",
  "videoUrl": "https://www.youtube.com/watch?v=IEI9tJBDTAU"
 },
 {
  "name": "Landmine Half-Kneeling Press",
  "category": "strength",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Chest",
   "Triceps",
   "Core"
  ],
  "equipment": "Landmine",
  "movementType": "Press",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee beside the landmine and press the end of the bar up and forward with the hand on the same side as the down knee. Squeeze the glute of the down leg and keep the trunk still; switch sides after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=bYvOZX1NoU0"
 },
 {
  "name": "Landmine Kneeling Press",
  "category": "strength",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Chest",
   "Triceps",
   "Core"
  ],
  "equipment": "Landmine",
  "movementType": "Press",
  "laterality": "bilateral",
  "instructions": "Kneel tall on both knees facing the landmine and press the end of the bar up and forward. Keep the hips under the shoulders and the ribs down.",
  "videoUrl": "https://www.youtube.com/watch?v=qgY4djb2xUg"
 },
 {
  "name": "Landmine Press (Supramaximal Two-Up, One-Down Eccentric)",
  "category": "strength",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Chest",
   "Triceps",
   "Core"
  ],
  "equipment": "Landmine",
  "movementType": "Press",
  "laterality": "unilateral",
  "instructions": "Press the landmine bar up with both hands, then let go with one and lower a load heavier than you could press with one arm slowly back to the shoulder. Alternate the lowering arm each rep.",
  "videoUrl": "https://youtu.be/0cDvnxMmqbU"
 },
 {
  "name": "Landmine Press (Eccentric Tempo)",
  "category": "strength",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Chest",
   "Triceps"
  ],
  "equipment": "Landmine",
  "movementType": "Press",
  "laterality": "unilateral",
  "instructions": "Press the landmine bar up, then lower it back to the shoulder over the counted time set. Keep the trunk still during the slow lowering.",
  "videoUrl": "https://youtu.be/SdaH9uN79WQ"
 },
 {
  "name": "Landmine Rotational Press",
  "category": "strength",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Obliques",
   "Chest",
   "Glutes"
  ],
  "equipment": "Landmine",
  "movementType": "Press",
  "laterality": "unilateral",
  "instructions": "Hold the end of the landmine bar at one shoulder in an athletic stance, then pivot the back foot and turn the hips as you press it up and across. Let the legs and hips start the press and switch sides after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=9Xkms3RsjyA"
 },
 {
  "name": "Landmine Split Jerk",
  "category": "olympic",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Quads",
   "Triceps",
   "Core"
  ],
  "equipment": "Landmine",
  "movementType": "Press",
  "laterality": "unilateral",
  "instructions": "Hold the end of the landmine bar at the shoulder, dip and drive, then split the feet as you punch the bar up to a straight arm. Recover the feet together under control and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=K1TAHqebpTw"
 },
 {
  "name": "Landmine Side-to-Side Press",
  "category": "strength",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Obliques",
   "Chest",
   "Triceps"
  ],
  "equipment": "Landmine",
  "movementType": "Press",
  "laterality": "bilateral",
  "instructions": "Hold the end of the landmine bar in both hands at one shoulder, press it up and over to the other shoulder in an arc, and lower it there. Keep the hips facing forward and repeat to the other side.",
  "videoUrl": "https://www.youtube.com/watch?v=Sjxe6tL0enk"
 },
 {
  "name": "Landmine Press (90-Degree Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Chest",
   "Triceps",
   "Core"
  ],
  "equipment": "Landmine",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Press the landmine bar until the elbow is bent to 90 degrees and hold it still there for the time set. Keep the ribs down and the trunk square; switch sides after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=Y0P7OxfaR-M"
 },
 {
  "name": "Landmine Single-Arm Drop and Catch",
  "category": "plyometric",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Chest",
   "Triceps"
  ],
  "equipment": "Landmine",
  "movementType": "Press",
  "laterality": "unilateral",
  "instructions": "Hold the landmine bar at arm's length, let go and catch it on the way down, absorbing it quickly at the shoulder. Start with a short drop and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=K7dtpnhw0Mw"
 },
 {
  "name": "Landmine Clean and Press",
  "category": "strength",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Shoulders",
   "Glutes",
   "Quads"
  ],
  "equipment": "Landmine",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hinge to the end of the landmine bar, drive through the legs to clean it to the shoulder, then press it up and forward. Lower it back to the shoulder and to the floor under control; switch sides after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=ZFFRdZqcb8I"
 },
 {
  "name": "Landmine Throw (Banded)",
  "category": "plyometric",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Chest",
   "Triceps",
   "Quads"
  ],
  "equipment": "Landmine",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "With a band attached to slow the bar on the way back, drive through the legs and throw the end of the landmine bar up and away, then catch it and absorb it at the chest. Reset before each throw.",
  "videoUrl": "https://www.youtube.com/watch?v=Lz5xoCIpNAw"
 },
 {
  "name": "Landmine Push-Pull (Banded)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Chest",
   "Core"
  ],
  "equipment": "Landmine",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "With a band attached to the landmine bar, press the end away from you and then pull it back in against the band, keeping a steady athletic stance. Keep the trunk still and the movement smooth.",
  "videoUrl": "https://www.youtube.com/watch?v=IBvRhBUuAtI"
 },
 {
  "name": "Landmine Snatch",
  "category": "olympic",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Shoulders",
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Landmine",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Hold the end of the landmine bar low in one hand, hinge, then extend the hips and pull it straight up to a locked arm overhead in one motion. Lower it back down under control and switch sides after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=t-NIFQEBaBk"
 },
 {
  "name": "Barbell Shoulder Press (Isometric Push)",
  "category": "strength",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Set the pins in a rack at the chosen height and press the bar up into them as hard as you can for the time set. Brace the trunk and keep the bar over the middle of the foot.",
  "videoUrl": "https://youtu.be/fK6mdD6MeY4"
 },
 {
  "name": "Band External Rotation Press",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Band",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Hold a band with the elbows bent at 90 degrees and the upper arms out to the sides, rotate the hands up against the band and then press them overhead. Reverse the steps slowly back to the start.",
  "videoUrl": "https://www.youtube.com/watch?v=NpZFg7BJMSM"
 },
 {
  "name": "Machine Single-Arm Shoulder Press",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Triceps"
  ],
  "equipment": "Machine",
  "movementType": "Press",
  "laterality": "unilateral",
  "instructions": "Sit tall in the shoulder press machine and press one handle overhead to a straight arm without leaning to the side. Lower under control and switch arms after the set.",
  "videoUrl": "https://youtu.be/xVNUBTnKTVc"
 },
 {
  "name": "Single-Arm Kettlebell Pullover",
  "category": "accessory",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Chest",
   "Core"
  ],
  "equipment": "Kettlebell",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Lie on your back holding a kettlebell over the chest with one straight arm, lower it slowly behind the head as far as you control, then pull it back over the chest. Keep the ribs down and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=eSqeW40d3hk"
 },
 {
  "name": "Dumbbell Single-Arm Snatch",
  "category": "olympic",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Shoulders",
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Dumbbell",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Start with the dumbbell between the feet, extend the hips and pull it up close to the body, then punch under it to a locked arm overhead. Lower it under control and switch hands after the set.",
  "videoUrl": "https://youtu.be/hmg7-yIuDRs"
 },
 {
  "name": "Pull-Up (Isometric Hold)",
  "category": "strength",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back",
   "Forearms"
  ],
  "equipment": "Kettlebell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "With a kettlebell attached for load, pull up to the chosen position and hold it still for the time set. Keep the shoulders pulled down and the legs quiet.",
  "videoUrl": "https://youtu.be/9BXTKsyVvnw"
 },
 {
  "name": "Pull-Up (Assisted Eccentric)",
  "category": "accessory",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Use a box, band or partner to get your chin over the bar, then lower yourself slowly to straight arms. Get assistance back to the top for each rep.",
  "videoUrl": "https://www.youtube.com/watch?v=oet3386b32M"
 },
 {
  "name": "Pull-Up (Eccentric Tempo)",
  "category": "strength",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Pull up until the chin clears the bar, then lower over the counted time set to straight arms. Keep the shoulders pulled down during the lowering.",
  "videoUrl": "https://www.youtube.com/watch?v=ZTkvarDdtdQ"
 },
 {
  "name": "Pull-Up (Concentric-Isometric-Eccentric Tempo)",
  "category": "strength",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Pull up on a set count, hold at the top for a set count, then lower on a set count. Keep each phase smooth and the body still.",
  "videoUrl": "https://youtu.be/JFdHPttg9WE"
 },
 {
  "name": "Pull-Up (Weighted Vest)",
  "category": "strength",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back",
   "Forearms"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Wearing a weighted vest, hang from the bar and pull up until the chin clears it. Lower under control to straight arms.",
  "videoUrl": "https://www.youtube.com/watch?v=esM5iJp6Bno"
 },
 {
  "name": "Pull-Up (Explosive, Band-Assisted)",
  "category": "plyometric",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Stand or kneel in a band looped over the bar and pull up as fast as you can, aiming to get the chest to the bar. Lower under control and reset before each rep.",
  "videoUrl": "https://youtu.be/Qp-WeydrlYs"
 },
 {
  "name": "Neutral-Grip Pull-Up",
  "category": "strength",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back",
   "Forearms"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Hang from parallel handles with the palms facing each other and pull up until the chin clears the hands. Lower under control to straight arms.",
  "videoUrl": "https://www.youtube.com/watch?v=Y9qHimvX2e4"
 },
 {
  "name": "Neutral-Grip Pull-Up (Weighted)",
  "category": "strength",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back",
   "Forearms"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "With added load from a belt or vest, hang from parallel handles with the palms facing each other and pull up until the chin clears the hands. Lower under control to straight arms.",
  "videoUrl": "https://www.youtube.com/watch?v=BFPVL5NxBPY"
 },
 {
  "name": "Clapping Pull-Up",
  "category": "plyometric",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back",
   "Forearms"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Pull up explosively so the hands leave the bar, clap once and catch the bar again. Absorb the catch and lower under control before the next rep.",
  "videoUrl": "https://www.youtube.com/watch?v=Srb1CcNnQgk"
 },
 {
  "name": "Band-Assisted Pull-Up",
  "category": "accessory",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Loop a band over the bar and put a foot or knee in it, then pull up until the chin clears the bar. Lower under control and use a lighter band as you get stronger.",
  "videoUrl": "https://www.youtube.com/watch?v=CYO5OABnYu8"
 },
 {
  "name": "Cross-Grip Pull-Up",
  "category": "strength",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back",
   "Forearms"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Hang with the hands close together and the grips crossed, and pull up until the chin clears the bar. Lower under control to straight arms.",
  "videoUrl": "https://youtu.be/UAbxf110BiA"
 },
 {
  "name": "Single-Arm Pull-Up (Assisted)",
  "category": "strength",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back",
   "Core"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Hang from the bar with one hand and help yourself up with the other hand on a band, towel or lower grip. Pull until the chin clears the bar and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=CJOcQJvpLBQ"
 },
 {
  "name": "Chin-Up (Eccentric Tempo)",
  "category": "strength",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Pull up with the palms facing you until the chin clears the bar, then lower over the counted time set to straight arms. Keep the shoulders pulled down during the lowering.",
  "videoUrl": "https://youtu.be/1Iwiei82fFA"
 },
 {
  "name": "Chin-Up (L-Sit)",
  "category": "strength",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Abs",
   "Hip Flexors"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Hang with the palms facing you and lift straight legs to hip height, then pull up while holding the legs in an L. Lower under control without dropping the legs.",
  "videoUrl": "https://www.youtube.com/watch?v=-hsIYe4SNLA"
 },
 {
  "name": "Single-Arm Chin-Up (Assisted)",
  "category": "strength",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back",
   "Core"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "With the feet on a box or bench for help, hang from the bar with one hand, palm facing you, and pull up using the legs only as much as needed. Lower under control and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=LBFwm5EEU2A"
 },
 {
  "name": "Monkey Bar Climb",
  "category": "conditioning",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Forearms",
   "Biceps",
   "Core"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Hang from the monkey bars and travel along them hand over hand without the feet touching the ground. Keep the shoulders active and swing the body only as much as needed.",
  "videoUrl": "https://www.youtube.com/watch?v=1bcxAFay3fI"
 },
 {
  "name": "Lat Pulldown (Two-Up, One-Down Eccentric)",
  "category": "strength",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back"
  ],
  "equipment": "Machine",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Pull the handles down with both arms, then let go with one and let the other arm return the load slowly to the top. Alternate the working arm each rep.",
  "videoUrl": "https://www.youtube.com/watch?v=Sz31w4XHAWU"
 },
 {
  "name": "Band Kneeling Pulldown",
  "category": "accessory",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Kneel under a band anchored high, hold the ends with straight arms overhead and pull the elbows down to the ribs. Return slowly without letting the trunk lean back.",
  "videoUrl": "https://www.youtube.com/watch?v=AqWknoWsCEM"
 },
 {
  "name": "Band Pulldown",
  "category": "accessory",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Biceps",
   "Back"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Stand or sit under a band anchored high, hold the ends with the arms overhead and pull the elbows down to the ribs. Return slowly to straight arms.",
  "videoUrl": "https://www.youtube.com/watch?v=T76JEmLKoQk"
 },
 {
  "name": "Active Hang",
  "category": "accessory",
  "muscleGroup": "Lats",
  "secondaryMuscles": [
   "Forearms",
   "Shoulders",
   "Back"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hang from the bar with straight arms and pull the shoulders down away from the ears without bending the elbows. Hold for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=f9_I67FXLCc"
 },
 {
  "name": "Single-Arm Hang",
  "category": "accessory",
  "muscleGroup": "Forearms",
  "secondaryMuscles": [
   "Lats",
   "Shoulders"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hang from the bar with one hand, keeping the shoulder pulled down and the body still. Hold for the time set and switch hands.",
  "videoUrl": "https://www.youtube.com/watch?v=DEyLAxYPn9o"
 },
 {
  "name": "Overhead Tricep Extension (One Arm)",
  "category": "accessory",
  "muscleGroup": "Triceps",
  "equipment": "Dumbbell",
  "movementType": "Push",
  "laterality": "unilateral",
  "instructions": "Hold a dumbbell overhead in one hand, lower it behind the head by bending the elbow, and straighten the arm back up. Keep the upper arm still and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=FfhlK4VSUqA"
 },
 {
  "name": "Band Overhead Tricep Extension",
  "category": "accessory",
  "muscleGroup": "Triceps",
  "equipment": "Band",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Anchor a band low behind you, hold it behind the head with the elbows pointing up and straighten the arms overhead. Return slowly without letting the elbows flare.",
  "videoUrl": "https://www.youtube.com/watch?v=W70dbP90KaE"
 },
 {
  "name": "Band Tricep Extension",
  "category": "accessory",
  "muscleGroup": "Triceps",
  "equipment": "Band",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Anchor a band high, hold the ends with the elbows at your sides and straighten the arms down. Return slowly to a bent elbow without the upper arms moving.",
  "videoUrl": "https://www.youtube.com/watch?v=IrTXO_d6J2Y"
 },
 {
  "name": "TRX Tricep Extension",
  "category": "accessory",
  "muscleGroup": "Triceps",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "TRX",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Face away from the anchor, hold the straps with straight arms and lean forward, then bend the elbows to lower the head toward the hands and straighten the arms to come back up. Keep the body in a straight line.",
  "videoUrl": "https://www.youtube.com/watch?v=cG4bpNyNAa0"
 },
 {
  "name": "Stability Ball Wall Circles",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Stability Ball",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Press a stability ball into a wall with one straight arm at shoulder height and make small, quick circles with it. Keep the shoulder pushed into the ball and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=KABYoFJmkUU"
 },
 {
  "name": "Stability Ball Shoulder Squeeze",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Chest"
  ],
  "equipment": "Stability Ball",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold a stability ball between the hands at chest height and squeeze it as hard as you can for the time set. Keep the shoulders down and breathe steadily.",
  "videoUrl": "https://youtu.be/zc7QMr4mzJ4"
 },
 {
  "name": "Partner Shoulder Abduction and Adduction (Isometric Push)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Chest"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hold the arm out at the chosen angle while a partner holds the wrist, then push out and in against the partner's hand as hard as you can for the time set. The partner matches the push so the arm does not move.",
  "videoUrl": "https://youtu.be/WBZty9_GFAk"
 },
 {
  "name": "Snatch-Grip Barbell Raise",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Traps",
   "Back"
  ],
  "equipment": "Barbell",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Hold a light barbell with a wide snatch grip and raise it with straight arms to shoulder height or overhead. Lower slowly without shrugging.",
  "videoUrl": "https://www.youtube.com/watch?v=0S-jCzt-xC0"
 },
 {
  "name": "Barbell Curl (Drop and Catch)",
  "category": "accessory",
  "muscleGroup": "Biceps",
  "secondaryMuscles": [
   "Forearms"
  ],
  "equipment": "Barbell",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Curl the bar to the top, let it drop a short way and catch it quickly with bent elbows, then curl it back up. Keep the upper arms still.",
  "videoUrl": "https://www.youtube.com/watch?v=ZUsBtlVB57A"
 },
 {
  "name": "Landmine Lateral Raise",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Traps"
  ],
  "equipment": "Landmine",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Stand side-on to the landmine, hold the end of the bar in the far hand down across the body and raise it out to the side to shoulder height. Lower slowly and switch sides after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=N8d97U2DG8M"
 },
 {
  "name": "Landmine Straight-Arm Raise (Eccentric)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Chest"
  ],
  "equipment": "Landmine",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Get the end of the landmine bar up to shoulder height with help, then lower it slowly with a straight arm. Keep the trunk still and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=N9TB3WSOWvU"
 },
 {
  "name": "Lateral Raise (Supported)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Traps"
  ],
  "equipment": "Dumbbell",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Hold a post or bench with one hand and raise a dumbbell out to the side with the other arm to shoulder height. Lower slowly and switch arms after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=FW2g8GSg2D4"
 },
 {
  "name": "Kettlebell Single-Arm 90/90 Shoulder Hold",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Kettlebell",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand tall holding a light kettlebell with the upper arm out to the side at shoulder height and the elbow bent to 90 degrees, forearm pointing up. Hold that position for the time set without letting the elbow drop, then switch arms.",
  "videoUrl": "https://youtu.be/YGA_D8-OuE0"
 },
 {
  "name": "Band Lateral Raise (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Traps"
  ],
  "equipment": "Band",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Stand on the middle of a band holding an end in each hand and raise the arms out to the sides to shoulder height. Hold the top position for the time set with the shoulders down and the elbows soft.",
  "videoUrl": "https://www.youtube.com/watch?v=KMuQwXPmcCs"
 },
 {
  "name": "Band Prone Cobra",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Shoulders",
   "Lower Back"
  ],
  "equipment": "Band",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Lie face down holding a light band in both hands with the arms by the sides. Lift the chest slightly, turn the thumbs out and pull the band apart as the shoulder blades squeeze down and back, then lower under control.",
  "videoUrl": "https://youtu.be/XVNPl6E4scM"
 },
 {
  "name": "Band Crucifix Hold",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Traps"
  ],
  "equipment": "Band",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold a band in each hand anchored in front of you and raise straight arms out to the sides to shoulder height, making a T. Hold the position for the time set without shrugging.",
  "videoUrl": "https://www.youtube.com/watch?v=rrQGHilQRwA"
 },
 {
  "name": "Band Overhead Pull-Apart",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Traps"
  ],
  "equipment": "Band",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Hold a light band overhead with straight arms and hands about shoulder width apart. Pull the band apart and lower it behind the head toward the upper back, then return overhead under control, keeping the ribs down.",
  "videoUrl": "https://youtu.be/NHm-n9xb2MY?t=31"
 },
 {
  "name": "Band Handball Throwing Motion",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Chest",
   "Core"
  ],
  "equipment": "Band",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Anchor a band behind you at shoulder height and hold it in the throwing hand. Step forward and drive the arm through a fast overhead throwing motion, then let the band bring the arm back under control before the next rep.",
  "videoUrl": "https://www.youtube.com/watch?v=rujKLN4J4mw"
 },
 {
  "name": "Prone Bench External Rotation",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Dumbbell",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Lie face down on a bench with the upper arm out at shoulder height and the elbow bent 90 degrees, a light dumbbell hanging toward the floor. Rotate the forearm up until it is level with the bench, pause, then lower slowly.",
  "videoUrl": "https://www.youtube.com/watch?v=z-qGGWm8I9c"
 },
 {
  "name": "Dumbbell Nordic Shoulder",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Dumbbell",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Lie face down on a bench with the upper arm out at shoulder height, elbow bent 90 degrees and a light dumbbell held up in external rotation. Lower the dumbbell slowly forward over three to five seconds, then reset to the top and repeat.",
  "videoUrl": "https://youtu.be/loiANZYjUFk"
 },
 {
  "name": "Cable External Rotation (Two-Up, One-Down Eccentric)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Cable",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand side-on to a cable at elbow height with the elbow tucked to the side. Rotate the handle out with the free hand helping, then let go and lower it back slowly with the working arm alone.",
  "videoUrl": "https://youtu.be/3GvcindxlyI"
 },
 {
  "name": "Band External Rotation (Isometric Hold)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Band",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand side-on to an anchored band with the elbow tucked to the side and bent 90 degrees. Rotate the forearm out against the band and hold that position for the time set without letting the elbow drift.",
  "videoUrl": "https://youtu.be/hpJj8zm9eTk"
 },
 {
  "name": "Band External Rotation Walkout (Scapular Plane)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Core"
  ],
  "equipment": "Band",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hold an anchored band with the arm slightly forward of the body and the forearm rotated out. Walk sideways away from the anchor and back while keeping the arm still against the growing pull.",
  "videoUrl": "https://www.youtube.com/watch?v=SbiRaLJ9P3c"
 },
 {
  "name": "Band External Rotation Walkout (With Rotation)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Core"
  ],
  "equipment": "Band",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Hold an anchored band with the elbow tucked and bent 90 degrees. Walk sideways away from the anchor, rotate the forearm out and back in a few times at the far point, then walk back in.",
  "videoUrl": "https://www.youtube.com/watch?v=ASk3ot8r5cc"
 },
 {
  "name": "Band External Rotation Walkout",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Core"
  ],
  "equipment": "Band",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hold an anchored band with the elbow tucked, bent 90 degrees and the forearm rotated out. Walk sideways away from the anchor and back while keeping the forearm still against the growing pull.",
  "videoUrl": "https://www.youtube.com/watch?v=A43nti4-cMM"
 },
 {
  "name": "Partner Shoulder External and Internal Rotation (Isometric Push)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Chest"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hold the elbow at 90 degrees while a partner places a hand on the forearm. Push out into rotation against their hand for the time set, then push in the other direction, with the partner matching the effort so nothing moves.",
  "videoUrl": "https://youtu.be/5rur0SpOj3M"
 },
 {
  "name": "Band Shoulder Flexion (V Raise)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Traps"
  ],
  "equipment": "Band",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Stand on a band holding an end in each hand and raise straight arms forward and up into a V overhead, thumbs up. Lower under control without arching the lower back.",
  "videoUrl": "https://www.youtube.com/watch?v=1pkDzJIpBm0"
 },
 {
  "name": "Band Shoulder Power Complex (External Rotation and Abduction)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Traps"
  ],
  "equipment": "Band",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Hold an anchored band with the elbow bent 90 degrees. Rotate the forearm out quickly, then raise the arm out to the side to shoulder height in one fast sequence, and return under control.",
  "videoUrl": "https://youtu.be/O4m_r6uiHH8"
 },
 {
  "name": "Band Shoulder Distraction Stabilization",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Core"
  ],
  "equipment": "Band",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hold a band anchored so it pulls the arm gently away from the body and keep the shoulder set and still against it. Hold the position, or make small controlled movements, for the time set.",
  "videoUrl": "https://youtu.be/BdvSUqkTQ2c"
 },
 {
  "name": "Foam Roller Supine Band Shoulder Flexion",
  "category": "mobility",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Core",
   "Back"
  ],
  "equipment": "Foam Roller",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Lie on your back along a foam roller holding a light band in both hands at the chest. Raise straight arms overhead with the band slightly apart, keeping the ribs down and the lower back on the roller, then return.",
  "videoUrl": "https://youtu.be/vhlQxX8VS3w"
 },
 {
  "name": "Band Half-Kneeling Rhythmic Stabilization",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Core",
   "Back"
  ],
  "equipment": "Band",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee holding a band with the arm in the position set by the coach. Keep the arm still while a partner taps or pulls the band in quick changing directions for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=fikGgeWq7f4"
 },
 {
  "name": "Cable Half-Kneeling External Rotation",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Cable",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee side-on to a cable set at elbow height, elbow tucked and bent 90 degrees. Rotate the handle out away from the body, pause, and return slowly.",
  "videoUrl": "https://www.youtube.com/watch?v=z9-gze58ovM"
 },
 {
  "name": "Cable Half-Kneeling External Rotation (Scapular Plane)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Cable",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee facing a cable with the upper arm raised slightly forward of the body and the elbow bent 90 degrees. Rotate the forearm up and back against the cable, pause, and lower slowly.",
  "videoUrl": "https://www.youtube.com/watch?v=8tGLrIsQ28E"
 },
 {
  "name": "Trap Bar Hanging Kettlebell Carry",
  "category": "strength",
  "muscleGroup": "Forearms",
  "secondaryMuscles": [
   "Traps",
   "Core",
   "Shoulders"
  ],
  "equipment": "Trap Bar",
  "movementType": "Carry",
  "laterality": "bilateral",
  "instructions": "Hang a kettlebell from each end of a trap bar with bands, stand up inside the bar and walk. Keep the bar level and steady as the kettlebells swing, walking tall with short steps.",
  "videoUrl": "https://www.youtube.com/watch?v=72oDhpXscCo"
 },
 {
  "name": "Kettlebell Bottoms-Up Carry",
  "category": "accessory",
  "muscleGroup": "Forearms",
  "secondaryMuscles": [
   "Shoulders",
   "Core"
  ],
  "equipment": "Kettlebell",
  "movementType": "Carry",
  "laterality": "unilateral",
  "instructions": "Hold a kettlebell upside down by the handle with the bell pointing up, elbow bent 90 degrees in front of you. Walk with a tight grip and a still wrist, keeping the bell balanced, then switch arms.",
  "videoUrl": "https://www.youtube.com/watch?v=wv-ESXMgVL8"
 },
 {
  "name": "Stability Ball Plank",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Abs"
  ],
  "equipment": "Stability Ball",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Set the forearms on a stability ball with the feet behind you and the body in a straight line. Hold still for the time set, ribs down and glutes tight, without letting the ball roll.",
  "videoUrl": "https://youtu.be/Djp9e_Zw3z0"
 },
 {
  "name": "Single-Arm High Plank",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Obliques"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "From a high plank with the feet a little wider than usual, lift one hand off the floor and hold. Keep the hips level and square to the floor, then switch hands.",
  "videoUrl": "https://youtu.be/AqPQF0EBFDU"
 },
 {
  "name": "High Plank Shoulder Tap",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Obliques"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold a high plank with the feet a little apart. Tap one hand to the opposite shoulder, put it back down and alternate, keeping the hips still and level.",
  "videoUrl": "https://youtu.be/3Nid_6THYoo"
 },
 {
  "name": "Bear Crawl Shoulder Tap",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Get on hands and feet with the knees bent and hovering just off the floor. Tap one hand to the opposite shoulder and alternate, keeping the knees low and the back flat.",
  "videoUrl": "https://youtu.be/0TNzUSzKetM"
 },
 {
  "name": "Bumper Plate Grip Hold",
  "category": "accessory",
  "muscleGroup": "Forearms",
  "secondaryMuscles": [
   "Traps"
  ],
  "equipment": "Plate",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Grip a bumper plate by its rim with the fingers on one side and the thumb on the other and stand tall with it at your side. Hold for the time set without letting it slip, then switch hands.",
  "videoUrl": "https://www.youtube.com/watch?v=iCoEbJAsy-Y"
 },
 {
  "name": "Box Compression Hold",
  "category": "accessory",
  "muscleGroup": "Forearms",
  "secondaryMuscles": [
   "Chest",
   "Shoulders"
  ],
  "equipment": "Box",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold a box or block off the floor by squeezing it between flat palms. Stand tall and hold for the time set, pressing the hands together hard.",
  "videoUrl": "https://www.youtube.com/watch?v=PsuXV7nnIM0"
 },
 {
  "name": "Wall Handstand Hold",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Kick or walk up into a handstand with the heels against a wall and the hands just away from it. Push the floor away with straight arms and hold for the time set, ribs tucked.",
  "videoUrl": "https://www.youtube.com/watch?v=IgikaGokkmQ"
 },
 {
  "name": "Handstand Walk",
  "category": "conditioning",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Triceps",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Carry",
  "laterality": "bilateral",
  "instructions": "From a handstand, walk forward on the hands with small steps, shifting the weight from hand to hand. Keep the arms straight and the body stacked over the hands.",
  "videoUrl": "https://www.youtube.com/watch?v=mmGsLQgd2xk"
 },
 {
  "name": "Flywheel Single-Arm Row",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps"
  ],
  "equipment": "Flywheel",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Set up on the flywheel with the strap in one hand and the body braced. Pull hard to the hip, then resist the wheel as it pulls the arm back out, slowing it down through the whole return.",
  "videoUrl": "https://www.youtube.com/watch?v=Uabik5TCVpg"
 },
 {
  "name": "Flywheel Bent-Over Thoracic Row",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Shoulders"
  ],
  "equipment": "Flywheel",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Hinge forward over the flywheel with a flat back and the strap in both hands. Row hard, pulling the shoulder blades back and lifting the chest, then resist the wheel on the way back down.",
  "videoUrl": "https://youtu.be/SNsZCyiviQM"
 },
 {
  "name": "Flywheel Row",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Lats",
   "Biceps"
  ],
  "equipment": "Flywheel",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Set up on the flywheel with the strap in both hands and the trunk braced. Pull hard to the body, then resist the wheel as it pulls the arms forward, slowing it through the whole return.",
  "videoUrl": "https://www.youtube.com/watch?v=8DjSQHzzpdI"
 },
 {
  "name": "Flywheel Curl",
  "category": "accessory",
  "muscleGroup": "Biceps",
  "secondaryMuscles": [
   "Forearms"
  ],
  "equipment": "Flywheel",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Stand on the flywheel with the strap in both hands and the elbows at the sides. Curl hard to the top, then resist the wheel on the way down without letting the elbows drift forward.",
  "videoUrl": "https://www.youtube.com/watch?v=CU81b2OI3_A"
 },
 {
  "name": "Flywheel Curl to Lateral Raise",
  "category": "accessory",
  "muscleGroup": "Biceps",
  "secondaryMuscles": [
   "Shoulders",
   "Forearms"
  ],
  "equipment": "Flywheel",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Stand on the flywheel holding the strap, curl to the top, then raise the elbows out to the sides toward shoulder height. Resist the wheel back down through both movements.",
  "videoUrl": "https://www.youtube.com/watch?v=95GR68nPDLo"
 },
 {
  "name": "Flywheel Lateral Raise",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Traps"
  ],
  "equipment": "Flywheel",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Stand on the flywheel with the strap in the hands and raise the arms out to the sides to shoulder height. Resist the wheel on the way down, keeping the shoulders away from the ears.",
  "videoUrl": "https://www.youtube.com/watch?v=bSwwjP2gkhY"
 },
 {
  "name": "Bench Press Throw",
  "category": "plyometric",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Barbell",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lie on a bench under a light bar in a rack or guided track and lower it to the chest. Press up as fast as possible so the bar leaves the hands, then catch it and lower it under control.",
  "videoUrl": "https://www.youtube.com/watch?v=_iiQJ2vJuNU"
 },
 {
  "name": "Bench Press (Banded Oscillatory)",
  "category": "strength",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Barbell",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Set up a bench press with bands hanging weights from the ends of the bar. Press and lower with steady control so the hanging weights bounce, keeping the bar level and the shoulders tight to the bench.",
  "videoUrl": "https://youtu.be/iHQro17hJKI"
 },
 {
  "name": "Band Oscillatory Press",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Shoulders",
   "Triceps",
   "Core"
  ],
  "equipment": "Band",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Stand facing away from a band anchored at chest height, holding it at the chest. Press forward in short, fast pulses at arm's length, keeping the trunk still and the elbows soft.",
  "videoUrl": "https://youtu.be/DIzaZW46Fnk"
 },
 {
  "name": "Band Half-Kneeling Oscillatory Press",
  "category": "accessory",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Shoulders",
   "Triceps",
   "Core"
  ],
  "equipment": "Band",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Kneel on one knee facing away from a band anchored at chest height. Press forward and make short, fast pulses at arm's length, keeping the hips square and still.",
  "videoUrl": "https://youtu.be/85sY_yBLFF4"
 },
 {
  "name": "Band Prone Straight-Arm Tantrum",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Shoulders",
   "Lats"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Lie face down holding a band anchored overhead in front of you with straight arms. Pull the arms down toward the floor in fast, repeated beats, keeping the chest down and the elbows straight.",
  "videoUrl": "https://youtu.be/s8Rx6A9lyyM"
 },
 {
  "name": "Band Prone Bent-Arm Tantrum",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Shoulders",
   "Biceps"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Lie face down holding a band anchored in front of you with the elbows bent. Drive the elbows down and back toward the floor in fast, repeated beats, keeping the chest down.",
  "videoUrl": "https://youtu.be/7CrRMHvEBKE"
 },
 {
  "name": "Band Half-Kneeling Straight-Arm Tantrum",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Shoulders",
   "Lats",
   "Core"
  ],
  "equipment": "Band",
  "movementType": "Pull",
  "laterality": "bilateral",
  "instructions": "Kneel on one knee holding a band anchored high in front of you with straight arms. Pull the arms down in fast, repeated beats, keeping the trunk tall and still.",
  "videoUrl": "https://youtu.be/_VO-g_wehig"
 },
 {
  "name": "Medicine Ball Supine Chest Throw (Concentric)",
  "category": "plyometric",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lie on your back holding a medicine ball at the chest. Throw it straight up as high and fast as possible, catch it and set it back on the chest before the next throw.",
  "videoUrl": "https://www.youtube.com/watch?v=YtZXfGU_fGM"
 },
 {
  "name": "Medicine Ball Supine Chest Throw (Eccentric-Concentric)",
  "category": "plyometric",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the arms up. Catch a ball dropped by a partner, let it sink toward the chest and throw it straight back up as fast as possible.",
  "videoUrl": "https://www.youtube.com/watch?v=3oVuSC-_WdY"
 },
 {
  "name": "Med Ball Kneeling Chest Pass",
  "category": "plyometric",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders",
   "Core"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Kneel tall holding a medicine ball at the chest. Throw it forward as hard as possible from the chest, finishing with the arms long and the hips still.",
  "videoUrl": "https://www.youtube.com/watch?v=doqvePYJvcY"
 },
 {
  "name": "Medicine Ball Kneeling Jump to Throw",
  "category": "plyometric",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Glutes",
   "Chest",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Kneel tall holding a medicine ball at the chest. Swing the arms and hips to jump up onto the feet, then throw the ball forward from the chest in one move.",
  "videoUrl": "https://youtu.be/8_lw93S4nVw"
 },
 {
  "name": "Med Ball Running Chest Pass",
  "category": "plyometric",
  "muscleGroup": "Chest",
  "secondaryMuscles": [
   "Triceps",
   "Shoulders",
   "Quads"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Run a few steps forward holding a medicine ball at the chest and throw it forward as hard as possible from the chest without breaking stride.",
  "videoUrl": "https://www.youtube.com/watch?v=hBTmmUS9JBc"
 },
 {
  "name": "Medicine Ball Forward Throw",
  "category": "plyometric",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Glutes",
   "Shoulders",
   "Core"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Stand holding a medicine ball, dip at the hips and knees, then drive up and throw the ball forward for distance. Finish tall and step after the throw.",
  "videoUrl": "https://youtu.be/Fq6VvDOSY5g"
 },
 {
  "name": "Med Ball Kneeling Overhead Throw",
  "category": "plyometric",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Core",
   "Lats",
   "Triceps"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Press",
  "laterality": "bilateral",
  "instructions": "Kneel tall holding a medicine ball overhead. Bring it back behind the head and throw it forward as hard as possible, keeping the hips forward.",
  "videoUrl": "https://youtu.be/pYnwrzxzEWc"
 },
 {
  "name": "Med Ball Drop to Overhead Throw",
  "category": "plyometric",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Core",
   "Lats",
   "Triceps"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Press",
  "laterality": "bilateral",
  "instructions": "Hold a medicine ball overhead, let it drop back behind the head and catch the drop with the arms, then throw it forward overhead as fast as possible.",
  "videoUrl": "https://youtu.be/ojlw-WxQLMw"
 },
 {
  "name": "Med Ball Altitude Drop to Overhead Throw",
  "category": "plyometric",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Core",
   "Lats",
   "Triceps"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Press",
  "laterality": "bilateral",
  "instructions": "Stand on a low box holding a medicine ball overhead. Step off, land with the ball still overhead, and throw it forward overhead as fast as possible off the landing.",
  "videoUrl": "https://youtu.be/ZNApGyPdB3A"
 },
 {
  "name": "Med Ball Partner High Drop to Overhead Throw",
  "category": "plyometric",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Core",
   "Lats",
   "Triceps"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Press",
  "laterality": "bilateral",
  "instructions": "Stand with the arms overhead while a partner drops a medicine ball from above into your hands. Let it sink behind the head and throw it straight back forward overhead as fast as possible.",
  "videoUrl": "https://youtu.be/eLSrFECOcNs"
 },
 {
  "name": "Med Ball Kneeling Overhead Mini Throws to Wall",
  "category": "plyometric",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Core",
   "Triceps"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Press",
  "laterality": "bilateral",
  "instructions": "Kneel close to a wall holding a light medicine ball overhead. Make short, quick throws into the wall and catch each one overhead, keeping the trunk tall.",
  "videoUrl": "https://www.youtube.com/watch?v=Oq4IE5_-EEA"
 },
 {
  "name": "Medicine Ball Wall Dribble",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Core",
   "Triceps"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Press",
  "laterality": "unilateral",
  "instructions": "Stand close to a wall holding a light medicine ball in one hand at or above head height. Bounce it against the wall in small, quick taps without letting it drop, then switch hands.",
  "videoUrl": "https://www.youtube.com/watch?v=yP0T0eQbDmg"
 },
 {
  "name": "Medicine Ball Kneeling Shoulder Throw",
  "category": "plyometric",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Chest",
   "Core"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Press",
  "laterality": "unilateral",
  "instructions": "Kneel tall holding a medicine ball at one shoulder. Push it forward from the shoulder as hard as possible like a shot put, then switch sides.",
  "videoUrl": "https://youtu.be/UNi3pwl5HxM"
 },
 {
  "name": "Medicine Ball Underhand Throw (Height)",
  "category": "plyometric",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a medicine ball between the legs with straight arms, hinge and dip, then drive the hips through and throw the ball straight up as high as possible."
 },
 {
  "name": "Medicine Ball Underhand Backward Throw (Distance)",
  "category": "plyometric",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a medicine ball between the legs with straight arms, hinge and dip, then drive the hips through and throw the ball backward over the head as far as possible."
 },
 {
  "name": "Medicine Ball Underhand Forward Throw (Distance)",
  "category": "plyometric",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a medicine ball between the legs with straight arms, hinge and dip, then drive the hips through and throw the ball forward as far as possible."
 },
 {
  "name": "Med Ball High Drop to Overhead Throw",
  "category": "plyometric",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Core",
   "Lats",
   "Triceps"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Press",
  "laterality": "bilateral",
  "instructions": "Hold a medicine ball high overhead, let it drop back behind the head from that higher start and catch the drop, then throw it forward overhead as fast as possible."
 },
 {
  "name": "Med Ball Approach Overhead Throw",
  "category": "plyometric",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Shoulders",
   "Core",
   "Lats"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Take a few approach steps holding a medicine ball overhead, plant and throw it forward overhead as hard as possible, letting the body follow through."
 },
 {
  "name": "Medicine Ball Linear Side Toss",
  "category": "plyometric",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Glutes",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Face the target holding a medicine ball at one hip. Rotate the hips and trunk and throw the ball forward from the side as hard as possible, then switch sides.",
  "videoUrl": "https://www.youtube.com/watch?v=zoXaFkBA4FE"
 },
 {
  "name": "Medicine Ball Split-Stance Anti-Rotation Side Toss",
  "category": "plyometric",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Glutes"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand in a split stance side-on to a wall with a medicine ball at the hip. Throw it into the wall with the arms and trunk while keeping the hips square and still, catch it and repeat.",
  "videoUrl": "https://www.youtube.com/watch?v=I5tkxAVEndc"
 },
 {
  "name": "Medicine Ball Half-Kneeling Side Toss",
  "category": "plyometric",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee side-on to a wall holding a medicine ball at the hip. Rotate the trunk and throw the ball into the wall as hard as possible, keeping the hips tall, then switch sides.",
  "videoUrl": "https://youtu.be/DPCQJ1gBmbE"
 },
 {
  "name": "Medicine Ball Single-Arm Throw",
  "category": "plyometric",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Obliques",
   "Chest"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Hold a light medicine ball in one hand at the shoulder like a throw. Step and rotate through the hips and throw it forward with one arm as hard as possible, then switch arms.",
  "videoUrl": "https://www.youtube.com/watch?v=TAyMI0XsdJE"
 },
 {
  "name": "Medicine Ball Double Hop to Single-Arm Throw",
  "category": "plyometric",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Shoulders",
   "Obliques",
   "Glutes"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hold a light medicine ball in the throwing hand, take two quick hops toward the target, land and throw it with one arm as hard as possible.",
  "videoUrl": "https://www.youtube.com/watch?v=q2cZ46-l18E"
 },
 {
  "name": "Medicine Ball Overhead Stomp Shuffle to Single-Arm Throw",
  "category": "plyometric",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Shoulders",
   "Obliques",
   "Core"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Slam a medicine ball down from overhead, catch it, shuffle sideways toward the target and throw it with one arm as hard as possible.",
  "videoUrl": "https://www.youtube.com/watch?v=86nA3DdTahQ"
 },
 {
  "name": "Medicine Ball Running Side Toss",
  "category": "plyometric",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Glutes",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Run a few steps holding a medicine ball at the hip, plant side-on to the target and rotate through the hips to throw the ball as hard as possible.",
  "videoUrl": "https://youtu.be/AAqxrWFLfuY"
 },
 {
  "name": "Medicine Ball Running Single-Arm Throw",
  "category": "plyometric",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Obliques",
   "Glutes"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Run a few steps holding a light medicine ball in the throwing hand, plant and throw it with one arm as hard as possible.",
  "videoUrl": "https://youtu.be/6dV0qfv9iYU"
 },
 {
  "name": "Medicine Ball Linear Catch and Scoop Toss",
  "category": "plyometric",
  "muscleGroup": "Hips",
  "secondaryMuscles": [
   "Obliques",
   "Glutes"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Face a partner, catch a medicine ball passed straight to you, load it to the hip and scoop toss it back with a fast hip turn in one move.",
  "videoUrl": "https://youtu.be/8A8esS0kkkk"
 },
 {
  "name": "Medicine Ball Lateral Catch and Scoop Toss",
  "category": "plyometric",
  "muscleGroup": "Hips",
  "secondaryMuscles": [
   "Obliques",
   "Glutes"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand side-on to a partner, catch a medicine ball passed to you, load it to the back hip and scoop toss it back with a fast hip turn in one move.",
  "videoUrl": "https://youtu.be/nUYeszoj38I"
 },
 {
  "name": "Medicine Ball Linear Catch and Throw",
  "category": "plyometric",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Face a partner or wall, catch the medicine ball, rotate to load it at the hip and throw it straight back as fast as possible without pausing.",
  "videoUrl": "https://youtu.be/sNLv20RMxdE"
 },
 {
  "name": "Medicine Ball Lateral Catch and Throw",
  "category": "plyometric",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand side-on to a partner or wall, catch the medicine ball, let it carry you into rotation and throw it back as fast as possible without pausing.",
  "videoUrl": "https://youtu.be/mRFWFNc2WNY"
 },
 {
  "name": "Medicine Ball Shuffle Catch and Throw",
  "category": "plyometric",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Glutes",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Shuffle sideways, catch a medicine ball from a partner, plant and rotate to throw it back as fast as possible, then shuffle again.",
  "videoUrl": "https://youtu.be/HdXyaf0uCf0"
 },
 {
  "name": "Medicine Ball Catch and Pivot Throw",
  "category": "plyometric",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Glutes",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Catch a medicine ball, pivot on the feet to turn toward the target and throw it as hard as possible from the hip in one move.",
  "videoUrl": "https://youtu.be/F0fXH19JLNc"
 },
 {
  "name": "Medicine Ball Side-to-Side Overhead Stomp",
  "category": "plyometric",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques",
   "Lats",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Raise a medicine ball overhead and slam it down to the floor outside one foot, pick it up and slam it outside the other foot, alternating.",
  "videoUrl": "https://youtu.be/jHE71FJU4ag"
 },
 {
  "name": "Medicine Ball Overhead Rollover Stomp",
  "category": "plyometric",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Lats",
   "Shoulders",
   "Hip Flexors"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Lie on your back holding a medicine ball overhead, roll up to the feet in one move, rise tall and slam the ball down hard.",
  "videoUrl": "https://youtu.be/-Im5BxzMfFA"
 },
 {
  "name": "Medicine Ball Kneeling Overhead Stomp",
  "category": "plyometric",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Lats",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Kneel tall holding a medicine ball overhead and slam it to the floor in front of the knees as hard as possible, keeping the hips forward.",
  "videoUrl": "https://youtu.be/L7GADtZYE9I"
 },
 {
  "name": "Medicine Ball Kneeling Side-to-Side Overhead Stomp",
  "category": "plyometric",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques",
   "Lats",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Kneel tall holding a medicine ball overhead and slam it to the floor beside one knee, then the other, alternating.",
  "videoUrl": "https://youtu.be/Xkkya2TPRY8"
 },
 {
  "name": "Medicine Ball Split-Stance Overhead Catch and Slam",
  "category": "plyometric",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Lats",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Stand in a split stance with the arms up, catch a medicine ball tossed overhead and slam it straight down to the floor in one move.",
  "videoUrl": "https://youtu.be/CaZqsQNdaP0"
 },
 {
  "name": "Medicine Ball Half-Kneeling Overhead Catch and Slam",
  "category": "plyometric",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Lats",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Kneel on one knee with the arms up, catch a medicine ball tossed overhead and slam it straight down to the floor in one move.",
  "videoUrl": "https://youtu.be/wFcXlySZR-Y"
 },
 {
  "name": "Medicine Ball Kneeling Overhead Catch and Slam",
  "category": "plyometric",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Lats",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Kneel tall with the arms up, catch a medicine ball tossed overhead and slam it straight down to the floor in one move.",
  "videoUrl": "https://youtu.be/sW_SMsiVP-M"
 },
 {
  "name": "Mini Medicine Ball Half-Kneeling External Rotation Throw (Position 1, 90/90)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee with the throwing arm out at shoulder height and the elbow bent 90 degrees. Catch a light ball from a partner, let the forearm rotate back and throw it straight back with a quick flick.",
  "videoUrl": "https://www.youtube.com/watch?v=Ytte5qRyooQ"
 },
 {
  "name": "Mini Medicine Ball Half-Kneeling External Rotation Throw (Position 2)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee with the throwing arm in the second position set by the coach and the elbow bent 90 degrees. Catch a light ball, let the forearm rotate back and throw it straight back with a quick flick.",
  "videoUrl": "https://www.youtube.com/watch?v=ZIWxjYeWFAc"
 },
 {
  "name": "Mini Medicine Ball Half-Kneeling External Rotation Throw (Position 3)",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee with the throwing arm in the third position set by the coach and the elbow bent 90 degrees. Catch a light ball, let the forearm rotate back and throw it straight back with a quick flick.",
  "videoUrl": "https://www.youtube.com/watch?v=Pk44ENpWot8"
 },
 {
  "name": "Mini Medicine Ball Half-Kneeling Travels",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Core"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee holding a light ball in the throwing hand with the elbow at shoulder height. Move the ball slowly through the throwing positions set by the coach and back, keeping the shoulder set.",
  "videoUrl": "https://www.youtube.com/watch?v=_SU6OCv2_S4"
 },
 {
  "name": "Mini Medicine Ball Single-Arm Lying Throw",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Chest",
   "Triceps"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Press",
  "laterality": "unilateral",
  "instructions": "Lie on your back holding a light ball in one hand with the elbow on the floor at shoulder height. Throw it straight up with a quick arm action, catch it and repeat, then switch arms.",
  "videoUrl": "https://www.youtube.com/watch?v=DJt9GqfHrx0"
 },
 {
  "name": "Mini Medicine Ball External Rotation Toss to Wall",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand facing a wall with the elbow at shoulder height and bent 90 degrees, a light ball in hand. Toss the ball into the wall with a quick flick of the forearm, catch it and repeat.",
  "videoUrl": "https://youtu.be/zHlxZovOUMw"
 },
 {
  "name": "Mini Medicine Ball Half-Kneeling External Rotation Toss to Wall",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee facing a wall with the elbow at shoulder height and bent 90 degrees. Toss a light ball into the wall with a quick flick of the forearm, catch it and repeat.",
  "videoUrl": "https://youtu.be/SanydC7uSkw"
 },
 {
  "name": "Mini Medicine Ball Deceleration Catch and Throw",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Core"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand in a throwing stance. Catch a light ball thrown from behind the throwing shoulder as the arm finishes its follow-through, slow it down, and throw it back from the same path.",
  "videoUrl": "https://youtu.be/J1JLXoYV5M8"
 },
 {
  "name": "Mini Medicine Ball Half-Kneeling Deceleration Catch and Throw",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Core"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee and catch a light ball thrown from behind the throwing shoulder in the follow-through, slow it down, and throw it back from the same path.",
  "videoUrl": "https://youtu.be/_IPO_i0m_go"
 },
 {
  "name": "Mini Medicine Ball Figure-8 Throw",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Core",
   "Forearms"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Hold a light ball in the throwing hand and move it in a smooth figure-8 in front of the body, then release it into a wall or to a partner at the end of the pattern.",
  "videoUrl": "https://youtu.be/UNJU1C8GNl0"
 },
 {
  "name": "Mini Medicine Ball Handball Throw",
  "category": "plyometric",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Obliques",
   "Chest"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Hold a light ball in the throwing hand, take a step and throw it overhead as in a handball shot, finishing the follow-through across the body.",
  "videoUrl": "https://youtu.be/9C106e-7r5M"
 },
 {
  "name": "Barbell Hollow Body Press",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Shoulders",
   "Triceps",
   "Chest"
  ],
  "equipment": "Barbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lie on your back in a hollow hold, shoulders and legs off the floor, holding a light bar over the chest. Press it up and lower it while holding the hollow shape without the lower back lifting.",
  "videoUrl": "https://www.youtube.com/watch?v=iQKiHrgMSi8"
 },
 {
  "name": "Dumbbell Hollow Body Press",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Shoulders",
   "Triceps",
   "Chest"
  ],
  "equipment": "Dumbbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lie on your back in a hollow hold, shoulders and legs off the floor, with a dumbbell in each hand at the chest. Press and lower while holding the hollow shape without the lower back lifting.",
  "videoUrl": "https://www.youtube.com/watch?v=wtX-yJPc5kw"
 },
 {
  "name": "Dumbbell Hollow Body Fly",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Chest",
   "Shoulders"
  ],
  "equipment": "Dumbbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lie on your back in a hollow hold with light dumbbells held above the chest. Open the arms out to the sides and bring them back together while holding the hollow shape.",
  "videoUrl": "https://www.youtube.com/watch?v=HnmqaZ222tc"
 },
 {
  "name": "Kettlebell Halo",
  "category": "mobility",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Core",
   "Traps"
  ],
  "equipment": "Kettlebell",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Hold a kettlebell upside down by the horns at the chest. Circle it around the head close to the hair, then reverse direction, keeping the ribs down and the trunk still.",
  "videoUrl": "https://www.youtube.com/watch?v=wdqRjeDVKqk"
 },
 {
  "name": "Kettlebell Pendulum Swing",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Kettlebell",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Stand wide holding a kettlebell with straight arms in front of you. Swing it side to side like a pendulum, controlling it at each end with the trunk rather than the arms.",
  "videoUrl": "https://youtu.be/4V4O7VMiWss"
 },
 {
  "name": "Dumbbell Side Bend",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Lower Back"
  ],
  "equipment": "Dumbbell",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Stand tall holding a dumbbell at one side. Bend sideways toward it, then pull back up to tall using the opposite side, without twisting, and switch sides after the set.",
  "videoUrl": "https://youtu.be/qb2qsK08IdI"
 },
 {
  "name": "Dumbbell Leg Lift Press",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Chest",
   "Triceps",
   "Hip Flexors"
  ],
  "equipment": "Dumbbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the legs raised and a dumbbell in each hand at the chest. Press and lower the dumbbells while lowering and raising the legs, keeping the lower back on the floor.",
  "videoUrl": "https://www.youtube.com/watch?v=ofCjrSW63Ag"
 },
 {
  "name": "Dumbbell Leg Lift Lateral Raise",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Shoulders",
   "Hip Flexors"
  ],
  "equipment": "Dumbbell",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Sit or lie back with the legs lifted off the floor and light dumbbells in hand. Raise the arms out to the sides and lower while holding the legs up and the trunk still.",
  "videoUrl": "https://www.youtube.com/watch?v=l216H_F6bc0"
 },
 {
  "name": "Dumbbell Bench Bird Dog Row",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Core",
   "Glutes"
  ],
  "equipment": "Dumbbell",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Kneel on a bench on one knee and one hand with a dumbbell in the free hand. Reach the opposite leg straight back and hold it level while rowing the dumbbell to the hip, then switch sides.",
  "videoUrl": "https://www.youtube.com/watch?v=u-FsCoKiWnw"
 },
 {
  "name": "Renegade Row (Bench)",
  "category": "accessory",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Dumbbell",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Set the hands on dumbbells resting on a bench with the feet back in a plank. Row one dumbbell to the hip while keeping the hips square, set it down and alternate.",
  "videoUrl": "https://www.youtube.com/watch?v=tnAXyszgBnU"
 },
 {
  "name": "Dumbbell Kneeling Overhead Hold to Stand",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Glutes",
   "Quads"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Kneel with a dumbbell held overhead on a straight arm. Step one foot forward and stand up without the weight moving off the line overhead, then return to kneeling.",
  "videoUrl": "https://youtu.be/QNbiDrCaTIs"
 },
 {
  "name": "Landmine Anti-Rotation",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques",
   "Shoulders"
  ],
  "equipment": "Landmine",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Hold the end of a landmine at arm's length in front of the chest. Move the bar from side to side in an arc with the arms while the hips and trunk stay facing forward.",
  "videoUrl": "https://www.youtube.com/watch?v=N9grk5I8FlY"
 },
 {
  "name": "Landmine Split-Stance Anti-Rotation",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques",
   "Glutes",
   "Shoulders"
  ],
  "equipment": "Landmine",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Stand in a split stance holding the end of a landmine at arm's length in front of the chest. Move the bar side to side in an arc while the hips stay square.",
  "videoUrl": "https://www.youtube.com/watch?v=cfktJE83C6U"
 },
 {
  "name": "Landmine Anti-Rotation Switch",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques",
   "Shoulders"
  ],
  "equipment": "Landmine",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Hold the end of a landmine at arm's length and move it to one side, then switch the bar quickly across to the other side, stopping it each time with the trunk still.",
  "videoUrl": "https://www.youtube.com/watch?v=KNVf98QOLrs"
 },
 {
  "name": "Landmine Half-Kneeling Anti-Rotation",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques",
   "Shoulders"
  ],
  "equipment": "Landmine",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Kneel on one knee holding the end of a landmine at arm's length in front of the chest. Move the bar side to side in an arc while the hips stay tall and square.",
  "videoUrl": "https://www.youtube.com/watch?v=43kPrz78tAY"
 },
 {
  "name": "Landmine Hollow Body Press",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Shoulders",
   "Chest",
   "Triceps"
  ],
  "equipment": "Landmine",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lie on your back in a hollow hold with the end of a landmine at the chest. Press it up and lower it while holding the hollow shape.",
  "videoUrl": "https://www.youtube.com/watch?v=8KwSI0mP6Bw"
 },
 {
  "name": "Landmine Hollow Body Lateral Drop",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Obliques",
   "Shoulders"
  ],
  "equipment": "Landmine",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Lie on your back in a hollow hold holding the end of a landmine above the chest with straight arms. Lower it to one side and bring it back to the middle, then the other side, holding the hollow shape.",
  "videoUrl": "https://www.youtube.com/watch?v=JpeyQ_dG3aU"
 },
 {
  "name": "Landmine Lateral Rollout (Knees Bent)",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Shoulders",
   "Lats"
  ],
  "equipment": "Landmine",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Kneel side-on to a landmine with the hands on the end of the bar. Roll it out sideways away from you as far as you can control, then pull it back, keeping the trunk straight.",
  "videoUrl": "https://www.youtube.com/watch?v=A1V_SKnIaIc"
 },
 {
  "name": "Landmine Lateral Rollout",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Shoulders",
   "Lats"
  ],
  "equipment": "Landmine",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand side-on to a landmine with the hands on the end of the bar. Roll it out sideways into a long side plank shape as far as you can control, then pull it back.",
  "videoUrl": "https://www.youtube.com/watch?v=lofa9JT7XTI"
 },
 {
  "name": "Landmine Rotation Drop Catch",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Landmine",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Hold the end of a landmine overhead, let it fall to one side and catch it at the hip, stopping it with the trunk, then drive it back up and repeat to the other side.",
  "videoUrl": "https://www.youtube.com/watch?v=fqGyffyokcc"
 },
 {
  "name": "RKC Plank",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Abs",
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Set up in a forearm plank with the elbows a little forward and close together. Squeeze the glutes, pull the elbows toward the toes and hold as hard as you can for a short time.",
  "videoUrl": "https://www.youtube.com/watch?v=RZT6BU1BO-Y"
 },
 {
  "name": "Plank (Leg Lifts)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Glutes",
   "Abs"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold a forearm plank and lift one straight leg a few inches, set it down and alternate, keeping the hips level.",
  "videoUrl": "https://www.youtube.com/watch?v=qn7A7g0PgRk"
 },
 {
  "name": "High Plank (Leg Lifts)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Glutes",
   "Shoulders"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold a high plank on straight arms and lift one straight leg a few inches, set it down and alternate, keeping the hips level.",
  "videoUrl": "https://www.youtube.com/watch?v=vkLBMMQQE_w"
 },
 {
  "name": "Side Plank (Upper Leg Lifted)",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hold a side plank and lift the top leg up and hold it there for the time set, hips high and in line with the shoulders.",
  "videoUrl": "https://www.youtube.com/watch?v=wNOCNAp1Ly8"
 },
 {
  "name": "Side Plank (Hip Flexion)",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Hip Flexors",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hold a side plank and drive the top knee up toward the chest, then extend it back, keeping the hips high and the body still.",
  "videoUrl": "https://www.youtube.com/watch?v=ElbthHTlklk"
 },
 {
  "name": "Side Plank and Row",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Back",
   "Core"
  ],
  "equipment": "Cable",
  "movementType": "Pull",
  "laterality": "unilateral",
  "instructions": "Hold a side plank facing a low cable or band with the handle in the top hand. Row the handle to the ribs and return it while the hips stay high and still.",
  "videoUrl": "https://www.youtube.com/watch?v=u_lCduey-BQ"
 },
 {
  "name": "Da Vinci Plank",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "From a high plank, widen the hands and feet into a star and hold, keeping the body flat and the hips level.",
  "videoUrl": "https://www.youtube.com/watch?v=DaUe1IaEGxE"
 },
 {
  "name": "Da Vinci Plank (Elbow)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "From a forearm plank, set the elbows and feet wide into a star and hold, keeping the body flat and the hips level.",
  "videoUrl": "https://www.youtube.com/watch?v=M9lFn9V1iRY"
 },
 {
  "name": "Front Plank Reach",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Obliques"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold a plank and reach one arm straight forward, set it down and alternate, keeping the hips level and still.",
  "videoUrl": "https://www.youtube.com/watch?v=taUdsWuMtJg"
 },
 {
  "name": "Slider Plank",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Abs",
   "Shoulders"
  ],
  "equipment": "Slider",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold a high or forearm plank with the feet or hands on sliders. Slide them out and back in a small range while the body stays straight and the hips do not sag.",
  "videoUrl": "https://www.youtube.com/watch?v=TVr31YCu-9M"
 },
 {
  "name": "Lying Leg Raise",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Hip Flexors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the legs straight and the hands under the hips or by the sides. Raise the legs to vertical and lower them slowly without the lower back lifting.",
  "videoUrl": "https://www.youtube.com/watch?v=C1EAMYP77GU"
 },
 {
  "name": "TRX Plank",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Abs"
  ],
  "equipment": "TRX",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Set the feet in the suspension straps and hold a forearm or high plank. Keep the body straight and the straps still for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=Z-6WcaVYHt8"
 },
 {
  "name": "TRX Extension Plank",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Shoulders",
   "Lats"
  ],
  "equipment": "TRX",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold the suspension handles with straight arms and lean forward into a plank, letting the arms move overhead as far as you can control. Pull back to the start without the hips sagging.",
  "videoUrl": "https://www.youtube.com/watch?v=T5UuVBelQXY"
 },
 {
  "name": "TRX Flutter Kick",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Hip Flexors",
   "Core"
  ],
  "equipment": "TRX",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold a plank with the feet in the suspension straps and kick the legs up and down in small, quick alternating movements, keeping the hips level.",
  "videoUrl": "https://www.youtube.com/watch?v=vgESoc8SqRM"
 },
 {
  "name": "TRX Fallout",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Shoulders",
   "Lats"
  ],
  "equipment": "TRX",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold the suspension handles in front of you with straight arms and lean forward, letting the arms rise overhead as the body falls forward. Pull back up keeping the body in one straight line.",
  "videoUrl": "https://www.youtube.com/watch?v=4FQlLhx1czU"
 },
 {
  "name": "TRX Single-Leg Fallout",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Shoulders",
   "Lats",
   "Glutes"
  ],
  "equipment": "TRX",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand on one leg holding the suspension handles and lean forward, letting the arms rise overhead as the body falls forward. Pull back up keeping the body straight, then switch legs.",
  "videoUrl": "https://www.youtube.com/watch?v=-aMdhf8IXKM"
 },
 {
  "name": "Bear Crawl (Backward)",
  "category": "conditioning",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Carry",
  "laterality": "bilateral",
  "instructions": "Set up on hands and toes with the knees an inch off the floor and crawl backward, opposite hand and foot together. Keep the back flat and the knees low the whole way.",
  "videoUrl": "https://www.youtube.com/watch?v=oSId815-RaU"
 },
 {
  "name": "Bear Crawl (Lateral)",
  "category": "conditioning",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Carry",
  "laterality": "bilateral",
  "instructions": "From a bear position with the knees an inch off the floor, crawl sideways, moving the near hand and foot first. Keep the hips level and the back flat.",
  "videoUrl": "https://www.youtube.com/watch?v=qEDloxBQ99E"
 },
 {
  "name": "Bear Crawl Thoracic Rotation",
  "category": "mobility",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Obliques"
  ],
  "equipment": "Bodyweight",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Hold a bear position with the knees just off the floor, lift one hand and rotate the chest open toward the ceiling, then return. Keep the hips square while the upper back turns.",
  "videoUrl": "https://www.youtube.com/watch?v=VwHNpmfGWoE"
 },
 {
  "name": "Bear Crawl Jump",
  "category": "conditioning",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "From a bear position with the knees just off the floor, hop both feet forward toward the hands and land softly back in the bear. Keep the back flat and the landings quiet.",
  "videoUrl": "https://www.youtube.com/watch?v=W1YSiMdOLzs"
 },
 {
  "name": "Bear Crawl Switch",
  "category": "conditioning",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Obliques"
  ],
  "equipment": "Bodyweight",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "From a bear position with the knees just off the floor, swing the legs through to one side and back, switching sides each rep. Keep the hands planted and the shoulders over the wrists.",
  "videoUrl": "https://www.youtube.com/watch?v=pf-1r1Vlp90"
 },
 {
  "name": "Bear Crawl Hand Lift",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hold a bear position with the knees an inch off the floor and lift one hand a few inches, then the other. Keep the hips from shifting or rotating as each hand comes up.",
  "videoUrl": "https://www.youtube.com/watch?v=QnKPNnyegUw"
 },
 {
  "name": "Bear Crawl (Weighted Vest)",
  "category": "conditioning",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Carry",
  "laterality": "bilateral",
  "instructions": "Wear a weighted vest and crawl forward on hands and feet with the knees an inch off the floor, opposite hand and foot together. Keep the back flat under the load.",
  "videoUrl": "https://youtu.be/nTRCioecL7M"
 },
 {
  "name": "Bird Dog (Knees Lifted)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Glutes",
   "Shoulders"
  ],
  "equipment": "Bodyweight",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "From hands and knees, lift the knees an inch off the floor, then reach one arm forward and the opposite leg back. Keep the hips level and return slowly.",
  "videoUrl": "https://www.youtube.com/watch?v=trjuLFQy7Ww"
 },
 {
  "name": "Bird Dog (Banded)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Glutes",
   "Shoulders"
  ],
  "equipment": "Band",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "From hands and knees with a band looped from hand to opposite foot, reach the arm forward and the leg back against the band. Keep the back flat and the hips square.",
  "videoUrl": "https://www.youtube.com/watch?v=0e_mzydHlqU"
 },
 {
  "name": "Scorpion",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Lower Back",
   "Obliques"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Lie face down with the arms out wide and swing one heel up and across toward the opposite hand, then return. Keep the chest and shoulders on the floor.",
  "videoUrl": "https://www.youtube.com/watch?v=q0tJ2KyynHc"
 },
 {
  "name": "Ring L-Sit",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Hip Flexors",
   "Triceps"
  ],
  "equipment": "Rings",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Support yourself on the rings with straight arms and lift the legs straight out in front to hip height. Keep the shoulders pushed down and the rings close to the body.",
  "videoUrl": "https://www.youtube.com/watch?v=Pxth0Y-MO3o"
 },
 {
  "name": "Ring L-Sit (Tucked)",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Hip Flexors",
   "Triceps"
  ],
  "equipment": "Rings",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Support yourself on the rings with straight arms and lift the knees to the chest. Keep the shoulders pushed down and hold still for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=g182gVfHEeM"
 },
 {
  "name": "Parallette L-Sit",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Hip Flexors",
   "Triceps"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Press up on the parallettes with straight arms and lift the legs straight out in front to hip height. Push the shoulders down away from the ears.",
  "videoUrl": "https://www.youtube.com/watch?v=R3mEbw3ETbM"
 },
 {
  "name": "Parallette L-Sit (Tucked)",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Hip Flexors",
   "Triceps"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Press up on the parallettes with straight arms and pull the knees toward the chest. Keep the shoulders down and hold for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=lMYp65ZRTtc"
 },
 {
  "name": "Hanging L-Sit",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Hip Flexors",
   "Forearms"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hang from a bar and lift the straight legs to hip height. Hold without swinging, shoulders active.",
  "videoUrl": "https://www.youtube.com/watch?v=36SMVcRTh54"
 },
 {
  "name": "Hanging Knee Tuck",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Hip Flexors",
   "Forearms"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Hang from a bar and pull the knees up toward the chest, then lower them under control. Keep the body from swinging between reps.",
  "videoUrl": "https://www.youtube.com/watch?v=-Ez_rbNOkBo"
 },
 {
  "name": "Hanging Hollow Body Hold",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Lats",
   "Forearms"
  ],
  "equipment": "Pull-Up Bar",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hang from a bar and pull the legs slightly forward into a hollow shape, ribs down and legs together. Hold the shape without swinging.",
  "videoUrl": "https://www.youtube.com/watch?v=pxcFmFcM2cM"
 },
 {
  "name": "Medicine Ball Three-Way Hanging Leg Raise",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Obliques",
   "Hip Flexors"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Hang from a bar with a light medicine ball held between the feet and raise the legs to the middle, then to each side. Lower under control without swinging.",
  "videoUrl": "https://www.youtube.com/watch?v=td6I0oV9Bxc"
 },
 {
  "name": "Dead Bug (Legs Only)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Abs",
   "Hip Flexors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Lie on your back with the arms up and the knees over the hips, then lower one leg toward the floor and return. Keep the lower back pressed into the floor.",
  "videoUrl": "https://www.youtube.com/watch?v=t9HgAENrEk8"
 },
 {
  "name": "Dead Bug (Banded)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Abs",
   "Shoulders"
  ],
  "equipment": "Band",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Lie on your back holding a band anchored overhead with straight arms, knees over the hips, and lower one leg at a time. Keep the arms still against the band and the lower back down.",
  "videoUrl": "https://youtu.be/CFeJ7OsVSqU"
 },
 {
  "name": "Stability Ball Dead Bug",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Abs"
  ],
  "equipment": "Stability Ball",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Lie on your back pressing a stability ball between the hands and knees, then lower the opposite arm and leg while the other pair holds the ball. Keep the lower back on the floor.",
  "videoUrl": "https://www.youtube.com/watch?v=3zu_Dks7aV4"
 },
 {
  "name": "Foam Roller Dead Bug",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Abs"
  ],
  "equipment": "Foam Roller",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Lie lengthwise on a foam roller with the arms up and knees over the hips, then lower the opposite arm and leg. Stay balanced on the roller with the ribs down.",
  "videoUrl": "https://www.youtube.com/watch?v=MCksMjRLqIU"
 },
 {
  "name": "GHD Reverse Plank",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back"
  ],
  "equipment": "GHD",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Set up in the glute-ham developer and hold the body straight out from the pad, hips locked and legs straight. Hold for the time set without letting the hips sag.",
  "videoUrl": "https://www.youtube.com/watch?v=CR32MQv2iuk"
 },
 {
  "name": "GHD Single-Leg Reverse Plank",
  "category": "accessory",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back"
  ],
  "equipment": "GHD",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Set up in the glute-ham developer with one foot under the pad and hold the body straight out, hips locked. Switch legs after the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=YwIodoWXEMM"
 },
 {
  "name": "GHD Side Plank",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Adductors",
   "Core"
  ],
  "equipment": "GHD",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Lie on your side on the glute-ham developer with the feet locked in and hold the upper body straight out from the pad. Keep the body in one line and switch sides.",
  "videoUrl": "https://www.youtube.com/watch?v=vVt6tk6z4rk"
 },
 {
  "name": "Hollow Body Roll",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Obliques"
  ],
  "equipment": "Bodyweight",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Hold a hollow body position and roll onto your stomach into a superman, then back to the hollow, alternating directions. Keep the arms and legs off the floor the whole time.",
  "videoUrl": "https://www.youtube.com/watch?v=8Q09w1g4G8s"
 },
 {
  "name": "Stability Ball Stir the Pot",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Abs",
   "Shoulders"
  ],
  "equipment": "Stability Ball",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Plank with the forearms on a stability ball and draw small circles with the elbows. Keep the hips level and the body still while the ball moves.",
  "videoUrl": "https://www.youtube.com/watch?v=VQqzK0nCsDo"
 },
 {
  "name": "Stability Ball Body Saw",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Abs",
   "Shoulders"
  ],
  "equipment": "Stability Ball",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Plank with the forearms on a stability ball and rock the body forward and back by moving at the shoulders. Keep the hips in line and the lower back from sagging.",
  "videoUrl": "https://www.youtube.com/watch?v=pLOVHB6pjAM"
 },
 {
  "name": "Stability Ball Plank (Feet on Ball)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Abs",
   "Shoulders"
  ],
  "equipment": "Stability Ball",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold a plank with the hands or forearms on the floor and the feet on a stability ball. Keep the body in one line and the ball still.",
  "videoUrl": "https://www.youtube.com/watch?v=O14ATnnMW4c"
 },
 {
  "name": "Stability Ball Single-Leg Plank",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Glutes",
   "Shoulders"
  ],
  "equipment": "Stability Ball",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Hold a plank with the feet on a stability ball and lift one foot off it. Keep the hips square and switch legs after the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=FNL7WKyI-SA"
 },
 {
  "name": "Stability Ball Bear Plank",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Quads"
  ],
  "equipment": "Stability Ball",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "With the hands on the floor and the shins on a stability ball, hold the hips and knees bent like a bear position. Keep the back flat and the ball still.",
  "videoUrl": "https://www.youtube.com/watch?v=5DGxZ4E4RlE"
 },
 {
  "name": "Ab Bridge",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold a straight-body bridge on the forearms and toes with the ribs pulled down and the hips level. Keep squeezing the trunk for the time set.",
  "videoUrl": "https://www.youtube.com/watch?v=1yM3elamSSk"
 },
 {
  "name": "Stability Ball Pike Roll",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Shoulders",
   "Hip Flexors"
  ],
  "equipment": "Stability Ball",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "From a push-up position with the shins on a stability ball, lift the hips into a pike and roll the ball toward the hands, then return. Keep the arms straight.",
  "videoUrl": "https://www.youtube.com/watch?v=q5zLnisMUII"
 },
 {
  "name": "Alekna",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Hip Flexors"
  ],
  "equipment": "Bench",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Lie on a bench with the legs anchored and a weight held at the chest or overhead, lower the trunk back past the bench and curl up. Move with control through the whole range.",
  "videoUrl": "https://www.youtube.com/watch?v=M9HTEddh4sM"
 },
 {
  "name": "Parachuter",
  "category": "accessory",
  "muscleGroup": "Lower Back",
  "secondaryMuscles": [
   "Glutes",
   "Shoulders"
  ],
  "equipment": "Bodyweight",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lie face down with the arms out like a skydiver and lift the chest and legs off the floor. Hold with the neck long and the glutes squeezed.",
  "videoUrl": "https://www.youtube.com/watch?v=AKn-TLmn4jE"
 },
 {
  "name": "Dragon Flag (Eccentric Only)",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Lats",
   "Hip Flexors"
  ],
  "equipment": "Bench",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Lie on a bench holding it behind the head, raise the body straight up onto the shoulders, then lower it slowly in one straight line. Return to the top any way you need and repeat.",
  "videoUrl": "https://www.youtube.com/watch?v=1mLkb8QAvJg"
 },
 {
  "name": "Bench Walkout",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Abs"
  ],
  "equipment": "Bench",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "With the feet on a bench and the hands on the floor, walk the hands out into a long plank and back in. Keep the body straight and the hips from sagging.",
  "videoUrl": "https://www.youtube.com/watch?v=p892tSRZgVQ"
 },
 {
  "name": "Bench Walkout (Leg Lift)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Glutes"
  ],
  "equipment": "Bench",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "With the feet on a bench and the hands on the floor, walk out into a long plank, lift one leg, then walk back in. Keep the hips level as the leg lifts.",
  "videoUrl": "https://www.youtube.com/watch?v=0q7T3JcXO0w"
 },
 {
  "name": "Band Wide-Stance Anti-Rotation Hold",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques"
  ],
  "equipment": "Band",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand side-on to a band anchor with a wide stance and hold the band straight out from the chest. Keep the chest and hips facing forward against the pull.",
  "videoUrl": "https://www.youtube.com/watch?v=Y0aCeeC1CCA"
 },
 {
  "name": "Pallof Press (Perturbations)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques"
  ],
  "equipment": "Band",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Hold a band Pallof press out from the chest while a partner taps or tugs the band. Keep the hands centred and the trunk still.",
  "videoUrl": "https://youtu.be/-VWN4t-w6E0"
 },
 {
  "name": "Cable Rotation",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Cable",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand side-on to a cable at chest height and rotate the handle across the body with straight arms, turning through the hips. Return slowly to the start.",
  "videoUrl": "https://youtu.be/PGYJYERAWac"
 },
 {
  "name": "Band Rotation",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Band",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand side-on to a band anchored at chest height and rotate the band across the body with straight arms, turning through the hips. Return under control.",
  "videoUrl": "https://youtu.be/l2WmDZ02Lmk"
 },
 {
  "name": "Cable Pallof Press",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques"
  ],
  "equipment": "Cable",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand side-on to a cable at chest height, press the handle straight out from the chest and bring it back. Keep the hips and chest square against the pull.",
  "videoUrl": "https://youtu.be/9PsWRXfU1h4"
 },
 {
  "name": "Cable Wide-Stance Anti-Rotation Chop",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques",
   "Shoulders"
  ],
  "equipment": "Cable",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand side-on to a cable with a wide stance and pull the handle across the body while the hips and trunk stay facing forward. Move the arms, not the torso.",
  "videoUrl": "https://youtu.be/hUbRkz4AxkE"
 },
 {
  "name": "Cable Half-Kneeling Chop (High to Low)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques",
   "Shoulders"
  ],
  "equipment": "Cable",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee side-on to a high cable and pull the rope down and across the body to the far hip. Keep the hips square and the trunk tall.",
  "videoUrl": "https://youtu.be/ielTENoFbR0"
 },
 {
  "name": "Cable Half-Kneeling Chop (Cross Body)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques",
   "Shoulders"
  ],
  "equipment": "Cable",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee side-on to a cable at chest height and pull the handle across the body. Keep the hips square and the trunk from turning with the arms.",
  "videoUrl": "https://youtu.be/w0beAdv3IwM"
 },
 {
  "name": "Cable Half-Kneeling Lift",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques",
   "Shoulders"
  ],
  "equipment": "Cable",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Kneel on one knee side-on to a low cable and lift the rope up and across the body to above the far shoulder, turning through the trunk. Return under control.",
  "videoUrl": "https://youtu.be/5kFJ4p2WkEI"
 },
 {
  "name": "Cable Kneeling Lift",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques",
   "Shoulders"
  ],
  "equipment": "Cable",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Kneel on both knees side-on to a low cable and lift the rope up and across the body, turning through the trunk. Return under control.",
  "videoUrl": "https://youtu.be/Xtl04g89pXM"
 },
 {
  "name": "Band A-Position Cross",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Hip Flexors",
   "Shoulders"
  ],
  "equipment": "Band",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand tall in an A position, one knee driven up, holding a band anchored to the side, and press the band across the body. Keep the standing hip tall and the trunk still.",
  "videoUrl": "https://youtu.be/a3COz7pruCI"
 },
 {
  "name": "Stability Ball Plate Rotation",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Plate",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Lie with the upper back on a stability ball, hips up, holding a plate overhead of the chest with straight arms, and rotate side to side. Keep the hips level as the plate turns.",
  "videoUrl": "https://youtu.be/cQKwpbtADmE"
 },
 {
  "name": "Plate Anti-Rotation Hold",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques",
   "Shoulders"
  ],
  "equipment": "Plate",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold a plate straight out from the chest and resist as a partner pushes it side to side. Keep the trunk and hips still.",
  "videoUrl": "https://youtu.be/VKPlB413Ss4"
 },
 {
  "name": "Plate Isometric Hold (90 Degrees)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders"
  ],
  "equipment": "Plate",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Hold a plate out in front with the arms at 90 degrees and the trunk braced. Keep the ribs down and the shoulders level for the time set.",
  "videoUrl": "https://youtu.be/porF4nP797M"
 },
 {
  "name": "Side-Lying Plate Press",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Shoulders",
   "Core"
  ],
  "equipment": "Plate",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Lie on your side and press a plate up toward the ceiling with the top arm while holding the body in a straight line. Keep the hips stacked.",
  "videoUrl": "https://youtu.be/C7zfgZIXnPE"
 },
 {
  "name": "Plate U-Abs",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Hip Flexors"
  ],
  "equipment": "Plate",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Sit balanced on the hips holding a plate and move it in a U around the knees from one side to the other while the legs stay lifted. Keep the chest tall.",
  "videoUrl": "https://youtu.be/IfnUjAbq1S4"
 },
 {
  "name": "Plate A-Position Cross",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Hip Flexors",
   "Shoulders"
  ],
  "equipment": "Plate",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand tall in an A position, one knee driven up, and move a plate across the body from hip to opposite shoulder. Keep the standing hip tall and balanced.",
  "videoUrl": "https://youtu.be/wA5siMvTVZc"
 },
 {
  "name": "Bear Crawl (Banded)",
  "category": "conditioning",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Glutes"
  ],
  "equipment": "Band",
  "movementType": "Carry",
  "laterality": "bilateral",
  "instructions": "With a band around the wrists or above the knees, crawl forward on hands and feet with the knees just off the floor. Keep tension on the band and the back flat.",
  "videoUrl": "https://youtu.be/R3uThJpNJ2g"
 },
 {
  "name": "Slider Plank Ride (Forward)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Abs",
   "Shoulders"
  ],
  "equipment": "Slider",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Plank on the forearms with the feet on sliders and slide the body forward by reaching through the shoulders, then back. Keep the hips in line.",
  "videoUrl": "https://youtu.be/3rzw0IrLzGU"
 },
 {
  "name": "Slider Plank Ride (Backward)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Abs",
   "Shoulders"
  ],
  "equipment": "Slider",
  "movementType": "Isometric",
  "laterality": "bilateral",
  "instructions": "Plank on the forearms with the feet on sliders and push the body backward from the shoulders, then return. Keep the lower back from sagging.",
  "videoUrl": "https://youtu.be/vIG9bV-M4-c"
 },
 {
  "name": "Elevated Side Bend (Isometric)",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Lower Back",
   "Core"
  ],
  "equipment": "Bench",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Lie on your side with the hips on a bench and the feet anchored, and hold the trunk straight out in line with the legs. Switch sides after the time set.",
  "videoUrl": "https://youtu.be/Qk1C6dtxCOo"
 },
 {
  "name": "Elevated Side Bend (Elbow, Isometric)",
  "category": "accessory",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Adductors",
   "Core"
  ],
  "equipment": "Bench",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Prop on one elbow with the feet up on a bench and hold the body straight in a side plank. Keep the hips lifted and stacked.",
  "videoUrl": "https://youtu.be/zFKruj2qWZ0"
 },
 {
  "name": "Medicine Ball Split-Stance Anti-Rotation Chop (No Drop)",
  "category": "conditioning",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand in a split stance and chop a medicine ball down and across the body, stopping it hard before the hip without letting go. Keep the trunk facing forward.",
  "videoUrl": "https://www.youtube.com/watch?v=T9V595wafjE"
 },
 {
  "name": "Medicine Ball Seated Pass",
  "category": "conditioning",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Abs",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Sit with the knees bent beside a wall or partner and pass the medicine ball across the body with a quick turn of the trunk. Catch and pass again.",
  "videoUrl": "https://www.youtube.com/watch?v=6Cx7YeiOl9o"
 },
 {
  "name": "Medicine Ball Split-Stance Scoop Toss",
  "category": "conditioning",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Hips",
   "Core"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand in a split stance side-on to a wall and scoop the medicine ball up and across into the wall, keeping the hips facing forward. Catch and repeat.",
  "videoUrl": "https://www.youtube.com/watch?v=I5tkxAVEndc"
 },
 {
  "name": "Medicine Ball Split-Stance Chop",
  "category": "conditioning",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand in a split stance and chop a medicine ball from above one shoulder down to the opposite hip. Keep the trunk braced and the legs still.",
  "videoUrl": "https://youtu.be/YTUM0ZfSiio"
 },
 {
  "name": "Medicine Ball A-Position Throw",
  "category": "plyometric",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Hip Flexors",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand in an A position on one leg, knee driven up, and throw the medicine ball into a wall or to a partner. Stay balanced on the standing leg through the throw.",
  "videoUrl": "https://youtu.be/-jnxkEIpTZA"
 },
 {
  "name": "Medicine Ball Contralateral Flexion",
  "category": "accessory",
  "muscleGroup": "Abs",
  "secondaryMuscles": [
   "Obliques",
   "Hip Flexors"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Lie on your back holding a medicine ball overhead and crunch up, bringing the ball to the opposite knee as it lifts. Lower slowly and switch sides.",
  "videoUrl": "https://youtu.be/6Snowi6dr0c"
 },
 {
  "name": "Medicine Ball Pallof Press (Isometric Push)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Obliques",
   "Chest"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "Stand side-on to a wall and press a medicine ball straight into it with both hands at chest height. Push hard and keep the trunk from turning.",
  "videoUrl": "https://youtu.be/W-wSs6LnTi8"
 },
 {
  "name": "Medicine Ball Hand-to-Hand Power Pass",
  "category": "conditioning",
  "muscleGroup": "Obliques",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Pass a medicine ball fast and hard to a partner or wall, catching and returning it with a quick turn of the trunk each rep. Keep the feet planted.",
  "videoUrl": "https://youtu.be/2UEoYyoomZo"
 },
 {
  "name": "Kettlebell Log Carry",
  "category": "strength",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Forearms",
   "Shoulders"
  ],
  "equipment": "Kettlebell",
  "movementType": "Carry",
  "laterality": "bilateral",
  "instructions": "Hold a heavy kettlebell hugged against the chest like a log and walk with short steps. Stay tall and keep the trunk braced.",
  "videoUrl": "https://youtu.be/gfbbPpyqfGM"
 },
 {
  "name": "TRX Bear Hold (Single-Arm)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Obliques"
  ],
  "equipment": "TRX",
  "movementType": "Isometric",
  "laterality": "unilateral",
  "instructions": "With the feet in the suspension straps, hold a bear position with the knees bent and lift one hand off the floor. Keep the hips level and the straps still for the time set.",
  "videoUrl": "https://youtu.be/6RhPmPRqQLA"
 },
 {
  "name": "Standing Landing (Tall to Short)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Stand tall on the toes with the arms up, then snap down into an athletic landing position and stick it. Land with the knees over the toes and the chest up.",
  "videoUrl": "https://youtu.be/beEsRxn1tiw?t=15"
 },
 {
  "name": "Single-Leg Standing Landing (Tall to Short, Two-to-One)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Rise tall on both toes with the arms up, then snap down onto one leg into a balanced landing and stick it. Keep the knee in line with the foot.",
  "videoUrl": "https://youtu.be/beEsRxn1tiw?t=30"
 },
 {
  "name": "Single-Leg Vertical Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Jump straight up off one leg and land on the same leg, sticking the landing. Land softly with the knee over the foot.",
  "videoUrl": "https://youtu.be/nXktShOccf4"
 },
 {
  "name": "Rotational Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Obliques"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Jump and turn a quarter or half turn in the air, landing on both feet and sticking it. Land facing the new direction with the knees over the toes.",
  "videoUrl": "https://youtu.be/yr1qAD8V_80"
 },
 {
  "name": "Single-Leg Rotational Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Obliques"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Hop and turn a quarter turn in the air, landing on one leg and sticking it. Keep the knee in line with the foot as you land.",
  "videoUrl": "https://youtu.be/yr1qAD8V_80?t=45"
 },
 {
  "name": "Single-Leg Drop Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Ankle"
  ],
  "equipment": "Box",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Step off a low box and land on one leg, sticking the landing. Land softly with the knee over the foot and hold still.",
  "videoUrl": "https://youtu.be/tzkxuksWrAA?t=28"
 },
 {
  "name": "Rotational Drop Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Obliques"
  ],
  "equipment": "Box",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Step off a box, turn a quarter turn in the air and land on both feet, sticking it. Land quietly with the knees over the toes.",
  "videoUrl": "https://youtu.be/PcD7_rrte64"
 },
 {
  "name": "Single-Leg Rotational Drop Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Obliques"
  ],
  "equipment": "Box",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Step off a low box, turn a quarter turn in the air and land on one leg, sticking it. Keep the knee in line with the foot.",
  "videoUrl": "https://youtu.be/PcD7_rrte64?t=35"
 },
 {
  "name": "Depth Jump (Stiff Ankle)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Step off a box and rebound off the balls of the feet with the ankles stiff and the knees nearly straight. Spend as little time on the ground as possible.",
  "videoUrl": "https://youtu.be/ut1v2eIsp8Q"
 },
 {
  "name": "Single-Leg Depth Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves",
   "Glutes"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Step off a low box onto one leg and rebound straight up off the same leg. Keep the ground contact short and the knee in line with the foot.",
  "videoUrl": "https://youtu.be/6TpSgNnfAsw"
 },
 {
  "name": "Hurdle Jump Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Hurdle",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Jump over a hurdle off both feet and stick the landing on both feet. Land softly with the knees over the toes before the next rep.",
  "videoUrl": "https://youtu.be/LA_oX_0hqTg"
 },
 {
  "name": "Lateral Hurdle Jump Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Adductors",
   "Glutes"
  ],
  "equipment": "Hurdle",
  "movementType": "Lunge",
  "laterality": "bilateral",
  "instructions": "Jump sideways over a hurdle off both feet and stick the landing. Land with the hips back and the knees over the toes.",
  "videoUrl": "https://youtu.be/i0GUGw1brsI"
 },
 {
  "name": "Rotational Hurdle Jump Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Obliques"
  ],
  "equipment": "Hurdle",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Jump over a hurdle, turn a quarter turn in the air and stick the landing on both feet. Land facing the new direction.",
  "videoUrl": "https://youtu.be/S4NnXQY77Ys"
 },
 {
  "name": "Hurdle Jump Landing (Two-to-One)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Ankle"
  ],
  "equipment": "Hurdle",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Jump over a hurdle off both feet and land on one leg, sticking it. Keep the knee in line with the foot.",
  "videoUrl": "https://youtu.be/X_nRD-DX_Zw"
 },
 {
  "name": "Single-Leg Hurdle Hop Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Hurdle",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Hop over a low hurdle on one leg and stick the landing on the same leg. Hold still before the next rep.",
  "videoUrl": "https://www.youtube.com/watch?v=WjcX3ywSE7E"
 },
 {
  "name": "Single-Leg Lateral Hurdle Hop Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Adductors",
   "Glutes"
  ],
  "equipment": "Hurdle",
  "movementType": "Lunge",
  "laterality": "unilateral",
  "instructions": "Hop sideways over a low hurdle on one leg and stick the landing on the same leg. Keep the knee over the foot.",
  "videoUrl": "https://www.youtube.com/watch?v=doCaYHOzwPc"
 },
 {
  "name": "Single-Leg Rotational Hurdle Hop Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Obliques"
  ],
  "equipment": "Hurdle",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Hop over a low hurdle on one leg, turn a quarter turn and stick the landing on the same leg. Keep the knee in line with the foot.",
  "videoUrl": "https://www.youtube.com/watch?v=mVrn4brBg3s"
 },
 {
  "name": "Awkward Angle Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Jump and land on both feet in an off-balance position, such as a staggered stance or a turned trunk, and stick it. Hold the landing with control.",
  "videoUrl": "https://youtu.be/Xp3J4nuSP38"
 },
 {
  "name": "Single-Leg Awkward Angle Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Hop and land on one leg in an off-balance position, such as leaning or turned, and stick it. Hold still with the knee in line with the foot.",
  "videoUrl": "https://youtu.be/8xFeFbZXY80"
 },
 {
  "name": "Drop Landing (Loaded)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Dumbbell",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Hold light dumbbells or wear a vest, step off a box and land on both feet, sticking it. Absorb the landing with the hips back and the knees over the toes.",
  "videoUrl": "https://youtu.be/h_VF3jDQado"
 },
 {
  "name": "Drop Landing (Partner Push)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Box",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Step off a box while a partner gives a light push, and land on both feet sticking it. Stay balanced over the feet.",
  "videoUrl": "https://youtu.be/J7avKSK7yiU"
 },
 {
  "name": "Drop Landing (Reactive)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Step off a box and, on a call or signal, land and stick or move off in the direction given. React fast and land under control.",
  "videoUrl": "https://youtu.be/gC3Hdm9Zm9A"
 },
 {
  "name": "Drop Landing (Medicine Ball, Floating Heel)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Ankle"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Hold a medicine ball, step off a low box and land on the balls of the feet with the heels kept off the ground. Stick it with the ankles stiff.",
  "videoUrl": "https://youtu.be/1vxgxrh9ILA"
 },
 {
  "name": "Single-Leg Drop Landing (Medicine Ball, Floating Heel)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Ankle"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Hold a medicine ball, step off a low box and land on the ball of one foot with the heel kept off the ground. Stick it and hold.",
  "videoUrl": "https://youtu.be/xqmZ22noJTQ"
 },
 {
  "name": "Single-Leg Drop Landing (Loaded)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Ankle"
  ],
  "equipment": "Dumbbell",
  "movementType": "Squat",
  "laterality": "unilateral",
  "instructions": "Hold light dumbbells, step off a low box and land on one leg, sticking it. Keep the knee in line with the foot.",
  "videoUrl": "https://www.youtube.com/watch?v=p5jTqSD4GzY"
 },
 {
  "name": "Seated Box Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Sit on a box or bench, plant the feet and jump straight from seated onto a second box. Land softly in a quarter squat.",
  "videoUrl": "https://www.youtube.com/watch?v=QHNz1GS6tok"
 },
 {
  "name": "Box Jump (Concentric Only)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Pause in a quarter squat for a second, then jump onto the box with no dip. Land softly in the same depth.",
  "videoUrl": "https://www.youtube.com/watch?v=sCqDBo5XSR0"
 },
 {
  "name": "Single-Leg Box Jump (Concentric Only)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Pause on one leg in a quarter squat, then jump onto the box with no dip, landing on the same leg. Land softly and stick it.",
  "videoUrl": "https://www.youtube.com/watch?v=w5FiI-OHP3s"
 },
 {
  "name": "Single-Leg Box Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Stand on one leg, dip and jump onto the box, landing on the same leg. Land softly with the knee over the foot.",
  "videoUrl": "https://www.youtube.com/watch?v=w2qvqPdZ5HQ"
 },
 {
  "name": "Single-Leg Box Jump (Floating Heel, Stiff Ankle)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Stand on one leg on the ball of the foot, heel off the floor, and jump onto a low box with a stiff ankle. Keep the heel off the ground the whole rep.",
  "videoUrl": "https://youtu.be/OIMaMgiKz2E"
 },
 {
  "name": "Rotational Box Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Obliques"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Stand side-on to the box and jump onto it with a quarter turn in the air. Land facing the box in a soft quarter squat.",
  "videoUrl": "https://www.youtube.com/watch?v=hoxhza8xAqU"
 },
 {
  "name": "Step-In Box Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Take one step toward the box into a two-foot takeoff and jump onto it. Land softly in a quarter squat.",
  "videoUrl": "https://www.youtube.com/watch?v=smQI-Z399j4"
 },
 {
  "name": "Approach Box Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Take a short run-up of a few steps and jump onto a high box off both feet. Land softly in a quarter squat.",
  "videoUrl": "https://www.youtube.com/watch?v=OTqk5ikXP8g"
 },
 {
  "name": "Step-Up Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Place one foot on a box and drive up through it into a jump, landing back with the same foot on the box. Switch legs after the set.",
  "videoUrl": "https://www.youtube.com/watch?v=UI-YZno3z0E"
 },
 {
  "name": "Box Jump (Knee Drive)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Hip Flexors",
   "Glutes"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump onto the box and drive the knees up hard in the air before landing. Land softly in a quarter squat.",
  "videoUrl": "https://www.youtube.com/watch?v=mA9Hvct_RVw"
 },
 {
  "name": "Staggered-Stance Box Jump (Knee Drive)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Hip Flexors",
   "Glutes"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Start in a staggered stance, jump onto the box and drive the back knee up as you take off. Land softly on both feet.",
  "videoUrl": "https://www.youtube.com/watch?v=mmRwB3lKxtU"
 },
 {
  "name": "Approach Jump Over Box",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Take a short run-up and jump over a box off both feet, landing on the far side. Land softly and stick it.",
  "videoUrl": "https://www.youtube.com/watch?v=8Z-iTw9TEEg"
 },
 {
  "name": "Sprinter Step Jump (Slant Board)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Glutes",
   "Hip Flexors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Stand with one foot on a slant board in a sprint start position and drive off it into a jump, the other knee driving up. Land and reset before the next rep.",
  "videoUrl": "https://www.youtube.com/watch?v=kDaA5ywzEUE"
 },
 {
  "name": "Sprinter Step Jump (Low Box)",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hip Flexors"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Place one foot on a low box and drive off it into a jump, the other knee driving up like a sprint stride. Land back with the same foot on the box.",
  "videoUrl": "https://www.youtube.com/watch?v=qOE8Lj_TlA8"
 },
 {
  "name": "Box Jump (Loaded, Concentric Only)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold light dumbbells at the sides, pause in a quarter squat, then jump onto the box with no dip. Land softly.",
  "videoUrl": "https://www.youtube.com/watch?v=aFRJB60q5UI"
 },
 {
  "name": "Box Jump (Loaded)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold light dumbbells at the sides, dip and jump onto the box. Land softly in a quarter squat.",
  "videoUrl": "https://www.youtube.com/watch?v=_xqB5kOV8h0"
 },
 {
  "name": "Single-Leg Box Jump (Loaded, Concentric Only)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hold light dumbbells, pause on one leg in a quarter squat, then jump onto a low box with no dip and land on the same leg.",
  "videoUrl": "https://www.youtube.com/watch?v=04Ix_Bw9hd4"
 },
 {
  "name": "Single-Leg Box Jump (Loaded)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hold light dumbbells, dip on one leg and jump onto a low box, landing on the same leg. Stick the landing.",
  "videoUrl": "https://www.youtube.com/watch?v=4xb63DU3DJg"
 },
 {
  "name": "Countermovement Jump (Arm Swing)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Dip quickly with a full arm swing and jump straight up as high as you can. Land softly on both feet.",
  "videoUrl": "https://www.youtube.com/watch?v=L6z2GSRhOCY"
 },
 {
  "name": "Single-Leg Countermovement Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Stand on one leg, dip quickly and jump straight up, landing on the same leg. Land softly with the knee over the foot.",
  "videoUrl": "https://www.youtube.com/watch?v=usE2mlUPWWE"
 },
 {
  "name": "Countermovement Jump (Band-Resisted)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With bands anchored to the floor and over the shoulders or hips, dip and jump straight up against the band. Land softly before each rep.",
  "videoUrl": "https://youtu.be/gy8Od8GMSCk"
 },
 {
  "name": "Countermovement Jump (Rhythmic, Band-Resisted)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With bands anchored to the floor and over the shoulders or hips, jump straight up repeatedly against the band, rebounding into each jump. Keep the rhythm steady.",
  "videoUrl": "https://youtu.be/ZtrIqoWVtbw"
 },
 {
  "name": "Hurdle Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Stand behind a hurdle, dip and jump up and over it with both feet, tucking the knees to clear it. Land softly on both feet and reset before the next jump.",
  "videoUrl": "https://youtu.be/eu37CTSmN_0"
 },
 {
  "name": "Hurdle Jump (Straight-Knee)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump over a low hurdle keeping the knees nearly straight, driving the jump from the ankles. Stay tall and land on the balls of the feet.",
  "videoUrl": "https://youtu.be/4hAK2ePFf4I"
 },
 {
  "name": "Single-Leg Hurdle Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Stand on one leg behind a low hurdle, jump up and over it and land on the same leg. Stick the landing with the knee over the foot before the next rep, then switch legs.",
  "videoUrl": "https://youtu.be/ghfgeYN5HgM"
 },
 {
  "name": "High Hurdle Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Stand behind a tall hurdle, swing the arms and jump as high as you can, pulling the knees up to clear it. Land softly on both feet and reset between jumps.",
  "videoUrl": "https://youtu.be/yQHlfQl8X3Q"
 },
 {
  "name": "Approach Jump (Two-Step)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Take two quick steps into a two-foot plant and jump straight up as high as you can, swinging both arms. Land softly on both feet.",
  "videoUrl": "https://youtu.be/iubKMpzJ8Ss"
 },
 {
  "name": "Approach Jump (Banded)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a band around the waist anchored behind you, take a short approach, plant both feet and jump as high as you can against the band. Land softly and walk back to the start.",
  "videoUrl": "https://youtu.be/aCDKupR0I6E"
 },
 {
  "name": "Single-Leg Approach Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Take a short approach and plant on one foot, driving the other knee and both arms up to jump as high as you can. Land under control and repeat off the other leg.",
  "videoUrl": "https://www.youtube.com/watch?v=ZV80I0ufVVg"
 },
 {
  "name": "Hurdle Approach Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Take a short approach into a two-foot plant and jump up and over a hurdle. Land softly on both feet on the far side.",
  "videoUrl": "https://www.youtube.com/watch?v=ZegvIhI_CtM"
 },
 {
  "name": "High Hurdle Approach Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Take a short approach into a two-foot plant and jump up and over a tall hurdle, pulling the knees high. Land softly on both feet and reset.",
  "videoUrl": "https://youtu.be/0TCAjemSjP4"
 },
 {
  "name": "Single-Leg Hurdle Approach Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Take a short approach and take off from one foot to clear a low hurdle. Land under control and repeat off the other leg.",
  "videoUrl": "https://www.youtube.com/watch?v=iUjuJGB4R4E"
 },
 {
  "name": "Low Box Jump (Maximal Takeoff)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Stand in front of a low box and jump as high as you can, well above the box, then land softly on top of it. The box is only the landing; the effort goes into the takeoff.",
  "videoUrl": "https://youtu.be/9eJUqwkTytk"
 },
 {
  "name": "Approach Low Box Takeoff Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Take a short approach, step onto a low box and take off from it, jumping as high as you can. Land softly on both feet.",
  "videoUrl": "https://youtu.be/H5pYQNef8FQ"
 },
 {
  "name": "Band Countermovement Jump (Eccentric-Accentuated)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Stand on bands that pull you down, drop fast into the dip and jump as high as you can. The bands speed up the descent; keep the dip quick and controlled.",
  "videoUrl": "https://youtu.be/0KIHAAqBFlA"
 },
 {
  "name": "Box Reflexive Hop",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Stand on a low box and make quick, short hops on the balls of the feet with stiff ankles. Spend as little time on the ground as possible.",
  "videoUrl": "https://youtu.be/FmLplpyc37Y"
 },
 {
  "name": "Smith Machine Reflexive Jump",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Smith Machine",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a light bar of a Smith machine across the upper back, make quick, short jumps on the balls of the feet with stiff ankles. Keep the ground contacts short.",
  "videoUrl": "https://youtu.be/nxjnzXvvIlw"
 },
 {
  "name": "Split Squat Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "From a split stance, drop into the bottom of a split squat and jump straight up, landing in the same stance. Reset before each rep and switch legs between sets.",
  "videoUrl": "https://youtu.be/uIjwhwXLpmQ"
 },
 {
  "name": "Band Split Squat Jump (Single)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "With a band giving resistance, jump straight up from a split squat and land back in the same stance. Pause and reset before each jump.",
  "videoUrl": "https://youtu.be/RJe_bASqdXk"
 },
 {
  "name": "Band Split Squat Jump (Continuous)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "With a band giving resistance, jump straight up from a split squat and go straight into the next jump as you land. Keep the stance the same and the ground contacts quick.",
  "videoUrl": "https://youtu.be/onvMVO5qWzo"
 },
 {
  "name": "Lunge Jump (Rhythmic)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "From a lunge, make small, rhythmic jumps without switching legs, staying in the stance. Keep the chest up and the front knee over the foot, then switch legs.",
  "videoUrl": "https://youtu.be/NS6xuSqy0Yk"
 },
 {
  "name": "Lunge Jump (Alternating Rhythmic)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "From a lunge, jump and switch legs in the air, landing in the opposite lunge, and keep a steady rhythm. Land softly with the front knee over the foot.",
  "videoUrl": "https://youtu.be/yrfdqDBYfh8"
 },
 {
  "name": "Split Jump (Switch)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "From a split stance, jump straight up and switch legs in the air, landing in the opposite split stance. Reset and repeat.",
  "videoUrl": "https://www.youtube.com/watch?v=Zq_0vAAkBYc"
 },
 {
  "name": "Trap Bar Squat to Box Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Trap Bar",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Perform a set of trap bar squats, set the bar down and go straight to a box jump. Land softly on the box and step down.",
  "videoUrl": "https://www.youtube.com/watch?v=5Gmv9N2t9yk"
 },
 {
  "name": "Squat to Box Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Perform a set of loaded squats, put the weights down and go straight to a box jump. Land softly on the box and step down.",
  "videoUrl": "https://youtu.be/YEsrccQv1dU"
 },
 {
  "name": "Trap Bar Squat Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Trap Bar",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Holding a light trap bar, pause in a half squat and jump straight up from a standstill. Land softly and reset before the next jump.",
  "videoUrl": "https://www.youtube.com/watch?v=qT6q2hdC6-Y"
 },
 {
  "name": "Landmine Countermovement Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Landmine",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold the end of a landmine bar at the chest, dip quickly and jump as high as you can. Land softly with the bar under control.",
  "videoUrl": "https://youtu.be/zibXlstms-s"
 },
 {
  "name": "Loaded to Unloaded Countermovement Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Do a countermovement jump holding dumbbells, set them down and do an unloaded countermovement jump right after. Jump as high as you can on both.",
  "videoUrl": "https://www.youtube.com/watch?v=G__zHbIck9c"
 },
 {
  "name": "Trap Bar Jump to Countermovement Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Trap Bar",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Do a jump holding a light trap bar, set it down and do an unloaded countermovement jump right after. Jump as high as you can on both.",
  "videoUrl": "https://www.youtube.com/watch?v=y3m-587zpQM"
 },
 {
  "name": "Medicine Ball Drop Countermovement Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a medicine ball, let it go as you drop into the dip and jump as high as you can. The quick drop sets up a fast countermovement.",
  "videoUrl": "https://youtu.be/gimpMm5RIwg"
 },
 {
  "name": "Medicine Ball Single-Leg Countermovement Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hold a medicine ball at the chest, stand on one leg, dip quickly and jump as high as you can. Land on the same leg under control, then switch.",
  "videoUrl": "https://youtu.be/qyH6nPVVZHk"
 },
 {
  "name": "Medicine Ball Approach Overhead Throw",
  "category": "plyometric",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Shoulders",
   "Glutes",
   "Core"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Take a short approach holding a medicine ball, plant both feet and jump while throwing the ball up and back overhead as high as you can. Drive with the legs first, then the arms.",
  "videoUrl": "https://youtu.be/m0Q50SUxwUM"
 },
 {
  "name": "Ankle Jump (Soft Mat)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "On a soft mat, make quick, small jumps on the balls of the feet with the knees nearly straight. Keep the ankles stiff and the rhythm steady.",
  "videoUrl": "https://youtu.be/rbDdhe1BNns"
 },
 {
  "name": "Ankle Jump",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Make quick, small jumps on the balls of the feet with the knees nearly straight. Keep the ankles stiff and the ground contacts short.",
  "videoUrl": "https://www.youtube.com/watch?v=MLoOh1yr4ro"
 },
 {
  "name": "Lateral Ankle Jump",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Make quick, small jumps side to side on the balls of the feet with the knees nearly straight. Keep the ankles stiff and the hops short.",
  "videoUrl": "https://www.youtube.com/watch?v=Z7UU8Crk4dA"
 },
 {
  "name": "Ankle Jump (Multidirectional)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Make quick, small ankle jumps forward, back and side to side in a set pattern. Keep the knees nearly straight and the ground contacts short.",
  "videoUrl": "https://www.youtube.com/watch?v=vYhYBVgxrps"
 },
 {
  "name": "Single-Leg Ankle Jump",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, make quick, small jumps on the ball of the foot with the knee nearly straight. Keep the ankle stiff, then switch legs.",
  "videoUrl": "https://www.youtube.com/watch?v=2hJSobp2vxE"
 },
 {
  "name": "Ankle Jump (Forward)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Make quick, small ankle jumps travelling forward, staying on the balls of the feet with the knees nearly straight. Keep the ground contacts short.",
  "videoUrl": "https://www.youtube.com/watch?v=mQVH3w0wJRo"
 },
 {
  "name": "Single-Leg Ankle Jump (Forward)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, make quick, small ankle jumps travelling forward with the knee nearly straight. Keep the ankle stiff, then switch legs.",
  "videoUrl": "https://www.youtube.com/watch?v=iJzmznbOL3s"
 },
 {
  "name": "Band Ankle Jump (Side)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a band pulling from one side, make quick, small ankle jumps in place. Keep the knees nearly straight and resist being pulled over.",
  "videoUrl": "https://youtu.be/WaqSTXnvpq0"
 },
 {
  "name": "Band Ankle Jump (Front)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a band pulling from the front, make quick, small ankle jumps in place. Keep the knees nearly straight and the body tall.",
  "videoUrl": "https://youtu.be/FGURpeTbnWQ"
 },
 {
  "name": "Band Ankle Jump (Back)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a band pulling from behind, make quick, small ankle jumps in place. Keep the knees nearly straight and the body tall.",
  "videoUrl": "https://youtu.be/MRbs-fM14-4"
 },
 {
  "name": "Stiff Ankle Pop",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Bounce on the balls of the feet in small pops, keeping the ankles and knees stiff. Barely leave the ground and keep the contacts quick.",
  "videoUrl": "https://youtu.be/gTkzOtoDZ08"
 },
 {
  "name": "Single-Leg Slant Board Ankle Jump (360)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, make small ankle jumps around a slant board so the foot meets the slope from every direction. Keep the ankle stiff and the hops small, then switch legs.",
  "videoUrl": "https://youtu.be/IgZVXW5KX4w"
 },
 {
  "name": "In-Out Vertical Bound",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Make quick vertical jumps, landing with the feet apart and then together, in a steady rhythm. Keep the knees nearly straight and the contacts short.",
  "videoUrl": "https://youtu.be/7q5JFMjuu-Y"
 },
 {
  "name": "Low Box Straddle Jump",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Adductors"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Stand astride a low box, jump up onto it with both feet and jump back down to the straddle. Keep a quick, steady rhythm.",
  "videoUrl": "https://www.youtube.com/watch?v=hBfrfxvdr1w"
 },
 {
  "name": "Low Box Quick Jump (Forward)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Make quick, small jumps forward onto and off a low box. Keep the knees soft and the ground contacts short.",
  "videoUrl": "https://www.youtube.com/watch?v=TKdn5le3MsA"
 },
 {
  "name": "Low Box Up-and-Down Ankle Jump",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Make quick ankle jumps up onto a low box and back down, with the knees nearly straight. Keep the ground contacts short.",
  "videoUrl": "https://www.youtube.com/watch?v=zLRjz-lTxaM"
 },
 {
  "name": "Single-Leg Low Box Up-and-Down Ankle Jump",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, make quick ankle jumps up onto a low box and back down. Keep the ankle stiff and the contacts short, then switch legs.",
  "videoUrl": "https://www.youtube.com/watch?v=dV2oabPIcMY"
 },
 {
  "name": "Lateral Low Box Up-and-Down Ankle Jump",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Adductors"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Standing side-on, make quick ankle jumps sideways up onto a low box and back down. Keep the knees nearly straight and the contacts short.",
  "videoUrl": "https://www.youtube.com/watch?v=6ECm7u6WOV4"
 },
 {
  "name": "Single-Leg Lateral Low Box Up-and-Down Ankle Jump",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Adductors"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, make quick ankle jumps sideways up onto a low box and back down. Keep the ankle stiff, then switch legs.",
  "videoUrl": "https://youtu.be/dV2oabPIcMY?t=8"
 },
 {
  "name": "Single-Leg Low Box Drop and Land",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Ankle"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Step off a low box onto one leg and stick the landing with the knee over the foot and the hips back. Hold, then step back up and switch legs.",
  "videoUrl": "https://www.youtube.com/watch?v=awGUn8Vm2ng"
 },
 {
  "name": "Single-Leg Lateral Plate Ankle Jump",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Adductors"
  ],
  "equipment": "Plate",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, make quick ankle jumps sideways onto and off a bumper plate on the floor. Keep the ankle stiff and the hops small, then switch legs.",
  "videoUrl": "https://youtu.be/1lwq3a-G8pc"
 },
 {
  "name": "Pogo Jump (Hands on Hips)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With the hands on the hips, bounce up and down on the balls of the feet with the knees nearly straight. Get height from the ankles alone.",
  "videoUrl": "https://www.youtube.com/watch?v=OVm2aHruzmI"
 },
 {
  "name": "Pogo Jump",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Bounce up and down on the balls of the feet with the knees nearly straight and stiff ankles. Keep the ground contacts short and the rhythm steady.",
  "videoUrl": "https://www.youtube.com/watch?v=x_OwT7JyCjk"
 },
 {
  "name": "Single-Leg Tuck Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, jump straight up and pull the knee toward the chest. Land softly on the same leg, then switch legs.",
  "videoUrl": "https://youtu.be/5Z5g0QsNFFY"
 },
 {
  "name": "Band Ankle Jump",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a band giving resistance, make quick, small ankle jumps in place with the knees nearly straight. Keep the ground contacts short.",
  "videoUrl": "https://youtu.be/hxdY7rJeDM4"
 },
 {
  "name": "Single-Leg Band Ankle Jump",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg with a band giving resistance, make quick, small ankle jumps in place. Keep the ankle stiff, then switch legs.",
  "videoUrl": "https://youtu.be/-Zt4t01J43o"
 },
 {
  "name": "Step-Up Jump (Rhythmic)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "With one foot on a box, drive through it to jump up, land back with the same foot on the box and repeat in a steady rhythm. Switch legs between sets.",
  "videoUrl": "https://www.youtube.com/watch?v=nuimAluHp94"
 },
 {
  "name": "Step-Up Jump (Alternating Rhythmic)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "With one foot on a box, drive through it to jump up and switch feet in the air, landing with the other foot on the box. Keep a steady rhythm.",
  "videoUrl": "https://www.youtube.com/watch?v=uccGlc9oFoA"
 },
 {
  "name": "Hurdle Jump (Double Contact, Low, Hands on Hips)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With the hands on the hips, jump over a row of low hurdles, taking one small bounce between each. Stay on the balls of the feet.",
  "videoUrl": "https://www.youtube.com/watch?v=HHgniaFX-ok"
 },
 {
  "name": "Hurdle Jump (Double Contact, Low)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump over a row of low hurdles, taking one small bounce between each. Stay on the balls of the feet and keep the rhythm.",
  "videoUrl": "https://www.youtube.com/watch?v=nfuptoAX0-E"
 },
 {
  "name": "Hurdle Jump (Double Contact, Middle)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump over a row of mid-height hurdles, taking one small bounce between each. Stay on the balls of the feet and keep the rhythm.",
  "videoUrl": "https://www.youtube.com/watch?v=lhoMrvmdjYg"
 },
 {
  "name": "Hurdle Jump (Double Contact, High)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves",
   "Glutes"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump over a row of tall hurdles, taking one small bounce between each. Pull the knees up to clear each hurdle.",
  "videoUrl": "https://www.youtube.com/watch?v=eiCL1vxsCu4"
 },
 {
  "name": "Hurdle Jump (Low, Hands on Hips)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With the hands on the hips, jump over a row of low hurdles, going straight into each jump as you land. Keep the ground contacts short.",
  "videoUrl": "https://www.youtube.com/watch?v=ZxLAC98pO58"
 },
 {
  "name": "Hurdle Jump (Low)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump over a row of low hurdles, going straight into each jump as you land. Keep the ground contacts short.",
  "videoUrl": "https://www.youtube.com/watch?v=cm6BYxYCeZA"
 },
 {
  "name": "Hurdle Jump (Middle)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves",
   "Glutes"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump over a row of mid-height hurdles, going straight into each jump as you land. Keep the ground contacts short.",
  "videoUrl": "https://www.youtube.com/watch?v=bwat1AnyjrA"
 },
 {
  "name": "Hurdle Jump (High)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves",
   "Glutes"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump over a row of tall hurdles, going straight into each jump as you land and pulling the knees up to clear each one.",
  "videoUrl": "https://www.youtube.com/watch?v=_gg8IDOF_JA"
 },
 {
  "name": "Hurdle Jump (Mixed Heights)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves",
   "Glutes"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump over a row of hurdles of different heights, going straight into each jump as you land. Adjust each jump to the next hurdle.",
  "videoUrl": "https://www.youtube.com/watch?v=hSDK1VpcSzw"
 },
 {
  "name": "Single-Leg Hurdle Jump (Double Contact, Low)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, hop over a row of low hurdles, taking one small bounce between each. Stay on the ball of the foot, then switch legs.",
  "videoUrl": "https://www.youtube.com/watch?v=Npbvr2lG44Q"
 },
 {
  "name": "Single-Leg Hurdle Jump (Double Contact, Middle)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, hop over a row of mid-height hurdles, taking one small bounce between each. Stay on the ball of the foot, then switch legs.",
  "videoUrl": "https://www.youtube.com/watch?v=DRcTty2LDW0"
 },
 {
  "name": "Single-Leg Hurdle Jump (Low)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, hop over a row of low hurdles, going straight into each hop as you land. Switch legs between sets.",
  "videoUrl": "https://www.youtube.com/watch?v=r_Zx2XXNXpM"
 },
 {
  "name": "Single-Leg Hurdle Jump (Middle)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, hop over a row of mid-height hurdles, going straight into each hop as you land. Switch legs between sets.",
  "videoUrl": "https://www.youtube.com/watch?v=yXOCzElb0Xc"
 },
 {
  "name": "Hurdle Jump Combination (Forward and Lateral)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Adductors"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump forward over a hurdle, then sideways over the next in a set pattern. Keep the ground contacts short as you change direction.",
  "videoUrl": "https://www.youtube.com/watch?v=mrEWA2GUldE"
 },
 {
  "name": "Hurdle Jump Combination (Lateral)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Adductors"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump sideways over a series of hurdles and back in a set pattern. Keep the ground contacts short and the hips square.",
  "videoUrl": "https://www.youtube.com/watch?v=BElMyBm2VyQ"
 },
 {
  "name": "Countermovement Jump (Band-Assisted)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a band overhead taking some of your weight, dip quickly and jump as high as you can. Land softly and reset before the next jump.",
  "videoUrl": "https://youtu.be/lAGDqPP8TsA"
 },
 {
  "name": "Single-Leg Countermovement Jump (Band-Assisted)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "With a band overhead taking some of your weight, dip quickly on one leg and jump as high as you can. Land on the same leg, reset, then switch.",
  "videoUrl": "https://youtu.be/zXg_daNb824"
 },
 {
  "name": "Countermovement Jump (Band-Assisted, Rhythmic)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a band overhead taking some of your weight, jump repeatedly, going straight into each jump as you land. Keep a steady rhythm.",
  "videoUrl": "https://youtu.be/T67lXxuQHUA"
 },
 {
  "name": "Single-Leg Countermovement Jump (Band-Assisted, Rhythmic)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "With a band overhead taking some of your weight, jump repeatedly on one leg in a steady rhythm. Switch legs between sets.",
  "videoUrl": "https://youtu.be/6su13WeNj9M"
 },
 {
  "name": "Single-Leg Hop (Rhythmic, Height)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, hop up and down in place for height, going straight into each hop as you land. Keep a steady rhythm, then switch legs.",
  "videoUrl": "https://youtu.be/G5Ax89d4P8E"
 },
 {
  "name": "Multiple Box Jump (Continuous)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Set out a row of boxes and jump onto and off each one in turn without stopping. Land softly and keep moving.",
  "videoUrl": "https://youtu.be/9uPFzfQ_KIs"
 },
 {
  "name": "Single-Leg Multiple Box Jump (Continuous)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Set out a row of low boxes and hop onto and off each one on one leg without stopping. Switch legs between sets.",
  "videoUrl": "https://youtu.be/lcqtuvp6cLg"
 },
 {
  "name": "Hurdle Jump onto Box (Low)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump over a low hurdle and go straight into a jump onto a box. Land softly on top and step down.",
  "videoUrl": "https://youtu.be/BZKz6M3j1vs"
 },
 {
  "name": "Hurdle Jump onto Box (Medium)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump over a mid-height hurdle and go straight into a jump onto a box. Land softly on top and step down.",
  "videoUrl": "https://youtu.be/l34BFDArjRM"
 },
 {
  "name": "Single-Leg Hurdle Jump onto Box (Low)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, hop over a low hurdle and go straight into a hop onto a low box. Land under control, step down and switch legs.",
  "videoUrl": "https://youtu.be/Ruvyz40L7mI"
 },
 {
  "name": "Single-Leg Band Ankle Stiffness Drop",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg with a band pulling you down, drop onto the ball of the foot and rebound with a stiff ankle. Keep the knee nearly straight and the contact short.",
  "videoUrl": "https://youtu.be/175EnNWKR_k"
 },
 {
  "name": "Low Box Short-Contact Jump (Forward)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump forward off and onto low boxes, spending as little time on the ground as possible. Stay on the balls of the feet with stiff ankles.",
  "videoUrl": "https://youtu.be/jyUfRRNjiDQ"
 },
 {
  "name": "Low Box Short-Contact Jump (Lateral)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Adductors"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump sideways off and onto low boxes, spending as little time on the ground as possible. Stay on the balls of the feet with stiff ankles.",
  "videoUrl": "https://youtu.be/nnWwph2nZQ4"
 },
 {
  "name": "Pogo Jump (Weighted Vest)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Wearing a weighted vest, bounce up and down on the balls of the feet with the knees nearly straight. Keep the ground contacts short.",
  "videoUrl": "https://youtu.be/4K1FwTahRnE"
 },
 {
  "name": "Medicine Ball Altitude Drop Countermovement Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Holding a medicine ball overhead, drop it as you fall into a quick dip and jump as high as you can. The sudden drop makes the dip fast.",
  "videoUrl": "https://youtu.be/RlbJNfxoxuM"
 },
 {
  "name": "Pogo Jump (Maximal Reactive)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Bounce as high as you can on the balls of the feet with stiff ankles, going straight into each jump as you land. Keep the contacts as short as you can.",
  "videoUrl": "https://youtu.be/HPL52DDZa6Y"
 },
 {
  "name": "Single-Leg Pogo Jump (Maximal Reactive)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, bounce as high as you can on the ball of the foot with a stiff ankle, going straight into each jump. Switch legs between sets.",
  "videoUrl": "https://youtu.be/RQe0c9DetH4"
 },
 {
  "name": "Depth Jump to Box Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Step off a box, land and jump straight onto a second box. Keep the ground contact short and land softly on top.",
  "videoUrl": "https://youtu.be/mrMnzbCiCzI"
 },
 {
  "name": "Single-Leg Depth Jump to Box Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Step off a low box onto one leg and hop straight onto a second box. Land under control, then switch legs.",
  "videoUrl": "https://youtu.be/oxa9zI98UO4"
 },
 {
  "name": "Depth Jump over Hurdle",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Step off a box, land and jump straight up and over a hurdle. Keep the ground contact short and land softly.",
  "videoUrl": "https://youtu.be/mpMKkhT_mzM"
 },
 {
  "name": "Single-Leg Depth Jump over Hurdle",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Step off a low box onto one leg and hop straight over a hurdle. Land under control, then switch legs.",
  "videoUrl": "https://youtu.be/qzfbGnUWn8Y"
 },
 {
  "name": "Single-Leg Depth Jump (Box to Box)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Step off a box onto one leg and hop straight up onto the next box. Keep the ground contact short, then switch legs.",
  "videoUrl": "https://youtu.be/CLLkRjOSjPc"
 },
 {
  "name": "Horizontal Landing (One-to-Two)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump forward off one leg and land on both feet, sticking the landing with the hips back and the knees over the feet. Hold before the next rep.",
  "videoUrl": "https://youtu.be/sj6bdmuxWPk?t=11"
 },
 {
  "name": "Horizontal Landing (Two-to-One)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Jump forward off both feet and land on one leg, sticking the landing with the knee over the foot. Hold, then switch the landing leg.",
  "videoUrl": "https://youtu.be/sj6bdmuxWPk?t=24"
 },
 {
  "name": "Horizontal Box Landing",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump forward onto a low box and stick the landing on top with the hips back and the knees over the feet. Hold, then step down.",
  "videoUrl": "https://youtu.be/4AF44tlz88E"
 },
 {
  "name": "Broad Jump (Multiple)",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Do several broad jumps in a row, sticking each landing and resetting briefly before the next. Swing the arms and drive forward each time.",
  "videoUrl": "https://www.youtube.com/watch?v=esWMvDgkJ40"
 },
 {
  "name": "Broad Jump (Two-to-One Landing)",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Jump forward off both feet and land on one leg, sticking the landing with the knee over the foot. Hold, then switch the landing leg.",
  "videoUrl": "https://www.youtube.com/watch?v=eGAqsgAxq-E"
 },
 {
  "name": "Broad Jump (One-to-Two Landing)",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Jump forward off one leg and land on both feet, sticking the landing with the hips back. Switch the takeoff leg each rep.",
  "videoUrl": "https://www.youtube.com/watch?v=OlzwRp1O04o"
 },
 {
  "name": "Kneeling Broad Jump",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Kneel with the toes tucked, swing the arms and drive the hips forward to jump up onto the feet and forward. Land in a squat and stick it.",
  "videoUrl": "https://youtu.be/YsRcmiOH7nk"
 },
 {
  "name": "Backward Broad Jump",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Swing the arms and jump backward as far as you can. Land softly on both feet with the knees bent and stick it.",
  "videoUrl": "https://www.youtube.com/watch?v=XAXaas5Vun4"
 },
 {
  "name": "Horizontal Box Jump",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hamstrings"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Stand back from a low box and jump forward and onto it. Land softly on top and step down.",
  "videoUrl": "https://youtu.be/p-H2RzcUqpQ"
 },
 {
  "name": "Broad Jump over Hurdle",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hamstrings"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Stand back from a hurdle and jump forward and over it, travelling distance as well as height. Land softly and stick it.",
  "videoUrl": "https://youtu.be/-fvsnVeFCwQ"
 },
 {
  "name": "Broad Jump over Hurdle to Box",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hamstrings"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump forward over a hurdle and go straight into a jump onto a box. Land softly on top and step down.",
  "videoUrl": "https://youtu.be/pC9e8ApLOo0"
 },
 {
  "name": "Band Broad Jump",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hamstrings"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a band around the waist anchored behind you, jump forward as far as you can against it. Land softly and walk back to the start.",
  "videoUrl": "https://www.youtube.com/watch?v=nsglV8AnokA"
 },
 {
  "name": "Stability Ball Broad Jump",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Adductors"
  ],
  "equipment": "Stability Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a stability ball and jump forward as far as you can, keeping control of the ball. Land softly on both feet and stick it.",
  "videoUrl": "https://youtu.be/6pLqFiYI7co"
 },
 {
  "name": "Drop to Broad Jump",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hamstrings"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Step off a low box, land and jump forward as far as you can. Keep the ground contact short and stick the final landing.",
  "videoUrl": "https://www.youtube.com/watch?v=FJW-qFubeOI"
 },
 {
  "name": "Lateral Jump to Broad Jump",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump sideways, land and go straight into a broad jump forward. Stick the final landing.",
  "videoUrl": "https://www.youtube.com/watch?v=_1S2bpjsunE"
 },
 {
  "name": "Medicine Ball Broad Jump",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hamstrings"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a medicine ball at the chest and jump forward as far as you can. Land softly on both feet and stick it.",
  "videoUrl": "https://youtu.be/eUtv2_nDP-c"
 },
 {
  "name": "Medicine Ball Throw Broad Jump",
  "category": "plyometric",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Glutes",
   "Shoulders",
   "Quads"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Throw a medicine ball forward from a squat, then broad jump after it. Land softly and stick it.",
  "videoUrl": "https://youtu.be/nIpbhRIo4KA"
 },
 {
  "name": "Medicine Ball Broad Jump (Continuous)",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hamstrings"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a medicine ball at the chest and do broad jumps one after another, going straight into each as you land.",
  "videoUrl": "https://www.youtube.com/watch?v=EUZ3mDyegtQ"
 },
 {
  "name": "Standing Triple Jump",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Hamstrings",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "From a standing start, take off from both feet onto one leg, step onto the other and jump to land on both feet. Stick the final landing.",
  "videoUrl": "https://www.youtube.com/watch?v=H3nBTLXXGE0"
 },
 {
  "name": "Bounding (Height)",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Bound from one leg to the other, driving the knee and the opposite arm up to get as much height as you can on each step.",
  "videoUrl": "https://youtu.be/GIjb2f5RhRw"
 },
 {
  "name": "Single-Leg Hop over Hurdle",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Glutes"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, hop forward over a hurdle and land on the same leg under control. Switch legs between sets.",
  "videoUrl": "https://youtu.be/rymOBsmeyzM"
 },
 {
  "name": "Single-Leg Hop to Box",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, hop forward onto a low box and stick the landing on top. Step down and switch legs.",
  "videoUrl": "https://youtu.be/iCwnnUYUuuI"
 },
 {
  "name": "Standing Triple Hop",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "From a standing start on one leg, hop forward three times on the same leg and stick the last landing. Switch legs.",
  "videoUrl": "https://youtu.be/nMkS3ORQSN8"
 },
 {
  "name": "Running Triple Hop",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Take a short run-up and hop forward three times on the same leg, sticking the last landing. Switch legs.",
  "videoUrl": "https://youtu.be/sa_u-25Oy3I"
 },
 {
  "name": "Single-Leg Hop (Repeated, Distance)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, hop forward as far as you can, going straight into the next hop as you land. Switch legs between sets.",
  "videoUrl": "https://youtu.be/PWsJCSarg2A"
 },
 {
  "name": "Running Bound",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Run into a series of long bounds from one leg to the other, covering as much ground as you can with each stride.",
  "videoUrl": "https://youtu.be/72Z_XInKDm4"
 },
 {
  "name": "Lateral Landing",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump sideways and land on both feet, sticking the landing with the hips back and the knees over the feet. Hold before the next rep.",
  "videoUrl": "https://www.youtube.com/watch?v=GLW3VZzp7MQ"
 },
 {
  "name": "Single-Leg Lateral Landing",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Jump sideways and land on one leg, sticking it with the knee over the foot. Hold, then repeat to the other side.",
  "videoUrl": "https://youtu.be/GLW3VZzp7MQ?t=38"
 },
 {
  "name": "Lateral Bound (Over Hurdle)",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Bound sideways from one leg to the other over a low hurdle, sticking each landing. Keep the knee over the foot as you land.",
  "videoUrl": "https://www.youtube.com/watch?v=bN32Ut2k0II"
 },
 {
  "name": "Band Lateral Bound",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "With a band around the waist pulling to the side, bound sideways from one leg to the other and stick each landing.",
  "videoUrl": "https://youtu.be/wXQblIWzgwI"
 },
 {
  "name": "Band Lateral Bound (Over Hurdle)",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "With a band around the waist pulling to the side, bound sideways over a low hurdle and stick each landing.",
  "videoUrl": "https://youtu.be/PfEU26xl2VQ"
 },
 {
  "name": "Drop Lateral Bound",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Step off a low box onto one leg and bound sideways onto the other, sticking the landing. Repeat to the other side.",
  "videoUrl": "https://www.youtube.com/watch?v=r5-4cGImigM"
 },
 {
  "name": "Medicine Ball Lateral Bound",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hold a medicine ball at the chest and bound sideways from one leg to the other, sticking each landing.",
  "videoUrl": "https://youtu.be/PcigJu-pJg8"
 },
 {
  "name": "Medicine Ball Lateral Bound (Over Hurdle)",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hold a medicine ball at the chest and bound sideways over a low hurdle, sticking each landing.",
  "videoUrl": "https://youtu.be/V2rsqt-wNlk"
 },
 {
  "name": "Slant Board Lateral Bound and Stick",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Bound sideways off one leg and land on the other foot on a slant board, holding the landing still for a count. Stick each landing with the knee over the foot before bounding back.",
  "videoUrl": "https://youtu.be/_k4SfFIv3Qs"
 },
 {
  "name": "Lateral Bound to Split-Stance Landing",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Bound sideways off one leg and land in a split stance, both feet down, and hold the landing for a count. Land quietly with the hips low before resetting.",
  "videoUrl": "https://www.youtube.com/watch?v=Gm-gjb5yPEw"
 },
 {
  "name": "Lateral Line Jumps (In-Out)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Stand beside a line and jump sideways over it and back on both feet, landing feet together then apart as set. Stay on the balls of the feet and keep each ground contact short.",
  "videoUrl": "https://youtu.be/XfUlkl-sB08"
 },
 {
  "name": "Single-Leg Lateral Line Hops (In-Out)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Balance on one leg beside a line and hop sideways over it and back continuously. Keep the contacts short and the knee over the foot, then switch legs.",
  "videoUrl": "https://www.youtube.com/watch?v=WxNK8o8o8YM"
 },
 {
  "name": "Lateral Single Line Jump (In-Out)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Stand beside a line and make one jump sideways over it, sticking the landing before jumping back. Reset between jumps and land soft with the knees over the feet.",
  "videoUrl": "https://www.youtube.com/watch?v=oAI6Wf_4wUM"
 },
 {
  "name": "Single-Leg Lateral Single Line Hop (In-Out)",
  "category": "plyometric",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Stand on one leg beside a line and make one hop sideways over it, sticking the landing before hopping back. Reset between hops and keep the knee over the foot.",
  "videoUrl": "https://www.youtube.com/watch?v=GtaCHjXWZu4"
 },
 {
  "name": "Lateral Ankle Jumps",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump side to side with stiff ankles and nearly straight knees, springing off the balls of the feet. Keep the ground contacts as short and quiet as possible.",
  "videoUrl": "https://www.youtube.com/watch?v=Z7UU8Crk4dA"
 },
 {
  "name": "Lateral Hurdle Jump (Double Contact, Low)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Glutes"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump sideways over a low hurdle on both feet, take one quick extra bounce on landing, then jump back. Keep both bounces short and stay tall through the trunk.",
  "videoUrl": "https://youtu.be/Mwci7DRDhGk"
 },
 {
  "name": "Lateral Hurdle Jump (Low)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Glutes"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Stand beside a low hurdle and jump sideways over it and back on both feet continuously. Lift the knees to clear it and keep the contacts quick.",
  "videoUrl": "https://youtu.be/-Wun-T1MHJ8"
 },
 {
  "name": "Lateral Hurdle Hop (Double Contact, Low)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Glutes"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, hop sideways over a low hurdle, take one quick extra hop on landing, then hop back. Keep the knee over the foot and switch legs after the set.",
  "videoUrl": "https://youtu.be/LOFHqb2slK0"
 },
 {
  "name": "Lateral Hurdle Hop (Low)",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Glutes"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, hop sideways over a low hurdle and back continuously. Keep the contacts quick and the knee over the foot, then switch legs.",
  "videoUrl": "https://youtu.be/3yN6NDw2t90"
 },
 {
  "name": "Reverse Lateral Bound",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Stand on one leg and bound sideways away from the standing leg, landing on the opposite foot, then bound back. Push the ground away hard and land with the hips back and the knee over the foot.",
  "videoUrl": "https://youtu.be/dM6hoDI2xaE"
 },
 {
  "name": "Reverse Lateral Bound (Over Hurdle)",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Perform the reverse lateral bound over a low hurdle placed between the landing spots. Clear the hurdle with height and stick each landing before the next bound.",
  "videoUrl": "https://www.youtube.com/watch?v=Jpr0URnZ0cA"
 },
 {
  "name": "Hop to Lateral Bound",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Calves",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hop once in place on one leg, then go straight into a lateral bound onto the other foot. Make the hop short and stiff so it feeds the bound.",
  "videoUrl": "https://www.youtube.com/watch?v=O23EPWzdSsQ"
 },
 {
  "name": "Slant Board Reverse Lateral Bound",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Stand on one leg on a slant board and perform the reverse lateral bound off it, landing on the opposite foot. Drive through the whole foot on the incline and stick the landing.",
  "videoUrl": "https://youtu.be/qiLejiZeB6A"
 },
 {
  "name": "Slant Board Reverse Lateral Bound (Over Hurdle)",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Ankle"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Bound off a slant board on one leg, over a low hurdle, and land on the opposite foot. Clear the hurdle with height and hold the landing before resetting.",
  "videoUrl": "https://youtu.be/cF5-Ho983uw"
 },
 {
  "name": "Double Hop to Reverse Lateral Bound",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Calves",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Take two quick hops on one leg, then go straight into a reverse lateral bound onto the other foot. Keep the hops short and stiff so they feed the bound.",
  "videoUrl": "https://youtu.be/uk7MSXW0Pl8"
 },
 {
  "name": "Drop Hop to Reverse Lateral Bound",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Calves",
   "Quads"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Step off a low box, land on one leg, and rebound straight into a reverse lateral bound onto the other foot. Keep the ground contact short and land the bound under control.",
  "videoUrl": "https://youtu.be/1UWlNtiAaW8"
 },
 {
  "name": "Band Reverse Lateral Bound",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "With a band around the waist pulling to the side, perform the reverse lateral bound and stick each landing. Hold the landing position as the band pulls.",
  "videoUrl": "https://youtu.be/UMXS_fnS73Q"
 },
 {
  "name": "Band Reverse Lateral Bound (Over Hurdle)",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "With a band around the waist pulling to the side, perform the reverse lateral bound over a low hurdle. Clear the hurdle and stick each landing despite the band.",
  "videoUrl": "https://youtu.be/6QVwm-3m_f8"
 },
 {
  "name": "Dumbbell Reverse Lateral Bound",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Dumbbell",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hold a light dumbbell in each hand and perform the reverse lateral bound, sticking each landing. Keep the weights close to the body.",
  "videoUrl": "https://youtu.be/WWD3O_R13-s"
 },
 {
  "name": "Medicine Ball Reverse Lateral Bound",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hold a medicine ball at the chest and perform the reverse lateral bound, sticking each landing. Keep the ball still against the chest.",
  "videoUrl": "https://youtu.be/VsyynSzpQyU"
 },
 {
  "name": "Reverse Lateral Bound with Medicine Ball Throw",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Obliques",
   "Shoulders"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hold a medicine ball, perform a reverse lateral bound, and throw the ball to a wall or partner as you land. Let the push from the leg carry into the throw.",
  "videoUrl": "https://youtu.be/YV9WGZ6jTWc"
 },
 {
  "name": "Hurdle Hop to Lateral Bound",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Calves",
   "Adductors"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hop over a low hurdle on one leg, then go straight into a lateral bound onto the other foot. Keep the hurdle contact short and stick the bound.",
  "videoUrl": "https://youtu.be/t5guROs1VWs"
 },
 {
  "name": "Hurdle Hop to Reverse Lateral Bound",
  "category": "plyometric",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Calves",
   "Adductors"
  ],
  "equipment": "Hurdle",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Hop over a low hurdle on one leg, then go straight into a reverse lateral bound onto the other foot. Keep the hurdle contact short and stick the bound.",
  "videoUrl": "https://youtu.be/fJsuraRZzW8"
 },
 {
  "name": "Slant Board Lateral Jumps",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Jump side to side across slant boards angled toward each other, landing on the inclines on both feet. Keep contacts quick and the knees tracking over the feet.",
  "videoUrl": "https://youtu.be/YTjbS5DeKRc"
 },
 {
  "name": "Single-Leg Change of Direction Hops",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Glutes",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "On one leg, hop continuously in a set pattern, forward, sideways and back, changing direction on each contact. Keep the knee over the foot and the contacts short, then switch legs.",
  "videoUrl": "https://youtu.be/PjT2PWbpOTI"
 },
 {
  "name": "Prime Times",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Calves",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Moving forward slowly, cycle one leg quickly up and down under the hip while the other stays tall, then switch. Strike down under the body with the foot flexed.",
  "videoUrl": "https://www.youtube.com/watch?v=GcKSOnaygK4"
 },
 {
  "name": "Backward Run",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Run backward with short, quick steps, staying on the balls of the feet. Keep the chest over the toes and the arms driving.",
  "videoUrl": "https://www.youtube.com/watch?v=-kOHh26ERVg"
 },
 {
  "name": "High Knees (Banded)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Calves",
   "Quads"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Perform high knees with a mini band around the feet or a long band around the waist resisting the movement. Keep the knees driving to hip height and the trunk tall.",
  "videoUrl": "https://www.youtube.com/watch?v=qZiBtvkkbBQ"
 },
 {
  "name": "Prime Times (Banded)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Calves",
   "Hamstrings"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Perform prime times with a mini band around the feet so the cycling leg drives against it. Strike down under the body with the foot flexed.",
  "videoUrl": "https://www.youtube.com/watch?v=IkWuavgwWvM"
 },
 {
  "name": "Rhythmic Thigh Switch",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Standing tall, switch the legs in a steady rhythm, one knee driving up as the other foot comes down under the hip. Keep the rhythm even and the foot flexed.",
  "videoUrl": "https://www.youtube.com/watch?v=xQ8E4tI_KXo"
 },
 {
  "name": "Forward Thigh Switch (Single)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Moving forward, march and then perform one fast thigh switch in a row, driving one knee up as the other foot strikes under the hip. Stay tall and keep the foot flexed.",
  "videoUrl": "https://www.youtube.com/watch?v=msa_bXMXBaE"
 },
 {
  "name": "Forward Thigh Switch (Double)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Moving forward, march and then perform two fast thigh switches in a row, driving one knee up as the other foot strikes under the hip. Stay tall and keep the foot flexed.",
  "videoUrl": "https://www.youtube.com/watch?v=GB1XVh0GA28"
 },
 {
  "name": "Thigh Switch (Single)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "From a tall stance with one knee up, perform one fast thigh switch, snapping the down foot under the hip as the other knee drives up, then hold. Stay tall and keep the foot flexed.",
  "videoUrl": "https://www.youtube.com/watch?v=CAH0XMQ7UlA"
 },
 {
  "name": "Thigh Switch (Double)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "From a tall stance with one knee up, perform two fast thigh switches, snapping the down foot under the hip as the other knee drives up, then hold. Stay tall and keep the foot flexed.",
  "videoUrl": "https://youtu.be/kDkwvh8Nip0"
 },
 {
  "name": "Thigh Switch (Triple)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "From a tall stance with one knee up, perform three fast thigh switches, snapping the down foot under the hip as the other knee drives up, then hold. Stay tall and keep the foot flexed.",
  "videoUrl": "https://www.youtube.com/watch?v=k0aezCYzoRA"
 },
 {
  "name": "Thigh Switch (Overhead)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core",
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Perform thigh switches with the arms held straight overhead. Stay tall through the trunk without leaning back.",
  "videoUrl": "https://www.youtube.com/watch?v=Gw5d_pgBPD4"
 },
 {
  "name": "Thigh Switch (Weighted Vest)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Perform thigh switches while wearing a weighted vest. Keep the same tall posture and fast switch as without the vest.",
  "videoUrl": "https://www.youtube.com/watch?v=6zINpBhd1I8"
 },
 {
  "name": "Stick Overhead Thigh Switch (Banded, Single)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a stick overhead with a mini band around the feet and perform one fast thigh switch, then hold. Keep the stick over the head and the trunk tall.",
  "videoUrl": "https://youtu.be/RhhuuwJStcs"
 },
 {
  "name": "Stick Overhead Thigh Switch (Banded, Double)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a stick overhead with a mini band around the feet and perform two fast thigh switches, then hold. Keep the stick over the head and the trunk tall.",
  "videoUrl": "https://youtu.be/cXNmn_DWPE8"
 },
 {
  "name": "Sprint Dribbles (Ankle, Calf, Knee)",
  "category": "conditioning",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Hip Flexors",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Move forward with small quick steps, lifting the heel to ankle height, then calf height, then knee height as set, and stepping down under the hip each time. Keep the foot flexed and the steps quick.",
  "videoUrl": "https://www.youtube.com/watch?v=IPAo-8aNDVI"
 },
 {
  "name": "Backpedal",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves",
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "From an athletic stance, move backward with quick steps under the hips, staying low with the chest over the toes. Keep the feet under the body and the arms moving.",
  "videoUrl": "https://www.youtube.com/watch?v=I84zjhssFa0"
 },
 {
  "name": "Thigh Switch (Banded, Single)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a mini band around the feet and one knee up, perform one fast thigh switch, then hold. Drive the knee up against the band and keep the foot flexed.",
  "videoUrl": "https://www.youtube.com/watch?v=N_p4AHRn5M8"
 },
 {
  "name": "Thigh Switch (Banded, Double)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a mini band around the feet and one knee up, perform two fast thigh switches, then hold. Drive the knee up against the band and keep the foot flexed.",
  "videoUrl": "https://www.youtube.com/watch?v=bbeL-pyEInY"
 },
 {
  "name": "Thigh Switch (Banded, Triple)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a mini band around the feet and one knee up, perform three fast thigh switches, then hold. Drive the knee up against the band and keep the foot flexed.",
  "videoUrl": "https://www.youtube.com/watch?v=HCy6gqUH-H8"
 },
 {
  "name": "Thigh Switch (Overhead Push, Single)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Push the arms up overhead as you perform one fast thigh switch, then hold. Time the push with the foot striking down.",
  "videoUrl": "https://www.youtube.com/watch?v=14uAuuXWfr8"
 },
 {
  "name": "Bumper Plate Overhead Push Thigh Switch (Single)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Plate",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hold a light bumper plate at the chest and push it overhead as you perform one fast thigh switch, then hold. Time the push with the foot striking down and stay tall.",
  "videoUrl": "https://youtu.be/dfeoHlpxeUE"
 },
 {
  "name": "Overhead Thigh Switch (Banded, Double)",
  "category": "conditioning",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core",
   "Shoulders"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With the arms overhead and a mini band around the feet, perform two fast thigh switches, then hold. Keep the trunk tall without leaning back.",
  "videoUrl": "https://www.youtube.com/watch?v=GARc7EXjVDQ"
 },
 {
  "name": "High Skip (Banded)",
  "category": "conditioning",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Hip Flexors",
   "Glutes"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Skip for height with a mini band around the feet, driving the knee up and pushing hard off the ground. Stay tall and land under the hip.",
  "videoUrl": "https://youtu.be/OAy20KM0XYY"
 },
 {
  "name": "Kneeling First Step",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hip Flexors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Start kneeling on both knees, then drive up and out into the first step of a sprint. Push the ground back with a forward lean and run through the first few steps.",
  "videoUrl": "https://youtu.be/KrtuSBP-wFE"
 },
 {
  "name": "Kneeling Lateral First Step",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Start kneeling side-on to the direction of travel, then drive up into a lateral first step and run. Push off the inside leg and stay low through the first steps.",
  "videoUrl": "https://youtu.be/3rinntfrThI"
 },
 {
  "name": "Sled Acceleration March",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Sled",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Lean into a heavy sled at an acceleration angle and march it forward, driving one knee up and pushing the ground back with the other leg. Keep a straight line from head to heel.",
  "videoUrl": "https://www.youtube.com/watch?v=4lMX-hUbIho"
 },
 {
  "name": "Sled Acceleration Push",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Sled",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lean into a sled at an acceleration angle and drive it forward with quick, powerful steps. Keep a straight line from head to heel and push the ground back.",
  "videoUrl": "https://www.youtube.com/watch?v=jFI4pD307IE"
 },
 {
  "name": "Sprint Start (Three-Point)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Start in a three-point stance with one hand on the ground, then drive out into a sprint. Push the ground back with a forward lean through the first steps.",
  "videoUrl": "https://www.youtube.com/watch?v=1VNhs_Vzb2g"
 },
 {
  "name": "Sprint Start (Push-Up)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Start lying face down, push up and drive straight into a sprint. Push the ground back with a forward lean through the first steps.",
  "videoUrl": "https://youtu.be/upnNtuDd85w?t=16"
 },
 {
  "name": "Sprint Start (Stability Ball)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Stability Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Lean into a stability ball held against a wall or by a partner, then let it drop and drive out into a sprint. Push the ground back with a forward lean through the first steps.",
  "videoUrl": "https://youtu.be/yKxF_gNwRJg"
 },
 {
  "name": "Sprint Start (Lateral)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Start side-on to the direction of travel, open the hips and drive out into a sprint. Push the ground back with a forward lean through the first steps.",
  "videoUrl": "https://www.youtube.com/watch?v=Up0O3eUyfuE"
 },
 {
  "name": "Sprint Start (Turn)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Start facing sideways or away at an angle, turn, and drive out into a sprint. Push the ground back with a forward lean through the first steps.",
  "videoUrl": "https://youtu.be/upnNtuDd85w?t=29"
 },
 {
  "name": "Sprint Start (180-Degree Turn)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Start facing away from the direction of travel, turn all the way around and drive out into a sprint. Push the ground back with a forward lean through the first steps.",
  "videoUrl": "https://www.youtube.com/watch?v=5u82QXGm758"
 },
 {
  "name": "Sprint Start (Broad Jump)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Perform one broad jump, land, and drive straight out into a sprint. Push the ground back with a forward lean through the first steps.",
  "videoUrl": "https://www.youtube.com/watch?v=PFjtELuD2WM"
 },
 {
  "name": "Sprint Start (Lateral Bound)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Perform one lateral bound, land, and drive straight out into a sprint. Push the ground back with a forward lean through the first steps.",
  "videoUrl": "https://www.youtube.com/watch?v=-wAiyB19rY4"
 },
 {
  "name": "Sprint Start (Banded)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Start with a band around the waist held by a partner or anchor, and drive out into a sprint against it. Push the ground back with a forward lean through the first steps.",
  "videoUrl": "https://www.youtube.com/watch?v=NmFSxX2wcpM"
 },
 {
  "name": "Sprint Start (Sled)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Sled",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Start attached to a light sled and drive out into a sprint against it. Push the ground back with a forward lean through the first steps.",
  "videoUrl": "https://www.youtube.com/watch?v=bjijWKWc5uU"
 },
 {
  "name": "Sprint Start (Medicine Ball Throw)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Medicine Ball",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Throw a medicine ball forward from a crouch and sprint after it. Push the ground back with a forward lean through the first steps.",
  "videoUrl": "https://www.youtube.com/watch?v=j9fWOPXzzOE"
 },
 {
  "name": "Sprint Start (Half-Kneeling)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Start half-kneeling, then drive up and out into a sprint. Push the ground back with a forward lean through the first steps.",
  "videoUrl": "https://youtu.be/_joX9UP7eJE"
 },
 {
  "name": "Sprint Start (Kneeling)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Start kneeling on both knees, then drive up and out into a sprint. Push the ground back with a forward lean through the first steps.",
  "videoUrl": "https://youtu.be/m7VRa6lrzz8"
 },
 {
  "name": "Sprint Start (Plyo Step)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Start standing, take a quick step back with the drive leg, then push off it into a sprint. Push the ground back with a forward lean through the first steps.",
  "videoUrl": "https://youtu.be/hCruAgQQc2Q"
 },
 {
  "name": "Sprint Start First Step (Banded)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hip Flexors"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a band around the waist anchored behind, take the first explosive step of a sprint start and hold. Drive the knee forward and push the ground back.",
  "videoUrl": "https://www.youtube.com/watch?v=6LYb2hfPjOI"
 },
 {
  "name": "Band-Resisted Acceleration Sprint",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a long band around the waist held by a partner, sprint forward against the resistance over a short distance. Hold a forward lean and push the ground back.",
  "videoUrl": "https://www.youtube.com/watch?v=P_KZDABB5VU"
 },
 {
  "name": "Rope-Resisted Sprint",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Rope",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "With a rope or harness around the waist held by a partner who resists, sprint forward over a short distance. Hold a forward lean and drive the knees.",
  "videoUrl": "https://www.youtube.com/watch?v=5qkS_G36WP4"
 },
 {
  "name": "Machine-Resisted Sprint",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Machine",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Attach to a motorized resistance machine and sprint forward against the set load over a short distance. Hold a forward lean and push the ground back.",
  "videoUrl": "https://www.youtube.com/watch?v=qzdJKL1C0KE"
 },
 {
  "name": "Curved Sprint",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Adductors",
   "Calves"
  ],
  "equipment": "Cones",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Sprint at speed along a marked curve, leaning into the bend from the ankles. Keep the stride quick and the inside arm close.",
  "videoUrl": "https://www.youtube.com/watch?v=wnXuTbAA-Uw"
 },
 {
  "name": "Submaximal Sprint",
  "category": "conditioning",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Hip Flexors",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Build up and run at a set share of top speed, smooth and relaxed. Keep the posture tall and the strides even.",
  "videoUrl": "https://www.youtube.com/watch?v=cB6r-QB4wGA"
 },
 {
  "name": "Maximal Speed Sprint",
  "category": "conditioning",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Hip Flexors",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "After a build-up, run at full speed through a marked zone. Stay tall and relaxed and strike the ground under the hips.",
  "videoUrl": "https://www.youtube.com/watch?v=tvFRhIMN8jw"
 },
 {
  "name": "Low Box Quick Jumps",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Face a low box and jump on and off it on both feet as quickly as possible. Keep the contacts short and land on the balls of the feet.",
  "videoUrl": "https://www.youtube.com/watch?v=TKdn5le3MsA"
 },
 {
  "name": "Low Box Straddle Jumps",
  "category": "plyometric",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Quads",
   "Adductors"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Stand astride a low box, jump up to land both feet on top, then jump back down astride it. Keep the contacts quick and light.",
  "videoUrl": "https://www.youtube.com/watch?v=hBfrfxvdr1w"
 },
 {
  "name": "Low Box Lateral Shuffle",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Lunge",
  "laterality": "bilateral",
  "instructions": "Stand beside a low box and shuffle sideways over it, stepping up onto it and down the far side. Stay low and keep the feet quick.",
  "videoUrl": "https://www.youtube.com/watch?v=Quy7wB9EJlM"
 },
 {
  "name": "Low Box Reverse Lateral Shuffle",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Lunge",
  "laterality": "bilateral",
  "instructions": "Starting on a low box, shuffle sideways off it and back up, leading with the outside foot. Stay low and keep the steps quick.",
  "videoUrl": "https://www.youtube.com/watch?v=4oFBF6ZUzA8"
 },
 {
  "name": "Low Box Reverse Lateral Shuffle (To Floor)",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Lunge",
  "laterality": "bilateral",
  "instructions": "Starting on a low box, shuffle sideways off it and continue the shuffle along the floor. Land low and keep the feet moving.",
  "videoUrl": "https://www.youtube.com/watch?v=ne9ARg6OoeY"
 },
 {
  "name": "Low Box Split Step to Lateral Start",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Calves"
  ],
  "equipment": "Box",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Step off a low box into a split step, landing wide, then push off into a lateral start. Land balanced on both feet and go immediately.",
  "videoUrl": "https://www.youtube.com/watch?v=CfqR6tyyh_g"
 },
 {
  "name": "Split Step to Lateral Start",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Hop into a split step, landing wide and balanced, then push off into a lateral start. Land low and go immediately.",
  "videoUrl": "https://www.youtube.com/watch?v=YYdA0luYejo"
 },
 {
  "name": "Step-In Split Step to Lateral Start",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Take a step in, hop into a split step, then push off into a lateral start. Time the landing so you can go either way.",
  "videoUrl": "https://www.youtube.com/watch?v=3HduILMVE7w"
 },
 {
  "name": "Lateral Shuffle (Banded)",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Band",
  "movementType": "Lunge",
  "laterality": "bilateral",
  "instructions": "Perform the lateral shuffle with a mini band around the legs or a band around the waist resisting. Stay low and keep the feet from clicking together.",
  "videoUrl": "https://www.youtube.com/watch?v=NT_BcdzV7d4"
 },
 {
  "name": "Lateral Shuffle to Sprint",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Shuffle sideways for a few steps, then open the hips and sprint forward. Make the change of direction without standing up.",
  "videoUrl": "https://www.youtube.com/watch?v=HWOm0UdAurA"
 },
 {
  "name": "Planned 90-Degree Cut",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Cones",
  "movementType": "Lunge",
  "laterality": "bilateral",
  "instructions": "Run to a cone, plant, and cut sharply at a right angle. Lower the hips before the plant and push off the outside foot.",
  "videoUrl": "https://youtu.be/U8EPe1Vn3Y4"
 },
 {
  "name": "Planned 180-Degree Cut",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Cones",
  "movementType": "Lunge",
  "laterality": "bilateral",
  "instructions": "Run to a line, slow down, plant, and turn all the way around to run back. Lower the hips into the plant and push off hard.",
  "videoUrl": "https://youtu.be/M5pDjjsVAgc"
 },
 {
  "name": "Broad Jump to Change of Direction",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Cones",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Perform a broad jump, land, and immediately cut and sprint in the direction called or set. Land balanced and go without a pause.",
  "videoUrl": "https://youtu.be/4T8Hcy8ypKk"
 },
 {
  "name": "Lateral Bound to Change of Direction",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Cones",
  "movementType": "Combination",
  "laterality": "unilateral",
  "instructions": "Perform a lateral bound, land on the outside leg, and push straight back into a cut and sprint. Land low and go without a pause.",
  "videoUrl": "https://youtu.be/kFkEGuFWAcg"
 },
 {
  "name": "Modified 505 Drill",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Hamstrings"
  ],
  "equipment": "Cones",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Sprint five meters to a line, plant, turn 180 degrees, and sprint back through the start. Lower the hips into the turn and push off hard.",
  "videoUrl": "https://www.youtube.com/watch?v=2LZWqslG4lg"
 },
 {
  "name": "Hip Turn to Sprint Start",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "From an athletic stance, turn the hips open toward one side and drive straight into a sprint. Turn the hips and feet together without a false step.",
  "videoUrl": "https://youtu.be/3bHswE9585Y"
 },
 {
  "name": "Defensive Figure-8 Drill",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Adductors"
  ],
  "equipment": "Cones",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Move around two cones in a figure-8 using shuffles, crossovers and backpedals. Stay low in a defensive stance throughout.",
  "videoUrl": "https://youtu.be/fs8VKKtgcYQ"
 },
 {
  "name": "Defensive In-Out Drill",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Adductors"
  ],
  "equipment": "Cones",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Close out forward to a cone, then retreat back out, staying in a defensive stance. Stop under control each time and stay low.",
  "videoUrl": "https://youtu.be/zbOPVcIZcJE"
 },
 {
  "name": "Defensive Triangle Drill",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Quads",
   "Adductors"
  ],
  "equipment": "Cones",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Move between three cones set in a triangle, using a shuffle, a drop step and a sprint. Stay low and keep the feet active.",
  "videoUrl": "https://youtu.be/FILRkD6wY4E"
 },
 {
  "name": "Change of Direction Turns",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Cones",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Sprint into a cone, turn around it, and accelerate away in a new direction. Lower the hips into each turn and push off hard.",
  "videoUrl": "https://youtu.be/2KADThdfe1E"
 },
 {
  "name": "Goalie Hip Lifts",
  "category": "mobility",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Hip Flexors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "From a deep wide kneel or goalie stance, lift one knee and rotate it out and around, then set it down. Move slowly through the whole range.",
  "videoUrl": "https://www.youtube.com/watch?v=OzEqCU21pn8"
 },
 {
  "name": "Dead Bug (Adductor Squeeze)",
  "category": "accessory",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Adductors",
   "Abs"
  ],
  "equipment": "Bodyweight",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Lie on your back with a ball squeezed between the knees and perform the dead bug, reaching the opposite arm and leg. Keep the low back pressed down and the squeeze on.",
  "videoUrl": "https://www.youtube.com/watch?v=hsFQFd4WzbA"
 },
 {
  "name": "Lateral Lunge Mobility",
  "category": "mobility",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Glutes",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "From a wide stance, shift slowly into a lateral lunge on one side, then the other, keeping the straight leg's foot flat. Sit the hips back with the chest up.",
  "videoUrl": "https://www.youtube.com/watch?v=zDjlprK9zv0"
 },
 {
  "name": "Wall Adductor Stretch",
  "category": "mobility",
  "muscleGroup": "Adductors",
  "secondaryMuscles": [
   "Hamstrings"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Lie on your back with your legs up the wall and let them slide apart into a wide straddle. Relax and breathe into the stretch.",
  "videoUrl": "https://youtu.be/7UR_dBaSImI"
 },
 {
  "name": "Heel Sit",
  "category": "mobility",
  "muscleGroup": "Ankle",
  "secondaryMuscles": [
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Kneel and sit back onto your heels with the tops of the feet flat. Hold and breathe, easing back further as it allows.",
  "videoUrl": "https://www.youtube.com/watch?v=SvYpxuzcmpU"
 },
 {
  "name": "Ankle Dorsiflexion Mobilization (Bench)",
  "category": "mobility",
  "muscleGroup": "Ankle",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Bench",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Place one foot on a bench and drive the knee forward over the toes, keeping the heel down. Rock in and out slowly, then switch sides.",
  "videoUrl": "https://www.youtube.com/watch?v=_mBe5lgYvMI"
 },
 {
  "name": "Ankle Dorsiflexion Mobilization (Three-Way Half-Kneeling)",
  "category": "mobility",
  "muscleGroup": "Ankle",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Half-kneeling, drive the front knee forward over the toes, then toward the inside and outside of the foot, keeping the heel down. Move slowly in each direction, then switch sides.",
  "videoUrl": "https://www.youtube.com/watch?v=1ygu1eUYZ4U"
 },
 {
  "name": "Bench Thoracic Extension Mobility",
  "category": "mobility",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Shoulders",
   "Lats"
  ],
  "equipment": "Bench",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Kneel facing a bench with the elbows on it and a stick between the hands, then sit back and let the chest sink toward the floor. Keep the lower ribs down and breathe out.",
  "videoUrl": "https://youtu.be/_TyWxY47kgo"
 },
 {
  "name": "Wall Romanian Deadlift Rotations",
  "category": "mobility",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Hamstrings",
   "Obliques"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Stand with the hips against a wall, hinge into a Romanian deadlift position, and reach one arm down and the other up as you rotate. Keep the hips square to the wall.",
  "videoUrl": "https://www.youtube.com/watch?v=FyrpSxEyMoo"
 },
 {
  "name": "Deep Squat Thoracic Rotation",
  "category": "mobility",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Hip Flexors",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Sit in a deep squat with one hand on the floor and rotate the other arm up toward the ceiling. Keep the heels down and switch sides.",
  "videoUrl": "https://youtu.be/0K_FGnRVg8I"
 },
 {
  "name": "Wall-Supported Thoracic Mobilization",
  "category": "mobility",
  "muscleGroup": "Back",
  "secondaryMuscles": [
   "Shoulders",
   "Lats"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Place the forearms on a wall and step back, letting the chest sink toward the floor between the arms. Keep the lower ribs down and breathe out.",
  "videoUrl": "https://youtu.be/ZICZDxei0wQ"
 },
 {
  "name": "Stability Ball Lower Back Relaxation",
  "category": "mobility",
  "muscleGroup": "Lower Back",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Stability Ball",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Lie face down over a stability ball and let the trunk drape over it, rolling gently back and forth. Breathe slowly and relax.",
  "videoUrl": "https://www.youtube.com/watch?v=usUGHpOSLVg"
 },
 {
  "name": "Wall Achilles Stretch",
  "category": "mobility",
  "muscleGroup": "Calves",
  "secondaryMuscles": [
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Face a wall with one foot back, bend both knees, and sink down keeping the back heel on the floor. Hold, then switch sides.",
  "videoUrl": "https://youtu.be/A7t7XuqVJbU"
 },
 {
  "name": "Bench Shin Stretch",
  "category": "mobility",
  "muscleGroup": "Ankle",
  "secondaryMuscles": [
   "Quads"
  ],
  "equipment": "Bench",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Place the top of one foot on a bench behind you and bend the standing knee to stretch the front of the shin. Hold, then switch sides.",
  "videoUrl": "https://youtu.be/U1A3Ycwir38"
 },
 {
  "name": "Full Body Foam Roll",
  "category": "mobility",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Quads",
   "Back"
  ],
  "equipment": "Foam Roller",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Roll slowly over the calves, hamstrings, quads, glutes and upper back on a foam roller, spending a few breaths on each area. Keep the pressure steady.",
  "videoUrl": "https://youtu.be/DMtXnWElvyU"
 },
 {
  "name": "Lower Body Ball Self-Massage",
  "category": "mobility",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Use a small massage ball to roll slowly over the feet, calves, glutes and hips, pausing on tight spots. Breathe and keep the pressure tolerable.",
  "videoUrl": "https://youtu.be/d265Lo-zN4g"
 },
 {
  "name": "Upper Body Ball Self-Massage",
  "category": "mobility",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Shoulders",
   "Back"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Use a small massage ball against a wall or the floor to roll slowly over the upper back, chest and shoulders, pausing on tight spots. Breathe and keep the pressure tolerable.",
  "videoUrl": "https://youtu.be/N1oqG22swjc"
 },
 {
  "name": "Glute Stretch",
  "category": "mobility",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hips"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Lie on your back, cross one ankle over the opposite knee, and pull the bottom leg toward the chest. Hold, then switch sides.",
  "videoUrl": "https://youtu.be/JxacSgQRMF0"
 },
 {
  "name": "Glute Stretch (Outside Arm)",
  "category": "mobility",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Lower Back"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Sit with one leg crossed over the other and hook the outside arm across the raised knee, pulling it toward the opposite shoulder. Sit tall and hold, then switch sides.",
  "videoUrl": "https://youtu.be/7KAs3LHzLro"
 },
 {
  "name": "Wall Hamstring Stretch",
  "category": "mobility",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Lie on your back in a doorway with one leg up the wall and the other flat on the floor. Slide closer as it allows, then switch sides.",
  "videoUrl": "https://youtu.be/k0bxcgb-eeU"
 },
 {
  "name": "Lying Hamstring Stretch",
  "category": "mobility",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Lie on your back and lift one straight leg, holding behind the thigh to draw it toward you. Keep the other leg flat, then switch sides.",
  "videoUrl": "https://youtu.be/tHVRH1Djmgk"
 },
 {
  "name": "Lying Hamstring Stretch (Banded)",
  "category": "mobility",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Calves"
  ],
  "equipment": "Band",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Lie on your back with a band around one foot and draw the straight leg up with it. Keep the other leg flat, then switch sides.",
  "videoUrl": "https://youtu.be/1ws1yGkvgFA"
 },
 {
  "name": "Seated Hip Lift-Offs",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Sit tall with the legs straight and lift one leg off the floor without leaning back, then lower it. Keep the knee straight and switch sides.",
  "videoUrl": "https://www.youtube.com/watch?v=8fuWp-BGPEs"
 },
 {
  "name": "Seated Hip Lift-Off (Hands Overhead)",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Sit tall with legs straight and both arms reaching overhead. Lift one straight leg off the floor without leaning back, hold for a moment, and lower it with control. Keep the chest up the whole time.",
  "videoUrl": "https://www.youtube.com/watch?v=IyOVMIUA0xE"
 },
 {
  "name": "Arabesque",
  "category": "mobility",
  "muscleGroup": "Hamstrings",
  "secondaryMuscles": [
   "Glutes",
   "Lower Back"
  ],
  "equipment": "Bodyweight",
  "movementType": "Hinge",
  "laterality": "unilateral",
  "instructions": "Stand on one leg and hinge forward as the free leg lifts straight behind you, arms reaching out to the sides. Keep the hips square to the floor and return to standing under control.",
  "videoUrl": "https://www.youtube.com/watch?v=zgNU8qpdGqo"
 },
 {
  "name": "Shin Box Mobility",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Sit with the front shin across the body and the back shin angled behind, both knees bent to about ninety degrees. Sit tall and lean gently over the front shin, then rotate the knees to the other side and repeat.",
  "videoUrl": "https://www.youtube.com/watch?v=aqN7E_-7S2I"
 },
 {
  "name": "Shin Box to Lunge",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "From the shin box position, drive the back hip forward and come up onto the knees, then step the back leg through into a half-kneeling lunge. Reverse the movement back to the floor and switch sides.",
  "videoUrl": "https://www.youtube.com/watch?v=HNnk_h7JQo4"
 },
 {
  "name": "Shin Box to Squat",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "From the shin box position, rotate the knees up, plant both feet and stand up through a deep squat. Sit back down into the shin box on the other side under control.",
  "videoUrl": "https://youtu.be/87IzltiZIgo"
 },
 {
  "name": "90/90 Hip Switch (Hands Overhead)",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Sit in the 90/90 position with both arms reaching overhead. Rotate the knees from one side to the other without leaning back or putting a hand down, keeping the chest tall.",
  "videoUrl": "https://www.youtube.com/watch?v=4Im_xIm5MZU"
 },
 {
  "name": "Hip Airplane",
  "category": "mobility",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hamstrings",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand on one leg and hinge until the torso is near level, arms out. Rotate the pelvis open toward the ceiling and then closed toward the standing leg, keeping the standing knee steady.",
  "videoUrl": "https://www.youtube.com/watch?v=fy2AXh4u1yY"
 },
 {
  "name": "Hurdler Hip Opener",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Stand tall, lift one knee up and out to the side, and circle it over an imaginary hurdle before setting the foot down. Keep the standing leg straight and the trunk still; repeat in both directions.",
  "videoUrl": "https://www.youtube.com/watch?v=KOBnVqX_htc"
 },
 {
  "name": "Hip Star Reach",
  "category": "mobility",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Hip Flexors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Balance on one leg and reach the other foot out to the front, side and back in turn, tapping lightly and returning to centre each time. Keep the standing knee over the foot and the hips level.",
  "videoUrl": "https://www.youtube.com/watch?v=WBK24R7C09o"
 },
 {
  "name": "Standing Hip Flexion Raise",
  "category": "accessory",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Stand tall beside a support and lift one knee as high as it goes without leaning back. Hold at the top for a moment and lower slowly.",
  "videoUrl": "https://www.youtube.com/watch?v=19M6TR3tZTQ"
 },
 {
  "name": "Standing Lateral Leg Raise",
  "category": "accessory",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hip Flexors",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Activation",
  "laterality": "unilateral",
  "instructions": "Stand tall beside a support and lift one straight leg out to the side, toes pointing forward. Keep the trunk upright, hold briefly, and lower with control.",
  "videoUrl": "https://www.youtube.com/watch?v=UkxgyhrHsHo"
 },
 {
  "name": "Standing Hip External Rotation",
  "category": "mobility",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Hip Flexors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Stand on one leg with the other knee lifted in front. Rotate the lifted knee out to the side and back in, keeping the pelvis level and the standing leg still.",
  "videoUrl": "https://youtu.be/lAxaH9SyOGg"
 },
 {
  "name": "Quadruped Hip Mobilization",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Start on hands and knees and rock the hips back toward the heels, then circle and shift them side to side through a comfortable range. Keep the back long and move slowly.",
  "videoUrl": "https://youtu.be/nl9CJssKrhg"
 },
 {
  "name": "Wall Hip Flexor Stretch",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Kneel facing away from a wall with the back shin against it and the front foot forward in a lunge. Squeeze the glute of the back leg and shift the hips forward until a stretch is felt at the front of the hip, then hold.",
  "videoUrl": "https://youtu.be/nusXcwouP2w"
 },
 {
  "name": "World's Greatest Stretch (Walking)",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Hamstrings",
   "Core"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Step forward into a long lunge, place the hand inside the front foot, lift the hips to stretch the front hamstring, then reach the inside arm to the ceiling. Stand up, step through and repeat on the other side as you travel.",
  "videoUrl": "https://www.youtube.com/watch?v=P6LxxGmlTdA"
 },
 {
  "name": "Squat Internal Rotation",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Glutes",
   "Adductors"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Sit in a deep squat or low seated position with the feet wide. Drop one knee in toward the floor between the feet, hold, and bring it back up before switching sides.",
  "videoUrl": "https://youtu.be/zgsajacI2OY"
 },
 {
  "name": "Side-Lying Windmill",
  "category": "mobility",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Chest"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "unilateral",
  "instructions": "Lie on your side with the knees bent and stacked. Sweep the top arm in a big slow circle over the head and behind you, letting the chest follow, and keep the knees together on the floor.",
  "videoUrl": "https://www.youtube.com/watch?v=aX2NcrU1MYo"
 },
 {
  "name": "Supine Shoulder Flexion",
  "category": "mobility",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Lats"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the knees bent and the lower back flat. Raise the straight arms overhead toward the floor as far as the ribs stay down, then return them slowly.",
  "videoUrl": "https://www.youtube.com/watch?v=-3Fpd9yfUhg"
 },
 {
  "name": "Wall Shoulder Flexion",
  "category": "mobility",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Lats",
   "Back"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Stand facing a wall with the forearms on it. Slide the arms up the wall as high as they go without arching the lower back, then lower them with control.",
  "videoUrl": "https://youtu.be/_HorlxdvK6I"
 },
 {
  "name": "Supine Snow Angel",
  "category": "mobility",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back",
   "Chest"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Lie on your back with the arms at your sides and the backs of the hands on the floor. Sweep the arms overhead and back down while keeping them as close to the floor as you can.",
  "videoUrl": "https://www.youtube.com/watch?v=WWj-jPULpfI"
 },
 {
  "name": "Shoulder External Rotation Lift-Off",
  "category": "accessory",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Back"
  ],
  "equipment": "Bodyweight",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Lie face down with the arm out to the side and the elbow bent to ninety degrees. Rotate the forearm up so the hand lifts off the floor, hold for a moment, and lower it slowly.",
  "videoUrl": "https://youtu.be/ZMmuTTX_QDg"
 },
 {
  "name": "Stick Shoulder External Rotation Mobility",
  "category": "mobility",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Chest"
  ],
  "equipment": "Bodyweight",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Hold a stick with one hand at the bottom and the working elbow bent and tucked to the side. Use the stick to ease the working hand out into external rotation, hold at the end of range, and return.",
  "videoUrl": "https://youtu.be/1IocueMwu54"
 },
 {
  "name": "Stick Shoulder Climb",
  "category": "mobility",
  "muscleGroup": "Shoulders",
  "secondaryMuscles": [
   "Lats"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Stand facing a wall and hold a stick upright against it. Walk the hands up the stick one at a time as high as the shoulders allow, then walk them back down.",
  "videoUrl": "https://youtu.be/9c8Qwmgy8IY"
 },
 {
  "name": "Monkey Transfer",
  "category": "mobility",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Hip Flexors",
   "Shoulders"
  ],
  "equipment": "Bodyweight",
  "movementType": "Mobility",
  "laterality": "bilateral",
  "instructions": "Squat deep with both hands on the floor to one side. Shift the weight into the hands and hop the feet over to the other side, landing back in the deep squat.",
  "videoUrl": "https://www.youtube.com/watch?v=UV_TgPFvnVs"
 },
 {
  "name": "Monkey Rotation",
  "category": "mobility",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Hip Flexors",
   "Obliques"
  ],
  "equipment": "Bodyweight",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "From a deep squat with the hands on the floor, rotate the hips and step through to turn and face the other way, staying low. Keep the movement smooth and continuous.",
  "videoUrl": "https://youtu.be/yechqWbeZzM"
 },
 {
  "name": "Duck Walk",
  "category": "mobility",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Ankle"
  ],
  "equipment": "Bodyweight",
  "movementType": "Squat",
  "laterality": "bilateral",
  "instructions": "Sit into a deep squat and walk forward with short steps, staying low the whole way. Keep the chest up and the heels as close to the floor as you can.",
  "videoUrl": "https://www.youtube.com/watch?v=ct_4-FgV6Wo"
 },
 {
  "name": "Crab Toe Touch",
  "category": "mobility",
  "muscleGroup": "Core",
  "secondaryMuscles": [
   "Shoulders",
   "Glutes"
  ],
  "equipment": "Bodyweight",
  "movementType": "Rotation",
  "laterality": "bilateral",
  "instructions": "Sit with the hands behind you and lift the hips into a crab position. Reach one hand to the opposite foot as that leg kicks up, then return and switch sides.",
  "videoUrl": "https://www.youtube.com/watch?v=hea6m6qIfzc"
 },
 {
  "name": "Scorpion Stretch",
  "category": "mobility",
  "muscleGroup": "Hip Flexors",
  "secondaryMuscles": [
   "Lower Back",
   "Obliques"
  ],
  "equipment": "Bodyweight",
  "movementType": "Rotation",
  "laterality": "unilateral",
  "instructions": "Lie face down with the arms out to the sides. Reach one foot up and across behind the body toward the opposite hand, keeping the chest down, then return and switch sides.",
  "videoUrl": "https://www.youtube.com/watch?v=q0tJ2KyynHc"
 },
 {
  "name": "Lizard Walk",
  "category": "conditioning",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Hip Flexors",
   "Shoulders"
  ],
  "equipment": "Bodyweight",
  "movementType": "Carry",
  "laterality": "bilateral",
  "instructions": "Start in a low push-up position and crawl forward, bringing each knee up toward the elbow on the same side as you step. Stay low and keep the hips level.",
  "videoUrl": "https://www.youtube.com/watch?v=48LYMt7ZGbA"
 },
 {
  "name": "Sit-Up to Stand",
  "category": "conditioning",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Abs",
   "Quads"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Lie on your back, roll up into a sit-up and keep the momentum going to plant the feet and stand up without using the hands. Sit back down under control and repeat.",
  "videoUrl": "https://www.youtube.com/watch?v=TpNCm374DIo"
 },
 {
  "name": "Sled March",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Sled",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Lean into the sled with the arms extended and march forward with slow, powerful steps, driving each knee up. Keep a straight line from head to heel.",
  "videoUrl": "https://www.youtube.com/watch?v=4lMX-hUbIho"
 },
 {
  "name": "Sled Push (Straight Arms)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Sled",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Grip the sled posts with the arms locked straight and the body leaning in. Drive the sled forward with short, powerful steps, keeping the trunk rigid.",
  "videoUrl": "https://www.youtube.com/watch?v=UWnrYVlLUms"
 },
 {
  "name": "Sled Push (Bent Arms)",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Sled",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Hold the sled posts with the elbows bent and the chest close to the hands, body leaning in low. Drive the sled forward with powerful steps, keeping the angle of the body steady.",
  "videoUrl": "https://www.youtube.com/watch?v=SeOFYxWHFMw"
 },
 {
  "name": "Sled Power Push",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Glutes",
   "Calves"
  ],
  "equipment": "Sled",
  "movementType": "Push",
  "laterality": "bilateral",
  "instructions": "Load the sled heavy and push it with maximal effort over a short distance, driving each leg fully behind you. Rest fully between efforts.",
  "videoUrl": "https://www.youtube.com/watch?v=uFTRx_CSvnM"
 },
 {
  "name": "Sled Lateral Drag",
  "category": "conditioning",
  "muscleGroup": "Glutes",
  "secondaryMuscles": [
   "Adductors",
   "Quads"
  ],
  "equipment": "Sled",
  "movementType": "Carry",
  "laterality": "unilateral",
  "instructions": "Stand side-on to the sled holding the strap and step sideways away from it, staying low with the hips back. Drag it the set distance, then face the other way and repeat.",
  "videoUrl": "https://www.youtube.com/watch?v=FIBSxlep1A0"
 },
 {
  "name": "Manual Treadmill Backward Walk",
  "category": "conditioning",
  "muscleGroup": "Quads",
  "secondaryMuscles": [
   "Calves",
   "Glutes"
  ],
  "equipment": "Machine",
  "movementType": "Carry",
  "laterality": "bilateral",
  "instructions": "Face away from the front of a non-motorised treadmill and walk backward, pushing the belt with each step. Stay tall and land on the balls of the feet.",
  "videoUrl": "https://www.youtube.com/watch?v=qxkbjlrf9To"
 },
 {
  "name": "Manual Treadmill Run",
  "category": "conditioning",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Quads",
   "Calves"
  ],
  "equipment": "Machine",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Run on a non-motorised treadmill, driving the belt yourself at the effort set for the interval. Lean slightly forward and keep a quick, steady stride.",
  "videoUrl": "https://www.youtube.com/watch?v=wG3A6CpPJeQ"
 },
 {
  "name": "Maximal Aerobic Speed Intervals",
  "category": "conditioning",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Quads",
   "Calves"
  ],
  "equipment": "Bodyweight",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Run short intervals at a set percentage of maximal aerobic speed over a measured distance, with equal or set rest between them. Hit each distance in the target time.",
  "videoUrl": "https://www.youtube.com/watch?v=LpwjzlbAq9Q"
 },
 {
  "name": "Snake Run with Turns",
  "category": "conditioning",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Quads",
   "Calves",
   "Adductors"
  ],
  "equipment": "Cones",
  "movementType": "Combination",
  "laterality": "bilateral",
  "instructions": "Run a winding course through a line of cones, turning sharply around each one. Lower the hips into each turn and accelerate out of it.",
  "videoUrl": "https://www.youtube.com/watch?v=ZAeTibhYvew"
 },
 {
  "name": "Stationary Bike Intervals",
  "category": "conditioning",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Quads",
   "Glutes"
  ],
  "equipment": "Machine",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Ride a stationary bike in set work and rest intervals at the target effort or power. Stay seated and keep a smooth, even pedal stroke.",
  "videoUrl": "https://www.youtube.com/watch?v=82d0HP2MIUo"
 },
 {
  "name": "Vertical Climber Intervals",
  "category": "conditioning",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Shoulders",
   "Quads"
  ],
  "equipment": "Machine",
  "movementType": "Activation",
  "laterality": "bilateral",
  "instructions": "Climb on a vertical climbing machine in set work and rest intervals, driving with the arms and legs together. Keep the hips close to the machine and the strokes long.",
  "videoUrl": "https://youtu.be/g6eOLIn2FZ0"
 },
 {
  "name": "Kettlebell Bear Hug Carry",
  "category": "strength",
  "muscleGroup": "Full Body",
  "secondaryMuscles": [
   "Core",
   "Back",
   "Biceps"
  ],
  "equipment": "Kettlebell",
  "movementType": "Carry",
  "laterality": "bilateral",
  "instructions": "Hug a heavy kettlebell tight against the chest with both arms and walk the set distance. Stay tall and brace the trunk without leaning back.",
  "videoUrl": "https://youtu.be/gfbbPpyqfGM"
 }
];
