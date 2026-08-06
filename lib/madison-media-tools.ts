import type { DesignAspectRatio } from "@/lib/types";

/**
 * Madison’s Design Studio media toolbox.
 * She keeps social/leads on Grok; image/video generation is routed to the
 * best configured engine for photoreal Party Perfect inventory looks.
 */

export type MadisonMediaKind = "image" | "video";

export type MadisonMediaToolId =
  | "flux-photoreal"
  | "flux-edit"
  | "xai-imagine"
  | "kling-video";

export interface MadisonMediaTool {
  id: MadisonMediaToolId;
  label: string;
  provider: "fal" | "xai";
  kind: MadisonMediaKind;
  /** 0–100 — higher = less “fake AI,” better for client proposals */
  photorealScore: number;
  /** How well it keeps product/inventory truth from reference photos */
  inventoryFidelity: number;
  supportsTextOnly: boolean;
  /** Max reference images this tool can take */
  maxReferences: number;
  supportsVideo: boolean;
  /** Short why Madison might pick this */
  bestFor: string;
  configured: boolean;
  /** fal model id or xAI model name */
  modelId: string;
}

export interface MadisonMediaJob {
  prompt: string;
  aspectRatio?: DesignAspectRatio;
  referenceUrls?: string[];
  n?: number;
  /** Prefer photoreal client proposal vs social lifestyle */
  goal?: "proposal" | "social" | "auto";
  preferVideo?: boolean;
  /** Force a tool (tests / future UI); otherwise Madison auto-picks */
  forceToolId?: MadisonMediaToolId | "auto";
}

export interface MadisonMediaResult {
  urls: string[];
  toolId: MadisonMediaToolId;
  toolLabel: string;
  modelId: string;
  reason: string;
}

function falKey() {
  return (
    process.env.FAL_KEY?.trim() ||
    process.env.FAL_API_KEY?.trim() ||
    // Josh’s Vercel label for Madison Flux
    process.env.madisonpplflux?.trim() ||
    process.env.adisonpplflux?.trim() ||
    ""
  );
}

function xaiKey() {
  return process.env.XAI_API_KEY?.trim() || "";
}

function forcedEngine(): string {
  return (process.env.MADISON_IMAGE_ENGINE || "auto").trim().toLowerCase();
}

/** Scan which generators Madison can use right now. */
export function listMadisonMediaTools(): MadisonMediaTool[] {
  const fal = Boolean(falKey());
  const xai = Boolean(xaiKey());

  return [
    {
      id: "flux-photoreal",
      label: "Flux Photoreal",
      provider: "fal",
      kind: "image",
      photorealScore: 94,
      inventoryFidelity: 78,
      supportsTextOnly: true,
      maxReferences: 0,
      supportsVideo: false,
      bestFor: "Text → photoreal event / tablescape looks",
      configured: fal,
      modelId: "fal-ai/flux-pro/v1.1",
    },
    {
      id: "flux-edit",
      label: "Flux Inventory Edit",
      provider: "fal",
      kind: "image",
      photorealScore: 96,
      inventoryFidelity: 95,
      supportsTextOnly: false,
      maxReferences: 8,
      supportsVideo: false,
      bestFor:
        "Edit/merge real inventory + phone look-board into client-true photos",
      configured: fal,
      modelId: "fal-ai/flux-pro/kontext/multi",
    },
    {
      id: "xai-imagine",
      label: "Grok Imagine",
      provider: "xai",
      kind: "image",
      photorealScore: 72,
      inventoryFidelity: 70,
      supportsTextOnly: true,
      maxReferences: 3,
      supportsVideo: false,
      bestFor: "Fast Grok fallback when Flux isn’t linked",
      configured: xai,
      modelId: "grok-imagine-image-quality",
    },
    {
      id: "kling-video",
      label: "Kling Video",
      provider: "fal",
      kind: "video",
      photorealScore: 88,
      inventoryFidelity: 80,
      supportsTextOnly: false,
      maxReferences: 1,
      supportsVideo: true,
      bestFor: "Short motion clips from a still (optional; needs Fal)",
      configured: fal,
      modelId: "fal-ai/kling-video/v1.6/standard/image-to-video",
    },
  ];
}

