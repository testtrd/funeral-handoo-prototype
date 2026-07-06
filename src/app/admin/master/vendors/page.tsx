import { AuthGate } from "@/components/AuthGate";
import MasterAdmin from "@/components/MasterAdmin";

export default function MasterVendorsPage() {
  return (
    <AuthGate allowedRoles={["admin"]}>
      <MasterAdmin section="vendors" />
    </AuthGate>
  );
}
