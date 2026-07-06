import { AuthGate } from "@/components/AuthGate";
import UserAdmin from "@/components/UserAdmin";

export default function UsersPage() {
  return (
    <AuthGate allowedRoles={["admin"]}>
      <UserAdmin />
    </AuthGate>
  );
}
