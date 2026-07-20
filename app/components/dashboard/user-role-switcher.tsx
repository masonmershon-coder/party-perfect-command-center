"use client";

export function UserRoleSwitcher({
  role,
  onChange,
}: {
  role: "owner" | "employee";
  onChange: (role: "owner" | "employee") => void;
}) {
  return (
    <div className="flex items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-panel)] p-1 text-xs">
      {(["owner", "employee"] as const).map((option) => {
        const active = role === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-lg px-3 py-1.5 font-semibold capitalize transition ${
              active
                ? "bg-[var(--pp-accent)] text-white"
                : "text-[var(--pp-text-muted)] hover:text-[var(--pp-text)]"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
