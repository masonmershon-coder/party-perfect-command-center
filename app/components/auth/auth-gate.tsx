"use client";

import { LoginScreen } from "@/app/components/auth/login-screen";
import { isMainSessionValid } from "@/lib/auth";
import { PartyPerfectLogo } from "@/app/components/dashboard/party-perfect-logo";
import { useEffect, useState } from "react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const valid = await isMainSessionValid();
      if (!cancelled) {
        setAuthenticated(valid);
        setReady(true);
      }
    }

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--pp-bg)]">
        <div className="text-center">
          <PartyPerfectLogo variant="sidebar" className="mx-auto opacity-90" />
          <p className="mt-6 text-sm text-[var(--pp-text-muted)]">
            Checking session…
          </p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <LoginScreen onSuccess={() => setAuthenticated(true)} />;
  }

  return <>{children}</>;
}
