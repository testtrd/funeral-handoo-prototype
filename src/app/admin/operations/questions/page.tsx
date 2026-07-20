import { AuthGate } from "@/components/AuthGate";
import MasterAdmin from "@/components/MasterAdmin";

export default function OperationQuestionsPage() {
  return (
    <AuthGate allowedRoles={["master", "planning", "manager"]}>
      <MasterAdmin section="questions" operationsMode />
    </AuthGate>
  );
}
