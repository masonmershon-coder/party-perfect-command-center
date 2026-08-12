import { isPorSyncConfigured } from "@/lib/por-snapshot";
import {
  clearReservationsCache,
  isValidPorReservationState,
  savePorReservations,
} from "@/lib/por-availability";
import {
  recordPorSyncError,
  recordPorSyncSuccess,
} from "@/lib/por-sync-health";
import type { PorReservationState } from "@/lib/types";
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

/**
 * ENTERPRISE sync: future TransactionItems+Transactions → Redis por-reservations.json.
 * Authorization: Bearer POR_SYNC_SECRET
 */
export async function POST(request: Request) {
  if (!isPorSyncConfigured()) {
    return NextResponse.json(
      { error: "POR_SYNC_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as unknown;
    if (!isValidPorReservationState(body)) {
      await recordPorSyncError(
        "reservations",
        "Invalid reservations. Expected { reservations:[{itemKey,qty,delivery,pickup,status,firm}], syncedAt, source }.",
      );
      return NextResponse.json(
        {
          error:
            "Invalid reservations. Expected { reservations:[{itemKey,qty,delivery,pickup,status,firm}], syncedAt, source }.",
        },
        { status: 400 },
      );
    }

    const state: PorReservationState = {
      ...body,
      syncedAt: body.syncedAt || new Date().toISOString(),
      source: body.source || "ENTERPRISE Sync-PorSnapshot",
    };
    clearReservationsCache();
    await savePorReservations(state);
    await recordPorSyncSuccess("reservations");

    return NextResponse.json({
      ok: true,
      reservations: state.reservations.length,
      firm: state.reservations.filter((r) => r.firm).length,
      soft: state.reservations.filter((r) => !r.firm).length,
      syncedAt: state.syncedAt,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to store reservations.";
    await recordPorSyncError("reservations", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
