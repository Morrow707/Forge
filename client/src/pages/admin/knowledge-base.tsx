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
  progressDone: number | null;
  progressTotal: number | null;
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
  const [readingSource, setReadingSource] = useState<Source | null>(null);

  const { data: sources = [] } = useQuery<Source[]>({
    queryKey: ["/api/admin/knowledge-sources"],
    queryFn: () => getJson("/api/admin/knowledge-sources"),
    // A transcription pass writes its progress to the source row, so the
    // list has to re-read to show it moving. Polled only while something is
    // actually running -- an idle knowledge base should not poll at all.
    // Polled while EITHER long phase runs. Filing passages was left out the
    // first time, so a textbook ingest showed a frozen row for several
    // minutes -- indistinguishable from a stuck one.
    refetchInterval: (query) =>
      (query.state.data ?? []).some(
        (s) => s.status === "transcribing" || s.status === "extracting",
      )
        ? 3000
        : false,
  });

  const anyJobRunning = sources.some(
    (s) => s.status === "transcribing" || s.status === "extracting",
  );

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

  async function upload(replace = false) {
    if (!file || !title.trim() || domains.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title.trim());
      if (citation.trim()) form.append("citation", citation.trim());
      if (licenceNote.trim()) form.append("licenceNote", licenceNote.trim());
      if (replace) form.append("replace", "true");
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
        // The way out of "already ingested" is one tap, not something to go
        // and find. Somebody re-uploading the same book almost always does
        // it because the first ingest came out wrong, and a bare refusal
        // leaves them stuck with the bad copy.
        if (body.canReplace) {
          toast.error(body.message, {
            duration: 20000,
            action: {
              label: "Replace it",
              onClick: () => void upload(true),
            },
          });
          return;
        }
        toast.error(body.message || "Upload failed");
        return;
      }
      // Nothing has been read yet at this point -- the reply comes back as
      // soon as the file is stored, and whether the book is text or a scan
      // is not known until extraction runs. The source row says which, a
      // moment later, on the screen the admin is already looking at.
      toast.success(body.message ?? "Uploaded.", { duration: 10000 });
      setTitle("");
      setCitation("");
      setLicenceNote("");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-sources"] });
      // Coverage reads the same passages and was drifting out of step after
      // a replace -- the table kept showing the old book's numbers next to
      // the new book's row.
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-coverage"] });
    } catch {
      // A thrown fetch on this screen is almost always the upload itself
      // being cut off rather than the server being down -- a 50MB book over
      // a phone connection. Saying "could not reach the server" sends
      // somebody to check a server that is fine, so the message names the
      // likelier cause and the thing to do about it.
      toast.error(
        "The upload did not finish. This is usually the connection dropping partway through a " +
          "large file -- check the list below in case it arrived, then try again on wifi.",
        { duration: 15000 },
      );
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-sources"] });
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
    onSuccess: () => {
      // Started, not finished. The sweep is one model call per passage with
      // a close neighbour, so on a textbook it runs for minutes; claiming a
      // count here would be inventing one.
      toast.info(
        "Checking for contradictions. This runs in the background and takes a while on a big " +
          "book -- anything it finds appears in the queue above.",
        { duration: 10000 },
      );
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-sources"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-conflicts"] });
    },
    onError: (err: ApiError) => {
      toast.error(err.message || "Could not run detection");
      // A stale row is the usual cause -- the source was replaced or deleted
      // and the screen still showed it. Refresh so the next tap is not the
      // same failure.
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-sources"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-coverage"] });
    },
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
              onClick={() => void upload()}
              disabled={uploading || !file || !title.trim() || domains.length === 0}
            >
              {/* "Uploading and reading" rather than "Extracting", because
                  this phase is now only the upload plus a local text extract
                  -- the long part (filing passages) happens after the
                  response and reports its own progress on the source below.
                  A button that names a phase it is no longer in is how
                  somebody concludes the app has hung. */}
              {uploading ? "Uploading and reading…" : "Upload and ingest"}
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
                    // Wraps on a phone. The actions were laid out beside the title as an
                    // unwrapping row, so on a narrow screen they took the width and squeezed the
                    // details column to about one word: "752 / pages, / 1920 / passages," down
                    // the left edge, with the buttons stacked and unreadable beside it.
                    "flex flex-wrap items-start gap-3 rounded-md border px-3 py-2",
                    s.status === "needs_vision" || s.status === "transcribing"
                      ? "border-amber-500/50"
                      : "border-border",
                  )}
                >
                  <div className="min-w-[14rem] flex-1">
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
                    {(s.status === "transcribing" || s.status === "extracting") && (
                      <IngestProgress source={s} />
                    )}
                    {s.status === "ready" && s.statusDetail && (
                      <p className="text-xs text-muted-foreground">{s.statusDetail}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReadingSource(s)}
                    disabled={s.passageCount === 0}
                  >
                    <BookOpen className="mr-1.5 h-4 w-4" />
                    Read
                  </Button>
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

        {readingSource && (
          <SourceReader source={readingSource} onClose={() => setReadingSource(null)} />
        )}

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
    // Follows an ingest as it fills, so the table climbs alongside the bar
    // rather than sitting on the previous book's numbers until a reload.
    refetchInterval: 5000,
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

/**
 * How far a long job has got, as a bar and a count.
 *
 * The button said "Extracting..." and nothing else for the whole run. On a
 * real textbook that is several minutes of silence, which reads exactly like
 * a hang -- and the natural response to a hang is to reload or upload again,
 * both of which make it worse.
 *
 * Counts as well as a percentage, because "1,240 of 1,800" answers the
 * question somebody watching actually has: how much is left, and is it
 * moving. A percentage alone moves too slowly on a long run to look alive.
 */
function IngestProgress({ source }: { source: Source }) {
  const done = source.progressDone ?? 0;
  const total = source.progressTotal ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
  const reading = source.status === "transcribing";

  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-amber-500">
        <span>{reading ? "Reading the pages" : "Filing passages by subject"}</span>
        {pct != null && <span className="font-semibold tabular-nums">{pct}%</span>}
        {total > 0 && (
          <span className="tabular-nums text-muted-foreground">
            {done.toLocaleString()} of {total.toLocaleString()} {reading ? "pages" : "passages"}
          </span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full bg-amber-500 transition-all duration-500",
            // No total yet means the job has started but has not counted its
            // work. A pulsing full-width bar says "working" without claiming
            // a progress figure nobody has computed.
            pct == null && "w-full animate-pulse",
          )}
          style={pct != null ? { width: `${pct}%` } : undefined}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        This runs on the server -- you can leave this screen and come back.
      </p>
    </div>
  );
}

