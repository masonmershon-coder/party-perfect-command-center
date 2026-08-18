"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KituwaNav } from "../components/kituwa-nav";
import { MatterTower, MatterFloorDetail } from "../components/matter-tower";
import type { TowerFloorId } from "@/lib/matter/tower";
import type { KituwaState } from "@/lib/kituwa/types";

export default function TowerPage() {
  const [state, setState] = useState<KituwaState | null>(null);
  const [floor, setFloor] = useState<TowerFloorId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/kituwa/state", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = "/kituwa";
          return;
        }
        const data = await res.json();
        setState(data.state);
      })
      .catch(() => setError("Could not load tower state."));
  }, []);

  if (error) return <main className="kituwa-shell"><p className="kituwa-error">{error}</p></main>;
  if (!state) return <main className="kituwa-shell"><p className="kituwa-status">Loading tower…</p></main>;

  return (
    <main className="kituwa-shell">
      <header className="kituwa-top">
        <div>
          <p className="kituwa-brand-word">KITUWA</p>
          <h1 className="kituwa-page-title">Matter Tower</h1>
        </div>
      </header>
      <KituwaNav />
      <MatterTower tasks={state.tasks} selectedFloor={floor} onSelectFloor={setFloor} />
      {floor ? <MatterFloorDetail floor={floor} tasks={state.tasks} /> : null}
      <Link href="/kituwa" className="kituwa-link-btn kituwa-hit">
        Back to command
      </Link>
    </main>
  );
}
