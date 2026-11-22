import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getJson, resolveApiUrl, getNativeToken } from "@/lib/queryClient";
import { ReadFailed } from "@/components/read-failed";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FileDown, ShieldCheck, AlertTriangle } from "lucide-react";
import { shareOrDownloadBlob } from "@/lib/share-file";
import { useT } from "@/i18n";

type ConsentCounts = { totalAthletes: number; consentedAthletes: number };

type ExportLogRow = {
  id: number;
  adminName: string;
  cohortDescription: string;
  filtersJson: string;
  cohortSize: number;
  consentedCount: number;
  recipient: string | null;
  createdAt: string;
};

/** The extract half of Cohort Explorer. Rendered as a section of that page rather than as its
 * own screen: Scott, on the two pages -- they have slight differences, but they do the same
 * thing. Kept as its own component and its own file because the code underneath genuinely is
 * separate (the mirror, the higher suppression floor, the PDF), and folding the markup into the
 * trends page would have hidden that rather than simplified it. */
export function ResearchExportsContent() {
  const t = useT();
  const qc = useQueryClient();
  const [cohortText, setCohortText] = useState("");
  const [recipient, setRecipient] = useState("");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);

  const { data: consent, isError: consentFailed, refetch: refetchConsent } = useQuery<ConsentCounts>({
    queryKey: ["/api/admin/research-consent"],
    queryFn: () => getJson("/api/admin/research-consent"),
  });

  const { data: log = [], isError: logFailed, refetch: refetchLog } = useQuery<ExportLogRow[]>({
    queryKey: ["/api/admin/research-exports"],
    queryFn: () => getJson("/api/admin/research-exports"),
  });

  // Downloaded through fetch rather than a plain link because this is a POST:
  // a URL that fully describes a dataset extract is a URL that ends up in
  // browser history, a proxy log, and a shared link.
  async function generate() {
    if (!cohortText.trim()) return;
    setGenerating(true);
    try {
      const token = getNativeToken();
      const res = await fetch(resolveApiUrl("/api/admin/research-export.pdf"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          text: cohortText.trim(),
          recipient: recipient.trim() || undefined,
          notes: notes
            .split("\n")
            .map((n) => n.trim())
            .filter(Boolean),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.message || t("Could not generate that extract."));
        return;
      }

      // shareOrDownloadBlob, not a hand-rolled <a download>: WKWebView has no
      // download manager and ignores the attribute, so inside the native app
      // the extract generated, was logged as an access, and then vanished --
      // the anchor was never even added to the document and the object URL was
      // revoked synchronously after the click. The shared helper writes the
      // file to disk and hands it to the share sheet on native, and does the
      // plain download on web.
      await shareOrDownloadBlob(await res.blob(), "forge-dataset-extract.pdf", "Forge dataset extract");
      toast.success(t("Extract generated and logged."));
      qc.invalidateQueries({ queryKey: ["/api/admin/research-exports"] });
    } catch {
      toast.error(t("Could not reach the server."));
    } finally {
      setGenerating(false);
    }
  }

  const consented = consent?.consentedAthletes ?? 0;
  const total = consent?.totalAthletes ?? 0;

  return (
      <div className="space-y-4">
        <Card className={cn(consented < 10 && "border-amber-500/50")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              {t("Who can be included")}
            </CardTitle>
            <CardDescription>
              {t("An extract is built only from athletes whose guardian or who themselves agreed to research use. Consent is off by default, so this number starts at zero and only grows by someone actively saying yes.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* A failed read renders 0 of 0 through the ?? fallbacks, which is both a
                consent figure and the "nothing can be reported" warning -- two claims
                about whether athletes agreed, made without asking anybody. */}
            {consentFailed ? (
              <ReadFailed
                what={t("the consent counts")}
                onRetry={() => void refetchConsent()}
                className="flex flex-col items-start gap-2 text-left"
              />
            ) : (
            <>
            <p className="font-display text-3xl font-bold">
              {consented}
              <span className="ml-2 text-base font-normal text-muted-foreground">
                {t("of {count} athletes", { count: total })}
              </span>
            </p>
            {consented < 10 && (
              <p className="mt-2 flex items-start gap-2 text-sm text-amber-500">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {t("Below 10 consenting athletes nothing can be reported at all, so no extract will generate until more people agree.")}
              </p>
            )}
            </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Generate an extract")}</CardTitle>
            <CardDescription>
              {t("Describe the cohort in plain English. The document contains group statistics only, and any figure describing fewer than 10 athletes is printed as suppressed rather than as a value.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cohort">{t("Cohort")}</Label>
              <Input
                id="cohort"
                value={cohortText}
                onChange={(e) => setCohortText(e.target.value)}
                placeholder={t("17 year old football athletes with hamstring injuries, vertical jump")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipient">{t("Prepared for (optional)")}</Label>
              <Input
                id="recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={t("Who is receiving this, for the export log")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">{t("Notes for the reader (optional, one per line)")}</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={t("Anything the recipient should know about this extract")}
              />
            </div>
            <Button onClick={generate} disabled={generating || !cohortText.trim()}>
              <FileDown className="h-4 w-4" />
              {generating ? t("Generating…") : t("Generate PDF")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Every extract ever generated")}</CardTitle>
            <CardDescription>
              {t("Written before each PDF is produced, so a document always has a record behind it. This is the answer to \"what did we send them, and when\".")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* This log is the record of what athlete data has left the organisation.
                "No extracts have been generated yet" off a failed read is the one wrong
                answer it can give. */}
            {logFailed ? (
              <ReadFailed
                what={t("the extract log")}
                onRetry={() => void refetchLog()}
                className="flex flex-col items-start gap-2 text-left"
              />
            ) : log.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No extracts have been generated yet.")}</p>
            ) : (
              log.map((row) => (
                <div key={row.id} className="rounded-md border border-border px-3 py-2">
                  <p className="text-sm">{row.cohortDescription}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("{when} by {name}", { when: t.date(row.createdAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }), name: row.adminName })}
                    {row.recipient ? ` — ${t("for {name}", { name: row.recipient })}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.plural(row.consentedCount, "{count} consenting athlete reported, {matched} matched the filters overall", "{count} consenting athletes reported, {matched} matched the filters overall", { matched: row.cohortSize })}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
  );
}
