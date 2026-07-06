import { AuthGate } from "@/components/AuthGate";
import MasterAdmin from "@/components/MasterAdmin";

export default function MasterVendorRulesPage() {
  return (
    <AuthGate allowedRoles={["admin"]}>
      <MasterAdmin section="rules" />
    </AuthGate>
  );
}
