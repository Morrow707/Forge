import { AppShell } from "@/components/app-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReviewQueueContent } from "./review-queue";
import { ProblemReportsContent } from "./problem-reports";
import { useT } from "@/i18n";

/** One page for both admin report inboxes -- previously two separate nav
 * entries. They're unrelated functions kept fully separate as tabs, not
 * merged: Review Queue is exercise-catalog moderation (always tied to one
 * exercise record, with a real approve/resolve workflow); Problem Reports
 * is a general, not-tied-to-anything bug inbox from the account menu. The
 * only thing they share is "an admin needs to look at reported things,"
 * which is exactly why having two nav entries for it was confusing. */
export default function AdminReports() {
  const t = useT();
  return (
    <AppShell title={t("Reports")}>
      <Tabs defaultValue="review-queue">
        <TabsList>
          <TabsTrigger value="review-queue">{t("Review Queue")}</TabsTrigger>
          <TabsTrigger value="problem-reports">{t("Problem Reports")}</TabsTrigger>
        </TabsList>

        <TabsContent value="review-queue">
          <ReviewQueueContent />
        </TabsContent>

        <TabsContent value="problem-reports">
          <ProblemReportsContent />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
