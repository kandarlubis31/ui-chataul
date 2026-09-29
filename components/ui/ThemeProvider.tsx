"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useChatStore } from "@/lib/store/chatStore";
import { SplashScreen } from "./SplashScreen";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { loaded, theme } = useSettingsStore();

  useEffect(() => {
    useSettingsStore.getState().load();
    useChatStore.getState().load();
  }, []);

  useEffect(() => {
    if (!loaded) return;

    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
      localStorage.setItem("theme", "system");
    }

    const handleChange = (e: MediaQueryListEvent) => {
      if (useSettingsStore.getState().theme === "system") {
        document.documentElement.classList.toggle("dark", e.matches);
      }
    };

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, [loaded, theme]);

  return (
    <>
      <SplashScreen loaded={loaded} />
      {children}
    </>
  );
}
