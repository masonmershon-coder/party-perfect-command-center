import path from "path";
import os from "os";

/**
 * Writable data directory.
 * - Local / VPS: ./data
 * - Vercel serverless: /tmp (ephemeral; reseeds from defaults on cold start)
 */
export function getDataDir() {
  if (process.env.DATA_DIR?.trim()) {
    return path.resolve(process.env.DATA_DIR.trim());
  }

  if (process.env.VERCEL === "1" || process.env.VERCEL === "true") {
    return path.join(os.tmpdir(), "party-perfect-command-center");
  }

  return path.join(process.cwd(), "data");
}

export function isVercelRuntime() {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}
