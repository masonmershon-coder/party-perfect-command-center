import { grokClient } from "@/lib/grok";
import { candidatesFromText } from "@/lib/quote-candidates";
import { candidatesForTermWithMemory } from "@/lib/quote-match-memory";
import { searchPorCatalog } from "@/lib/por-catalog";

/**
 * Quoting photo intake:
 *  - tablescape: vision → piece terms → top-2 SKU options (with learning boost)
 *  - handwriting: OCR the paper Rental Proposal → qty+item lines → same candidates
 */

export type QuotePhotoMode = "tablescape" | "handwriting";

export type QuotePhotoCandidateLine = {
  qty: number;
  term: string;
  candidates: Array<{
    sku: string;
    name: string;
    category?: string;
    ratePerDay: number;
    qty: number;
    available: number;
    num?: string;
    score: number;
    learned?: boolean;
  }>;
};

async function fileToDataUrl(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function describeTablescapeTerms(
  imageUrls: string[],
  command: string,
): Promise<string[]> {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    {
      type: "text",
      text: [
        `Staff note: ${command || "(none)"}`,
        "List EVERY distinct Party Perfect rental piece visible across these photos.",
        "Be specific (color + item), e.g. \"champagne gold charger\", \"ivory satin napkin\", \"crossback chair\".",
        "Return ONLY a JSON array of short search phrases (4–12). No qty guesses unless printed on a tag.",
      ].join("\n"),
    },
    ...imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    })),
  ];

  const res = await grokClient.chat.completions.create({
    model: "grok-4.3",
    messages: [
      {
        role: "system",
        content:
          "You are Madison for Party Perfect Event Rentals (Tulsa). Identify real rental inventory in showroom photos. JSON array only.",
      },
      { role: "user", content: content as never },
    ] as never,
    max_tokens: 320,
  });

  const raw = res.choices[0]?.message?.content?.trim() || "";
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
  if (!Array.isArray(parsed)) return [];
  const terms = parsed
    .map((v) => String(v || "").trim())
    .filter((v) => v.length >= 3 && v.length <= 80);
  // de-dupe case-insensitive
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.slice(0, 12);
}

async function readHandwrittenTicket(
  imageUrls: string[],
  command: string,
): Promise<string> {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    {
      type: "text",
      text: [
        "This is a handwritten Party Perfect Rental Proposal / quote ticket.",
        "Read every line item you can: quantity + item description (size/color if written).",
        'Return ONLY a single plain text string like: "120 gold chargers, 130 forks, 12 round tables, 120 wine glasses"',
        "If customer name / event date are clearly written, append: \"; customer: NAME; event: YYYY-MM-DD\" when possible.",
        `Staff note: ${command || "(none)"}`,
      ].join("\n"),
    },
    ...imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    })),
  ];

  const res = await grokClient.chat.completions.create({
    model: "grok-4.3",
    messages: [
      {
        role: "system",
        content:
          "You are Madison reading showroom handwritten rental tickets. Output one comma-separated qty+item list only.",
      },
      { role: "user", content: content as never },
    ] as never,
    max_tokens: 400,
  });

  return (res.choices[0]?.message?.content || "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

export async function quoteCandidatesFromPhotos(input: {
  files: File[];
  mode: QuotePhotoMode;
  command?: string;
  perItem?: number;
}): Promise<{
  mode: QuotePhotoMode;
  lines: QuotePhotoCandidateLine[];
  searchTerms: string[];
  transcribed?: string;
  usedVision: boolean;
}> {
  const perItem = input.perItem ?? 2;
  const urls = await Promise.all(input.files.map(fileToDataUrl));
  if (!urls.length) {
    return {
      mode: input.mode,
      lines: [],
      searchTerms: [],
      usedVision: false,
    };
  }

  if (input.mode === "handwriting") {
    const transcribed = await readHandwrittenTicket(
      urls,
      input.command || "",
    );
    // Strip trailing meta so candidates parser focuses on items
    const itemText = transcribed.split(/;\s*customer:/i)[0].trim();
    const lines = await candidatesFromText(itemText || transcribed, perItem);
    // Boost with memory
    const enriched: QuotePhotoCandidateLine[] = [];
    for (const line of lines) {
      const withMem = await candidatesForTermWithMemory(
        line.term,
        line.qty,
        perItem,
      );
      enriched.push(withMem);
    }
    return {
      mode: "handwriting",
      lines: enriched,
      searchTerms: lines.map((l) => l.term),
      transcribed,
      usedVision: true,
    };
  }

  const terms = await describeTablescapeTerms(urls, input.command || "");
  const lines: QuotePhotoCandidateLine[] = [];
  for (const term of terms) {
    lines.push(await candidatesForTermWithMemory(term, 1, perItem));
  }

  // If vision returned nothing useful, fall back to command text search
  if (!lines.length && input.command?.trim()) {
    const hits = await searchPorCatalog(input.command.trim(), perItem);
    if (hits.length) {
      lines.push({
        qty: 1,
        term: input.command.trim(),
        candidates: hits.map((h) => ({ ...h, learned: false })),
      });
    }
  }

  return {
    mode: "tablescape",
    lines,
    searchTerms: terms,
    usedVision: terms.length > 0,
  };
}
