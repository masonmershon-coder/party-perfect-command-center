"use client";

import { useTheme } from "@/app/components/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="pp-btn-secondary flex items-center gap-2 px-3 py-2 text-xs font-medium"
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      <span className="text-base">{theme === "light" ? "☾" : "☀"}</span>
      <span>{theme === "light" ? "Dark Mode" : "Daylight"}</span>
    </button>
  );
}
