import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RadioChipGroup } from "@/components/filter-chip-group";
import { apiRequest, getJson } from "@/lib/queryClient";
import { MOVEMENT_TYPES } from "@shared/exercise-taxonomy";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Send, Sparkles, Loader2, Camera, Eye, Video } from "lucide-react";
import { cn } from "@/lib/utils";

// "jump" isn't a movementType in exercise-taxonomy.ts (jump tracking is its
// own trackingLevel, not a movement pattern), but it gets taught and
// profiled the same way as everything else -- see shared/schema.ts's
// movementProfiles comment.
const PROFILE_MOVEMENT_TYPES = [...MOVEMENT_TYPES, "jump"];

type ProfileFields = {
  minKneeAngleDeg: number | null;
  valgusRatioMin: number | null;
  maxTorsoLeanDeg: number | null;
  barPathDeviationMaxCm: number | null;
  barTiltMaxDeg: number | null;
  jumpHeightOutlierPercent: number | null;
  cameraFramingNotes: string | null;
};

type ActiveProfile = ProfileFields & {
  id: number;
  movementType: string;
  version: number;
  sourceSummary: string | null;
};

type Proposal = ProfileFields & { sourceSummary: string; summary: string };

type KnowledgeMessage = {
  id: number;
  role: "admin" | "assistant";
  content: string;
  createdAt: string;
};

type ChatState = { activeProfile: ActiveProfile | null; messages: KnowledgeMessage[] };

type NumericFieldKey = Exclude<keyof ProfileFields, "cameraFramingNotes">;

const FIELD_META: { key: NumericFieldKey; label: string; unit: string }[] = [
  { key: "minKneeAngleDeg", label: "Min bottom-position knee angle", unit: "°" },
  { key: "valgusRatioMin", label: "Min knee/ankle valgus ratio", unit: "" },
  { key: "maxTorsoLeanDeg", label: "Max forward torso lean", unit: "°" },
  { key: "barPathDeviationMaxCm", label: "Max bar-path deviation", unit: "cm" },
  { key: "barTiltMaxDeg", label: "Max bar tilt", unit: "°" },
  { key: "jumpHeightOutlierPercent", label: "Jump-height outlier threshold", unit: "%" },
];

function formatValue(value: number | null, unit: string): string {
  return value == null ? "using tracker default" : `${value}${unit}`;
}

/** Lets the admin teach the camera tracker per-movement kinematic
 * thresholds (knee angle, valgus, torso lean, bar path/tilt, jump-height
 * outlier %) through a conversation, one profile per movementType --
 * mirrors the ai-knowledge/nutrition-knowledge "teach, propose, review,
 * apply" pattern, but the AI proposes structured fields instead of a
 * freeform document. Nothing here affects a live tracked set until the
 * admin explicitly applies a proposal -- see storage.applyMovementProfileProposal. */
