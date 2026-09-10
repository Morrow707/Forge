import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getJson, resolveApiUrl, getNativeToken } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { FileDown, ShieldCheck, AlertTriangle } from "lucide-react";

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
  const qc = useQueryClient();
  const [cohortText, setCohortText] = useState("");
  const [recipient, setRecipient] = useState("");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);

  const { data: consent } = useQuery<ConsentCounts>({
    queryKey: ["/api/admin/research-consent"],
    queryFn: () => getJson("/api/admin/research-consent"),
  });

  const { data: log = [] } = useQuery<ExportLogRow[]>({
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
        toast.error(body.message || "Could not generate that extract.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "forge-dataset-extract.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Extract generated and logged.");
      qc.invalidateQueries({ queryKey: ["/api/admin/research-exports"] });
    } catch {
      toast.error("Could not reach the server.");
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
              Who can be included
            </CardTitle>
            <CardDescription>
              An extract is built only from athletes whose guardian or who themselves agreed to
              research use. Consent is off by default, so this number starts at zero and only grows
              by someone actively saying yes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-bold">
              {consented}
              <span className="ml-2 text-base font-normal text-muted-foreground">
                of {total} athletes
              </span>
            </p>
            {consented < 10 && (
              <p className="mt-2 flex items-start gap-2 text-sm text-amber-500">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Below 10 consenting athletes nothing can be reported at all, so no extract will
                generate until more people agree.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generate an extract</CardTitle>
            <CardDescription>
              Describe the cohort in plain English. The document contains group statistics only, and
              any figure describing fewer than 10 athletes is printed as suppressed rather than as a
              value.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cohort">Cohort</Label>
              <Input
                id="cohort"
                value={cohortText}
                onChange={(e) => setCohortText(e.target.value)}
                placeholder="17 year old football athletes with hamstring injuries, vertical jump"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipient">Prepared for (optional)</Label>
              <Input
                id="recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Who is receiving this, for the export log"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes for the reader (optional, one per line)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anything the recipient should know about this extract"
              />
            </div>
            <Button onClick={generate} disabled={generating || !cohortText.trim()}>
              <FileDown className="h-4 w-4" />
              {generating ? "Generating…" : "Generate PDF"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Every extract ever generated</CardTitle>
            <CardDescription>
              Written before each PDF is produced, so a document always has a record behind it. This
              is the answer to "what did we send them, and when".
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {log.length === 0 ? (
              <p className="text-sm text-muted-foreground">No extracts have been generated yet.</p>
            ) : (
              log.map((row) => (
                <div key={row.id} className="rounded-md border border-border px-3 py-2">
                  <p className="text-sm">{row.cohortDescription}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(row.createdAt), "MMM d, yyyy h:mm a")} by {row.adminName}
                    {row.recipient ? ` — for ${row.recipient}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.consentedCount} consenting athlete{row.consentedCount === 1 ? "" : "s"}{" "}
                    reported, {row.cohortSize} matched the filters overall
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
  );
}
