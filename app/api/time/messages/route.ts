import { timePrivateJson } from "@/lib/time/auth";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeEmployeeError, requireTimeEmployee } from "@/lib/time/http";
import type { RequestKind } from "@/lib/time/types";
import { postRequestMessage } from "@/lib/time/workflow";

const KINDS = new Set<RequestKind>(["correction", "absence", "time_off"]);

export async function GET(request: Request) {
  const employee = await requireTimeEmployee(request);
  if (isTimeEmployeeError(employee)) return employee;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") as RequestKind;
  const id = url.searchParams.get("id") || "";
  if (!KINDS.has(kind) || !id) {
    return timePrivateJson({ error: "kind and id required" }, { status: 400 });
  }
  const store = await getTimeStore();
  const owned =
    kind === "correction"
      ? (await store.getCorrection(id))?.employeeId === employee.id
      : kind === "absence"
        ? (await store.getAbsence(id))?.employeeId === employee.id
        : (await store.getTimeOff(id))?.employeeId === employee.id;
  if (!owned) return timePrivateJson({ error: "Not found" }, { status: 404 });
  return timePrivateJson({ messages: await store.listMessages(kind, id) });
}

export async function POST(request: Request) {
  const employee = await requireTimeEmployee(request);
  if (isTimeEmployeeError(employee)) return employee;
  let body: { kind?: RequestKind; id?: string; body?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return timePrivateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  const kind = body.kind as RequestKind;
  const id = String(body.id || "");
  const text = String(body.body || "").trim();
  if (!KINDS.has(kind) || !id || !text) {
    return timePrivateJson({ error: "kind, id, and message required" }, { status: 400 });
  }
  const store = await getTimeStore();
  let owned = false;
  let needsReply = false;
  if (kind === "correction") {
    const row = await store.getCorrection(id);
    owned = row?.employeeId === employee.id;
    needsReply = row?.state === "needs_clarification";
    if (owned && needsReply) {
      await store.upsertCorrection({ ...row!, state: "pending", updatedAt: new Date().toISOString() });
    }
  } else if (kind === "absence") {
    const row = await store.getAbsence(id);
    owned = row?.employeeId === employee.id;
    needsReply = row?.state === "needs_clarification";
    if (owned && needsReply) {
      await store.upsertAbsence({ ...row!, state: "pending", updatedAt: new Date().toISOString() });
    }
  } else {
    const row = await store.getTimeOff(id);
    owned = row?.employeeId === employee.id;
    needsReply = row?.state === "needs_clarification";
    if (owned && needsReply) {
      await store.upsertTimeOff({ ...row!, state: "pending", updatedAt: new Date().toISOString() });
    }
  }
  if (!owned) return timePrivateJson({ error: "Not found" }, { status: 404 });
  const message = await postRequestMessage(store, {
    requestKind: kind,
    requestId: id,
    authorRole: "employee",
    authorId: employee.id,
    body: text,
  });
  return timePrivateJson({ message, returnedToShelly: needsReply });
}
