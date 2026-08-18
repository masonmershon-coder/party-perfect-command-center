import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="kituwa-shell">
      <h1 className="kituwa-page-title">Offline</h1>
      <p className="kituwa-prompt">Kituwa cannot reach Matter right now.</p>
      <p className="kituwa-using">Your last saved tasks remain on the server when connectivity returns.</p>
      <Link href="/kituwa" className="kituwa-link-btn kituwa-hit">
        Retry
      </Link>
    </main>
  );
}
