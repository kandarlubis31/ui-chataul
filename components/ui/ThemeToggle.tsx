"use client";

import { useSettingsStore } from "@/lib/store/settingsStore";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useSettingsStore();

  const cycle = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const icon =
    theme === "dark" ? (
      <Moon className="h-4 w-4" />
    ) : theme === "light" ? (
      <Sun className="h-4 w-4" />
    ) : (
      <Sun className="h-4 w-4" />
    );

  return (
    <button
      onClick={cycle}
      className="rounded-lg p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
      aria-label={`Toggle theme (current: ${theme})`}
      title={`Theme: ${theme}`}
    >
      {icon}
    </button>
  );
}
