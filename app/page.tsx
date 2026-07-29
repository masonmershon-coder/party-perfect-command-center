import { Suspense } from "react";
import { AuthGate } from "./components/auth/auth-gate";
import PartyPerfectDashboard from "./components/party-perfect-dashboard";

export default function Home() {
  return (
    <AuthGate>
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-[var(--pp-bg)] text-sm text-[var(--pp-text-muted)]">
            Loading Command Center…
          </div>
        }
      >
        <PartyPerfectDashboard />
      </Suspense>
    </AuthGate>
  );
}
