import { AuthGate } from "@/components/AuthGate";
import MasterAdmin from "@/components/MasterAdmin";

export default function MasterUsersPage() {
  return (
    <AuthGate allowedRoles={["admin"]}>
      <MasterAdmin section="users" />
    </AuthGate>
  );
}
