import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PhotoUploadField } from "@/components/photo-upload-field";
import type { CapturedPhoto } from "@/lib/photo-capture";
import { apiRequest, getJson } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Send, Sparkles, Loader2, BookOpen, Eye, X, Database, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type ForgeAiMessage = { id: number; role: "admin" | "assistant"; content: string; createdAt: string };

type EntryTags = {
  category?: string | null;
  position?: string | null;
  gender?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  maturity: "established" | "experimental";
};

type ForgeAiEntry = EntryTags & { id: number; content: string; updatedAt: string };

type Proposal = EntryTags & {
  content: string;
  summary: string;
  updatesEntryId?: number | null;
  isCorrection?: boolean;
  changeReason?: string;
  sourceType?: "chat" | "image" | "url";
  sourceExcerpt?: string | null;
};

function scopeLabel(e: EntryTags): string {
  const parts = [
    e.position ? `position: ${e.position}` : null,
    e.gender ? `gender: ${e.gender}` : null,
    e.ageMin != null || e.ageMax != null ? `age ${e.ageMin ?? "any"}-${e.ageMax ?? "any"}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "universal";
}

/** Forge AI's central teaching chat -- see chatWithForgeAi's own comment in
 * storage.ts for why this is a per-entry propose flow (content + specificity
 * tags + maturity level) rather than the old single-document rewrite the
 * "Teach AI"/"Teach Nutrition AI" pages used. Nothing here reaches the live
 * knowledge base every AI feature reads from until the admin reviews a
 * proposal card and explicitly applies it. */
export default function ForgeAiPage() {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [attachedImage, setAttachedImage] = useState<CapturedPhoto | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [retiringId, setRetiringId] = useState<number | null>(null);
  const [retireReason, setRetireReason] = useState("");
  const [showAggregate, setShowAggregate] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  type Gap = { context: string; position: string | null; gender: string | null; age: number | null; count: number; lastSeen: string };
  type Finding = {
    id: number;
    tier: "safety" | "informational";
    summary: string;
    detail: string;
    sampleSize: number;
    confidence: "low" | "moderate" | "high";
    createdAt: string;
  };
  const { data, isLoading } = useQuery<{
    messages: ForgeAiMessage[];
    entries: ForgeAiEntry[];
    usageCounts: Record<number, number>;
    gaps: Gap[];
    findings: Finding[];
  }>({
    queryKey: ["/api/admin/forge-ai"],
    queryFn: () => getJson("/api/admin/forge-ai"),
  });
  const messages = data?.messages ?? [];
  const entries = data?.entries ?? [];
  const usageCounts = data?.usageCounts ?? {};
  const gaps = data?.gaps ?? [];
  const findings = data?.findings ?? [];

  type AthleteRow = {
    age: number | null;
    gender: string | null;
    heightIn: number | null;
    bodyWeightLbs: number | null;
    sport: string | null;
    position: string | null;
    seasonPhase: string | null;
    trainingStylePreference: string | null;
    nutritionGoal: string | null;
    healthStatus: string;
    fortyYardDash: number | null;
    verticalJumpIn: number | null;
    broadJumpIn: number | null;
    proAgilitySeconds: number | null;
    benchMaxLbs: number | null;
    squatMaxLbs: number | null;
    deadliftMaxLbs: number | null;
  };
  const { data: aggregateData, isLoading: aggregateLoading } = useQuery<AthleteRow[]>({
    queryKey: ["/api/admin/aggregate-athlete-data"],
    queryFn: () => getJson("/api/admin/aggregate-athlete-data"),
    enabled: showAggregate,
  });

  type ScreenRow = {
    testKey: string;
    label: string;
    category: string;
    scoreType: string;
    side: string | null;
    scoreValue: number;
    flagged: boolean;
    age: number | null;
    gender: string | null;
    sport: string | null;
    position: string | null;
  };
  const [showScreens, setShowScreens] = useState(false);
  const { data: screenData, isLoading: screenLoading } = useQuery<ScreenRow[]>({
    queryKey: ["/api/admin/movement-screens/aggregate"],
    queryFn: () => getJson("/api/admin/movement-screens/aggregate"),
    enabled: showScreens,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/forge-ai/chat", {
        content,
        image: attachedImage ?? undefined,
      });
      return res.json() as Promise<{ proposal: Proposal | null }>;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/forge-ai"] });
      setContent("");
      setAttachedImage(null);
      setProposal(result.proposal ?? null);
    },
    onError: () => toast.error("Couldn't send that -- try again"),
  });

  const apply = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/forge-ai/apply", proposal);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/forge-ai"] });
      setProposal(null);
      toast.success("Applied -- Forge AI knows this now");
    },
    onError: () => toast.error("Couldn't apply that -- try again"),
  });

  const retire = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/forge-ai/entries/${id}/deactivate`, { reason: retireReason });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/forge-ai"] });
      setRetiringId(null);
      setRetireReason("");
      toast.success("Retired");
    },
    onError: () => toast.error("Couldn't retire that -- a reason is required"),
  });

  return (
    <AppShell title="Forge AI">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="flex min-h-[28rem] flex-col">
          <CardHeader className="shrink-0">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Talk with Forge AI
            </CardTitle>
            <CardDescription>
              A real conversation, not an intake form -- discuss ideas, ask questions, paste research. When something's
              concrete enough to teach, it'll propose an entry for you to review below.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {isLoading && <div className="h-24 animate-pulse rounded-md bg-surface" />}
              {!isLoading && messages.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nothing taught yet -- paste an idea, a quote, a link, or just ask a question to start.
                </p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "admin" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      m.role === "admin" ? "bg-primary text-primary-foreground" : "border border-primary/30 bg-primary/5",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    <p className={cn("mt-1 text-[10px]", m.role === "admin" ? "text-primary-foreground/70" : "text-muted-foreground")}>
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
                  {proposal.updatesEntryId ? `Review update to entry #${proposal.updatesEntryId}` : "Review new entry"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={proposal.maturity === "established" ? "default" : "secondary"}>
                    {proposal.maturity}
                  </Badge>
                  {proposal.category && <Badge variant="outline">{proposal.category}</Badge>}
                  {proposal.position && <Badge variant="outline">{proposal.position}</Badge>}
                  {proposal.gender && <Badge variant="outline">{proposal.gender}</Badge>}
                  {(proposal.ageMin != null || proposal.ageMax != null) && (
                    <Badge variant="outline">
                      age {proposal.ageMin ?? "any"}-{proposal.ageMax ?? "any"}
                    </Badge>
                  )}
                  {proposal.isCorrection && <Badge variant="destructive">correction</Badge>}
                  {proposal.sourceType === "image" && <Badge variant="outline">from photo</Badge>}
                  {proposal.sourceType === "url" && <Badge variant="outline">from a link</Badge>}
                </div>
                <p className="rounded bg-background/60 p-2 text-sm">{proposal.content}</p>
                {proposal.changeReason && (
                  <p className="text-xs text-muted-foreground">Why: {proposal.changeReason}</p>
                )}
                {proposal.sourceType === "url" && proposal.sourceExcerpt && (
                  <p className="truncate text-xs text-muted-foreground">Source: {proposal.sourceExcerpt}</p>
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
                if (!content.trim() || send.isPending) return;
                send.mutate();
              }}
              className="shrink-0 space-y-2 border-t border-border pt-3"
            >
              <PhotoUploadField
                images={attachedImage ? [attachedImage] : []}
                onChange={(images) => setAttachedImage(images[images.length - 1] ?? null)}
                maxImages={1}
                document
              />
              <div className="flex items-end gap-2">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Teach it something, paste an article, attach a photo, or just ask a question..."
                  className="min-h-[44px] flex-1 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (content.trim() && !send.isPending) send.mutate();
                    }
                  }}
                />
                <Button type="submit" disabled={send.isPending || !content.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="flex min-h-[28rem] flex-col">
          <CardHeader className="shrink-0">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              What it knows ({entries.length})
            </CardTitle>
            <CardDescription>Every active taught entry, most recent first.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {isLoading ? (
              <div className="h-40 animate-pulse rounded-md bg-surface" />
            ) : entries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nothing taught yet.</p>
            ) : (
              entries.map((e) => (
                <div key={e.id} className="rounded-md border border-border p-2.5">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant={e.maturity === "established" ? "default" : "secondary"} className="text-[10px]">
                      {e.maturity}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{scopeLabel(e)}</span>
                    <span className="text-[10px] text-muted-foreground">
                      · {usageCounts[e.id] ? `used ${usageCounts[e.id]}x this week` : "unused this week"}
                    </span>
                  </div>
                  <p className="text-sm">{e.content}</p>
                  {retiringId === e.id ? (
                    <div className="mt-2 flex items-center gap-1.5">
                      <Textarea
                        value={retireReason}
                        onChange={(ev) => setRetireReason(ev.target.value)}
                        placeholder="Why is this being retired?"
                        className="min-h-[32px] flex-1 resize-none text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={!retireReason.trim() || retire.isPending}
                        onClick={() => retire.mutate(e.id)}
                      >
                        Confirm
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setRetiringId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRetiringId(e.id)}
                      className="mt-1 text-[10px] font-semibold text-muted-foreground hover:text-destructive"
                    >
                      This was wrong -- retire it
                    </button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {findings.length > 0 && (
        <div className="px-4 pb-4 lg:px-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reflection findings</CardTitle>
              <CardDescription>
                Patterns the background reflection job found in the injury/training-load data and the roster itself,
                weighed against what's been taught. Every finding carries its own sample size -- read the number, not
                just the headline.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {findings.map((f) => (
                <div key={f.id} className="rounded-md border border-border p-2.5">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    {f.tier === "safety" ? (
                      <Badge variant="destructive" className="flex items-center gap-1 text-[10px]">
                        <AlertTriangle className="h-3 w-3" />
                        safety
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="flex items-center gap-1 text-[10px]">
                        <Info className="h-3 w-3" />
                        informational
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      n={f.sampleSize} · {f.confidence} confidence
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{format(parseISO(f.createdAt), "MMM d")}</span>
                  </div>
                  <p className="text-sm font-medium">{f.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="px-4 pb-4 lg:px-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recurring gaps</CardTitle>
              <CardDescription>
                Cases that came up more than once in the last two weeks with nothing taught for them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {gaps.map((g, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span>
                    <span className="font-semibold">{g.context.replace(/_/g, " ")}</span> ·{" "}
                    {[g.position, g.gender, g.age != null ? `age ${g.age}` : null].filter(Boolean).join(", ") || "no profile detail"}
                  </span>
                  <Badge variant="outline">{g.count}x</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="px-4 pb-4 lg:px-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4 text-primary" />
                  Aggregate athlete data
                </CardTitle>
                <CardDescription>
                  Every athlete on the platform, across every coach's roster -- exact values, no names or team info.
                  Each view is logged.
                </CardDescription>
              </div>
              {!showAggregate && (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAggregate(true)}>
                  View data
                </Button>
              )}
            </div>
          </CardHeader>
          {showAggregate && (
            <CardContent className="overflow-x-auto">
              {aggregateLoading ? (
                <div className="h-24 animate-pulse rounded-md bg-surface" />
              ) : !aggregateData || aggregateData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No athletes yet.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                      <th className="py-1.5 pr-3">Age</th>
                      <th className="py-1.5 pr-3">Gender</th>
                      <th className="py-1.5 pr-3">Height</th>
                      <th className="py-1.5 pr-3">Weight</th>
                      <th className="py-1.5 pr-3">Sport</th>
                      <th className="py-1.5 pr-3">Position</th>
                      <th className="py-1.5 pr-3">Season</th>
                      <th className="py-1.5 pr-3">Style</th>
                      <th className="py-1.5 pr-3">Nutrition goal</th>
                      <th className="py-1.5 pr-3">Health</th>
                      <th className="py-1.5 pr-3">40-Yd</th>
                      <th className="py-1.5 pr-3">Vertical</th>
                      <th className="py-1.5 pr-3">Broad</th>
                      <th className="py-1.5 pr-3">Agility</th>
                      <th className="py-1.5 pr-3">Bench</th>
                      <th className="py-1.5 pr-3">Squat</th>
                      <th className="py-1.5 pr-3">Deadlift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregateData.map((a, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1.5 pr-3">{a.age ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.gender ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.heightIn ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.bodyWeightLbs ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.sport ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.position ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.seasonPhase ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.trainingStylePreference ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.nutritionGoal ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.healthStatus}</td>
                        <td className="py-1.5 pr-3">{a.fortyYardDash ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.verticalJumpIn ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.broadJumpIn ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.proAgilitySeconds ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.benchMaxLbs ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.squatMaxLbs ?? "--"}</td>
                        <td className="py-1.5 pr-3">{a.deadliftMaxLbs ?? "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      <div className="px-4 pb-4 lg:px-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4 text-primary" />
                  Movement screen results
                </CardTitle>
                <CardDescription>
                  Every screened result across every coach's roster -- exact values, redacted to age/gender/sport/
                  position. Each view is logged.
                </CardDescription>
              </div>
              {!showScreens && (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowScreens(true)}>
                  View data
                </Button>
              )}
            </div>
          </CardHeader>
          {showScreens && (
            <CardContent className="overflow-x-auto">
              {screenLoading ? (
                <div className="h-24 animate-pulse rounded-md bg-surface" />
              ) : !screenData || screenData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No screens logged yet.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                      <th className="py-1.5 pr-3">Test</th>
                      <th className="py-1.5 pr-3">Side</th>
                      <th className="py-1.5 pr-3">Score</th>
                      <th className="py-1.5 pr-3">Flagged</th>
                      <th className="py-1.5 pr-3">Age</th>
                      <th className="py-1.5 pr-3">Gender</th>
                      <th className="py-1.5 pr-3">Sport</th>
                      <th className="py-1.5 pr-3">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {screenData.map((r, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1.5 pr-3">{r.label}</td>
                        <td className="py-1.5 pr-3">{r.side ?? "--"}</td>
                        <td className="py-1.5 pr-3">{r.scoreValue}</td>
                        <td className="py-1.5 pr-3">{r.flagged ? "yes" : "no"}</td>
                        <td className="py-1.5 pr-3">{r.age ?? "--"}</td>
                        <td className="py-1.5 pr-3">{r.gender ?? "--"}</td>
                        <td className="py-1.5 pr-3">{r.sport ?? "--"}</td>
                        <td className="py-1.5 pr-3">{r.position ?? "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
