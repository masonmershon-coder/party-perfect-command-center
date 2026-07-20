"use client";

import { PartyPerfectLogo } from "@/app/components/dashboard/party-perfect-logo";

export function BrandLogo({
  size = "md",
  showWordmark = true,
}: {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
}) {
  if (!showWordmark) {
    return <PartyPerfectLogo variant="icon" />;
  }

  if (size === "sm") {
    return <PartyPerfectLogo variant="compact" />;
  }

  return <PartyPerfectLogo variant="sidebar" />;
}
