import { kituwaPrivateJson, verifyKituwaWorkerBearer } from "@/lib/kituwa/auth";
import { mutateKituwaState } from "@/lib/kituwa/store";

/** Outbound Mac/worker pulse. Does not grant execution. KITUWA_WORKER_TOKEN required. */
export async function POST(request: Request) {
  if (!verifyKituwaWorkerBearer(request)) {
    return kituwaPrivateJson({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { worker_id?: string; available?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const worker_id = String(body.worker_id || "").trim();
  if (!worker_id) return kituwaPrivateJson({ error: "worker_id required" }, { status: 400 });
  const state = await mutateKituwaState((s) => ({
    ...s,
    workerPulses: [
      ...s.workerPulses.filter((p) => p.worker_id !== worker_id).slice(-40),
      {
        worker_id,
        at: new Date().toISOString(),
        available: Boolean(body.available),
      },
    ],
  }));
  return kituwaPrivateJson({ ok: true, localMac: state.workerPulses.at(-1) });
}
