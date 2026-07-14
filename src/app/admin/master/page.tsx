import { AuthGate } from "@/components/AuthGate";
import MasterAdmin from "@/components/MasterAdmin";

export default function MasterPage() {
  return (
    <AuthGate allowedRoles={["master"]}>
      <MasterAdmin section="overview" />
    </AuthGate>
  );
}
