import { mkdtemp, cp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { KituwaRouting } from "@/lib/kituwa/types";

type RouteInput = {
  task_id: string;
  objective: string;
  task_category: string;
  required_capabilities: Record<string, number | boolean>;
  required_permissions?: string[];
  protected_actions?: string[];
  needs_verification?: boolean;
  requires_intelligence?: boolean;
  risk_class?: string;
};

type MatterRouteResult = {
  primary?: string | null;
  verifier?: string | null;
  blocked?: boolean;
  route?: string | null;
  selection_basis?: string | null;
  owner_approval_required?: boolean;
  considered?: Array<{ worker_id: string; eligible: boolean; reasons: string[] }>;
};

const MATTER_SRC = path.join(process.cwd(), "AI-HANDOFF", "matter");

export async function withWritableMatterDir<T>(fn: () => Promise<T>): Promise<T> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "kituwa-matter-"));
  await cp(MATTER_SRC, tmp, { recursive: true });
  const prev = process.env.MATTER_DIR;
  process.env.MATTER_DIR = tmp;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.MATTER_DIR;
    else process.env.MATTER_DIR = prev;
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function routeWithMatter(task: RouteInput): Promise<KituwaRouting> {
  return withWritableMatterDir(async () => {
    const mod = (await import("../../AI-HANDOFF/matter/matter-registry.mjs")) as {
      route: (t: RouteInput) => MatterRouteResult;
    };
    const decision = mod.route({
      ...task,
      requires_intelligence: task.requires_intelligence ?? true,
    });
    return {
      primary: decision.primary ?? null,
      verifier: decision.verifier ?? null,
      blocked: Boolean(decision.blocked),
      route: decision.route ?? null,
      selection_basis: decision.selection_basis ?? null,
      owner_approval_required: Boolean(decision.owner_approval_required),
      considered: (decision.considered || []).map((c) => ({
        worker_id: c.worker_id,
        eligible: Boolean(c.eligible),
        reasons: c.reasons || [],
      })),
    };
  });
}
