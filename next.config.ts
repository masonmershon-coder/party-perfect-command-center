import type { NextConfig } from "next";
import { SECURITY_HEADER_ENTRIES } from "./lib/security-headers";

const isVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";

const nextConfig: NextConfig = {
  // Standalone is for VPS/Docker. Vercel builds the standard Next output.
  ...(!isVercel ? { output: "standalone" as const } : {}),
  // Allow Party Perfect logo optimization from /public
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADER_ENTRIES,
      },
    ];
  },
};

export default nextConfig;
