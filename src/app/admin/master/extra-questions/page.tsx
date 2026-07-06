import { AuthGate } from "@/components/AuthGate";
import MasterAdmin from "@/components/MasterAdmin";

export default function MasterExtraQuestionsPage() {
  return (
    <AuthGate allowedRoles={["admin"]}>
      <MasterAdmin section="questions" />
    </AuthGate>
  );
}
