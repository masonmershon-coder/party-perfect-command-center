import { Suspense } from "react";
import PartyPerfectDashboard from "./components/party-perfect-dashboard";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-[var(--pp-bg)] text-sm text-[var(--pp-text-muted)]">
          Loading Command Center…
        </div>
      }
    >
      <PartyPerfectDashboard />
    </Suspense>
  );
}
