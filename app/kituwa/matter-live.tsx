"use client";

import Link from "next/link";
import type { KituwaTask } from "@/lib/kituwa/types";
import { FLOOR_SPECS, floorForTask } from "@/lib/matter/tower";

type RegistryWorker = {
  worker_id: string;
  provider: string | null;
  product?: string | null;
  model?: string | null;
  version?: string | null;
  available?: boolean;
  heartbeat_fresh?: boolean;
  last_heartbeat?: string | null;
  cost_class?: string | null;
};

function workerMeta(id: string | null, registry: RegistryWorker[]) {
  if (!id) return null;
  return registry.find((w) => w.worker_id === id) || null;
}

export function MatterLive({
  tasks,
  workers = [],
}: {
  tasks: KituwaTask[];
  workers?: RegistryWorker[];
}) {
  if (!tasks.length) {
    return (
      <div className="kituwa-office">
        <div className="kituwa-station">OPS ROOM IDLE<br />NO ACTIVE WORKERS</div>
      </div>
    );
  }

  return (
    <div className="kituwa-office">
      {tasks.map((task) => {
        const floor = floorForTask(task);
        const spec = FLOOR_SPECS[floor];
        const assigned = workerMeta(task.assignmentWorkerId, workers);
        const rejected = task.routing?.considered?.filter((c) => !c.eligible) || [];
        return (
          <div
            key={task.id}
            className="kituwa-station"
            data-busy={task.state === "RUNNING" ? "1" : "0"}
            data-blocked={task.state === "BLOCKED" || task.state === "WAITING_APPROVAL" ? "1" : "0"}
            style={{ ["--floor-accent" as string]: spec.accent }}
          >
            <Link href={`/tasks/${task.id}`} className="kituwa-station-link">
              {task.assignmentHat || task.category.toUpperCase()}
              <br />
              {assigned
                ? `HAT ${assigned.worker_id} · ${assigned.provider || "provider unknown"}`
                : "HAT NONE"}
              <br />
              {task.state}
              <br />
              {task.blocker ? `BLOCK: ${task.blocker}` : null}
            </Link>
            {rejected.length ? (
              <ul className="kituwa-rejected">
                {rejected.slice(0, 3).map((r) => (
                  <li key={r.worker_id}>
                    {r.worker_id}: {r.reasons.join("; ") || "not eligible"}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
