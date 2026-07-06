import { AuthGate } from "@/components/AuthGate";
import MasterAdmin from "@/components/MasterAdmin";

export default function MasterPage() {
  return (
    <AuthGate allowedRoles={["admin"]}>
      <MasterAdmin section="overview" />
    </AuthGate>
  );
}
