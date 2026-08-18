import type { TaskRecord } from "@/lib/matter/kituwa-contract-types";
import type { KituwaTask } from "@/lib/kituwa/types";

export const TOWER_FLOORS = [
  "lobby",
  "claude",
  "grok",
  "codex",
  "cursor",
  "local",
  "memory",
  "outbox",
] as const;

export type TowerFloorId = (typeof TOWER_FLOORS)[number];

export type FloorSpec = {
  id: TowerFloorId;
  label: string;
  department: string;
  accent: string;
  personality: string;
};

export const FLOOR_SPECS: Record<TowerFloorId, FloorSpec> = {
  lobby: {
    id: "lobby",
    label: "MATTER",
    department: "Orchestration",
    accent: "#9b7dff",
    personality: "Calm coordinator. Timeless casing. Newer sensors.",
  },
  claude: {
    id: "claude",
    label: "CLAUDE",
    department: "Analysis / Context",
    accent: "#d4a574",
    personality: "Archive library. Filing cabinets. Long reads.",
  },
  grok: {
    id: "grok",
    label: "GROK",
    department: "Research / Intelligence",
    accent: "#5ad0ff",
    personality: "Newsroom. Radios. Conflicting feeds.",
  },
  codex: {
    id: "codex",
    label: "CODEX",
    department: "Build / Software",
    accent: "#74e0a8",
    personality: "Computer lab. CRT beside a modern build machine.",
  },
  cursor: {
    id: "cursor",
    label: "CURSOR",
    department: "Engineering / Security",
    accent: "#ff6b4a",
    personality: "Bench full of dismantled hardware. Oscilloscopes.",
  },
  local: {
    id: "local",
    label: "LOCAL",
    department: "Machine Room",
    accent: "#3dffc4",
    personality: "GPU racks. Home lab. Quiet fans.",
  },
  memory: {
    id: "memory",
    label: "MEMORY",
    department: "Archives",
    accent: "#c9b37a",
    personality: "Decades of cartridges, tapes, and vector stores.",
  },
  outbox: {
    id: "outbox",
    label: "OUTBOX",
    department: "Delivery",
    accent: "#f4ffff",
    personality: "Packages, printouts, finished artifacts.",
  },
};

export function floorForCategory(category: string): TowerFloorId {
  const c = category.toLowerCase();
  if (c === "verification" || c === "security") return "cursor";
  if (c === "build" || c === "automation" || c === "coding") return "codex";
  if (c === "research") return "grok";
  if (c === "analysis" || c === "planning") return "claude";
  if (c === "local" || c === "infra") return "local";
  return "lobby";
}

export function floorForWorkerId(workerId: string | null | undefined): TowerFloorId | null {
  if (!workerId) return null;
  const w = workerId.toLowerCase();
  if (w.includes("claude") || w.includes("anthropic")) return "claude";
  if (w.includes("grok") || w.includes("xai")) return "grok";
  if (w.includes("codex") || w.includes("openai") || w.includes("gpt")) return "codex";
  if (w.includes("cursor")) return "cursor";
  if (w.includes("local") || w.includes("ollama") || w.includes("mac")) return "local";
  return null;
}

export function floorForTask(task: Pick<KituwaTask, "category" | "assignmentWorkerId" | "state">): TowerFloorId {
  if (task.state === "COMPLETE") return "outbox";
  return floorForWorkerId(task.assignmentWorkerId) || floorForCategory(task.category);
}

export function floorForRecord(task: TaskRecord): TowerFloorId {
  if (task.status === "COMPLETE") return "outbox";
  return floorForWorkerId(task.assigned_worker_id) || floorForCategory(task.domain);
}

export type FloorOccupancy = {
  floor: TowerFloorId;
  tasks: Array<{ id: string; title: string; state: string; workerId: string | null }>;
  lit: boolean;
  busy: boolean;
  blocked: boolean;
};

export function occupyFloors(tasks: KituwaTask[]): Record<TowerFloorId, FloorOccupancy> {
  const occ = Object.fromEntries(
    TOWER_FLOORS.map((id) => [
      id,
      {
        floor: id,
        tasks: [] as FloorOccupancy["tasks"],
        lit: id === "lobby" || id === "memory",
        busy: false,
        blocked: false,
      },
    ]),
  ) as Record<TowerFloorId, FloorOccupancy>;

  for (const task of tasks) {
    const floor = floorForTask(task);
    const slot = occ[floor];
    slot.tasks.push({
      id: task.id,
      title: task.title,
      state: task.state,
      workerId: task.assignmentWorkerId,
    });
    slot.lit = true;
    if (task.state === "RUNNING" || task.state === "VERIFYING") slot.busy = true;
    if (task.state === "BLOCKED" || task.state === "WAITING_APPROVAL") slot.blocked = true;
  }
  if (tasks.some((t) => t.state === "COMPLETE")) occ.outbox.lit = true;
  return occ;
}
