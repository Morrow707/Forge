import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DownloadButton } from "@/components/download-button";
import type { CameraConstant } from "@shared/camera-constants-registry";
import { useT } from "@/i18n";

type Spread = { samples: number; median: number | null; p10: number | null; p90: number | null };

type Evidence = {
  takesConsidered: number;
  selfContradiction: Spread & { takesOutsideBand: number; bandLow: number; bandHigh: number };
  wander: Spread;
  scaleSources: { source: string; chosen: number; outlier: number; ratioWhenOutlier: Spread }[];
  corroboratedTakes: number;
  takesWithAnyScale: number;
  torsoSpreadGrips: Spread;
  loop: {
    gravityReadings: number;
    takesTeachingBones: number;
    takesScaledByBodyModel: number;
  };
};

function SpreadLine({ label, spread, ideal }: { label: string; spread: Spread; ideal?: string }) {
  const t = useT();
  if (spread.samples === 0) {
    return (
      <div className="flex justify-between gap-4 py-1 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{t("no takes carry this yet")}</span>
      </div>
    );
  }
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">
        {spread.median} <span className="text-muted-foreground">{t("typical")}</span> · {spread.p10}–
        {spread.p90} <span className="text-muted-foreground">{t("over {count}", { count: spread.samples })}</span>
        {ideal ? <span className="text-muted-foreground"> · {ideal}</span> : null}
      </span>
    </div>
  );
}

/**
 * Nothing in the camera pipeline learns. The body tracker is Apple's and frozen, the object
 * detector is a file compiled into the binary, and overwatch is about thirty hand-picked
 * constants. What CAN improve is how well-aimed the next human fix is, and that has been
 * bottlenecked on evidence: every threshold is an admitted guess, and the only way to check one
 * was to film beside a bar sensor.
 *
 * That does not scale -- nobody sensors every lift. Two signals need no ground truth at all and
 * are already in every stored take, so this page reads them retroactively across the fleet and
 * puts each measurement beside the guess it would revise.
 */
