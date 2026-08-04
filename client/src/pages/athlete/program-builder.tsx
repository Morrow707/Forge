import { ProgramBuilderPage } from "@/pages/program-builder";

export default function AthleteProgramBuilder() {
  return (
    <ProgramBuilderPage
      apiBase="/api/athlete"
      routeBase="/athlete/programs"
      showAssign={false}
      showAiChat
    />
  );
}
