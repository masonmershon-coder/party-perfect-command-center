"use client";

import { PageHeader } from "@/app/components/dashboard/page-header";
import { DESIGN_PRESETS } from "@/lib/design-presets";
import type { DesignAsset } from "@/lib/types";
import { formatTime } from "@/lib/ui";
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_PENDING = 8;

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
  const [engineNote, setEngineNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/design");
    const data = (await res.json()) as { assets?: DesignAsset[]; error?: string };
    if (!res.ok) throw new Error(data.error || "Could not load studio.");
    setAssets(data.assets || []);
  }, []);

  useEffect(() => {
    void refresh()
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Load failed."),
      )
      .finally(() => setLoading(false));

    // Silent background: Madison refreshes website product photos if stale.
    void (async () => {
      try {
        const res = await fetch("/api/design/catalog");
        const data = (await res.json()) as {
          totalCached?: number;
          stale?: boolean;
        };
        if (!res.ok) return;
        if ((data.totalCached || 0) === 0 || data.stale) {
          await fetch("/api/design/catalog", { method: "POST" });
        }
      } catch {
        // Designers never need to see catalog plumbing.
      }
    })();

    void fetch("/api/design/tools")
      .then((r) => r.json())
      .then(
        (data: {
          falConfigured?: boolean;
          recommendation?: { label?: string } | null;
          xaiConfigured?: boolean;
        }) => {
          if (data.falConfigured) {
            setEngineNote(
              data.recommendation?.label
                ? `Madison · ${data.recommendation.label}`
                : "Madison · Flux inventory edit",
            );
          } else if (data.xaiConfigured) {
            setEngineNote("Madison · Grok Imagine");
          }
        },
      )
      .catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      for (const p of pending) {
        if (p.preview.startsWith("blob:")) URL.revokeObjectURL(p.preview);
      }
    };
    // only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

      const res = await fetch("/api/design/command", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        assets?: DesignAsset[];
        board?: DesignAsset[];
        preparedCount?: number;
        boardCount?: number;
        matchedItems?: DesignAsset["matchedItems"];
        generatorLabel?: string;
        madisonLinkedInventory?: {
          usedVision?: boolean;
        };
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
      const engine = data.generatorLabel || first?.generatorLabel || "Madison";
      setLastNote(
        `${engine} built ${data.assets?.length || 0} look${
          (data.assets?.length || 0) === 1 ? "" : "s"
        }${boardN ? ` from your photos` : ""}${
          matchCount
            ? data.madisonLinkedInventory?.usedVision
              ? ` · matched ${matchCount} rental pieces`
              : ` · matched ${matchCount} pieces`
            : ""
        }.`,
      );
      clearPending();
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
        description="Add photos, tell Madison what you need — she returns 2 looks that match what we rent."
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
            Drop in showroom photos. Madison returns 2 looks.
          </p>
        </div>

        {pending.length > 0 ? (
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
            placeholder="Example: Polish this showroom tablescape for a client proposal — keep these exact linens and chairs"
            className="mt-2 w-full rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-3 text-base leading-6 text-[var(--pp-text)] outline-none focus:border-[var(--pp-accent)]"
          />
          <p className="mt-2 text-[11px] leading-5 text-[var(--pp-text-muted)]">
            Madison matches inventory in the background — just send the photos.
          </p>
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
                <p className="text-xs text-[var(--pp-text-muted)]">
                  Madison matched {selected.matchedItems.length} rental piece
                  {selected.matchedItems.length === 1 ? "" : "s"} in the background.
                </p>
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
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
