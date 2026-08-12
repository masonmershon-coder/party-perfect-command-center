import {
  applyAvailabilityToResolved,
  extractEventDateFromCommand,
} from "@/lib/design-availability";
import {
  extractProductPhrases,
  resolveDesignProducts,
  resolverConfidence,
  type ResolvedDesignProduct,
} from "@/lib/design-resolver";
import { stageDesignEscalated, stageDesignWithCutouts } from "@/lib/design-staging";
import { grokClient } from "@/lib/grok";
import type { DesignMatchedItem } from "@/lib/types";
import type { MadisonMediaResult } from "@/lib/madison-media-tools";

export interface DesignPipelineInput {
  command: string;
  eventDate?: string;
  realItems?: boolean;
  qtyPerLine?: number;
  n?: number;
}

export interface DesignPipelineResult {
  resolved: ResolvedDesignProduct[];
  adjusted: Awaited<ReturnType<typeof applyAvailabilityToResolved>>;
  cutoutUrls: string[];
  stagingPrompt: string;
  escalated: boolean;
  confidence: number;
  matchedItems: DesignMatchedItem[];
  media?: MadisonMediaResult;
}

const ESCALATE_RE =
  /\b(asymmetric|eclectic|pinterest|mood board|reference photo|mixed style|art direction|layout like|same vibe as)\b/i;

function needsStyleEscalation(
  command: string,
  resolved: ResolvedDesignProduct[],
  confidence: number,
): boolean {
  if (confidence < 45) return true;
  if (ESCALATE_RE.test(command)) return true;
  const phrases = extractProductPhrases(command);
  const productWords =
    command.match(
      /\b(charger|linen|plate|chair|goblet|napkin|fork|knife|spoon|tablecloth|runner|tumbler|flute|bowl|blush|gold|white|ivory)\b/gi,
    ) || [];
  if (productWords.length > resolved.length + 2) return true;
  if (phrases.length >= 3 && resolved.length < 2) return true;
  return false;
}

function toMatchedItems(
  adjusted: Awaited<ReturnType<typeof applyAvailabilityToResolved>>,
): DesignMatchedItem[] {
  return adjusted.map((p) => ({
    key: p.sku,
    name: p.swappedFrom
      ? `${p.name} (swap for ${p.swappedFrom})`
      : p.name,
    imageUrl: p.stagingUrl,
    porItemId: p.sku,
    porAvailable: p.unavailable ? 0 : p.availableQty,
    porPricePerDay: p.ratePerDay,
    source: p.imageSource === "website" ? "website" : p.imageSource === "por" ? "por" : "both",
    score: p.matchScore,
  }));
}

async function maybeEscalatePrompt(
  command: string,
  basePrompt: string,
  products: Awaited<ReturnType<typeof applyAvailabilityToResolved>>,
): Promise<string> {
  try {
    const res = await grokClient.chat.completions.create({
      model: "grok-4.3",
      messages: [
        {
          role: "system",
          content:
            "You write ONE Flux/Bria scene-staging instruction for Party Perfect Event Rentals. Staff named real rental SKUs with cutout photos. Keep every product exact; describe venue, lighting, and layout only. Return ONLY the instruction.",
        },
        {
          role: "user",
          content: `Command: ${command}\nProducts: ${products.map((p) => p.name).join("; ")}\nDraft: ${basePrompt}`,
        },
      ],
      max_tokens: 220,
    });
    return res.choices[0]?.message?.content?.trim() || basePrompt;
  } catch {
    return stageDesignEscalated({ prompt: command, products });
  }
}

/**
 * Full Madison design pipeline:
 * RESOLVER → AVAILABILITY → (optional ESCALATE prompt) → STAGING (FAL)
 */
export async function runDesignPipeline(
  input: DesignPipelineInput,
): Promise<DesignPipelineResult> {
  const command = input.command.trim();
  if (!command) throw new Error("Command required.");

  const resolved = input.realItems === false ? [] : await resolveDesignProducts(command);
  const confidence = resolverConfidence(command, resolved);
  const eventDate =
    input.eventDate?.trim() || extractEventDateFromCommand(command);

  const adjusted = await applyAvailabilityToResolved(resolved, {
    eventDate,
    qtyPerLine: input.qtyPerLine,
  });

  const cutoutUrls = adjusted
    .map((p) => p.cutoutUrl || p.stagingUrl)
    .filter((u): u is string => Boolean(u));

  let stagingPrompt = command;
  const swaps = adjusted.filter((p) => p.swapReason);
  if (swaps.length) {
    stagingPrompt = `${command}\n\nAvailability: ${swaps.map((s) => s.swapReason).join("; ")}`;
  }

  const escalated = needsStyleEscalation(command, resolved, confidence);
  if (escalated) {
    stagingPrompt = await maybeEscalatePrompt(command, stagingPrompt, adjusted);
  }

  const matchedItems = toMatchedItems(adjusted);

  let media: MadisonMediaResult | undefined;
  if (cutoutUrls.length > 0) {
    try {
      media = await stageDesignWithCutouts({
        prompt: stagingPrompt,
        products: adjusted,
        n: input.n ?? 2,
      });
    } catch (err) {
      console.error("[design-pipeline] staging failed:", err);
    }
  }

  return {
    resolved,
    adjusted,
    cutoutUrls,
    stagingPrompt,
    escalated,
    confidence,
    matchedItems,
    media,
  };
}

/** Resolver + availability only (no FAL spend) — for preview / debug. */
export async function previewDesignPipeline(
  input: DesignPipelineInput,
): Promise<Omit<DesignPipelineResult, "media">> {
  const command = input.command.trim();
  const resolved =
    input.realItems === false ? [] : await resolveDesignProducts(command);
  const confidence = resolverConfidence(command, resolved);
  const eventDate =
    input.eventDate?.trim() || extractEventDateFromCommand(command);
  const adjusted = await applyAvailabilityToResolved(resolved, {
    eventDate,
    qtyPerLine: input.qtyPerLine,
  });
  const cutoutUrls = adjusted
    .map((p) => p.cutoutUrl || p.stagingUrl)
    .filter((u): u is string => Boolean(u));
  let stagingPrompt = command;
  const escalated = needsStyleEscalation(command, resolved, confidence);
  if (escalated) {
    stagingPrompt = await stageDesignEscalated({
      prompt: command,
      products: adjusted,
    });
  }
  return {
    resolved,
    adjusted,
    cutoutUrls,
    stagingPrompt,
    escalated,
    confidence,
    matchedItems: toMatchedItems(adjusted),
  };
}
