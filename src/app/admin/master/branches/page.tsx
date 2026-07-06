import { AuthGate } from "@/components/AuthGate";
import MasterAdmin from "@/components/MasterAdmin";

export default function MasterBranchesPage() {
  return (
    <AuthGate allowedRoles={["admin"]}>
      <MasterAdmin section="branches" />
    </AuthGate>
  );
}
