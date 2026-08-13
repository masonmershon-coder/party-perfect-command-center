import { timingSafeEqual } from "node:crypto";
import { isAuthError, requireApiAuth } from "@/lib/api-auth";
import {
  appendSentinelAppEvent,
  listSentinelInboxEvents,
} from "@/lib/sentinel-inbox";
import { NO_STORE_HEADERS } from "@/lib/no-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function collectorSecretOk(request: Request): boolean {
  const expected = process.env.SENTINEL_COLLECTOR_SECRET?.trim();
  if (!expected) return false;
  const header =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    request.headers.get("x-sentinel-collector-secret")?.trim() ||
    "";
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Owner Security Inbox — redacted, read-only. */
export async function GET(request: Request) {
  const gate = await requireApiAuth("security");
  if (isAuthError(gate)) return gate;

  const url = new URL(request.url);
  const limit = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("limit") || "80") || 80),
  );
  const { events, total } = await listSentinelInboxEvents(limit);
  return NextResponse.json({ events, total }, { headers: NO_STORE_HEADERS });
}

/** Collector append-only ingest. No edit/delete. Redacts body. */
export async function POST(request: Request) {
  if (!process.env.SENTINEL_COLLECTOR_SECRET?.trim()) {
    return NextResponse.json(
      { error: "Collector ingest disabled" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  if (!collectorSecretOk(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const kind = String(body.event_type || body.kind || "").trim();
  if (!kind || kind.length > 80) {
    return NextResponse.json(
      { error: "event_type required" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const signalIds = Array.isArray(body.signalIds)
    ? body.signalIds.filter((x): x is string => typeof x === "string").slice(0, 12)
    : undefined;

  const event = await appendSentinelAppEvent({
    kind,
    severity: String(body.severity || "WATCH"),
    title: String(body.title || kind.replace(/_/g, " ")),
    summary: typeof body.description === "string" ? body.description : String(body.summary || ""),
    signalCount:
      typeof body.signalCount === "number" ? body.signalCount : undefined,
    signalIds,
  });

  return NextResponse.json({ ok: true, id: event.id }, { headers: NO_STORE_HEADERS });
}
