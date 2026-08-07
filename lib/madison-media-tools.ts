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
  return withInventoryFidelityPrompt(prompt);
}

/**
 * True when staff is asking to relocate / stage inventory into a new place
 * (garden wedding, warehouse, ballroom, etc.) — not just a lighting filter.
 */
export function commandWantsSceneChange(command: string): boolean {
  const text = command.trim();
  if (!text) return false;

  if (
    /\b(put|place|move|set|relocate|stage|drop|situate)\b[\s\S]{0,60}\b(in|at|into|on|onto|inside)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (
    /\b(change|swap|replace|move)\b[\s\S]{0,30}\b(background|backdrop|setting|scene|venue|location|room|environment)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (
    /\b(garden|warehouse|ballroom|barn|tent exterior|outdoor|patio|backyard|dock|reception|ceremony|church|hotel|manor|lawn|courtyard|greenhouse|vineyard|estate|park)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (
    /\b(for (this|a|an|the)\s+[\w-]*\s*(wedding|gala|party|event|reception|dinner))\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/\b(make it look like|as if (it'?s|at)|staged (at|in|for))\b/i.test(text)) {
    return true;
  }
  return false;
}

/**
 * Lock Party Perfect rental identity. Products stay exact.
 * Venue/background only stays locked when staff did NOT ask to move the look.
 */
export function withInventoryFidelityPrompt(
  prompt: string,
  opts?: { allowSceneChange?: boolean },
): string {
  const base = prompt.trim();
  const allowScene =
    opts?.allowSceneChange ?? commandWantsSceneChange(base);

  const lock = allowScene
    ? [
        "PRODUCT IDENTITY LOCK — Party Perfect Event Rentals Tulsa:",
        "- Keep the EXACT rental pieces from the reference: chair style, table shape, linen color/pattern, china, chargers, glassware, centerpieces.",
        "- Do NOT replace patterned linens with plain white, swap chair styles, or invent products we do not rent.",
        "- DO change the surrounding place to match the staff command (garden, warehouse, wedding venue, etc.).",
        "- Relight so the same inventory belongs in that new place — photoreal event photo, not a filter or Instagram LUT.",
        "- No plastic AI look, no watermark spam.",
      ].join("\n")
    : [
        "IDENTITY LOCK — Party Perfect Event Rentals Tulsa:",
        "- This is an EDIT of the reference photo(s).",
        "- Keep the EXACT rental pieces: chair style, table shape, linen color/pattern, china, chargers, glassware, centerpieces.",
        "- Do NOT replace patterned linens with plain white, or swap chair styles.",
        "- Keep the same place unless the staff command asks for a new venue.",
        "- Prefer honest showroom / real-event lighting over glossy CGI.",
        "- No plastic AI look, no watermark spam, no invented products we do not rent.",
      ].join("\n");

  if (/IDENTITY LOCK|PRODUCT IDENTITY LOCK|exact rental pieces/i.test(base)) {
    return base;
  }
  return `${base}\n\n${lock}`;
}

/**
 * Two edit passes for a look board.
 * Scene commands → place inventory in the asked venue (2 angles).
 * Otherwise → lighting polish (not a filter-y rebuild).
 */
export function buildShowroomEditPrompts(command: string): {
  tight: string;
  polish: string;
  mode: "scene" | "polish";
} {
  const goal = command.trim() || "Client proposal look";
  const scene = commandWantsSceneChange(goal);

  if (scene) {
    return {
      mode: "scene",
      tight: withInventoryFidelityPrompt(
        [
          `${goal}.`,
          "SCENE PLACEMENT: take the exact Party Perfect table / linens / chairs / place settings from the reference photo and place them in the location the staff described.",
          "Change the environment and lighting to match that place. Keep product identity identical — same linen pattern, chair style, china, table shape.",
          "Photoreal Tulsa event rental photo for a client proposal. Do not apply a color filter or style LUT on the original room.",
        ].join(" "),
        { allowSceneChange: true },
      ),
      polish: withInventoryFidelityPrompt(
        [
          `${goal}.`,
          "Same exact Party Perfect inventory in that same commanded place, alternate camera angle or lighting (golden hour / reception glow) for a second proposal option.",
          "Products must stay recognizable as the same SKUs — only the shot and atmosphere may differ.",
        ].join(" "),
        { allowSceneChange: true },
      ),
    };
  }

  return {
    mode: "polish",
    tight: withInventoryFidelityPrompt(
      [
        `${goal}.`,
        "Edit the main reference tablescape: improve lighting, straighten framing, tidy crumbs/clutter, and make it client-proposal clean.",
        "Keep the same room/showroom context. Furniture and soft goods must stay the same Party Perfect SKUs.",
      ].join(" "),
      { allowSceneChange: false },
    ),
    polish: withInventoryFidelityPrompt(
      [
        `${goal}.`,
        "Light polish for a sales proposal: flattering light and a slightly cleaner backdrop.",
        "CRITICAL: preserve every linen pattern, chair, table, and place setting — do not redesign the tablescape or invent a new venue.",
      ].join(" "),
      { allowSceneChange: false },
    ),
  };
}
