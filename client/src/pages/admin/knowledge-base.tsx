import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, getJson, resolveApiUrl, getNativeToken, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { Upload, Trash2, Search, AlertTriangle, BookOpen, ScanText } from "lucide-react";

// The assistants a source can serve. A source can carry several: an energy
// availability chapter is honestly both nutrition and strength, and forcing
// one tag would hide it from whichever assistant lost the coin toss.
const DOMAINS = [
  { key: "strength", label: "Strength & conditioning" },
  { key: "nutrition", label: "Nutrition" },
  { key: "rehab", label: "Rehab & return to play" },
  { key: "sport", label: "Sport specific" },
  { key: "movement", label: "Movement & camera" },
  { key: "class", label: "Class & lesson design" },
];

type Source = {
  id: number;
  title: string;
  citation: string | null;
  pageCount: number | null;
  status: "extracting" | "ready" | "failed" | "needs_vision" | "transcribing";
  statusDetail: string | null;
  domains: string[];
  passageCount: number;
  createdAt: string;
};

type Conflict = {
  id: number;
  summary: string;
  status: string;
  createdAt: string;
  passage: { text: string; pageNumber: number; sourceTitle: string; citation: string | null } | null;
  otherPassage: {
    text: string;
    pageNumber: number;
    sourceTitle: string;
    citation: string | null;
  } | null;
};

