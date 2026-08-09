import { ClassBuilderPage } from "@/pages/class-builder";

export default function AdminClassBuilder() {
  return (
    <ClassBuilderPage
      apiBase="/api/admin"
      routeBase="/admin/classes"
      showPricing
      showEnroll={false}
    />
  );
}
