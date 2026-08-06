import {
  aspectToFalImageSize,
  buildShowroomEditPrompts,
  withInventoryFidelityPrompt,
  withPhotorealPrompt,
  type MadisonMediaJob,
  type MadisonMediaResult,
  type MadisonMediaTool,
} from "@/lib/madison-media-tools";

function falKey() {
  return (
    process.env.FAL_KEY?.trim() ||
    process.env.FAL_API_KEY?.trim() ||
    process.env.madisonpplflux?.trim() ||
    process.env.adisonpplflux?.trim() ||
    ""
  );
}

type FalImageOut = {
  images?: Array<{ url?: string; content_type?: string }>;
  image?: { url?: string };
  video?: { url?: string };
  detail?: string;
  error?: string;
};

/**
 * Run a fal model (sync gateway). Auth: Authorization: Key <FAL_KEY>
 */
export async function falRun<T extends FalImageOut>(
  modelId: string,
  input: Record<string, unknown>,
): Promise<T> {
  const key = falKey();
  if (!key) throw new Error("FAL_KEY is not configured.");

  const response = await fetch(`https://fal.run/${modelId}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(120_000),
  });

  const payload = (await response.json()) as T & {
    detail?: unknown;
    error?: string;
  };
  if (!response.ok) {
    const detail =
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.detail === "string"
          ? payload.detail
          : JSON.stringify(payload.detail || payload).slice(0, 400);
    throw new Error(`Flux/Fal failed (${response.status}): ${detail}`);
  }
  return payload;
}

function collectUrls(payload: FalImageOut): string[] {
  const urls: string[] = [];
  for (const img of payload.images || []) {
    if (img.url) urls.push(img.url);
  }
  if (payload.image?.url) urls.push(payload.image.url);
  if (payload.video?.url) urls.push(payload.video.url);
  return [...new Set(urls)];
}

/** Prefer https inventory URLs; keep data URIs (Fal usually accepts them). */
function prepareRefs(refs: string[], max: number): string[] {
  return refs.map((u) => u.trim()).filter(Boolean).slice(0, max);
}

export async function runFluxPhotoreal(
  tool: MadisonMediaTool,
  job: MadisonMediaJob,
): Promise<MadisonMediaResult> {
  const n = Math.min(Math.max(job.n ?? 2, 1), 4);
  const prompt = withPhotorealPrompt(job.prompt);
  const payload = await falRun(tool.modelId, {
    prompt,
    num_images: n,
    image_size: aspectToFalImageSize(job.aspectRatio),
    output_format: "jpeg",
    enable_safety_checker: true,
  });
  const urls = collectUrls(payload);
  if (!urls.length) throw new Error("Flux returned no images.");
  return {
    urls: urls.slice(0, n),
    toolId: tool.id,
    toolLabel: tool.label,
    modelId: tool.modelId,
    reason: "Flux photoreal text→image",
  };
}

async function runKontextOnce(
  refs: string[],
  prompt: string,
  numImages: number,
): Promise<{ urls: string[]; modelId: string }> {
  const model =
    refs.length > 1
      ? "fal-ai/flux-pro/kontext/multi"
      : "fal-ai/flux-pro/kontext";
  const input: Record<string, unknown> = {
    prompt: withInventoryFidelityPrompt(prompt),
    num_images: numImages,
    output_format: "jpeg",
    // Stronger prompt stickiness so “keep exact linens/chairs” wins over fantasy rebuilds.
    guidance_scale: 5.5,
    safety_tolerance: "2",
    enhance_prompt: false,
  };
  if (refs.length > 1) {
    input.image_urls = refs;
  } else {
    input.image_url = refs[0];
  }

  const payload = await falRun(model, input);
  const urls = collectUrls(payload);
  if (!urls.length) throw new Error("Flux edit returned no images.");
  return { urls, modelId: model };
}

/**
 * Multi-reference inventory edit. Falls back to single-image kontext if needed.
 * When staff uploads a look board, run two edit strengths so results stay
 * product-true instead of rebuilding a glossy AI venue.
 */
export async function runFluxEdit(
  tool: MadisonMediaTool,
  job: MadisonMediaJob,
): Promise<MadisonMediaResult> {
  const n = Math.min(Math.max(job.n ?? 2, 1), 4);
  const refs = prepareRefs(job.referenceUrls || [], tool.maxReferences);
  if (!refs.length) {
    throw new Error("Flux edit needs at least one reference photo.");
  }

  const edits = buildShowroomEditPrompts(job.prompt);

  try {
    if (n >= 2) {
      const [tight, polish] = await Promise.all([
        runKontextOnce(refs, edits.tight, 1),
        runKontextOnce(refs, edits.polish, 1),
      ]);
      const urls = [...tight.urls, ...polish.urls].slice(0, n);
      return {
        urls,
        toolId: tool.id,
        toolLabel: tool.label,
        modelId: tight.modelId,
        reason: `Flux inventory edit — keep exact SKUs (${refs.length} refs; tight + polish)`,
      };
    }

    const one = await runKontextOnce(refs, edits.tight, 1);
    return {
      urls: one.urls.slice(0, 1),
      toolId: tool.id,
      toolLabel: tool.label,
      modelId: one.modelId,
      reason: `Flux inventory edit (${refs.length} refs)`,
    };
  } catch (err) {
    // Older/alternate multi path — try flex edit
    console.error("[madison-media] kontext failed, trying flux-2-flex/edit:", err);
    const prompt = withInventoryFidelityPrompt(
      `${job.prompt}\n\nKeep exact Party Perfect rental pieces from every reference. Do not rebuild the tablescape.`,
    );
    const payload = await falRun("fal-ai/flux-2-flex/edit", {
      prompt,
      image_urls: refs.slice(0, 8),
      num_images: n,
      output_format: "jpeg",
      guidance_scale: 5.5,
      num_inference_steps: 28,
    });
    const urls = collectUrls(payload);
    if (!urls.length) throw new Error("Flux flex edit returned no images.");
    return {
      urls: urls.slice(0, n),
      toolId: tool.id,
      toolLabel: tool.label,
      modelId: "fal-ai/flux-2-flex/edit",
      reason: `Flux flex edit fallback (${refs.length} refs)`,
    };
  }
}

export async function runKlingVideo(
  tool: MadisonMediaTool,
  job: MadisonMediaJob,
): Promise<MadisonMediaResult> {
  const refs = prepareRefs(job.referenceUrls || [], 1);
  if (!refs.length) {
    throw new Error("Video needs a still frame or photo to animate.");
  }
  const payload = await falRun(tool.modelId, {
    prompt: withPhotorealPrompt(job.prompt),
    image_url: refs[0],
    duration: "5",
    aspect_ratio: job.aspectRatio === "9:16" ? "9:16" : "16:9",
  });
  const urls = collectUrls(payload);
  if (!urls.length) throw new Error("Kling returned no video.");
  return {
    urls,
    toolId: tool.id,
    toolLabel: tool.label,
    modelId: tool.modelId,
    reason: "Kling image→video",
  };
}