export default function AdminKnowledgeBase() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [citation, setCitation] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchDomains, setSearchDomains] = useState<string[]>(["strength"]);

  const { data: sources = [] } = useQuery<Source[]>({
    queryKey: ["/api/admin/knowledge-sources"],
    queryFn: () => getJson("/api/admin/knowledge-sources"),
    // A transcription pass writes its progress to the source row, so the
    // list has to re-read to show it moving. Polled only while something is
    // actually running -- an idle knowledge base should not poll at all.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((s) => s.status === "transcribing") ? 5000 : false,
  });

  const { data: conflicts = [] } = useQuery<Conflict[]>({
    queryKey: ["/api/admin/knowledge-conflicts"],
    queryFn: () => getJson("/api/admin/knowledge-conflicts"),
  });

  const { data: searchHits, refetch: runSearch } = useQuery<any[]>({
    queryKey: ["knowledge-search", searchText, searchDomains.join(",")],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/admin/knowledge-search", {
        query: searchText,
        domains: searchDomains,
      });
      return res.json();
    },
    enabled: false,
  });

  async function upload() {
    if (!file || !title.trim() || domains.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title.trim());
      if (citation.trim()) form.append("citation", citation.trim());
      form.append("domains", domains.join(","));

      const token = getNativeToken();
      const res = await fetch(resolveApiUrl("/api/admin/knowledge-sources"), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.message || "Upload failed");
        return;
      }
      if (body.looksScanned) {
        // Not a failure. The file is stored and the source exists; it is
        // waiting on a transcription pass the admin starts from the list.
        toast.info(body.message, { duration: 15000 });
      } else {
        toast.success(`Ingested ${body.passageCount} passage(s) from ${body.pageCount} pages.`);
      }
      setTitle("");
      setCitation("");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-sources"] });
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setUploading(false);
    }
  }

  const deleteSource = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/knowledge-sources/${id}`),
    onSuccess: () => {
      toast.success("Source and all of its passages removed.");
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-sources"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-conflicts"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete"),
  });

  const transcribe = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/knowledge-sources/${id}/transcribe`),
    onSuccess: () => {
      toast.info(
        "Reading the pages. This runs in the background and takes a while for a long book; " +
          "progress shows on the source below.",
        { duration: 10000 },
      );
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-sources"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not start transcription"),
  });

  const detect = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/admin/knowledge-sources/${id}/detect-conflicts`),
    onSuccess: async (res) => {
      const body = await res.json();
      toast.success(
        `Checked ${body.checked} passage(s) with a close match; found ${body.found} conflict(s).`,
      );
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-conflicts"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not run detection"),
  });

  return (
    <AppShell title="Knowledge Base">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload a source
            </CardTitle>
            <CardDescription>
              A PDF of a book, manual or handout. The text is extracted on our own server and split
              into passages that keep their page numbers, so anything the AI takes from it can cite
              where it came from. Scanned pages are reported rather than silently ingested as blanks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="kb-title">Title</Label>
              <Input
                id="kb-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="NSCA CSCS Volume 4"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kb-citation">How it should be cited (optional)</Label>
              <Input
                id="kb-citation"
                value={citation}
                onChange={(e) => setCitation(e.target.value)}
                placeholder="NSCA, Essentials of Strength Training, 4th ed."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Which assistants may use it</Label>
              <div className="grid grid-cols-2 gap-2">
                {DOMAINS.map((d) => (
                  <label key={d.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={domains.includes(d.key)}
                      onCheckedChange={(c) =>
                        setDomains((prev) =>
                          c === true ? [...prev, d.key] : prev.filter((x) => x !== d.key),
                        )
                      }
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kb-file">PDF</Label>
              <Input
                id="kb-file"
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button
              onClick={upload}
              disabled={uploading || !file || !title.trim() || domains.length === 0}
            >
              {uploading ? "Extracting…" : "Upload and ingest"}
            </Button>
          </CardContent>
        </Card>

        {conflicts.length > 0 && (
          <Card className="border-amber-500/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-500">
                <AlertTriangle className="h-5 w-5" />
                {conflicts.length} contradiction{conflicts.length === 1 ? "" : "s"} to rule on
              </CardTitle>
              <CardDescription>
                Two sources disagree. Nothing picks a winner until you do, and until then the AI is
                told the guidance here is contested rather than quietly choosing one.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {conflicts.map((c) => (
                <ConflictRow key={c.id} conflict={c} />
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search what has been ingested
            </CardTitle>
            <CardDescription>
              The same search the assistants use. Worth running before you trust a source to answer
              something.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="hamstring strain return to play"
                onKeyDown={(e) => e.key === "Enter" && searchText.trim() && runSearch()}
              />
              <Button onClick={() => runSearch()} disabled={!searchText.trim()}>
                Search
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {DOMAINS.map((d) => (
                <label key={d.key} className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={searchDomains.includes(d.key)}
                    onCheckedChange={(c) =>
                      setSearchDomains((prev) =>
                        c === true ? [...prev, d.key] : prev.filter((x) => x !== d.key),
                      )
                    }
                  />
                  {d.label}
                </label>
              ))}
            </div>
            {searchHits?.map((hit: any) => (
              <div key={hit.passageId} className="rounded-md border border-border px-3 py-2">
                <p className="text-xs font-bold text-muted-foreground">
                  {hit.citation || hit.sourceTitle}, p. {hit.pageNumber}
                </p>
                <p className="mt-1 text-sm">{hit.text.slice(0, 400)}…</p>
              </div>
            ))}
            {searchHits && searchHits.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing matched. Try the words the book itself would use.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Sources
            </CardTitle>
            <CardDescription>
              Deleting a source removes every passage taken from it and the stored file. That is the
              clean undo for a bad ingest or a licence that lapsed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing ingested yet.</p>
            ) : (
              sources.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-start gap-3 rounded-md border px-3 py-2",
                    s.status === "needs_vision" || s.status === "transcribing"
                      ? "border-amber-500/50"
                      : "border-border",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.pageCount ?? 0} pages, {s.passageCount} passages,{" "}
                      {s.domains.join(", ") || "no assistants"} —{" "}
                      {format(new Date(s.createdAt), "MMM d, yyyy")}
                    </p>
                    {s.status === "needs_vision" && (
                      <p className="text-xs text-amber-500">
                        {s.statusDetail ??
                          "No readable text was found. These pages are images, so Claude has to read them."}
                      </p>
                    )}
                    {s.status === "transcribing" && (
                      <p className="text-xs text-amber-500">
                        Reading the pages. {s.statusDetail ?? ""}
                      </p>
                    )}
                    {s.status === "ready" && s.statusDetail && (
                      <p className="text-xs text-muted-foreground">{s.statusDetail}</p>
                    )}
                  </div>
                  {s.status === "needs_vision" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => transcribe.mutate(s.id)}
                      disabled={transcribe.isPending}
                    >
                      <ScanText className="mr-1.5 h-4 w-4" />
                      Read the pages
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => detect.mutate(s.id)}
                    disabled={detect.isPending || s.status !== "ready"}
                  >
                    Check for conflicts
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteSource.mutate(s.id)}
                    disabled={deleteSource.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function ConflictRow({ conflict }: { conflict: Conflict }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [scopeSports, setScopeSports] = useState("");

  const resolve = useMutation({
    mutationFn: (input: { status: string; reason?: string; scope?: Record<string, string[]> }) =>
      apiRequest("POST", `/api/admin/knowledge-conflicts/${conflict.id}/resolve`, input),
    onSuccess: () => {
      toast.success("Ruling recorded.");
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-conflicts"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not record that"),
  });

  const cite = (p: Conflict["passage"]) =>
    p ? `${p.citation || p.sourceTitle}, p. ${p.pageNumber}` : "unknown source";

  return (
    <div className="space-y-2 rounded-md border border-border px-3 py-2">
      <p className="text-sm">{conflict.summary}</p>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-md bg-muted/40 p-2">
          <p className="text-xs font-bold text-muted-foreground">{cite(conflict.passage)}</p>
          <p className="mt-1 text-xs">{conflict.passage?.text.slice(0, 300)}…</p>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <p className="text-xs font-bold text-muted-foreground">{cite(conflict.otherPassage)}</p>
          <p className="mt-1 text-xs">{conflict.otherPassage?.text.slice(0, 300)}…</p>
        </div>
      </div>

      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Why, in your own words. A coach who asks about this guidance is shown this."
      />
      <Input
        value={scopeSports}
        onChange={(e) => setScopeSports(e.target.value)}
        placeholder="Sports the first source wins for, comma separated (for a scoped ruling)"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() =>
            resolve.mutate({
              status: "scoped",
              reason,
              scope: {
                sports: scopeSports
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
            })
          }
          disabled={resolve.isPending || !reason.trim() || !scopeSports.trim()}
        >
          Both true, scoped
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => resolve.mutate({ status: "prefer_new", reason })}
          disabled={resolve.isPending}
        >
          Prefer the first
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => resolve.mutate({ status: "prefer_existing", reason })}
          disabled={resolve.isPending}
        >
          Prefer the second
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => resolve.mutate({ status: "dismissed", reason })}
          disabled={resolve.isPending}
        >
          Not a conflict
        </Button>
      </div>
    </div>
  );
}
