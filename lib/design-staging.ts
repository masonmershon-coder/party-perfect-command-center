import type { AvailabilityAdjustedProduct } from "@/lib/design-availability";
import { runFluxEdit, runBriaProductScene } from "@/lib/madison-media-fal";
import {
  listMadisonMediaTools,
  withInventoryFidelityPrompt,
  type MadisonMediaJob,
  type MadisonMediaResult,
} from "@/lib/madison-media-tools";

/**
 * STAGING worker — the only expensive FAL call in the happy path.
 * Uses pre-cut product PNGs as refs; generates scene around real inventory.
 */
export async function stageDesignWithCutouts(input: {
  prompt: string;
  products: AvailabilityAdjustedProduct[];
  n?: number;
  aspectRatio?: MadisonMediaJob["aspectRatio"];
}): Promise<MadisonMediaResult> {
  const cutouts = input.products
    .map((p) => p.cutoutUrl || p.stagingUrl)
    .filter((u): u is string => Boolean(u))
    .slice(0, 8);

  if (cutouts.length === 0) {
    throw new Error("No product cutouts available for staging.");
  }

  const tools = listMadisonMediaTools();
  const n = Math.min(Math.max(input.n ?? 2, 1), 4);
  const productNames = input.products.map((p) => p.name).join("; ");
  const stagingPrompt = withInventoryFidelityPrompt(
    [
      input.prompt.trim(),
      `Stage these exact Party Perfect rentals: ${productNames}.`,
      "Use the reference cutouts as the real products — do not invent different SKUs.",
    ].join(" "),
    { allowSceneChange: true },
  );

  const job: MadisonMediaJob = {
    prompt: stagingPrompt,
    aspectRatio: input.aspectRatio,
    productReferenceUrls: cutouts,
    referenceUrls: [],
    n,
    realItems: true,
    goal: "proposal",
  };

  if (cutouts.length === 1) {
    const bria = tools.find((t) => t.id === "bria-product-scene" && t.configured);
    if (bria) {
      return runBriaProductScene(bria, job);
    }
  }

  const edit = tools.find((t) => t.id === "flux-edit" && t.configured);
  if (edit) {
    return runFluxEdit(edit, job);
  }

  throw new Error("FAL staging not configured (need FAL_KEY).");
}

/** Optional second-pass polish — only when explicitly requested (not default). */
export async function stageDesignEscalated(input: {
  prompt: string;
  products: AvailabilityAdjustedProduct[];
}): Promise<string> {
  const names = input.products.map((p) => p.name).join("; ");
  return withInventoryFidelityPrompt(
    [
      input.prompt.trim(),
      `Layout brief for Party Perfect showroom: ${names}.`,
      "Describe placement, spacing, and lighting for a photoreal client proposal.",
      "Keep every named rental SKU exact; specify how cutouts sit on the table/venue.",
    ].join(" "),
    { allowSceneChange: true },
  );
}

export async function pingStagingEngine(): Promise<boolean> {
  return Boolean(
    process.env.FAL_KEY?.trim() ||
      process.env.FAL_API_KEY?.trim() ||
      process.env.madisonpplflux?.trim() ||
      process.env.adisonpplflux?.trim(),
  );
}
