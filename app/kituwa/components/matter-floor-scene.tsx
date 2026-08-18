"use client";

import type { TowerFloorId } from "@/lib/matter/tower";

const DEPT_BADGES: Partial<Record<TowerFloorId, string>> = {
  claude: "Anthropic",
  grok: "xAI",
  codex: "OpenAI",
  cursor: "Cursor",
  local: "Home lab",
};

const IDLE_EQUIPMENT: Partial<Record<TowerFloorId, string[]>> = {
  claude: ["cabinet", "scroll", "lamp"],
  grok: ["tv", "radio", "feed"],
  codex: ["crt", "terminal", "manual"],
  cursor: ["scope", "bench", "scanner"],
  local: ["rack", "fan", "node"],
  memory: ["tape", "cartridge", "index"],
  outbox: ["crate", "printer", "slot"],
};

/** Tiny department room preview — animation follows real floor occupancy only. */
export function MatterFloorScene({
  floor,
  lit,
  busy,
  blocked,
  workerCount,
}: {
  floor: TowerFloorId;
  lit: boolean;
  busy: boolean;
  blocked: boolean;
  workerCount: number;
}) {
  const badge = DEPT_BADGES[floor];
  const equipment = IDLE_EQUIPMENT[floor] || ["relay"];
  const workers = Math.max(workerCount, lit ? 1 : 0);

  return (
    <div
      className="matter-floor-scene"
      data-lit={lit ? "1" : "0"}
      data-busy={busy ? "1" : "0"}
      data-blocked={blocked ? "1" : "0"}
      aria-hidden
    >
      {badge ? <span className="matter-dept-badge">{badge}</span> : null}
      <div className="matter-floor-equipment">
        {equipment.map((kind) => (
          <span key={kind} className="matter-equipment" data-kind={kind} />
        ))}
      </div>
      <div className="matter-floor-workers">
        {Array.from({ length: Math.min(workers, 6) }).map((_, i) => (
          <span
            key={i}
            className="matter-worker"
            data-role={i % 3}
            style={{ animationDelay: `${i * 240}ms` }}
          />
        ))}
      </div>
      {busy ? <span className="matter-floor-scanline" /> : null}
    </div>
  );
}
