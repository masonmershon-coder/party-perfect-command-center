/**
 * Best-effort resume text for Mike scoring.
 * PDF: extract printable strings from content streams (no heavy native deps).
 * Plain text / DOCX-as-text: utf-8 decode.
 */

export async function extractResumeText(input: {
  bytes: Buffer;
  mimeType?: string;
  fileName?: string;
  maxChars?: number;
}): Promise<string> {
  const max = input.maxChars ?? 6000;
  const mime = (input.mimeType || "").toLowerCase();
  const name = (input.fileName || "").toLowerCase();
  const isPdf =
    mime.includes("pdf") || name.endsWith(".pdf") || input.bytes.slice(0, 5).toString() === "%PDF-";
  const isText =
    mime.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv");

  let text = "";
  if (isText) {
    text = input.bytes.toString("utf8");
  } else if (isPdf) {
    text = extractPdfTextRough(input.bytes);
  } else {
    // Unknown binary — try utf8 and keep printable
    text = input.bytes.toString("utf8").replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ");
  }

  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Rough PDF text pull from ( ... ) Tj / TJ operators — good enough for most simple resumes. */
function extractPdfTextRough(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  const chunks: string[] = [];

  // Literal strings: (Hello World) Tj
  const lit = /\((?:\\.|[^\\)]){2,}\)(?:\s*Tj|\s*')/g;
  let m: RegExpExecArray | null;
  while ((m = lit.exec(raw))) {
    const inner = m[0]
      .replace(/\)\s*Tj$/, "")
      .replace(/\)\s*'$/, "")
      .slice(1);
    const decoded = inner
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, " ")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (/[A-Za-z]{2,}/.test(decoded)) chunks.push(decoded);
  }

  // TJ arrays: [(Hello) -20 (World)] TJ
  const tj = /\[((?:[^\]]|\n){0,800})\]\s*TJ/g;
  while ((m = tj.exec(raw))) {
    const parts = [...m[1].matchAll(/\((?:\\.|[^\\)])*\)/g)].map((p) =>
      p[0]
        .slice(1, -1)
        .replace(/\\n/g, " ")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\"),
    );
    const joined = parts.join("");
    if (/[A-Za-z]{2,}/.test(joined)) chunks.push(joined);
  }

  return chunks.join(" ").replace(/\s+/g, " ").trim();
}