/**
 * Reading what actually came out of a book, and dropping the parts that
 * should not have.
 *
 * Which pages are a foreword, an index or a bibliography is not knowable at
 * upload time -- you can only judge it after seeing the text. Before this
 * the only remedy was deleting the whole book and paying to ingest it again.
 *
 * The page map comes first because it answers the question at a glance. Real
 * chapters produce dense passages; an index produces many tiny ones; front
 * matter produces almost nothing. The shape of that strip shows where the
 * body of the book starts and stops without reading a word of it.
 */
function SourceReader({ source, onClose }: { source: Source; onClose: () => void }) {
  const qc = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [gotoPage, setGotoPage] = useState("");
  const [fromPage, setFromPage] = useState("");
  const [toPage, setToPage] = useState("");
  const PAGE_SIZE = 25;

  const { data: pageMap = [] } = useQuery<
    { pageNumber: number; passages: number; characters: number }[]
  >({
    queryKey: ["knowledge-page-map", source.id],
    queryFn: () => getJson(`/api/admin/knowledge-sources/${source.id}/page-map`),
  });

  const { data: passages = [] } = useQuery<
    {
      id: number;
      pageNumber: number;
      endPageNumber: number;
      text: string;
      topics: string[];
      fromVision: boolean;
    }[]
  >({
    queryKey: ["knowledge-passages", source.id, offset],
    queryFn: () =>
      getJson(
        `/api/admin/knowledge-sources/${source.id}/passages?limit=${PAGE_SIZE}&offset=${offset}`,
      ),
  });

  const dropPages = useMutation({
    mutationFn: () =>
      apiRequest("DELETE", `/api/admin/knowledge-sources/${source.id}/pages`, {
        fromPage: Number(fromPage),
        toPage: Number(toPage),
      }),
    onSuccess: async (res) => {
      const body = await res.json();
      toast.success(`Removed ${body.removed} passage(s) from pages ${fromPage}-${toPage}.`);
      setFromPage("");
      setToPage("");
      qc.invalidateQueries({ queryKey: ["knowledge-page-map", source.id] });
      qc.invalidateQueries({ queryKey: ["knowledge-passages", source.id] });
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-sources"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-coverage"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't remove those pages"),
  });

  // Where a given page's passages start in the flat list the reader pages through.
  //
  // The reader opened at offset zero and stepped forward twenty-five passages at a time, which
  // on a 752-page textbook means the only thing anybody ever saw was the title page, the
  // copyright notice and the start of chapter one. Deciding that pages 1-8 are front matter
  // worth removing needs a way to look at page 400, and there wasn't one -- so the page strip
  // was a picture of the book that could not be opened, and the range remover asked for numbers
  // nothing on the screen could help anyone choose.
  //
  // The map is grouped by the page a passage STARTS on and every passage starts on exactly one
  // page, so a running total across it lands on that page's first passage exactly rather than
  // approximately.
  const offsetOfPage = (target: number) => {
    let total = 0;
    for (const p of pageMap) {
      if (p.pageNumber >= target) break;
      total += p.passages;
    }
    return total;
  };
  const jumpToPage = (target: number) => {
    setOffset(Math.max(0, Math.floor(offsetOfPage(target) / PAGE_SIZE) * PAGE_SIZE));
  };

  const canDrop = !!fromPage && !!toPage && Number(toPage) >= Number(fromPage);
  // Below this, a page produced so little that it is almost certainly an
  // index entry, a running header or a page of references rather than prose.
  const THIN_PAGE_CHARS = 400;

  return (
    <Card className="border-primary/50">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>What came out of "{source.title}"</span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </CardTitle>
        <CardDescription>
          {source.passageCount.toLocaleString()} passage(s), from{" "}
          {pageMap.length.toLocaleString()} page(s) that produced any text.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pages, by how much they produced
          </p>
          <div className="max-h-40 overflow-y-auto rounded-md border">
            <div className="flex flex-wrap gap-1 p-2">
              {pageMap.map((p) => (
                <button
                  type="button"
                  key={p.pageNumber}
                  onClick={() => jumpToPage(p.pageNumber)}
                  title={`Page ${p.pageNumber}: ${p.passages} passage(s), ${p.characters} characters -- tap to read it`}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] tabular-nums transition-colors",
                    p.characters < THIN_PAGE_CHARS
                      ? "bg-amber-500/20 text-amber-500 hover:bg-amber-500/40"
                      : "bg-muted text-muted-foreground hover:bg-muted-foreground/30",
                  )}
                >
                  {p.pageNumber}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Tap a page to read it. Amber pages produced very little text -- a run of them at the
            front or the back is usually front matter, an index or a bibliography.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="goto-page" className="text-xs">
                Go to page
              </Label>
              <Input
                id="goto-page"
                inputMode="numeric"
                value={gotoPage}
                onChange={(e) => setGotoPage(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-9 w-24"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!gotoPage}
              onClick={() => jumpToPage(Number(gotoPage))}
            >
              Go
            </Button>
          </div>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Remove a page range</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="drop-from" className="text-xs">
                From
              </Label>
              <Input
                id="drop-from"
                inputMode="numeric"
                value={fromPage}
                onChange={(e) => setFromPage(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-9 w-24"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="drop-to" className="text-xs">
                To
              </Label>
              <Input
                id="drop-to"
                inputMode="numeric"
                value={toPage}
                onChange={(e) => setToPage(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-9 w-24"
              />
            </div>
            <Button
              size="sm"
              variant="destructive"
              disabled={!canDrop || dropPages.isPending}
              onClick={() => dropPages.mutate()}
            >
              {dropPages.isPending ? "Removing..." : "Remove these pages"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Removes the passages from those pages and nothing else. The book stays, so you never
            pay to ingest it again. A passage straddling the boundary goes with them.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                The passages themselves
              </p>
              {/* Where in the book this is. Without it, twenty-five passages of front matter and
                  twenty-five from the middle of chapter nine look identical, and there is no way
                  to tell whether Forward is worth pressing four hundred more times. */}
              {passages.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Pages {passages[0].pageNumber}-{passages[passages.length - 1].endPageNumber} --
                  passage {(offset + 1).toLocaleString()} of{" "}
                  {source.passageCount.toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Back
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={passages.length < PAGE_SIZE}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Forward
              </Button>
            </div>
          </div>

          {passages.map((p) => (
            <div key={p.id} className="rounded-md border px-3 py-2">
              <p className="text-xs font-bold text-muted-foreground">
                p. {p.pageNumber}
                {p.endPageNumber !== p.pageNumber && `-${p.endPageNumber}`}
                {p.topics.length > 0 && (
                  <span className="ml-2 font-normal">{p.topics.join(", ")}</span>
                )}
                {p.fromVision && (
                  <span className="ml-2 font-normal text-amber-500">read from an image</span>
                )}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{p.text.slice(0, 600)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
