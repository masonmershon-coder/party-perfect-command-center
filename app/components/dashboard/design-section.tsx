"use client";

import { PageHeader } from "@/app/components/dashboard/page-header";
import { DESIGN_PRESETS } from "@/lib/design-presets";
import type { DesignAsset, DesignMatchedItem, WebsiteCatalogItem } from "@/lib/types";
import { formatTime } from "@/lib/ui";
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_PENDING = 8;
const MAX_CATALOG_PICKS = 6;

type PendingMedia = {
  id: string;
  file: File;
  preview: string;
  /** Still frame pulled from video so Madison can use it visually */
  frameFile?: File;
};

export function DesignSection({
  onAskMadison,
}: {
  onAskMadison?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState<string | null>(null);

  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogHits, setCatalogHits] = useState<WebsiteCatalogItem[]>([]);
  const [pickedCatalog, setPickedCatalog] = useState<WebsiteCatalogItem[]>([]);
  const [catalogMeta, setCatalogMeta] = useState<{
    totalCached: number;
    syncedAt: string | null;
    stale: boolean;
  } | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogSearching, setCatalogSearching] = useState(false);
  const [engineNote, setEngineNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/design");
    const data = (await res.json()) as { assets?: DesignAsset[]; error?: string };
    if (!res.ok) throw new Error(data.error || "Could not load studio.");
    setAssets(data.assets || []);
  }, []);

  const refreshCatalogMeta = useCallback(async (q = "") => {
    const res = await fetch(
      `/api/design/catalog?q=${encodeURIComponent(q)}&limit=24`,
    );
    const data = (await res.json()) as {
      items?: WebsiteCatalogItem[];
      totalCached?: number;
      syncedAt?: string | null;
      stale?: boolean;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error || "Catalog load failed.");
    setCatalogHits(data.items || []);
    setCatalogMeta({
      totalCached: data.totalCached || 0,
      syncedAt: data.syncedAt || null,
      stale: Boolean(data.stale),
    });
  }, []);

  useEffect(() => {
    void refresh()
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Load failed."),
      )
      .finally(() => setLoading(false));
    void refreshCatalogMeta("").catch(() => {
      // empty catalog until sync is fine
    });
    void fetch("/api/design/tools")
      .then((r) => r.json())
      .then((data: {
        falConfigured?: boolean;
        xaiConfigured?: boolean;
        recommendation?: { label?: string } | null;
      }) => {
        if (data.falConfigured) {
          setEngineNote(
            `Madison media: ${data.recommendation?.label || "Flux photoreal"} preferred for realistic looks`,
          );
        } else if (data.xaiConfigured) {
          setEngineNote(
            "Madison media: Grok Imagine (add FAL_KEY for Flux photoreal)",
          );
        } else {
          setEngineNote("No media engine linked yet — add FAL_KEY and/or XAI_API_KEY");
        }
      })
      .catch(() => null);
  }, [refresh, refreshCatalogMeta]);

  useEffect(() => {
    return () => {
      for (const p of pending) {
        if (p.preview.startsWith("blob:")) URL.revokeObjectURL(p.preview);
      }
    };
    // only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = catalogQuery.trim();
    if (!q) {
      void refreshCatalogMeta("");
      return;
    }
    const t = window.setTimeout(() => {
      setCatalogSearching(true);
      void refreshCatalogMeta(q)
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Search failed."),
        )
        .finally(() => setCatalogSearching(false));
    }, 280);
    return () => window.clearTimeout(t);
  }, [catalogQuery, refreshCatalogMeta]);

  function clearPending() {
    setPending((prev) => {
      for (const p of prev) {
        if (p.preview.startsWith("blob:")) URL.revokeObjectURL(p.preview);
      }
      return [];
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePending(id: string) {
    setPending((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.preview.startsWith("blob:")) {
        URL.revokeObjectURL(target.preview);
      }
      return prev.filter((p) => p.id !== id);
    });
  }

  function heicLike(file: File) {
    return (
      /heic|heif/i.test(file.type) ||
      /\.heic$/i.test(file.name) ||
      /\.heif$/i.test(file.name) ||
      /avif/i.test(file.type)
    );
  }

  /** Mac Photos often gives HEIC — convert to JPEG in Safari before upload. */
  async function normalizePickedPhoto(file: File): Promise<File> {
    const name = file.name || "photo.jpg";
    if (!heicLike(file)) return file;

    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("JPEG encode failed");
      return new File(
        [blob],
        name.replace(/\.(heic|heif|avif)$/i, ".jpg"),
        { type: "image/jpeg" },
      );
    } catch {
      return file;
    }
  }

  /** Grab a still from phone video so it shapes the AI look (not mood-only). */
  async function captureVideoFrame(
    file: File,
    atRatio = 0.35,
  ): Promise<File | null> {
    const url = URL.createObjectURL(file);
    try {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = url;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Could not read video"));
      });
      const duration = Number.isFinite(video.duration) ? video.duration : 1;
      const t = Math.min(
        Math.max(duration * atRatio, 0.05),
        Math.max(duration - 0.05, 0.05),
      );
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error("Could not seek video"));
        video.currentTime = t;
      });
      const maxEdge = 1536;
      const scale = Math.min(
        1,
        maxEdge / Math.max(video.videoWidth || 1, video.videoHeight || 1),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((video.videoWidth || 720) * scale));
      canvas.height = Math.max(
        1,
        Math.round((video.videoHeight || 720) * scale),
      );
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88),
      );
      if (!blob) return null;
      const base = (file.name || "clip").replace(/\.[^.]+$/, "");
      return new File([blob], `${base}-frame.jpg`, { type: "image/jpeg" });
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function onPickFile(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = MAX_PENDING - pending.length;
    if (room <= 0) {
      setError(`Look board is full (max ${MAX_PENDING} photos/videos).`);
      return;
    }
    const next: PendingMedia[] = [];
    for (const raw of Array.from(files).slice(0, room)) {
      if (raw.type.startsWith("video/")) {
        const frameFile = await captureVideoFrame(raw);
        next.push({
          id: crypto.randomUUID(),
          file: raw,
          preview: URL.createObjectURL(raw),
          frameFile: frameFile || undefined,
        });
      } else {
        const normalized = await normalizePickedPhoto(raw);
        next.push({
          id: crypto.randomUUID(),
          file: normalized,
          preview: URL.createObjectURL(normalized),
        });
      }
    }
    setPending((prev) => [...prev, ...next].slice(0, MAX_PENDING));
    if (fileRef.current) fileRef.current.value = "";
  }

  function toggleCatalogItem(item: WebsiteCatalogItem) {
    setError(null);
    setPickedCatalog((prev) => {
      if (prev.some((p) => p.key === item.key)) {
        return prev.filter((p) => p.key !== item.key);
      }
      if (prev.length >= MAX_CATALOG_PICKS) {
        setError(`Pick up to ${MAX_CATALOG_PICKS} catalog pieces.`);
        return prev;
      }
      return [...prev, item];
    });
  }

  async function syncCatalog() {
    setCatalogBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/design/catalog", { method: "POST" });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        totalCached?: number;
        syncedAt?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Catalog sync failed.");
      }
      setLastNote(
        `Website catalog synced — ${data.totalCached || 0} items with photos.`,
      );
      await refreshCatalogMeta(catalogQuery.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Catalog sync failed.");
    } finally {
      setCatalogBusy(false);
    }
  }

  async function sendToMadison() {
    const text = command.trim();
    if (!text) {
      setError("Type what you need Madison to create.");
      return;
    }

    setError(null);
    setBusy(true);
    setLastNote(null);
    try {
      const form = new FormData();
      form.set("command", text);
      for (const p of pending) {
        form.append("files", p.file);
        if (p.frameFile) form.append("videoFrames", p.frameFile);
      }
      if (pickedCatalog.length) {
        form.set("catalogKeys", pickedCatalog.map((p) => p.key).join(","));
      }

      const res = await fetch("/api/design/command", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        assets?: DesignAsset[];
        board?: DesignAsset[];
        mediaKind?: string;
        referenceCount?: number;
        preparedCount?: number;
        boardCount?: number;
        matchedItems?: DesignMatchedItem[];
        promptUsed?: string;
        generatorLabel?: string;
        generatorReason?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Madison couldn’t finish that.");
      }

      if (data.board) setAssets(data.board);
      else await refresh();

      const first = data.assets?.[0];
      if (first) setSelectedId(first.id);

      const matchCount = data.matchedItems?.length || 0;
      const boardN = data.boardCount || pending.length;
      const preparedN = data.preparedCount || 0;
      const engine = data.generatorLabel || first?.generatorLabel || "Madison";
      setLastNote(
        `${engine} · ${
          boardN > 0
            ? `look board (${boardN} media${preparedN > 3 ? ` → packed ${preparedN} visuals` : ""})`
            : "command"
        } → 2 looks${matchCount ? ` · ${matchCount} inventory matches` : ""}.`,
      );
      clearPending();
      setPickedCatalog([]);
      setCommand("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch("/api/design", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Delete failed.");
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  const selected =
    assets.find((a) => a.id === selectedId) ||
    assets.find((a) => a.kind === "generated") ||
    assets[0] ||
    null;

  const slotsLeft = Math.max(0, MAX_PENDING - pending.length);

  return (
    <div className="mx-auto max-w-xl space-y-5 pb-8">
      <PageHeader
        eyebrow="Madison · Design Studio"
        title="Design Studio"
        description="Build a look board with multiple photos & videos, then Madison returns 2 options that match what we rent."
        action={
          onAskMadison ? (
            <button
              type="button"
              onClick={onAskMadison}
              className="pp-btn-secondary px-3 py-2 text-xs font-medium"
            >
              Full Madison chat
            </button>
          ) : null
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}
      {lastNote && !error && (
        <div className="rounded-xl border border-[var(--pp-accent)]/30 bg-[var(--pp-accent-soft)] px-4 py-3 text-sm text-[var(--pp-text)]">
          {lastNote}
        </div>
      )}
      {engineNote && !error && (
        <p className="text-[11px] text-[var(--pp-text-muted)]">{engineNote}</p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,image/heic,image/heif"
        multiple
        className="sr-only"
        onChange={(e) => void onPickFile(e.target.files)}
      />

      <section className="space-y-3 rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4">
        <div>
          <p className="text-sm font-semibold text-[var(--pp-text)]">
            Look board · photos & videos
          </p>
          <p className="text-xs text-[var(--pp-text-muted)]">
            Add everything that shows the vibe you want. Madison still gives you 2 looks.
          </p>
        </div>

        {pending.length > 0 || pickedCatalog.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {pending.map((p) => (
              <div
                key={p.id}
                className="relative aspect-square overflow-hidden rounded-xl bg-black"
              >
                {p.file.type.startsWith("video/") ? (
                  <video
                    src={p.preview}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.preview}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
                {p.file.type.startsWith("video/") && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] uppercase text-white">
                    Video
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removePending(p.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white"
                >
                  ✕
                </button>
              </div>
            ))}
            {pickedCatalog.map((item) => (
              <div
                key={item.key}
                className="relative aspect-square overflow-hidden rounded-xl border border-[var(--pp-accent)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-0 left-0 right-0 truncate bg-black/65 px-1 py-0.5 text-[9px] text-white">
                  {item.name}
                </span>
                <button
                  type="button"
                  onClick={() => toggleCatalogItem(item)}
                  className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white"
                >
                  ✕
                </button>
              </div>
            ))}
            {slotsLeft > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-[var(--pp-accent)]/50 text-xs text-[var(--pp-text-muted)]"
              >
                + Add
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--pp-accent)]/60 bg-[var(--pp-accent-soft)] px-4 py-10 text-center active:scale-[0.99]"
          >
            <span className="text-3xl text-[var(--pp-accent)]">📷</span>
            <span className="text-lg font-semibold text-[var(--pp-text)]">
              Add photos or videos
            </span>
            <span className="text-xs text-[var(--pp-text-muted)]">
              Multi-select from camera roll · up to {MAX_PENDING}
            </span>
          </button>
        )}

        {pending.length > 0 && (
          <button
            type="button"
            disabled={busy || slotsLeft <= 0}
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-xl border border-[var(--pp-border)] py-3 text-sm font-medium text-[var(--pp-text)] disabled:opacity-50"
          >
            Add more photos or videos ({pending.length}/{MAX_PENDING})
          </button>
        )}

        <div className="flex flex-wrap gap-2">
          {DESIGN_PRESETS.slice(0, 4).map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setCommand(preset.label)}
              className="rounded-full border border-[var(--pp-border)] px-3 py-1.5 text-xs text-[var(--pp-text-muted)]"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--pp-text-muted)]">
            Command for Madison
          </span>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            rows={3}
            placeholder="Example: Turn this look board into a black & gold charity gala tablescape"
            className="mt-2 w-full rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-3 text-base leading-6 text-[var(--pp-text)] outline-none focus:border-[var(--pp-accent)]"
          />
        </label>

        <button
          type="button"
          disabled={busy || !command.trim()}
          onClick={() => void sendToMadison()}
          className="pp-btn-primary w-full py-4 text-base font-semibold disabled:opacity-50"
        >
          {busy ? "Madison is building…" : "Send to Madison"}
        </button>
        <p className="text-center text-[11px] text-[var(--pp-text-muted)]">
          Dump in the photos/videos for the look you want — she always returns 2 options.
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--pp-text)]">
              Website inventory
            </p>
            <p className="text-xs text-[var(--pp-text-muted)]">
              Same catalog as the public site — pick exact pieces so AI isn’t fake.
            </p>
          </div>
          <button
            type="button"
            disabled={catalogBusy}
            onClick={() => void syncCatalog()}
            className="shrink-0 rounded-lg border border-[var(--pp-border)] px-3 py-2 text-xs font-medium text-[var(--pp-text)] disabled:opacity-50"
          >
            {catalogBusy ? "Syncing…" : "Sync catalog"}
          </button>
        </div>
        <p className="text-[11px] text-[var(--pp-text-muted)]">
          {catalogMeta?.totalCached
            ? `${catalogMeta.totalCached.toLocaleString()} photos cached${
                catalogMeta.syncedAt
                  ? ` · ${new Date(catalogMeta.syncedAt).toLocaleDateString()}`
                  : ""
              }${catalogMeta.stale ? " · refresh recommended" : ""}`
            : "Not synced yet — tap Sync catalog (takes ~1–2 min)."}
        </p>
        <input
          value={catalogQuery}
          onChange={(e) => setCatalogQuery(e.target.value)}
          placeholder="Search linens, chargers, bars, chairs…"
          className="w-full rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5 text-sm text-[var(--pp-text)] outline-none focus:border-[var(--pp-accent)]"
        />
        {catalogSearching && (
          <p className="text-[11px] text-[var(--pp-text-muted)]">Searching…</p>
        )}
        <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
          {catalogHits.map((item) => {
            const picked = pickedCatalog.some((p) => p.key === item.key);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleCatalogItem(item)}
                className={`relative aspect-square overflow-hidden rounded-xl border-2 text-left ${
                  picked
                    ? "border-[var(--pp-accent)]"
                    : "border-transparent"
                }`}
                title={item.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[9px] text-white">
                  {item.name}
                </span>
              </button>
            );
          })}
        </div>
        {!catalogHits.length && catalogMeta?.totalCached === 0 && (
          <p className="text-xs text-[var(--pp-text-muted)]">
            Sync once to pull product photos from partyperfecteventrental.com.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)]">
        {selected ? (
          <div>
            {selected.mimeType.startsWith("video/") ? (
              <video
                src={selected.url}
                controls
                playsInline
                className="aspect-[4/3] w-full bg-black object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.url}
                alt={selected.prompt || selected.fileName}
                className="aspect-[4/3] w-full object-cover"
              />
            )}
            <div className="space-y-2 p-4">
              <p className="text-sm font-medium text-[var(--pp-text)]">
                {selected.kind === "generated" ? "Madison result" : "Upload"}
                {selected.generatorLabel
                  ? ` · ${selected.generatorLabel}`
                  : ""}
              </p>
              {selected.prompt && (
                <p className="text-xs leading-5 text-[var(--pp-text-muted)]">
                  {selected.prompt}
                </p>
              )}
              {selected.matchedItems && selected.matchedItems.length > 0 && (
                <div className="space-y-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">
                    Match for sales close
                  </p>
                  <ul className="space-y-2">
                    {selected.matchedItems.slice(0, 8).map((m) => (
                      <li
                        key={m.key}
                        className="flex items-center gap-2 text-xs text-[var(--pp-text)]"
                      >
                        {m.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.imageUrl}
                            alt=""
                            className="h-9 w-9 rounded-md object-cover"
                          />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--pp-surface)] text-[10px]">
                            SKU
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{m.name}</p>
                          <p className="truncate text-[10px] text-[var(--pp-text-muted)]">
                            {[m.categoryName, m.porItemId && `POR ${m.porItemId}`]
                              .filter(Boolean)
                              .join(" · ")}
                            {typeof m.porAvailable === "number"
                              ? ` · avail ${m.porAvailable}`
                              : ""}
                            {typeof m.porPricePerDay === "number"
                              ? ` · $${m.porPricePerDay}/day`
                              : ""}
                          </p>
                        </div>
                        {m.pageUrl && (
                          <a
                            href={m.pageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 text-[10px] text-[var(--pp-accent)]"
                          >
                            Site
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[11px] text-[var(--pp-text-muted)]">
                {formatTime(selected.createdAt)}
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  className="pp-btn-secondary px-3 py-2 text-xs font-medium"
                >
                  Open / save
                </a>
                <button
                  type="button"
                  onClick={() => void handleDelete(selected.id)}
                  className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-500"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center px-6 text-center text-sm text-[var(--pp-text-muted)]">
            {loading ? "Loading…" : "Results show here after you send."}
          </div>
        )}
      </section>

      {assets.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--pp-text-muted)]">
            Recent ({assets.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {assets.slice(0, 12).map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setSelectedId(asset.id)}
                className={`relative aspect-square overflow-hidden rounded-xl border-2 ${
                  selected?.id === asset.id
                    ? "border-[var(--pp-accent)]"
                    : "border-transparent"
                }`}
              >
                {asset.mimeType.startsWith("video/") ? (
                  <div className="flex h-full w-full items-center justify-center bg-black/80 text-xs text-white">
                    Video
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
                {asset.kind === "generated" && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] uppercase text-white">
                    AI
                  </span>
                )}
                {asset.matchedItems && asset.matchedItems.length > 0 && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                    {asset.matchedItems.length} SKU
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
