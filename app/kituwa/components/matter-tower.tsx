"use client";

import { useMemo } from "react";
import { FLOOR_SPECS, floorForTask, occupyFloors, type TowerFloorId } from "@/lib/matter/tower";
import type { KituwaTask } from "@/lib/kituwa/types";
import { MatterFloorScene } from "./matter-floor-scene";

export function MatterTower({
  tasks,
  selectedFloor,
  onSelectFloor,
}: {
  tasks: KituwaTask[];
  selectedFloor: TowerFloorId | null;
  onSelectFloor: (floor: TowerFloorId) => void;
}) {
  const occupancy = useMemo(() => occupyFloors(tasks), [tasks]);
  const floors = Object.values(occupancy).filter((f) => f.floor !== "lobby");

  return (
    <section className="matter-tower" aria-label="Matter Tower">
      <div className="matter-tower-head">
        <div>
          <p className="matter-tower-kicker">MATTER TOWER</p>
          <h2>Your window into headquarters</h2>
        </div>
        <div className="matter-tower-elevator" aria-hidden>
          <span className="matter-tower-shaft" />
          <span className="matter-tower-car" data-floor={selectedFloor || "lobby"} />
        </div>
      </div>
      <div className="matter-tower-stack">
        {floors.map((floor) => {
          const spec = FLOOR_SPECS[floor.floor];
          const active = selectedFloor === floor.floor;
          return (
            <button
              key={floor.floor}
              type="button"
              className="matter-floor"
              data-lit={floor.lit ? "1" : "0"}
              data-busy={floor.busy ? "1" : "0"}
              data-blocked={floor.blocked ? "1" : "0"}
              data-active={active ? "1" : "0"}
              style={{ ["--floor-accent" as string]: spec.accent }}
              onClick={() => onSelectFloor(floor.floor)}
            >
              <div className="matter-floor-meta">
                <span className="matter-floor-name">{spec.label}</span>
                <span className="matter-floor-dept">{spec.department}</span>
              </div>
              <div className="matter-floor-state">
                {floor.tasks.length ? `${floor.tasks.length} task(s)` : "idle"}
                {floor.blocked ? " · blocked" : ""}
                {floor.busy ? " · running" : ""}
              </div>
              <div className="matter-floor-room" aria-hidden>
                {floor.lit ? <span className="matter-floor-glow" /> : null}
                <MatterFloorScene
                  floor={floor.floor}
                  lit={floor.lit}
                  busy={floor.busy}
                  blocked={floor.blocked}
                  workerCount={floor.tasks.length}
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function MatterFloorDetail({
  floor,
  tasks,
}: {
  floor: TowerFloorId;
  tasks: KituwaTask[];
}) {
  const spec = FLOOR_SPECS[floor];
  const onFloor = tasks.filter((t) => floorForTask(t) === floor);
  const waiting = onFloor.filter(
    (t) => t.state === "BLOCKED" || t.state === "WAITING_APPROVAL" || !t.assignmentWorkerId,
  );

  return (
    <section className="matter-floor-detail" style={{ ["--floor-accent" as string]: spec.accent }}>
      <header>
        <p className="matter-floor-kicker">{spec.department}</p>
        <h2>{spec.label} floor</h2>
        <p className="matter-floor-personality">{spec.personality}</p>
      </header>
      {onFloor.length ? (
        <>
          {waiting.length === onFloor.length ? (
            <p className="matter-floor-empty">
              Floor involved — waiting for an eligible worker. Tasks are saved; execution is not running.
            </p>
          ) : null}
          <ul className="matter-floor-tasklist">
            {onFloor.map((task) => (
              <li key={task.id}>
                <strong>{task.title}</strong>
                <span>{task.state}</span>
                <span>{task.assignmentWorkerId || "HAT NONE"}</span>
                {task.blocker ? <small>{task.blocker}</small> : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="matter-floor-empty">No task on this floor yet. Lights stay low until Matter delegates here.</p>
      )}
    </section>
  );
}