export function CalibrationEvidence() {
  const t = useT();
  const { data, isLoading, isError } = useQuery<{ evidence: Evidence; constants: CameraConstant[] }>(
    { queryKey: ["/api/admin/calibration-evidence?limit=500"] },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Calibration evidence")}</CardTitle>
        <CardDescription>
          {t("Every camera threshold is a guess. These are the two things a take can say about itself with no sensor anywhere: whether its own arithmetic agrees, and whether independent rulers agree with each other. Read across every stored take, so it answers for footage already filmed.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {isLoading && <p className="text-muted-foreground">{t("Reading stored takes...")}</p>}
        {isError && <p className="text-destructive">{t("Could not load the evidence.")}</p>}

        {data && (
          <>
            <p className="text-muted-foreground">
              {t("Over {count} stored takes.", { count: data.evidence.takesConsidered })}
            </p>

            {/* HAS THE LOOP FIRED. Built and running look identical from a code review, and
                every link here is idle until the first one runs. */}
            <div>
              <h3 className="font-semibold">{t("Has the learning loop fired yet?")}</h3>
              <p className="pb-1 text-xs text-muted-foreground">
                {t(
                  "A flat jump gives gravity a scale → gravity measures your bones → those bones scale a later take that has no plate and no full body in frame. Each number below is one link. A zero means that link has never run, not that it is broken.",
                )}
              </p>
              <div className="flex justify-between gap-4 py-1">
                <span className="text-muted-foreground">{t("1. Gravity readings (flat jumps)")}</span>
                <span className="tabular-nums">{data.evidence.loop.gravityReadings}</span>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <span className="text-muted-foreground">{t("2. Takes that measured bones")}</span>
                <span className="tabular-nums">{data.evidence.loop.takesTeachingBones}</span>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <span className="text-muted-foreground">{t("3. Takes scaled BY those bones")}</span>
                <span className="tabular-nums">{data.evidence.loop.takesScaledByBodyModel}</span>
              </div>
              {data.evidence.loop.gravityReadings === 0 && (
                <p className="pt-1 text-xs text-muted-foreground">
                  {t("Nothing has started it yet. One flat countermovement jump, landing where you took off, not onto a box, produces the first reading.")}
                </p>
              )}
            </div>

            <div>
              <h3 className="font-semibold">{t("Does a take agree with itself?")}</h3>
              <p className="pb-1 text-xs text-muted-foreground">
                {t("Mean velocity times concentric duration is a distance, and it has to be the range of motion. Arithmetic, not opinion — 1.00 is a take that agrees with itself.")}
              </p>
              <SpreadLine
                label={t("Implied travel ÷ range of motion")}
                spread={data.evidence.selfContradiction}
                ideal={t("1.00 is agreement")}
              />
              <div className="flex justify-between gap-4 py-1">
                <span className="text-muted-foreground">
                  {t("Outside {low}–{high}", {
                    low: data.evidence.selfContradiction.bandLow,
                    high: data.evidence.selfContradiction.bandHigh,
                  })}
                </span>
                <span className="tabular-nums">
                  {t("{count} takes", { count: data.evidence.selfContradiction.takesOutsideBand })}
                </span>
              </div>
            </div>

            <div>
              <h3 className="font-semibold">{t("How much did the tracked point wander?")}</h3>
              <p className="pb-1 text-xs text-muted-foreground">
                {t("Path is summed step to step, displacement measured end to end. Only wandering separates them, and wandering is what inflates velocity while leaving range of motion alone.")}
              </p>
              <SpreadLine
                label={t("Path walked ÷ distance travelled")}
                spread={data.evidence.wander}
                ideal={t("1.00 never wandered")}
              />
            </div>

            <div>
              <h3 className="font-semibold">{t("Do the rulers agree with each other?")}</h3>
              <p className="pb-1 text-xs text-muted-foreground">
                {t("Two independent sources landing in the same place is the only corroborated evidence this pipeline can produce. A source that repeatedly loses, and loses by a lot, is telling you something without any sensor being involved.")}
              </p>
              <div className="flex justify-between gap-4 py-1">
                <span className="text-muted-foreground">{t("Corroborated by a second source")}</span>
                <span className="tabular-nums">
                  {t("{count} of {total} takes with a scale", {
                    count: data.evidence.corroboratedTakes,
                    total: data.evidence.takesWithAnyScale,
                  })}
                </span>
              </div>
              {data.evidence.scaleSources.length === 0 && (
                <p className="text-muted-foreground">{t("No take has recorded a scale source yet.")}</p>
              )}
              {data.evidence.scaleSources.map((s) => (
                <div key={s.source} className="flex justify-between gap-4 py-1">
                  <span className="font-mono text-xs">{s.source}</span>
                  <span className="text-right tabular-nums">
                    {t("decided {chosen} · outlier {outlier}", { chosen: s.chosen, outlier: s.outlier })}
                    {s.ratioWhenOutlier.median != null && (
                      <span className="text-muted-foreground">
                        {" "}
                        {t("· typically {ratio}× the chosen scale when it lost", { ratio: s.ratioWhenOutlier.median })}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div>
              <h3 className="font-semibold">{t("Torso stillness")}</h3>
              <p className="pb-1 text-xs text-muted-foreground">
                {t("A bench and a squat should land either side of the threshold with daylight between them. If they do not, the threshold is wrong.")}
              </p>
              <SpreadLine label={t("Torso spread, grip widths")} spread={data.evidence.torsoSpreadGrips} />
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">{t("The guesses, and what would correct each one")}</h3>
              {data.constants.map((c) => (
                <div key={c.name} className="rounded-md border border-border p-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-xs">{c.name}</span>
                    <span className="tabular-nums">
                      {c.value} <span className="text-muted-foreground">{c.unit}</span>
                    </span>
                  </div>
                  <p className="pt-1 text-xs text-muted-foreground">{c.decides}</p>
                  <p className="pt-1 text-xs text-muted-foreground">
                    <span className="font-semibold">{t("Why this number:")}</span> {c.basis}
                  </p>
                  {c.revisedBy ? (
                    <p className="pt-1 text-xs text-muted-foreground">
                      <span className="font-semibold">{t("Revised by:")}</span> {c.revisedBy}
                    </p>
                  ) : (
                    <Badge variant="destructive" className="mt-1">
                      {t("Nothing can check this one")}
                    </Badge>
                  )}
                </div>
              ))}
            </div>

            <DownloadButton
              url="/api/admin/calibration-evidence?limit=2000"
              filename="forge-calibration-evidence.json"
              shareTitle={t("Forge calibration evidence")}
              label={t("Download evidence")}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
