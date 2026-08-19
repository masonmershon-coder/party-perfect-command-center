"use client";

import { useEffect, useRef, useState } from "react";
import { MatterDiorama } from "./matter-diorama";
import { FLOOR_SPECS, type TowerFloorId } from "@/lib/matter/tower";

export function MatterFloorScene({
  floor,
  lit,
  busy,
  blocked,
  workerCount,
  tall = false,
}: {
  floor: TowerFloorId;
  lit: boolean;
  busy: boolean;
  blocked: boolean;
  workerCount: number;
  tall?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const sync = (onScreen: boolean) => {
      setAnimate(onScreen && !document.hidden);
    };
    const io = new IntersectionObserver(
      ([entry]) => sync(entry.isIntersecting),
      { rootMargin: "48px", threshold: 0.05 },
    );
    io.observe(node);
    const onVis = () => sync(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const spec = FLOOR_SPECS[floor];

  return (
    <div
      ref={ref}
      className="matter-floor-scene"
      data-floor={floor}
      data-lit={lit ? "1" : "0"}
      data-busy={busy ? "1" : "0"}
      data-blocked={blocked ? "1" : "0"}
      data-tall={tall ? "1" : "0"}
      data-animate={animate ? "1" : "0"}
      style={{ ["--floor-accent" as string]: spec.accent }}
      aria-hidden
    >
      <MatterDiorama
        floor={floor}
        lit={lit}
        busy={busy}
        blocked={blocked}
        workerCount={workerCount}
        tall={tall}
      />
      {blocked ? <span className="matter-floor-warn">HOLD</span> : null}
      {busy ? <span className="matter-floor-scanline" /> : null}
    </div>
  );
}
