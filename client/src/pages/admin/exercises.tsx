import { ExerciseBankPage } from "@/pages/exercise-bank";
import { useT } from "@/i18n";

export default function AdminExercises() {
  const t = useT();
  return (
    <ExerciseBankPage
      apiBase="/api/admin"
      routeBase="/admin/exercises"
      title={t("Forge Library")}
      emptyStateText={t("The Forge library is empty. Add the first official exercise for every coach to use.")}
    />
  );
}
