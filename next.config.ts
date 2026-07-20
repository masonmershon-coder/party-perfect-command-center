import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Smaller production bundle for VPS/Docker (node .next/standalone/server.js)
  output: "standalone",
};

export default nextConfig;
