import { privateJson } from "@/lib/api-auth";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeAdminError, requireTimeAdmin } from "@/lib/time/http";
import { publicLocation } from "@/lib/time/serialize";
import type { WorkLocation } from "@/lib/time/types";

export async function GET(request: Request) {
  const gate = await requireTimeAdmin(request, "overview");
  if (isTimeAdminError(gate)) return gate;
  return privateJson({ locations: (await (await getTimeStore()).listLocations()).map(publicLocation) });
}

export async function PATCH(request: Request) {
  const gate = await requireTimeAdmin(request, "overview");
  if (isTimeAdminError(gate)) return gate;
  let body: Partial<WorkLocation> & { id?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) return privateJson({ error: "Missing id" }, { status: 400 });
  const store = await getTimeStore();
  const existing = (await store.listLocations()).find((l) => l.id === body.id);
  if (!existing) return privateJson({ error: "Not found" }, { status: 404 });
  const next: WorkLocation = {
    ...existing,
    name: body.name ?? existing.name,
    address: body.address ?? existing.address,
    latitude: body.latitude === undefined ? existing.latitude : body.latitude,
    longitude: body.longitude === undefined ? existing.longitude : body.longitude,
    radiusM: body.radiusM ?? existing.radiusM,
    active: body.active ?? existing.active,
    verified: body.verified ?? existing.verified,
    notes: body.notes ?? existing.notes,
  };
  if (next.active && next.verified && (next.latitude == null || next.longitude == null)) {
    return privateJson(
      { error: "Set verified latitude and longitude before activating this location." },
      { status: 400 },
    );
  }
  const saved = await store.upsertLocation(next);
  await store.appendAudit({
    at: new Date().toISOString(),
    actor: gate.actor,
    action: "location.patch",
    target: saved.id,
    detail: `active=${saved.active} verified=${saved.verified}`,
  });
  return privateJson({ location: publicLocation(saved) });
}
