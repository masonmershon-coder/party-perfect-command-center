import { createHash, timingSafeEqual } from "node:crypto";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hexEqual(a: string, b: string): boolean {
  const left = Buffer.from(a.toLowerCase(), "utf8");
  const right = Buffer.from(b.toLowerCase(), "utf8");
  if (left.length !== 32 && left.length !== 64) return false;
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hashAiCostIngestToken(plaintext: string): string {
  return sha256Hex(plaintext.trim());
}

type EnvMap = Record<string, string | undefined>;

export function ingestTokenConfigured(env: EnvMap = process.env): boolean {
  return Boolean((env.AI_COST_INGEST_TOKEN_SHA256 || "").trim());
}

export function verifyAiCostIngestBearer(header: string | null, env: EnvMap = process.env): boolean {
  const expected = (env.AI_COST_INGEST_TOKEN_SHA256 || "").trim().toLowerCase();
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) return false;
  if (!header || !header.startsWith("Bearer ")) return false;
  const presented = header.slice("Bearer ".length).trim();
  if (!presented) return false;
  return hexEqual(sha256Hex(presented), expected);
}

/** Collectors submit events only. They cannot read owner billing APIs. */
export function collectorCanReadDashboard(): false {
  return false;
}

/** Owner CC sessions are not ingest credentials unless a separate ingest token is presented. */
export function ownerSessionImpersonatesCollector(sessionCookie: string | null, ingestHeader: string | null, env: EnvMap = process.env): boolean {
  if (!sessionCookie) return false;
  return verifyAiCostIngestBearer(ingestHeader, env);
}
