import type { NextConfig } from "next";

const isVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";

const nextConfig: NextConfig = {
  // Standalone is for VPS/Docker. Vercel builds the standard Next output.
  ...(!isVercel ? { output: "standalone" as const } : {}),
  // Allow Party Perfect logo optimization from /public
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
