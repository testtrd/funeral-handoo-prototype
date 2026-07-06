import { AuthGate } from "@/components/AuthGate";
import HandoffApp from "@/components/HandoffApp";

export default function Home() {
  return (
    <AuthGate>
      <HandoffApp />
    </AuthGate>
  );
}