export default function AdminMovementKnowledge() {
  const qc = useQueryClient();
  const [movementType, setMovementType] = useState<string>(MOVEMENT_TYPES[0]);
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchUrl = `/api/admin/movement-knowledge/${movementType}`;

  const { data, isLoading } = useQuery<ChatState>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
  });
  const messages = data?.messages ?? [];
  const activeProfile = data?.activeProfile ?? null;

  useEffect(() => {
    setProposal(null);
  }, [movementType]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${fetchUrl}/chat`, {
        content: content.trim() || undefined,
        url: url.trim() || undefined,
      });
      return res.json() as Promise<ChatState & { proposal: Proposal | null }>;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [fetchUrl] });
      setContent("");
      setUrl("");
      setProposal(result.proposal ?? null);
    },
    onError: () => toast.error("Couldn't send that -- try again"),
  });

  const apply = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${fetchUrl}/apply`, proposal);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [fetchUrl] });
      setProposal(null);
      toast.success("Applied");
    },
    onError: () => toast.error("Couldn't apply that -- try again"),
  });

  const canSend = (content.trim() || url.trim()) && !send.isPending;

  const changedFields = proposal
    ? FIELD_META.filter((f) => proposal[f.key] !== (activeProfile?.[f.key] ?? null))
    : [];
  const cameraNotesChanged =
    proposal && proposal.cameraFramingNotes !== (activeProfile?.cameraFramingNotes ?? null);

  return (
    <AppShell title="Teach Movement AI">
      <div className="mb-4">
        <RadioChipGroup
          label="Movement"
          options={PROFILE_MOVEMENT_TYPES}
          value={movementType}
          onChange={(v) => v && setMovementType(v)}
          colorClass="border-primary bg-primary/15 text-primary"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="flex min-h-[28rem] flex-col">
          <CardHeader className="shrink-0">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Teach the Tracker: {movementType}
            </CardTitle>
            <CardDescription>
              Describe cues, corrections, or paste a URL about {movementType.toLowerCase()} mechanics --
              the camera tracker's form-fault checks for this movement will use it from the moment you
              apply it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {isLoading && <div className="h-24 animate-pulse rounded-md bg-surface" />}
              {!isLoading && messages.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nothing taught yet for {movementType} -- try something like "knees should break
                  parallel, don't let the threshold get more lenient than 95 degrees" or paste a URL
                  to an article on the movement.
                </p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "admin" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      m.role === "admin"
                        ? "bg-primary text-primary-foreground"
                        : "border border-primary/30 bg-primary/5",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    <p
                      className={cn(
                        "mt-1 text-[10px]",
                        m.role === "admin" ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {format(parseISO(m.createdAt), "MMM d, h:mm a")}
                    </p>
                  </div>
                </div>
              ))}
              {send.isPending && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Thinking...
                    </span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {proposal && (
              <div className="shrink-0 space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                  <Eye className="h-3.5 w-3.5" />
                  Review before this takes effect
                </p>
                {changedFields.length === 0 && !cameraNotesChanged ? (
                  <p className="text-xs text-muted-foreground">
                    No threshold changes in this proposal -- just the note below.
                  </p>
                ) : (
                  <div className="space-y-1 rounded bg-background/60 p-2 font-mono text-xs">
                    {changedFields.map((f) => (
                      <div key={f.key} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{f.label}</span>
                        <span>
                          {formatValue(activeProfile?.[f.key] ?? null, f.unit)}
                          {" → "}
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatValue(proposal[f.key], f.unit)}
                          </span>
                        </span>
                      </div>
                    ))}
                    {cameraNotesChanged && (
                      <div className="pt-1">
                        <span className="text-muted-foreground">Camera framing notes:</span>
                        <p className="mt-0.5 whitespace-pre-wrap text-emerald-600 dark:text-emerald-400">
                          {proposal.cameraFramingNotes || "(cleared)"}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setProposal(null)}>
                    Discard
                  </Button>
                  <Button type="button" size="sm" onClick={() => apply.mutate()} disabled={apply.isPending}>
                    {apply.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Apply
                  </Button>
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canSend) send.mutate();
              }}
              className="shrink-0 space-y-2 border-t border-border pt-3"
            >
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Teach it something about this movement's mechanics..."
                className="min-h-[44px] resize-none"
                maxLength={5000}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSend) send.mutate();
                  }
                }}
              />
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <label className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    <Video className="h-3 w-3" />
                    Or a URL (optional)
                  </label>
                  <Input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="h-9"
                  />
                </div>
                <Button type="submit" disabled={!canSend}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="flex min-h-[28rem] flex-col">
          <CardHeader className="shrink-0">
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              Active Profile
            </CardTitle>
            <CardDescription>
              {activeProfile
                ? `Version ${activeProfile.version} -- live for every ${movementType} set tracked right now.`
                : "Nothing applied yet -- the tracker is using its built-in hardcoded defaults for this movement."}
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="h-40 animate-pulse rounded-md bg-surface" />
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5 text-sm">
                  {FIELD_META.map((f) => (
                    <div key={f.key} className="flex items-center justify-between gap-2 border-b border-border/50 py-1">
                      <span className="text-muted-foreground">{f.label}</span>
                      <span className="font-mono text-xs">{formatValue(activeProfile?.[f.key] ?? null, f.unit)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Camera framing</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activeProfile?.cameraFramingNotes || "Nothing taught yet."}
                  </p>
                </div>
                {activeProfile?.sourceSummary && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Taught from</p>
                    <p className="mt-1 text-sm text-muted-foreground">{activeProfile.sourceSummary}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
