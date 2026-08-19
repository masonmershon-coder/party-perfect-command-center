"use client";

import { useMemo } from "react";
import Link from "next/link";
import { FLOOR_SPECS, floorForTask, occupyFloors, type TowerFloorId } from "@/lib/matter/tower";
import type { KituwaTask } from "@/lib/kituwa/types";
import { MatterFloorScene } from "./matter-floor-scene";

export const TOWER_VIEW_ORDER: TowerFloorId[] = [
  "codex",
  "claude",
  "grok",
  "cursor",
  "local",
  "memory",
  "outbox",
];

const FLOOR_NUM: Record<TowerFloorId, string> = {
  lobby: "M",
  codex: "7",
  claude: "6",
  grok: "5",
  cursor: "4",
  local: "3",
  memory: "2",
  outbox: "G",
};

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
  const floors = TOWER_VIEW_ORDER.map((id) => occupancy[id]);
  const lobby = occupancy.lobby;

  return (
    <section className="matter-tower" aria-label="Matter Tower">
      <div className="matter-tower-head">
        <div>
          <p className="matter-tower-kicker">MATTER TOWER</p>
          <h2>Look into headquarters</h2>
        </div>
      </div>

      <div className="matter-building">
        <div className="matter-building-sky" aria-hidden />
        <div className="matter-building-frame">
          <div className="matter-building-crown">
            <span className="matter-building-sign">MATTER</span>
            <span className="matter-building-sub">AI OPERATIONS</span>
          </div>

          <button
            type="button"
            className="matter-penthouse"
            data-lit={lobby.lit ? "1" : "0"}
            data-busy={lobby.busy ? "1" : "0"}
            data-blocked={lobby.blocked ? "1" : "0"}
            data-active={selectedFloor === "lobby" ? "1" : "0"}
            onClick={() => onSelectFloor("lobby")}
          >
            <span className="matter-window-sill">CORE · M</span>
            <MatterFloorScene
              floor="lobby"
              lit={lobby.lit}
              busy={lobby.busy}
              blocked={lobby.blocked}
              workerCount={Math.max(lobby.tasks.length, 1)}
            />
          </button>

          <div className="matter-building-body">
            <div className="matter-elevator" aria-hidden>
              <span className="matter-elevator-shaft" />
              <span className="matter-elevator-car" data-floor={selectedFloor || "lobby"} />
              {TOWER_VIEW_ORDER.map((id) => (
                <span key={id} className="matter-elevator-dot" data-on={occupancy[id].lit ? "1" : "0"} data-floor={id} />
              ))}
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
                    data-floor={floor.floor}
                    data-lit={floor.lit ? "1" : "0"}
                    data-busy={floor.busy ? "1" : "0"}
                    data-blocked={floor.blocked ? "1" : "0"}
                    data-active={active ? "1" : "0"}
                    style={{ ["--floor-accent" as string]: spec.accent }}
                    onClick={() => onSelectFloor(floor.floor)}
                  >
                    <div className="matter-window-chrome">
                      <span className="matter-floor-name">{spec.label}</span>
                      <span className="matter-floor-dept">{spec.department}</span>
                      <span className="matter-floor-state">
                        {floor.tasks.length ? `${floor.tasks.length} live` : "idle"}
                        {floor.blocked ? " · hold" : ""}
                        {floor.busy ? " · running" : ""}
                      </span>
                      <span className="matter-floor-num">{FLOOR_NUM[floor.floor]}</span>
                    </div>
                    <div className="matter-floor-room">
                      <span className="matter-mullion" />
                      <MatterFloorScene
                        floor={floor.floor}
                        lit={floor.lit}
                        busy={floor.busy}
                        blocked={floor.blocked}
                        workerCount={Math.max(floor.tasks.length, 1)}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="matter-building-base">LOADING DOCK</div>
        </div>
      </div>
    </section>
  );
}

