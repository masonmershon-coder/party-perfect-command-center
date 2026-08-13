import { privateJson } from "@/lib/api-auth";
import { ingestUsageEvents } from "@/lib/ai-cost";
import { verifyAiCostIngestBearer, ingestTokenConfigured } from "@/lib/ai-cost-auth";
import { getAiCostEngine } from "@/lib/ai-cost-deps";
import { enforceAiCostIngestLimit } from "@/lib/ai-cost-rate-limit";
import { AI_COST_INGEST_MAX_BYTES } from "@/lib/ai-cost-policy";

export async function POST(request: Request) {
  if (!ingestTokenConfigured()) {
    return privateJson({ error: "ingest_not_configured" }, { status: 503 });
  }
  const auth = request.headers.get("authorization");
  if (!verifyAiCostIngestBearer(auth)) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }
  if (enforceAiCostIngestLimit("ingest")) {
    return privateJson({ error: "rate_limited" }, { status: 429 });
  }
  const raw = await request.text();
  if (raw.length > AI_COST_INGEST_MAX_BYTES) {
    return privateJson({ error: "payload_too_large" }, { status: 413 });
  }
  type IngestBody = { events?: unknown; collectorId?: string; lastSuccessAt?: string; error?: string };
  let body: IngestBody | null = null;
  try {
    body = JSON.parse(raw) as IngestBody;
  } catch {
    return privateJson({ error: "invalid_json" }, { status: 400 });
  }
  if (!body || !Array.isArray(body.events)) {
    return privateJson({ error: "events array required" }, { status: 400 });
  }
  const engine = getAiCostEngine();
  if (body.collectorId) {
    await engine.store.recordImportRun({
      collectorId: String(body.collectorId).slice(0, 80),
      lastAttemptAt: new Date().toISOString(),
      lastSuccessAt: body.error ? null : new Date().toISOString(),
      lastError: body.error ? String(body.error).slice(0, 200) : null,
      status: body.error ? "failed" : "ok",
    });
  }
  const result = await ingestUsageEvents(engine, body.events as Parameters<typeof ingestUsageEvents>[1], {
    payloadBytes: raw.length,
  });
  return privateJson(result, { status: result.rejected && !result.accepted ? 400 : 200 });
}
