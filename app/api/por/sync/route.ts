import {
  getPorSnapshot,
  getPorSyncMeta,
  isPorSyncConfigured,
  isValidPorSnapshot,
  savePorSnapshot,
} from "@/lib/por-snapshot";
import type { PorSnapshot } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorize(request: Request) {
  const secret = process.env.POR_SYNC_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(bearer) && bearer === secret;
}

/** Latest POR snapshot for Command Center UI (read-only). */
export async function GET() {
  const snapshot = await getPorSnapshot();
  const meta = getPorSyncMeta(snapshot);
  return NextResponse.json({
    syncConfigured: isPorSyncConfigured(),
    meta,
    snapshot,
  });
}

/**
 * Push endpoint for the ENTERPRISE read-only sync agent.
 * Authorization: Bearer POR_SYNC_SECRET
 */
export async function POST(request: Request) {
  if (!isPorSyncConfigured()) {
    return NextResponse.json(
      {
        error:
          "POR_SYNC_SECRET is not configured on Command Center. Add it in Vercel env.",
      },
      { status: 503 },
    );
  }

  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as unknown;
    if (!isValidPorSnapshot(body)) {
      return NextResponse.json(
        {
          error:
            "Invalid POR snapshot. Expected version:1 with inventory, money, and ops.",
        },
        { status: 400 },
      );
    }

    const snapshot: PorSnapshot = {
      ...body,
      syncedAt: body.syncedAt || new Date().toISOString(),
    };

    await savePorSnapshot(snapshot);
    const meta = getPorSyncMeta(snapshot);

    return NextResponse.json({
      ok: true,
      storedAt: new Date().toISOString(),
      meta,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to store POR snapshot.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
