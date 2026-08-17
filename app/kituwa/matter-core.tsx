"use client";

import { useEffect, useRef } from "react";
import type { MatterUiStatus } from "@/lib/kituwa/types";

function tone(status: MatterUiStatus) {
  if (status === "BLOCKED") return [1, 0.69, 0.13] as const;
  if (status === "WAITING" || status === "WAITING_FOR_APPROVAL") return [0.48, 0.65, 1] as const;
  if (status === "IDLE") return [0.25, 0.45, 0.5] as const;
  return [0.11, 0.88, 0.76] as const;
}

export function MatterCore({ status }: { status: MatterUiStatus }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const live = !["IDLE", "COMPLETE", "BLOCKED", "WAITING", "WAITING_FOR_APPROVAL"].includes(status);
    const draw = (t: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const [r, g, b] = tone(status);
      const cx = w / 2;
      const cy = h / 2 + 6;
      const pulse = live ? 0.55 + 0.45 * Math.sin(t / 320) : 0.35 + 0.08 * Math.sin(t / 900);
      ctx.strokeStyle = `rgba(${r * 255},${g * 255},${b * 255},0.12)`;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, 18 + i * 16, 0, Math.PI * 2);
        ctx.stroke();
      }
      const nodes = 14;
      for (let i = 0; i < nodes; i++) {
        const a = (i / nodes) * Math.PI * 2 + t / 2400;
        const rad = 58 + Math.sin(t / 500 + i) * (live ? 10 : 3);
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad * 0.72;
        ctx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},${0.35 + pulse * 0.4})`;
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        ctx.strokeStyle = `rgba(${r * 255},${g * 255},${b * 255},0.18)`;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 10 + pulse * 8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},${0.2 + pulse * 0.25})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${r * 255},${g * 255},${b * 255})`;
      ctx.fill();
      if (live) {
        for (let i = 0; i < 8; i++) {
          const a = t / 400 + i;
          ctx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},0.35)`;
          ctx.fillRect(cx + Math.cos(a) * 90, cy + Math.sin(a * 1.3) * 40, 2, 2);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  return (
    <div className="kituwa-core-wrap" aria-hidden>
      <canvas ref={ref} />
    </div>
  );
}
