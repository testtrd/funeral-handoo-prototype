import { AuthGate } from "@/components/AuthGate";
import { ReportPreview } from "@/components/ReportPreview";

export default function ReportPreviewPage() {
  return (
    <AuthGate allowedRoles={["master", "planning", "manager", "staff"]}>
      <ReportPreview />
    </AuthGate>
  );
}
