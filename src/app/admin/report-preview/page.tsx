import { AuthGate } from "@/components/AuthGate";
import { ReportPreview } from "@/components/ReportPreview";

export default function ReportPreviewPage() {
  return (
    <AuthGate allowedRoles={["admin", "office", "driver"]}>
      <ReportPreview />
    </AuthGate>
  );
}
