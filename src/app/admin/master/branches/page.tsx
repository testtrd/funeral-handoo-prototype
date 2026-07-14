import { AuthGate } from "@/components/AuthGate";
import MasterAdmin from "@/components/MasterAdmin";

export default function MasterBranchesPage() {
  return (
    <AuthGate allowedRoles={["master"]}>
      <MasterAdmin section="branches" />
    </AuthGate>
  );
}
