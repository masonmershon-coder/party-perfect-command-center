import { randomUUID } from "node:crypto";
import { isKituwaAuthError, kituwaPrivateJson, requireKituwaSession } from "@/lib/kituwa/auth";
import { mutateKituwaState } from "@/lib/kituwa/store";
import type { KituwaAttachment } from "@/lib/kituwa/types";

const MAX_INLINE = 180_000;

function kindOf(mime: string, name: string): KituwaAttachment["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (/\.(pdf|docx?|txt|md)$/i.test(name) || mime.includes("pdf") || mime.startsWith("text/")) {
    return "document";
  }
  return "other";
}

export async function POST(request: Request) {
  const gate = requireKituwaSession(request);
  if (isKituwaAuthError(gate)) return gate;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return kituwaPrivateJson({ error: "file required" }, { status: 400 });
  }
  const att: KituwaAttachment = {
    id: randomUUID(),
    name: file.name || "upload",
    mime: file.type || "application/octet-stream",
    size: file.size,
    kind: kindOf(file.type || "", file.name || ""),
    stored: file.size <= MAX_INLINE ? "inline" : "meta_only",
  };
  const state = await mutateKituwaState((s) => ({
    ...s,
    attachments: [...s.attachments, att],
  }));
  return kituwaPrivateJson({
    ok: true,
    attachment: att,
    note:
      att.stored === "meta_only"
        ? "File recorded. Binary not kept in the control-plane JSON (too large for V1)."
        : "File recorded for this session store.",
    attachmentCount: state.attachments.length,
  });
}
