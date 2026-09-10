import { privateJson } from "@/lib/api-auth";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeAdminError, requireTimeAdmin } from "@/lib/time/http";
import {
  retrieveSquareTimecard,
  writeBackTimecard,
  type SquareWritebackInput,
  type TimecardExpectation,
  type TimecardPatch,
} from "@/lib/time/square-writeback";
import type { TimeCapability } from "@/lib/time/types";

function responseStatus(result: Awaited<ReturnType<typeof writeBackTimecard>>) {
  if (result.ok) return 200;
  if (result.status === "FORBIDDEN") return 403;
  if (result.status === "INVALID_REQUEST") return 400;
  if (result.status === "NOT_CONFIGURED") return 503;
  if (result.status === "SYNC_CONFLICT") return 409;
  if (result.status === "PENDING_SQUARE_SYNC") return 503;
  if (result.status === "NEEDS_REVIEW") return 409;
  return 502;
}

function principalCapabilities(gate: Awaited<ReturnType<typeof requireTimeAdmin>>): TimeCapability[] {
  if (isTimeAdminError(gate)) return [];
  if (gate.canOwner) {
    return Array.from(new Set<TimeCapability>([...gate.capabilities, "timekeeping.owner", "timekeeping.review"]));
  }
  return gate.capabilities;
}

/**
 * GET is deliberately read-only and can be used by the manager UI to capture
 * the Square version/updated_at snapshot before presenting an edit form.
 */
export async function GET(request: Request) {
  const gate = await requireTimeAdmin(request, "review");
  if (isTimeAdminError(gate)) return gate;
  const url = new URL(request.url);
  const timecardId = url.searchParams.get("timecardId")?.trim();
  if (!timecardId) return privateJson({ error: "timecardId is required" }, { status: 400 });

  const result = await retrieveSquareTimecard(timecardId);
  if (!result.ok) {
    return privateJson(
      { error: result.error, retryable: result.retryable },
      { status: result.retryable ? 503 : result.status || 502 },
    );
  }
  const card = result.data.timecard;
  if (!card) return privateJson({ error: "Square returned no timecard" }, { status: 502 });

  return privateJson({
    timecard: {
      id: card.id,
      team_member_id: card.team_member_id,
      location_id: card.location_id,
      start_at: card.start_at,
      end_at: card.end_at ?? null,
      status: card.status,
      breaks: card.breaks || [],
      version: card.version ?? null,
      updated_at: card.updated_at ?? null,
    },
    writeEnabled: process.env.TIME_SQUARE_WRITE_ENABLED === "true",
    safeTestConfigured: Boolean(process.env.TIME_SQUARE_SAFE_TEST_TIMECARD_ID?.trim()),
    safeTestWritesEnabled:
      process.env.SQUARE_ENV === "sandbox" ||
      process.env.TIME_SQUARE_SAFE_TEST_WRITES_ENABLED === "true",
    environment: process.env.SQUARE_ENV === "sandbox" ? "sandbox" : "production",
  });
}

/**
 * Management-only correction write.
 * Employees cannot reach this route because requireTimeAdmin(review) rejects them server-side.
 * The adapter independently checks review capability, optimistic conflict state, bounded retries,
 * durable audit history, deterministic idempotency, and Square read-back before CONFIRMED.
 */
export async function POST(request: Request) {
  const gate = await requireTimeAdmin(request, "review");
  if (isTimeAdminError(gate)) return gate;

  let body: {
    correctionId?: string;
    timecardId?: string;
    idempotencyKey?: string;
    reason?: string;
    expected?: TimecardExpectation;
    patch?: TimecardPatch;
    safeTest?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }

  const input: SquareWritebackInput = {
    actorId: gate.actor,
    actorCapabilities: principalCapabilities(gate),
    correctionId: body.correctionId || "",
    timecardId: body.timecardId || "",
    idempotencyKey: body.idempotencyKey || "",
    reason: body.reason || "",
    expected: body.expected || {},
    patch: body.patch || {},
    safeTest: body.safeTest === true,
  };

  const store = await getTimeStore();
  const result = await writeBackTimecard(store, input);
  return privateJson(result, { status: responseStatus(result) });
}
