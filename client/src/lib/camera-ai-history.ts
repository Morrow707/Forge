// A hand-maintained changelog of the on-device CoreML object detector's training history --
// NOT auto-generated from git log or any live signal. Every entry here corresponds to a real
// retrain that happened in scripts/med-ball-detector/, verified with direct inference against
// real photos before being bundled and shipped (see each retrain's own commit message for the
// full verification numbers this summarizes).
//
// Grouped by equipment/object, one function per row, per explicit request: "for the ai have
// every function be built separate, barbell, dumbbells, kettlebells, all the balls, with room
// to grow and expand into other categories" -- each row below is exactly one of those functions.
// A category with nothing built yet still gets a row (status "not_built" + notBuiltNote
// explaining what runs today instead), so the page is honest about gaps rather than only
// showing what exists. To add a brand-new category later (a new ball, a new implement): add it
// to CLASS_NAMES in scripts/med-ball-detector/prepare_dataset.py, label real photos of it the
// same way as everything below, retrain, then add its row here -- the list isn't capped at
// these seven, every category on it got added exactly that way.
export type CameraAiDomainStatus = "active" | "not_built";

export type CameraAiHistoryEntry = {
  date: string; // YYYY-MM-DD
  headline: string;
  detail: string;
};

export type CameraAiDomain = {
  id: string;
  label: string;
  status: CameraAiDomainStatus;
  // Real count of labeled bounding boxes (real photos, hand-verified) this domain's classes
  // have been trained on -- the raw number behind "how much has it actually learned here,"
  // so a gap between domains (e.g. med_ball's 10 vs tennis_ball's 1) is visible, not implied.
  // Counted straight from training-data/med-ball/labels/*.json, same source every retrain reads.
  trainingExampleCount: number;
  // What's still missing for this domain -- shown whether status is "not_built" (nothing
  // visual exists yet) or "active" (some of it works, but a real gap remains, e.g. barbell's
  // plates are recognized but the bar itself still isn't).
  notBuiltNote?: string;
  entries: CameraAiHistoryEntry[];
};

export const CAMERA_AI_MODEL_NOTE =
  "The active classes below (med_ball, plate, baseball, golf_ball, tennis_ball) all live in " +
  "one shared on-device model (MedBallDetector.mlpackage) -- adding a new class means " +
  "retraining that whole model, not a separate one per object. Every retrain in this history " +
  "was verified by running inference against a real reference photo of every class that " +
  "existed at that point, before being bundled and shipped, specifically so a new class can't " +
  "silently break or drop an older one without it being caught first.";

export const CAMERA_AI_DOMAINS: CameraAiDomain[] = [
  {
    id: "barbell",
    label: "Barbell",
    status: "active",
    trainingExampleCount: 3,
    notBuiltNote:
      "The plates are recognized (see below), but the bar itself still has no visual class -- squat/bench/deadlift/row bar-path tracking runs on motion-diff (implement-tracking.ts / bar-tracking.ts), the same fallback used for every implement with no trained class.",
    entries: [
      {
        date: "2026-09-02",
        headline: "plate class added",
        detail:
          "3 real photos of the same 10lb bumper plate, circle-fit measured the same way as med_ball. 96-99% confidence. Not yet wired into any live tracking feature -- squat/bench/deadlift bar-path tracking still runs on motion tracking only, this class just exists and works if something calls it.",
      },
    ],
  },
  {
    id: "dumbbells",
    label: "Dumbbells",
    status: "not_built",
    trainingExampleCount: 0,
    notBuiltNote:
      "No visual model, no labeled photos yet. Tracking runs entirely on motion-diff (implement-tracking.ts) -- it has no concept of \"dumbbell,\" doesn't know its size, and can't tell a heavy one from a light one by sight.",
    entries: [],
  },
  {
    id: "kettlebells",
    label: "Kettlebells",
    status: "not_built",
    trainingExampleCount: 0,
    notBuiltNote:
      "No visual model, no labeled photos yet. Tracking runs entirely on motion-diff (watches which pixels move near the wrist frame-to-frame) -- it has no concept of \"kettlebell,\" doesn't know it's round, and can't tell a heavier one from a lighter one by sight.",
    entries: [],
  },
  {
    id: "med_ball",
    label: "Medicine balls",
    status: "active",
    trainingExampleCount: 10,
    entries: [
      {
        date: "2026-09-01",
        headline: "First detector trained -- med_ball only",
        detail:
          "8 real training photos across 4 differently-sized/colored med balls (a 15lb slam ball, a 10lb slam ball, a green/black ~12lb ball, a 30lb slam ball). 98% confidence on its own training frame. Bounding boxes eyeballed against a pixel grid.",
      },
      {
        date: "2026-09-02",
        headline: "Training boxes re-measured with precise circle-fitting",
        detail:
          "Same 8 photos, but the balls' bounding boxes were re-measured with cv2.HoughCircles (an objective edge-detection fit) instead of eyeballing -- every ball is photographed close to straight overhead, so its silhouette is a true circle. Confidence held at 95-99% on retrain, and 2 of the photos turned out to have a second ball in frame once measured carefully, so the real count of learned examples is 10, not 8.",
      },
    ],
  },
  {
    id: "baseball",
    label: "Baseballs",
    status: "active",
    trainingExampleCount: 2,
    entries: [
      {
        date: "2026-09-02",
        headline: "baseball class added",
        detail:
          "2 real baseball photos (both in one frame) -- already in the training set (originally uploaded for floor-tile scale reference) that had never been labeled or used, circle-fit measured. 97.3-99.9% confidence, correctly told apart from every other class on the same test pass. Not yet wired into any live tracking feature -- no baseball throw tracker exists yet.",
      },
    ],
  },
  {
    id: "golf_ball",
    label: "Golf balls",
    status: "active",
    trainingExampleCount: 2,
    entries: [
      {
        date: "2026-09-02",
        headline: "golf_ball class added",
        detail:
          "2 real golf ball photos (both in one frame), same set as baseball/tennis_ball, circle-fit measured. 97.3-99.9% confidence, correctly told apart from every other class on the same test pass. Not yet wired into any live tracking feature -- no golf swing/throw tracker exists yet.",
      },
    ],
  },
  {
    id: "tennis_ball",
    label: "Tennis balls",
    status: "active",
    trainingExampleCount: 1,
    notBuiltNote:
      "Only 1 real labeled photo so far, the smallest example count of any active class -- confidence numbers on this class are the least proven of the five and should be trusted least until more real photos come in.",
    entries: [
      {
        date: "2026-09-02",
        headline: "tennis_ball class added",
        detail:
          "1 real tennis ball photo, same set as baseball/golf_ball, circle-fit measured. 97.3-99.9% confidence, correctly told apart from every other class on the same test pass. Not yet wired into any live tracking feature -- no tennis throw/swing tracker exists yet.",
      },
    ],
  },
];
