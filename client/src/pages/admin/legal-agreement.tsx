import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { DownloadButton } from "@/components/download-button";
import { toast } from "sonner";
import { Save, ShieldAlert } from "lucide-react";

/** Plain direct-edit admin page for the clickwrap agreement every new
 * coach/athlete accepts at signup (see client/src/pages/signup.tsx and
 * server/auth.ts's snapshot-at-signup logic) -- unlike Teach AI/Teach
 * Nutrition AI, there's no propose-then-review chat here, since this is a
 * legal document an admin writes/pastes themselves rather than something an
 * AI drafts. Saving only changes what FUTURE signups see; every existing
 * user's own acceptance record (agreedToTermsText on their user row) is a
 * frozen snapshot of whatever text was live when they signed up, untouched
 * by later edits here. */
export default function AdminLegalAgreement() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ content: string }>({
    queryKey: ["/api/legal-agreement"],
  });
  const [content, setContent] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (data && !hydrated) {
      setContent(data.content);
      setHydrated(true);
    }
  }, [data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/admin/legal-agreement", { content });
      return res.json() as Promise<{ content: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/legal-agreement"] });
      toast.success("Agreement updated -- new signups will see this text");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save"),
  });

  return (
    <AppShell title="Legal Agreement">
      <Card>
        <CardHeader>
          <CardTitle>Signup Agreement</CardTitle>
          <CardDescription>
            Shown to every coach/athlete on the signup page -- they must check a box agreeing to
            this exact text before an account is created. Editing it only affects signups from now
            on; nobody who already agreed sees their own record change.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            This is stored and shown as plain text, exactly as typed here -- Forge doesn't provide
            legal review. Have this reviewed before relying on it.
          </p>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isLoading}
            rows={18}
            className="font-mono text-sm"
            placeholder="Loading…"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !content.trim() || isLoading}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
            <DownloadButton
              url="/api/admin/legal-agreement.pdf"
              filename="forge-signup-agreement.pdf"
              shareTitle="Forge Signup Agreement"
              label="Print / Download PDF"
            />
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
