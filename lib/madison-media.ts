import { assertGrokConfigured } from "@/lib/grok";
import {
  runFluxEdit,
  runFluxPhotoreal,
  runKlingVideo,
} from "@/lib/madison-media-fal";
import {
  listMadisonMediaTools,
  selectMadisonMediaTool,
  withPhotorealPrompt,
  type MadisonMediaJob,
  type MadisonMediaResult,
  type MadisonMediaTool,
} from "@/lib/madison-media-tools";

type XaiImageResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: string | { message?: string };
  message?: string;
};

function xaiErrorMessage(payload: XaiImageResponse, status: number): string {
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }
  if (
    payload.error &&
    typeof payload.error === "object" &&
    typeof payload.error.message === "string" &&
    payload.error.message.trim()
  ) {
    return payload.error.message.trim();
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  return `Grok Imagine failed (${status}).`;
}

function withImageTags(prompt: string, imageCount: number): string {
  if (imageCount <= 1) return prompt;
  if (/<IMAGE_\d+>/i.test(prompt)) return prompt;
  const tags = Array.from(
    { length: imageCount },
    (_, i) => `<IMAGE_${i}>`,
  ).join(", ");
  return `${prompt}\n\nCombine and stay faithful to the exact Party Perfect rental pieces in ${tags}. Photoreal, not generic AI décor.`;
}

async function runXaiImagine(
  tool: MadisonMediaTool,
  job: MadisonMediaJob,
): Promise<MadisonMediaResult> {
  assertGrokConfigured();
  const apiKey = process.env.XAI_API_KEY!.trim();
  const refs = (job.referenceUrls || [])
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, tool.maxReferences);
  const n = Math.min(Math.max(job.n ?? 2, 1), 4);
  const prompt = withImageTags(withPhotorealPrompt(job.prompt), refs.length);
  const aspectRatio = job.aspectRatio || "auto";

  let endpoint = "https://api.x.ai/v1/images/generations";
  let body: Record<string, unknown> = {
    model: tool.modelId,
    prompt,
    n,
    aspect_ratio: aspectRatio,
    resolution: "2k",
  };

  if (refs.length === 1) {
    endpoint = "https://api.x.ai/v1/images/edits";
    body = {
      model: tool.modelId,
      prompt,
      n,
      aspect_ratio: aspectRatio,
      resolution: "2k",
      image: { url: refs[0], type: "image_url" },
    };
  } else if (refs.length > 1) {
    endpoint = "https://api.x.ai/v1/images/edits";
    body = {
      model: tool.modelId,
      prompt,
      n,
      aspect_ratio: aspectRatio,
      resolution: "2k",
      images: refs.map((url) => ({ url, type: "image_url" })),
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as XaiImageResponse;
  if (!response.ok) {
    if (refs.length > 1) {
      return runXaiImagine(tool, {
        ...job,
        referenceUrls: [refs[0]],
        prompt: `${job.prompt} — merge look from Party Perfect inventory references`,
      });
    }
    if (refs.length === 1) {
      return runXaiImagine(tool, {
        ...job,
        referenceUrls: [],
        prompt: `${job.prompt} — inspired by Party Perfect inventory photos`,
      });
    }
    throw new Error(xaiErrorMessage(payload, response.status));
  }

  const urls: string[] = [];
  for (const row of payload.data || []) {
    if (row.url) urls.push(row.url);
    else if (row.b64_json) urls.push(`data:image/jpeg;base64,${row.b64_json}`);
  }
  if (!urls.length) throw new Error("Grok Imagine returned no images.");

  return {
    urls,
    toolId: tool.id,
    toolLabel: tool.label,
    modelId: tool.modelId,
    reason: "Grok Imagine fallback",
  };
}

async function executeTool(
  tool: MadisonMediaTool,
  job: MadisonMediaJob,
): Promise<MadisonMediaResult> {
  switch (tool.id) {
    case "flux-photoreal":
      return runFluxPhotoreal(tool, job);
    case "flux-edit":
      return runFluxEdit(tool, job);
    case "kling-video":
      return runKlingVideo(tool, job);
    case "xai-imagine":
      return runXaiImagine(tool, job);
    default:
      throw new Error(`Unknown Madison media tool: ${(tool as MadisonMediaTool).id}`);
  }
}

/**
 * Madison scans available generators, picks the best fit, runs it,
 * and falls back down the ranked list if the winner fails.
 */
export async function madisonCreateMedia(
  job: MadisonMediaJob,
): Promise<MadisonMediaResult & { tried: string[] }> {
  const prompt = job.prompt.trim();
  if (!prompt) throw new Error("Describe what you want Madison to create.");

  const selection = selectMadisonMediaTool(job);
  const tried: string[] = [];
  const all = listMadisonMediaTools().filter((t) => t.configured);
  const queue: MadisonMediaTool[] = [selection.tool];
  for (const runner of selection.runnersUp) {
    const tool = all.find((t) => t.id === runner.id);
    if (tool && !queue.some((q) => q.id === tool.id)) queue.push(tool);
  }
  for (const tool of all) {
    if (!queue.some((q) => q.id === tool.id)) queue.push(tool);
  }

  let lastError: Error | null = null;
  for (const tool of queue) {
    if (tool.kind === "video" && !job.preferVideo) continue;
    if (tool.kind === "image" && job.preferVideo) continue;
    const refs = (job.referenceUrls || []).filter(Boolean).length;
    if (refs === 0 && !tool.supportsTextOnly) continue;
    if (refs > 0 && tool.maxReferences === 0) continue;

    tried.push(tool.id);
    try {
      const result = await executeTool(tool, {
        ...job,
        prompt,
        goal: job.goal || "proposal",
      });
      return {
        ...result,
        reason: `${selection.reason} Ran ${result.toolLabel}.`,
        tried,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[madison-media] ${tool.id} failed:`, lastError.message);
    }
  }

  throw lastError || new Error("All Madison media generators failed.");
}
