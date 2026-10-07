
## The 2026-10-07 pass: all 266 images labelled

Before this pass, 41 images carried 43 boxes. Now all 266 carry **1611**, and the
distribution is the point as much as the count:

| class | was | now |
|---|---|---|
| plate | 12 | 465 |
| dumbbell | 1 | 430 |
| med_ball | 10 | 201 |
| kettlebell | 12 | 150 |
| **barbell** | **3** | **146** |
| baseball | 2 | 108 |
| golf_ball | 2 | 72 |
| tennis_ball | 1 | 39 |

**The 225 frames were the valuable half and were the unlabelled half.** They are
1440x1920 portrait -- the geometry a phone actually hands the detector -- with
objects at 2-15% of the frame. The 41 images labelled before are close-ups at
26-56%. A detector trained only on close-ups predicts boxes too large, which a
scale pipeline reads as a scale too small: exactly what `plateScaleIfAdmitted`
measured on 2026-10-07 (bench 3.9x, row 4.7x, press 1.9x too small against the
scale each take needed). That is the symptom this pass exists to remove.

**How a box was placed.** By eye, on one frame of a clip, rendered at 950px with a
20-cell grid; carried onto that clip's siblings by the frames' own ORB homography;
then looked at again on a contact sheet. Where the carry drifted off its object it
was replaced by eye or dropped -- it is a starting point, never the label. On the
clips whose floor is featureless dark tile the homography finds nothing and every
frame was placed by eye.

**Twenty-two images are negatives** (`"boxes": []`): plyo boxes, mats, a tape
measure on the floor. None of the eight classes is in them. They stay in the set
because a detector that has never seen a gym with nothing in it reports a plate in
every one.

**Known coarseness, stated rather than hidden:** the dense dumbbell racks
(IMG_0017-0023, IMG_0036-0038) are labelled rack-wide and some boxes span two
dumbbells. `dumbbell` is not an implement any capture mode tracks -- plate,
barbell, med_ball and kettlebell are the ones the scale pipeline reads -- so the
care went there. Re-tightening the dumbbell racks is open work.
