import { isDurableBlobConfigured } from "@/lib/durable-json";

const MAX_RESUME_BYTES = 8 * 1024 * 1024;
const MAX_INLINE_BYTES = 1.5 * 1024 * 1024;

const ALLOWED_RESUME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
}

export function isAllowedResumeMime(mime: string, fileName?: string) {
  const m = mime.toLowerCase();
  if (ALLOWED_RESUME.has(m)) return true;
  if (m === "application/octet-stream" && fileName) {
    return /\.(pdf|doc|docx|jpe?g|png|webp|heic|heif)$/i.test(fileName);
  }
  return false;
}

export type StoredJobResume = {
  fileName: string;
  mimeType: string;
  blobPathname?: string;
  dataUrl?: string;
};

/**
 * Store an applicant resume in private Vercel Blob (preferred),
 * or inline data URI for small files when Blob is not linked.
 */
export async function storeJobResume(input: {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
  applicationId: string;
}): Promise<StoredJobResume> {
  if (input.bytes.length > MAX_RESUME_BYTES) {
    throw new Error("Resume must be under 8MB.");
  }
  const mimeType = (input.mimeType || "application/octet-stream").toLowerCase();
  if (!isAllowedResumeMime(mimeType, input.fileName)) {
    throw new Error("Upload a PDF, Word doc, or photo of your resume.");
  }

  const safeName = input.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const fileName = safeName || "resume.pdf";

  if (isDurableBlobConfigured()) {
    const { put } = await import("@vercel/blob");
    const pathname = `pp-data/jobs/resumes/${input.applicationId}-${safeName}`;
    await put(pathname, input.bytes, {
      access: "private",
      contentType: mimeType,
      addRandomSuffix: false,
      token: blobToken(),
    });
    return {
      fileName,
      mimeType,
      blobPathname: pathname,
    };
  }

  if (input.bytes.length > MAX_INLINE_BYTES) {
    throw new Error(
      "Resume storage isn’t fully configured yet — try a smaller PDF (under ~1.5MB) or skip resume and we’ll still take your application.",
    );
  }

  return {
    fileName,
    mimeType,
    dataUrl: `data:${mimeType};base64,${input.bytes.toString("base64")}`,
  };
}

export async function readJobResumeBytes(input: {
  blobPathname?: string;
  dataUrl?: string;
  mimeType?: string;
}): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (input.dataUrl?.startsWith("data:")) {
    const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(input.dataUrl);
    if (!match) return null;
    return {
      mimeType: match[1],
      bytes: Buffer.from(match[2], "base64"),
    };
  }

  if (input.blobPathname && isDurableBlobConfigured()) {
    const { get } = await import("@vercel/blob");
    const result = await get(input.blobPathname, {
      access: "private",
      token: blobToken(),
    });
    if (!result?.stream) return null;
    const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
    return {
      bytes,
      mimeType:
        result.blob?.contentType || input.mimeType || "application/octet-stream",
    };
  }

  return null;
}

export function applicationHasResume(app: {
  resumeBlobPathname?: string;
  resumeDataUrl?: string;
  resumeFileName?: string;
}) {
  return Boolean(
    app.resumeBlobPathname || app.resumeDataUrl || app.resumeFileName,
  );
}