export function MatterFloorTakeover({
  floor,
  tasks,
  onSelectFloor,
  onClose,
}: {
  floor: TowerFloorId;
  tasks: KituwaTask[];
  onSelectFloor: (floor: TowerFloorId) => void;
  onClose: () => void;
}) {
  const occupancy = useMemo(() => occupyFloors(tasks), [tasks]);
  const slot = occupancy[floor];
  const spec = FLOOR_SPECS[floor];
  const onFloor = tasks.filter((t) => floorForTask(t) === floor);

  return (
    <section className="matter-takeover" style={{ ["--floor-accent" as string]: spec.accent }}>
      <header className="matter-takeover-head">
        <button type="button" className="matter-takeover-back kituwa-hit" onClick={onClose}>
          Tower
        </button>
        <div>
          <p className="matter-floor-kicker">
            FLOOR {FLOOR_NUM[floor]} · {spec.department}
          </p>
          <h2>{spec.label}</h2>
        </div>
      </header>

      <div className="matter-takeover-stage">
        <nav className="matter-takeover-elev" aria-label="Floor selector">
          <button type="button" className="matter-elev-btn" data-active={floor === "lobby" ? "1" : "0"} onClick={() => onSelectFloor("lobby")}>
            M
          </button>
          {TOWER_VIEW_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className="matter-elev-btn"
              data-active={floor === id ? "1" : "0"}
              data-lit={occupancy[id].lit ? "1" : "0"}
              data-blocked={occupancy[id].blocked ? "1" : "0"}
              onClick={() => onSelectFloor(id)}
            >
              {FLOOR_NUM[id]}
            </button>
          ))}
        </nav>
        <div className="matter-takeover-window">
          <MatterFloorScene
            floor={floor}
            lit={slot.lit}
            busy={slot.busy}
            blocked={slot.blocked}
            workerCount={Math.max(slot.tasks.length, slot.lit ? 2 : 1)}
            tall
          />
        </div>
      </div>

      <div className="matter-takeover-ops">
        <p className="matter-floor-personality">{spec.personality}</p>
        {onFloor.length ? (
          <ul className="matter-floor-tasklist">
            {onFloor.map((task) => (
              <li key={task.id}>
                <Link href={`/tasks/${task.id}`}>
                  <strong>{task.title}</strong>
                  <span>{task.state}</span>
                  <span>{task.assignmentWorkerId || "HAT NONE"}</span>
                  {task.blocker ? <small>{task.blocker}</small> : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="matter-floor-empty">
            {slot.lit
              ? "Lights are on. No live assignment on this floor yet."
              : "No task on this floor yet. Ambient systems only."}
          </p>
        )}
      </div>
    </section>
  );
}

export function MatterWorkforceStrip({
  tasks,
  href = "/tower",
}: {
  tasks: KituwaTask[];
  href?: string;
}) {
  const occupancy = useMemo(() => occupyFloors(tasks), [tasks]);
  const awake = TOWER_VIEW_ORDER.filter((id) => occupancy[id].lit || occupancy[id].tasks.length);

  return (
    <section className="matter-workforce" aria-label="Active workforce">
      <div className="matter-workforce-head">
        <h2 className="kituwa-section-title">Workforce</h2>
        <Link href={href} className="kituwa-link-btn kituwa-hit">
          Open Tower
        </Link>
      </div>
      <div className="matter-workforce-row">
        {(awake.length ? awake : (["codex", "claude", "grok", "cursor"] as TowerFloorId[])).slice(0, 4).map((id) => {
          const slot = occupancy[id];
          const spec = FLOOR_SPECS[id];
          return (
            <Link
              key={id}
              href="/tower"
              className="matter-workforce-window"
              style={{ ["--floor-accent" as string]: spec.accent }}
              data-lit={slot.lit ? "1" : "0"}
              data-blocked={slot.blocked ? "1" : "0"}
            >
              <MatterFloorScene
                floor={id}
                lit={slot.lit}
                busy={slot.busy}
                blocked={slot.blocked}
                workerCount={Math.max(slot.tasks.length, 1)}
              />
              <span>{spec.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
