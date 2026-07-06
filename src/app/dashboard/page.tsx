import { AuthGate } from "@/components/AuthGate";
import AdminDashboard from "@/components/AdminDashboard";

export default function DashboardPage() {
  return (
    <AuthGate allowedRoles={["admin", "office", "driver"]}>
      <AdminDashboard />
    </AuthGate>
  );
}
