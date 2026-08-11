import { AuthGate } from "@/app/components/auth/auth-gate";
import type { Metadata } from "next";
import { MatterClient } from "./matter-client";

export const metadata: Metadata = {
  title: "Matter",
  appleWebApp: { capable: true, title: "Matter", statusBarStyle: "black-translucent" },
};

// P2A phone control surface for AI Core. Behind the existing AuthGate.
export default function MatterPage() {
  return (
    <AuthGate>
      <MatterClient />
    </AuthGate>
  );
}