export function madisonMediaToolsStatus() {
  const tools = listMadisonMediaTools();
  const available = tools.filter((t) => t.configured);
  return {
    enginePreference: forcedEngine() || "auto",
    falConfigured: Boolean(falKey()),
    xaiConfigured: Boolean(xaiKey()),
    availableCount: available.length,
    tools: tools.map((t) => ({
      id: t.id,
      label: t.label,
      kind: t.kind,
      configured: t.configured,
      photorealScore: t.photorealScore,
      inventoryFidelity: t.inventoryFidelity,
      bestFor: t.bestFor,
      maxReferences: t.maxReferences,
    })),
    recommendation: available.length
      ? available.sort(
          (a, b) =>
            b.photorealScore +
            b.inventoryFidelity -
            (a.photorealScore + a.inventoryFidelity),
        )[0]
      : null,
  };
}

function scoreTool(tool: MadisonMediaTool, job: MadisonMediaJob): number {
  if (!tool.configured) return -1;
  if (job.preferVideo && !tool.supportsVideo) return -1;
  if (!job.preferVideo && tool.kind === "video") return -1;

  const refs = (job.referenceUrls || []).filter(Boolean).length;
  if (refs > 0 && tool.maxReferences === 0 && !tool.supportsTextOnly) {
    return -1;
  }
  if (refs === 0 && !tool.supportsTextOnly) return -1;
  if (refs > tool.maxReferences && tool.maxReferences > 0) {
    // Still usable if we pack/trim refs — slight penalty
  }

  const goal = job.goal || "auto";
  let score =
    tool.photorealScore * 1.2 +
    tool.inventoryFidelity * (refs > 0 ? 1.4 : 0.8);

  if (goal === "proposal") {
    score += tool.photorealScore * 0.35;
    score += tool.inventoryFidelity * 0.45;
  }
  if (goal === "social") {
    score += tool.photorealScore * 0.2;
  }
  if (refs > 0 && tool.id === "flux-edit") score += 40;
  if (refs === 0 && tool.id === "flux-photoreal") score += 25;
  if (tool.id === "xai-imagine") score -= 15; // prefer Flux when both live

  const pref = forcedEngine();
  if (pref === "flux" && tool.provider === "fal") score += 50;
  if (pref === "xai" && tool.provider === "xai") score += 80;
  if (pref === "flux" && tool.provider === "xai") score -= 40;

  return score;
}

/**
 * Madison picks the best configured generator for this job.
 * Future tools plug into listMadisonMediaTools() and get scored automatically.
 */
export function selectMadisonMediaTool(job: MadisonMediaJob): {
  tool: MadisonMediaTool;
  reason: string;
  runnersUp: Array<{ id: MadisonMediaToolId; score: number }>;
} {
  if (job.forceToolId && job.forceToolId !== "auto") {
    const forced = listMadisonMediaTools().find((t) => t.id === job.forceToolId);
    if (forced?.configured) {
      return {
        tool: forced,
        reason: `Forced tool ${forced.label}.`,
        runnersUp: [],
      };
    }
  }

  const ranked = listMadisonMediaTools()
    .map((tool) => ({ tool, score: scoreTool(tool, job) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    throw new Error(
      "No image generators configured. Add FAL_KEY (Flux photoreal) and/or XAI_API_KEY.",
    );
  }

  const best = ranked[0];
  const refs = (job.referenceUrls || []).filter(Boolean).length;
  const why =
    refs > 0
      ? `${best.tool.label} — strongest inventory fidelity for your look board (${refs} refs).`
      : `${best.tool.label} — best photoreal score for text → proposal looks.`;

  return {
    tool: best.tool,
    reason: why,
    runnersUp: ranked.slice(1, 3).map((r) => ({
      id: r.tool.id,
      score: Math.round(r.score),
    })),
  };
}

export function aspectToFalImageSize(
  aspect: DesignAspectRatio | undefined,
): string | { width: number; height: number } {
  switch (aspect) {
    case "1:1":
      return "square_hd";
    case "4:3":
      return { width: 1536, height: 1152 };
    case "3:4":
      return { width: 1152, height: 1536 };
    case "16:9":
      return "landscape_16_9";
    case "9:16":
      return "portrait_16_9";
    default:
      return "landscape_4_3";
  }
}

export function withPhotorealPrompt(prompt: string): string {
  const base = prompt.trim();
  if (/photoreal|real inventory|party perfect/i.test(base)) return base;
  return `${base}\n\nPhotoreal Party Perfect Event Rentals Tulsa inventory — real linens, china, chargers, tables, tents. Client proposal quality. No cartoon, no plastic AI look, no invented products.`;
}
