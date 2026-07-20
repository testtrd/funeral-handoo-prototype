import { AuthGate } from "@/components/AuthGate";
import MasterAdmin from "@/components/MasterAdmin";

export default function OperationVendorRulesPage() {
  return (
    <AuthGate allowedRoles={["master", "planning", "manager"]}>
      <MasterAdmin section="rules" operationsMode />
    </AuthGate>
  );
}
