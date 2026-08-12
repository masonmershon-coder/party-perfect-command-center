"use client";

export function ConnectorDemoBanner({
  label,
  connectHint,
  onConnect,
  connectLabel = "Connect",
}: {
  label: string;
  connectHint: string;
  onConnect?: () => void;
  connectLabel?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-950 dark:text-amber-100">
      <div>
        <p className="font-semibold uppercase tracking-wider">
          Not connected — demo data
        </p>
        <p className="mt-1 text-[11px] opacity-90">
          {label}. {connectHint}
        </p>
      </div>
      {onConnect ? (
        <button
          type="button"
          onClick={onConnect}
          className="rounded-lg border border-amber-600/40 bg-amber-500/20 px-3 py-1.5 text-[11px] font-semibold hover:bg-amber-500/30"
        >
          {connectLabel}
        </button>
      ) : null}
    </div>
  );
}
