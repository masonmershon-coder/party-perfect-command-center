"use client";

export function LiveModeToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Live Mode"
      onClick={() => onChange(!enabled)}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
        enabled
          ? "border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] pp-accent-text"
          : "border-[var(--pp-border)] bg-[var(--pp-panel)] text-[var(--pp-text-muted)]"
      }`}
    >
      <span
        className={`relative h-5 w-9 rounded-full transition ${
          enabled ? "bg-[var(--pp-accent)]" : "bg-[var(--pp-border)]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
            enabled ? "left-4" : "left-0.5"
          }`}
        />
      </span>
      Live Mode {enabled ? "On" : "Off"}
    </button>
  );
}
