"use client";

import { useEffect, useRef } from "react";
import type { MatterUiStatus } from "@/lib/kituwa/types";

function tone(status: MatterUiStatus) {
  if (status === "BLOCKED") return [1, 0.69, 0.13] as const;
  if (status === "WAITING" || status === "WAITING_FOR_APPROVAL") return [0.48, 0.65, 1] as const;
  if (status === "IDLE") return [0.25, 0.45, 0.5] as const;
  return [0.61, 0.49, 1] as const;
}

/** Matter entity — not the Kituwa brand ghost. Small repaired robot core. */
export function MatterEntity({ status }: { status: MatterUiStatus }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const live = !["IDLE", "COMPLETE", "BLOCKED", "WAITING", "WAITING_FOR_APPROVAL"].includes(status);
    const draw = (t: number) => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const [r, g, b] = tone(status);
      const cx = w / 2;
      const cy = h / 2 + 4;
      const pulse = reduced ? 0.4 : live ? 0.55 + 0.45 * Math.sin(t / 320) : 0.35 + 0.08 * Math.sin(t / 900);

      ctx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},0.08)`;
      ctx.fillRect(cx - 34, cy - 28, 68, 56);
      ctx.strokeStyle = `rgba(${r * 255},${g * 255},${b * 255},0.35)`;
      ctx.strokeRect(cx - 34, cy - 28, 68, 56);
      ctx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},0.25)`;
      ctx.fillRect(cx - 28, cy - 22, 56, 44);
      ctx.fillStyle = `rgb(${Math.floor(r * 255)},${Math.floor(g * 255)},${Math.floor(b * 255)})`;
      ctx.fillRect(cx - 10, cy - 8, 6, 6);
      ctx.fillRect(cx + 4, cy - 8, 6, 6);
      ctx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},${0.2 + pulse * 0.3})`;
      ctx.beginPath();
      ctx.arc(cx, cy + 10, 8 + pulse * 4, 0, Math.PI * 2);
      ctx.fill();
      if (live && !reduced) {
        ctx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},0.5)`;
        ctx.fillRect(cx - 42, cy + 18, 4, 4);
        ctx.fillRect(cx + 38, cy - 18, 3, 3);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  return (
    <div className="matter-entity-wrap" aria-hidden>
      <canvas ref={ref} />
    </div>
  );
}
