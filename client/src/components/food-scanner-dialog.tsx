import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, getJson } from "@/lib/queryClient";
import { BarcodeScanner } from "@/lib/barcode-scanner";
import { toast } from "sonner";
import { Camera, Search, Pencil, Loader2, Plus } from "lucide-react";

type FoodCandidate = {
  description: string;
  brand: string | null;
  servingDescription: string | null;
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  barcode: string | null;
};

type Mode = "scan" | "search" | "manual" | "confirm";
type Source = "barcode" | "search" | "manual";

function emptyManual(): FoodCandidate {
  return {
    description: "",
    brand: null,
    servingDescription: null,
    caloriesKcal: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    sodiumMg: null,
    barcode: null,
  };
}

/** Camera-first food logging -- scan a barcode (Open Food Facts, falling
 * back to USDA FoodData Central if configured -- see server/food-lookup.ts)
 * for the common case of packaged food, with search-by-name and full
 * manual entry as fallbacks for anything without a barcode. Never an AI
 * capability -- see foodLogEntries' schema comment -- so it's free for
 * every athlete regardless of coach/paywall status. */
export function FoodScannerDialog({
  open,
  onOpenChange,
  date,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("scan");
  const [source, setSource] = useState<Source>("barcode");
  const [candidate, setCandidate] = useState<FoodCandidate>(emptyManual());
  const [servings, setServings] = useState("1");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FoodCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<BarcodeScanner | null>(null);

  useEffect(() => {
    if (!open) {
      setMode("scan");
      setCandidate(emptyManual());
      setServings("1");
      setSearchQuery("");
      setSearchResults([]);
      setCameraError(null);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "scan") {
      scannerRef.current?.stop();
      scannerRef.current = null;
      return;
    }
    const scanner = new BarcodeScanner();
    scannerRef.current = scanner;
    let cancelled = false;

    (async () => {
      try {
        if (!videoRef.current) return;
        await scanner.start(
          videoRef.current,
          async (barcode) => {
            if (cancelled) return;
            scanner.stop();
            await handleBarcodeDetected(barcode);
          },
          () => {
            if (!cancelled) setCameraError("Couldn't access the camera -- check permissions.");
          },
        );
      } catch {
        if (!cancelled) setCameraError("Couldn't access the camera -- check permissions.");
      }
    })();

    return () => {
      cancelled = true;
      scanner.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  async function handleBarcodeDetected(barcode: string) {
    try {
      const result: FoodCandidate = await getJson(
        `/api/athlete/food/lookup-barcode?barcode=${encodeURIComponent(barcode)}`,
      );
      setCandidate(result);
      setSource("barcode");
      setServings("1");
      setMode("confirm");
    } catch {
      toast.error("Couldn't find that product -- try search or enter it manually.");
      setMode("search");
    }
  }

  const searchMutation = useMutation({
    mutationFn: async () => {
      setSearching(true);
      const results: FoodCandidate[] = await getJson(
        `/api/athlete/food/search?q=${encodeURIComponent(searchQuery)}`,
      );
      return results;
    },
    onSuccess: (results) => {
      setSearchResults(results);
      setSearching(false);
    },
    onError: () => {
      setSearching(false);
      toast.error("Search failed -- try again");
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const multiplier = Number(servings) || 1;
      const scale = (v: number | null) => (v == null ? null : Math.round(v * multiplier * 10) / 10);
      const res = await apiRequest("POST", "/api/athlete/food-log", {
        date,
        description: candidate.description,
        brand: candidate.brand,
        servingDescription:
          multiplier !== 1
            ? `${multiplier} x ${candidate.servingDescription ?? "serving"}`
            : candidate.servingDescription,
        caloriesKcal: scale(candidate.caloriesKcal),
        proteinG: scale(candidate.proteinG),
        carbsG: scale(candidate.carbsG),
        fatG: scale(candidate.fatG),
        fiberG: scale(candidate.fiberG),
        sodiumMg: scale(candidate.sodiumMg),
        source,
        barcode: candidate.barcode,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/food-log"] });
      toast.success("Logged");
      onOpenChange(false);
    },
    onError: () => toast.error("Couldn't log that -- try again"),
  });

  function pickSearchResult(result: FoodCandidate) {
    setCandidate(result);
    setSource("search");
    setServings("1");
    setMode("confirm");
  }

  function startManualEntry() {
    setCandidate(emptyManual());
    setSource("manual");
    setServings("1");
    setMode("manual");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Log Food
          </DialogTitle>
          <DialogDescription>
            Scan a barcode, search by name, or enter it manually.
          </DialogDescription>
        </DialogHeader>

        {mode === "scan" && (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-md border border-border bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full" />
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-16 -translate-y-1/2 rounded-md border-2 border-primary/70" />
            </div>
            {cameraError && <p className="text-sm text-destructive">{cameraError}</p>}
            <p className="text-center text-xs text-muted-foreground">
              Hold a barcode steady in the frame
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setMode("search")}>
                <Search className="h-4 w-4" />
                Search by name
              </Button>
              <Button type="button" variant="outline" className="flex-1" onClick={startManualEntry}>
                <Pencil className="h-4 w-4" />
                Enter manually
              </Button>
            </div>
          </div>
        )}

        {mode === "search" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. grilled chicken breast"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim().length >= 2) searchMutation.mutate();
                }}
              />
              <Button
                type="button"
                onClick={() => searchMutation.mutate()}
                disabled={searchQuery.trim().length < 2 || searching}
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {searchResults.length === 0 && !searching && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Search a food name, or{" "}
                  <button type="button" className="underline" onClick={startManualEntry}>
                    enter it manually
                  </button>
                  .
                </p>
              )}
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickSearchResult(r)}
                  className="flex w-full items-center justify-between rounded-md border border-border p-2.5 text-left text-sm hover:border-primary/50 hover:bg-surface"
                >
                  <div>
                    <p className="font-medium">{r.description}</p>
                    {r.brand && <p className="text-xs text-muted-foreground">{r.brand}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground">{r.caloriesKcal ?? "?"} kcal</p>
                </button>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("scan")}>
              <Camera className="h-3.5 w-3.5" />
              Back to scanning
            </Button>
          </div>
        )}

        {(mode === "confirm" || mode === "manual") && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="food-desc">Food</Label>
              <Input
                id="food-desc"
                value={candidate.description}
                onChange={(e) => setCandidate((c) => ({ ...c, description: e.target.value }))}
                placeholder="e.g. Grilled Chicken Breast"
                readOnly={mode === "confirm"}
              />
            </div>
            {mode === "confirm" && candidate.brand && (
              <p className="text-xs text-muted-foreground">{candidate.brand}</p>
            )}
            {mode === "confirm" ? (
              <div className="space-y-1.5">
                <Label htmlFor="food-servings">Servings ({candidate.servingDescription ?? "1 serving"})</Label>
                <Input
                  id="food-servings"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.25"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="food-serving-desc">Serving description (optional)</Label>
                <Input
                  id="food-serving-desc"
                  value={candidate.servingDescription ?? ""}
                  onChange={(e) => setCandidate((c) => ({ ...c, servingDescription: e.target.value }))}
                  placeholder="e.g. 1 cup"
                />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["caloriesKcal", "Calories"],
                  ["proteinG", "Protein (g)"],
                  ["carbsG", "Carbs (g)"],
                  ["fatG", "Fat (g)"],
                  ["fiberG", "Fiber (g)"],
                  ["sodiumMg", "Sodium (mg)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`food-${key}`} className="text-xs">
                    {label}
                  </Label>
                  <Input
                    id={`food-${key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={candidate[key] ?? ""}
                    readOnly={mode === "confirm"}
                    onChange={(e) =>
                      setCandidate((c) => ({
                        ...c,
                        [key]: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMode(mode === "confirm" ? "scan" : "scan")}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={!candidate.description.trim() || addMutation.isPending}
                onClick={() => addMutation.mutate()}
              >
                <Plus className="h-4 w-4" />
                Add to Log
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
