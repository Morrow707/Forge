import { useEffect, useState } from "react";
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
import { KNOWLEDGE_DOMAINS } from "@shared/knowledge-domains";
import { toast } from "sonner";
import { format } from "date-fns";
import { Upload, Trash2, Search, AlertTriangle, BookOpen, ScanText } from "lucide-react";

// The assistants a source can serve. A source can carry several: an energy
// availability chapter is honestly both nutrition and strength, and forcing
// one tag would hide it from whichever assistant lost the coin toss.

type Source = {
  id: number;
  title: string;
  citation: string | null;
  pageCount: number | null;
  status: "extracting" | "ready" | "failed" | "needs_vision" | "transcribing";
  statusDetail: string | null;
  licenceNote: string | null;
  transcribedThroughPage: number | null;
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

/**
 * The full knowledge base, without the page chrome.
 *
 * Exported separately so Teach AI can host it as a tab. An admin looking for
 * "how do I teach the AI from a book" goes to Teach AI -- that is what the
 * screen is called -- and a PDF upload living only on its own page in the
 * More menu is one nobody finds. Same component in both places rather than
 * two that drift.
 */
export function KnowledgeBaseContent() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [citation, setCitation] = useState("");
  const [licenceNote, setLicenceNote] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchDomains, setSearchDomains] = useState<string[]>(["strength"]);
  const [transcribeTarget, setTranscribeTarget] = useState<Source | null>(null);

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
      if (licenceNote.trim()) form.append("licenceNote", licenceNote.trim());
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
      setLicenceNote("");
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
    mutationFn: (input: { id: number; fromPage?: number; toPage?: number; restart?: boolean }) =>
      apiRequest("POST", `/api/admin/knowledge-sources/${input.id}/transcribe`, {
        fromPage: input.fromPage,
        toPage: input.toPage,
        restart: input.restart,
      }),
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
    <>
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
                {KNOWLEDGE_DOMAINS.map((d) => (
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
              <Label htmlFor="kb-licence">What may Forge do with this? (optional)</Label>
              <Input
                id="kb-licence"
                value={licenceNote}
                onChange={(e) => setLicenceNote(e.target.value)}
                placeholder="e.g. purchased copy, internal use only"
              />
              <p className="text-xs text-muted-foreground">
                Nothing computes on this. It is here for the day somebody asks whether a passage
                from this source may be quoted to a customer's coach, or included in something
                sold to an outside party.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kb-file">PDF</Label>
              {/* Both the MIME type and the extension. iOS decides which
                  sources to offer from `accept`, and some versions of the
                  document picker match on extension rather than MIME -- with
                  the type alone a PDF sitting in Files could appear greyed
                  out. Listing both keeps Files, iCloud and Dropbox
                  selectable. */}
              <Input
                id="kb-file"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                On a phone this opens the document picker -- choose Browse or Files to reach a PDF
                saved on the device. Up to 60MB.
              </p>
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
              {KNOWLEDGE_DOMAINS.map((d) => (
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
              <SearchHit key={hit.passageId} hit={hit} />
            ))}
            {searchHits && searchHits.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing matched. Try the words the book itself would use.
              </p>
            )}
          </CardContent>
        </Card>

        <CoverageCard />

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
                      onClick={() => setTranscribeTarget(s)}
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

        <TranscribeDialog
          source={transcribeTarget}
          onClose={() => setTranscribeTarget(null)}
          onStart={(input) => {
            transcribe.mutate({ id: transcribeTarget!.id, ...input });
            setTranscribeTarget(null);
          }}
        />
      </div>
    </>
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

/**
 * What the library actually covers.
 *
 * An assistant with an empty shelf answers exactly like one with a good
 * library -- both produce fluent text, and only one is grounded. This table
 * is the only place that difference is visible.
 *
 * Passages rather than sources, because one pamphlet and one textbook are
 * both "1 source" and are nothing alike.
 */
function CoverageCard() {
  const { data: coverage = [] } = useQuery<
    { domain: string; label: string; sources: number; passages: number; fromVision: number }[]
  >({
    queryKey: ["/api/admin/knowledge-coverage"],
    queryFn: () => getJson("/api/admin/knowledge-coverage"),
  });

  const empty = coverage.filter((c) => c.passages === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coverage</CardTitle>
        <CardDescription>
          Which assistants have something behind them. An assistant with nothing still answers;
          it just answers from general knowledge with nothing to cite.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Area</th>
                <th className="py-2 pr-4 text-right font-medium">Sources</th>
                <th className="py-2 pr-4 text-right font-medium">Passages</th>
                <th className="py-2 text-right font-medium">Transcribed</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {coverage.map((c) => (
                <tr key={c.domain} className="border-b last:border-0">
                  <td className="py-2 pr-4">{c.label}</td>
                  <td className="py-2 pr-4 text-right">{c.sources}</td>
                  <td
                    className={cn(
                      "py-2 pr-4 text-right",
                      c.passages === 0 && "text-amber-500",
                    )}
                  >
                    {c.passages}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">{c.fromVision}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {empty.length > 0 && (
          <p className="text-xs text-amber-500">
            Nothing behind {empty.map((c) => c.label).join(", ")}. Those assistants are running
            on general knowledge alone.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Transcribed passages were read off a page image rather than extracted as text. Treat
          their numbers as unverified until somebody has checked them against the page.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Confirms a transcription pass, with what it will cost.
 *
 * The estimate is the whole point of this dialog. A 400-page scan is 400
 * model calls, and without a number in front of them an admin finds out
 * what it cost from a bill. The page range is here for the same reason:
 * skipping the index and the reference list is usually the largest single
 * saving available on a real textbook.
 */
function TranscribeDialog({
  source,
  onClose,
  onStart,
}: {
  source: Source | null;
  onClose: () => void;
  onStart: (input: { fromPage?: number; toPage?: number; restart?: boolean }) => void;
}) {
  const [fromPage, setFromPage] = useState("");
  const [toPage, setToPage] = useState("");

  const resumable = (source?.transcribedThroughPage ?? 0) > 0;

  const { data: estimate } = useQuery<{
    pages: number;
    alreadyDone: number;
    model: string;
    estimatedUsd: number | null;
  }>({
    queryKey: ["transcribe-estimate", source?.id, fromPage, toPage],
    enabled: !!source,
    queryFn: () => {
      const params = new URLSearchParams();
      if (fromPage) params.set("fromPage", fromPage);
      if (toPage) params.set("toPage", toPage);
      return getJson(
        `/api/admin/knowledge-sources/${source!.id}/transcribe-estimate?${params.toString()}`,
      );
    },
  });

  if (!source) return null;

  return (
    <Card className="border-primary/50">
      <CardHeader>
        <CardTitle className="text-base">Read the pages of "{source.title}"</CardTitle>
        <CardDescription>
          Claude reads each page as an image and transcribes it. This runs in the background and
          takes a while for a long book.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="kb-from">First page</Label>
            <Input
              id="kb-from"
              inputMode="numeric"
              value={fromPage}
              onChange={(e) => setFromPage(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-to">Last page</Label>
            <Input
              id="kb-to"
              inputMode="numeric"
              value={toPage}
              onChange={(e) => setToPage(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={String(source.pageCount ?? "")}
            />
          </div>
        </div>

        <PagePicker
          sourceId={source.id}
          pageCount={source.pageCount ?? 0}
          fromPage={fromPage ? Number(fromPage) : 1}
          toPage={toPage ? Number(toPage) : (source.pageCount ?? 1)}
          onPick={(page, edge) => {
            if (edge === "start") setFromPage(String(page));
            else setToPage(String(page));
          }}
        />

        <p className="text-xs text-muted-foreground">
          Skipping the index, the front matter and the reference list is usually the biggest
          saving on a textbook. Nothing is lost by leaving them out; they answer no questions.
        </p>

        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Estimated cost</p>
          <p className="text-2xl font-semibold tabular-nums">
            {estimate?.estimatedUsd != null ? `$${estimate.estimatedUsd.toFixed(2)}` : "--"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {estimate?.pages ?? 0} page(s) on {estimate?.model ?? "the cheap model"}. An estimate,
            not a quote: a page's real cost depends on how dense it is.
          </p>
        </div>

        {resumable && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
            This source already has {source.transcribedThroughPage} page(s) read. Starting again
            carries on from there rather than paying for them twice.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              onStart({
                fromPage: fromPage ? Number(fromPage) : undefined,
                toPage: toPage ? Number(toPage) : undefined,
              })
            }
          >
            {resumable ? "Carry on reading" : "Start reading"}
          </Button>
          {resumable && (
            <Button
              variant="outline"
              onClick={() =>
                onStart({
                  fromPage: fromPage ? Number(fromPage) : undefined,
                  toPage: toPage ? Number(toPage) : undefined,
                  restart: true,
                })
              }
            >
              Start over (pays again)
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * One search result, correctable in place.
 *
 * The edit lives here rather than on a separate screen because this is the
 * only place an admin actually reads a passage. A transcription that misread
 * a load is spotted while searching for that load, and the fix has to be one
 * click away from the moment of noticing -- otherwise it becomes a note that
 * never gets actioned.
 *
 * Correcting also clears the "transcribed from an image" flag, because a
 * person has now read it against the page. That flag is what makes the
 * assistant tell readers to verify the numbers, and leaving it on a passage
 * somebody has checked trains people to ignore the warning.
 */
function SearchHit({ hit }: { hit: any }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState<string>(hit.text ?? "");

  const save = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/admin/knowledge-passages/${hit.passageId}`, {
        text: text.trim(),
        fromVision: false,
      }),
    onSuccess: () => {
      toast.success("Passage corrected. It is re-indexed straight away.");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["knowledge-search"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save that"),
  });

  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-bold text-muted-foreground">
          {hit.citation || hit.sourceTitle}, p. {hit.pageNumber}
          {hit.fromVision && (
            <span className="ml-2 font-normal text-amber-500">read from an image</span>
          )}
        </p>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Correct this
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Fixes the passage in place and re-indexes it. Use this for a misread number or a chunk
            that split mid-table -- to remove content, delete the source.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !text.trim()}>
              {save.isPending ? "Saving..." : "Save correction"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(hit.text ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm">{String(hit.text ?? "").slice(0, 400)}…</p>
      )}
    </div>
  );
}

/** The standalone page, for the direct link and the More menu. */
export default function AdminKnowledgeBase() {
  return (
    <AppShell title="Knowledge Base">
      <KnowledgeBaseContent />
    </AppShell>
  );
}

/**
 * The page picker, the way a print dialog does it: look at the pages, pick
 * the range.
 *
 * Typing two numbers into a 400-page scan is guesswork -- an admin has no
 * idea whether the index starts at term 380 or 412, so they either transcribe
 * the whole thing or guess and cut real content. Seeing the pages removes the
 * guess.
 *
 * WHAT THE THUMBNAILS ACTUALLY ARE
 *
 * The exact image the transcription pass reads, not a separate rendering.
 * A preview drawn another way could look perfectly readable while the real
 * pass saw nothing, which would make the picker worse than useless: somebody
 * would select forty pages of plates and pay for forty empty transcriptions.
 * A page that shows "nothing to read" here is a page the pass would also
 * find empty, and that is information worth having before you pay.
 *
 * Loaded a window at a time. A 400-page book is 400 image extractions and
 * nobody scrolls all of them; the strip pages through in blocks so the cost
 * matches what is actually being looked at.
 */
const WINDOW = 12;

function PagePicker({
  sourceId,
  pageCount,
  fromPage,
  toPage,
  onPick,
}: {
  sourceId: number;
  pageCount: number;
  fromPage: number;
  toPage: number;
  onPick: (page: number, edge: "start" | "end") => void;
}) {
  const [windowStart, setWindowStart] = useState(1);
  // Two-tap selection, and which tap comes next is explicit rather than
  // inferred from where the page sits relative to the current range. The
  // first attempt guessed, and guessing produced a control where the same
  // tap on the same tile did different things depending on state nobody
  // could see.
  const [nextEdge, setNextEdge] = useState<"start" | "end">("start");

  if (pageCount <= 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No page count on file for this source, so there is nothing to preview. The range boxes
        above still work.
      </p>
    );
  }

  const last = Math.min(pageCount, windowStart + WINDOW - 1);
  const pages = Array.from({ length: last - windowStart + 1 }, (_, i) => windowStart + i);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Pages {windowStart}–{last} of {pageCount}. Next tap sets the{" "}
          <span className="font-semibold text-foreground">
            {nextEdge === "start" ? "first" : "last"}
          </span>{" "}
          page.
        </p>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={windowStart <= 1}
            onClick={() => setWindowStart(Math.max(1, windowStart - WINDOW))}
          >
            Back
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={last >= pageCount}
            onClick={() => setWindowStart(Math.min(pageCount, windowStart + WINDOW))}
          >
            Forward
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {pages.map((page) => {
          const inRange = page >= fromPage && page <= toPage;
          return (
            <button
              key={page}
              type="button"
              onClick={() => {
                onPick(page, nextEdge);
                setNextEdge(nextEdge === "start" ? "end" : "start");
              }}
              className={cn(
                "group relative overflow-hidden rounded-md border transition-colors",
                inRange ? "border-primary" : "border-border opacity-50 hover:opacity-100",
              )}
              title={`Page ${page}`}
            >
              <PagePreview sourceId={sourceId} page={page} />
              <span
                className={cn(
                  "absolute bottom-0 left-0 right-0 bg-background/80 py-0.5 text-center text-[10px] font-semibold",
                  inRange ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {page}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        A blank tile is a page with nothing the reader can pick up -- it would transcribe to
        nothing, so it is worth leaving out of the range.
      </p>
    </div>
  );
}

/**
 * One page thumbnail.
 *
 * Fetched rather than set as an <img src>, because in the native app the
 * session is a bearer token and an img tag cannot send a header -- every
 * thumbnail would have come back 401 on a phone, which is the one place this
 * picker matters most. The fetch goes through the same helper the rest of
 * the app uses, so it carries the token on native and the cookie on web.
 *
 * A 204 means the page holds nothing the reader can pick up. Rendered as an
 * explicit "nothing to read" rather than a broken image, because that is a
 * real answer about the page and worth seeing before paying to transcribe
 * it.
 */
function PagePreview({ sourceId, page }: { sourceId: number; page: number }) {
  const [state, setState] = useState<"loading" | "empty" | "error">("loading");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const token = getNativeToken();
        const res = await fetch(
          resolveApiUrl(`/api/admin/knowledge-sources/${sourceId}/page-preview/${page}`),
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            credentials: "include",
          },
        );
        if (cancelled) return;
        if (res.status === 204) {
          setState("empty");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        objectUrl = URL.createObjectURL(await res.blob());
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
      // Revoked on unmount, or scrolling a 400-page book leaks a blob per
      // page for the life of the session.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sourceId, page]);

  if (url) {
    return <img src={url} alt={`Page ${page}`} className="aspect-[3/4] w-full bg-muted object-cover" />;
  }

  return (
    <div className="flex aspect-[3/4] w-full items-center justify-center bg-muted px-1 text-center text-[9px] leading-tight text-muted-foreground">
      {state === "loading" ? "…" : state === "empty" ? "nothing to read" : "couldn't load"}
    </div>
  );
}
