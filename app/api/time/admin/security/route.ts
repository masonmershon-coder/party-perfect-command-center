import { privateJson } from "@/lib/api-auth";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeAdminError, requireTimeAdmin } from "@/lib/time/http";
import { acknowledgePunchVerification } from "@/lib/time/punch";
import { adminPunchDetail } from "@/lib/time/serialize";
import { buildSecurityAlertQueue } from "@/lib/time/workflow";

/**
 * Mason (primary) / Michelle (owner) — security & time-theft oversight.
 * Full punch evidence. Never exposed on Shelly's ops queue.
 * Review signals only — not automatic guilt.
 */
export async function GET(request: Request) {
  const gate = await requireTimeAdmin(request, "security");
  if (isTimeAdminError(gate)) return gate;
  const store = await getTimeStore();
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const punch = await store.getPunch(id);
    if (!punch) return privateJson({ error: "Not found" }, { status: 404 });
    const device = punch.trustedDeviceId
      ? await store.getTrustedDevice(punch.trustedDeviceId)
      : null;
    await store.appendAudit({
      at: new Date().toISOString(),
      actor: gate.actor,
      action: "punch.security_viewed",
      target: id,
      detail: "mason_michelle",
    });
    return privateJson({
      item: { ...adminPunchDetail(punch), deviceRecord: device },
      note: "Review signal only — not an accusation of theft.",
    });
  }
  const queue = await buildSecurityAlertQueue(store);
  const cutoff = Date.now() - 30 * 60 * 1000;
  const failedAuth = (await store.listAudit()).filter(
    (entry) => entry.action === "auth.failed" && Date.parse(entry.at) >= cutoff,
  );
  const failedByTarget = new Map<string, { count: number; lastAt: string }>();
  for (const entry of failedAuth) {
    const current = failedByTarget.get(entry.target);
    failedByTarget.set(entry.target, {
      count: (current?.count ?? 0) + 1,
      lastAt: current?.lastAt && current.lastAt > entry.at ? current.lastAt : entry.at,
    });
  }
  const authenticationAlerts = [...failedByTarget.entries()]
    .filter(([, value]) => value.count >= 3)
    .map(([target, value]) => ({
      kind: "authentication_alert" as const,
      id: `auth:${target}`,
      severity: value.count >= 5 ? ("HIGH" as const) : ("MEDIUM" as const),
      summary: `${value.count} failed PIN attempts in 30 minutes`,
      target,
      lastAt: value.lastAt,
      routeTo: value.count >= 5 ? "mason_and_michelle" : "mason",
    }));
  return privateJson({
    label: "Security alerts · Mason primary / Michelle owner",
    route: {
      primary: "Mason",
      secondary: "Michelle",
      notRouted: "Shelly",
    },
    severity: {
      LOW: "Evidence only (e.g. IP change on trusted device) — no push",
      MEDIUM: "Mason review (new device, GPS unavailable, unusual network)",
      HIGH: "Mason + Michelle visibility (impossible travel, multi-device, etc.)",
    },
    authenticationAlerts,
    ...queue,
  });
}

export async function PATCH(request: Request) {
  const gate = await requireTimeAdmin(request, "security");
  if (isTimeAdminError(gate)) return gate;
  let body: { id?: string; acknowledge?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) return privateJson({ error: "id required" }, { status: 400 });
  const store = await getTimeStore();
  const actor = gate.actor;
  const saved = await acknowledgePunchVerification(store, body.id, actor);
  if (!saved) return privateJson({ error: "Not found" }, { status: 404 });
  return privateJson({
    punch: adminPunchDetail(saved),
    note: "Marked reviewed by security oversight.",
  });
}
