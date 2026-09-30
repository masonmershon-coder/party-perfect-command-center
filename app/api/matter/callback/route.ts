import { NextResponse } from "next/server";
import { ERROR_CODES, type CallbackErrorCode } from "@/lib/matter/callback/contract";
import { processMatterCallback, type CallbackLogEntry } from "@/lib/matter/callback/processor";
import { callbackRuntime, readBodyLimited } from "@/lib/matter/callback/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

function log(entry: CallbackLogEntry) {
  const line = JSON.stringify({ kind: "matter_callback", ...entry });
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  else console.info(line);
}

function errorResponse(code: CallbackErrorCode) {
  const { status, retryable } = ERROR_CODES[code];
  return NextResponse.json({ ok: false, code, retryable }, { status, headers: NO_STORE });
}

/**
 * Matter worker callback (preview/local only). Machine principal: every request is
 * authenticated by processMatterCallback (HMAC over raw body + timestamp + nonce).
 * Matter / AI Core stays authoritative; this records reported events only.
 */
export async function POST(request: Request) {
  const rt = callbackRuntime();
  if (!rt.enabled) {
    log({ level: "info", code: "CALLBACK_DISABLED", reason: rt.reason });
    return errorResponse("CALLBACK_DISABLED");
  }
  const raw = await readBodyLimited(request, rt.maxBodyBytes);
  if (raw === null) {
    log({ level: "warn", code: "PAYLOAD_TOO_LARGE" });
    return errorResponse("PAYLOAD_TOO_LARGE");
  }
  const result = await processMatterCallback(request.headers, raw, { ...rt.deps, log });
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
}

export async function GET() {
  return errorResponse("METHOD_NOT_ALLOWED");
}
