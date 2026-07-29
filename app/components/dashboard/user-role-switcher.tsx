"use client";

export function UserRoleSwitcher({
  role,
  ownerLocked,
  onChange,
  onRequestOwner,
}: {
  role: "owner" | "employee";
  ownerLocked?: boolean;
  onChange: (role: "owner" | "employee") => void;
  onRequestOwner: () => void;
}) {
  return (
    <div className="flex items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-panel)] p-1 text-xs">
      {(["owner", "employee"] as const).map((option) => {
        const active = role === option;
        const isLockedOwner = option === "owner" && ownerLocked;
        return (
          <button
            key={option}
            type="button"
            onClick={() => {
              if (option === "owner" && ownerLocked) {
                onRequestOwner();
                return;
              }
              onChange(option);
            }}
            className={`rounded-lg px-3 py-1.5 font-semibold capitalize transition ${
              active
                ? "bg-[var(--pp-accent)] text-white"
                : "text-[var(--pp-text-muted)] hover:text-[var(--pp-text)]"
            } ${isLockedOwner && !active ? "opacity-80" : ""}`}
          >
            {option}
            {isLockedOwner && !active ? " 🔒" : ""}
          </button>
        );
      })}
    </div>
  );
}
