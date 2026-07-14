import { AuthGate } from "@/components/AuthGate";
import AdminDashboard from "@/components/AdminDashboard";

export default function DashboardPage() {
  return (
    <AuthGate allowedRoles={["master", "planning", "manager", "staff"]}>
      <AdminDashboard />
    </AuthGate>
  );
}
