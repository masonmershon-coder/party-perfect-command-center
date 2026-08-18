"use client";

import { KituwaNav } from "../components/kituwa-nav";

export default function SettingsPage() {
  return (
    <main className="kituwa-shell">
      <header className="kituwa-top">
        <div>
          <p className="kituwa-brand-word">KITUWA</p>
          <h1 className="kituwa-page-title">Settings</h1>
        </div>
      </header>
      <KituwaNav />
      <p className="kituwa-using">Device sessions and notification preferences will live here. PIN changes happen in Vercel env only.</p>
    </main>
  );
}
