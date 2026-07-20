"use client";

import Image from "next/image";
import { BRAND } from "@/lib/brand";

const LOGO_SRC = "/party-perfect-logo.png";
const LOGO_WIDTH = 490;
const LOGO_HEIGHT = 137;

export function PartyPerfectLogo({
  variant = "sidebar",
  className = "",
}: {
  variant?: "sidebar" | "compact" | "icon";
  className?: string;
}) {
  const heights = {
    sidebar: 56,
    compact: 36,
    icon: 32,
  };

  const height = heights[variant === "icon" ? "icon" : variant === "compact" ? "compact" : "sidebar"];
  const width = Math.round((height / LOGO_HEIGHT) * LOGO_WIDTH);

  return (
    <Image
      src={LOGO_SRC}
      alt={`${BRAND.wordmarkPrimary} ${BRAND.wordmarkSecondary}`}
      width={width}
      height={height}
      priority
      className={`h-auto max-w-full object-contain ${className}`}
      style={{ height, width: "auto", maxWidth: width }}
    />
  );
}
