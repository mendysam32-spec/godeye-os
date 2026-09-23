"use client";
import { useEffect } from "react";
import { useGodEye } from "@/lib/store";

const THEMES = ["light", "dark", "glass", "blacklime", "aurora", "indigoblack"] as const;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings, setSettings } = useGodEye();
  useEffect(() => {
    // migrate legacy "system" -> light
    if (!(THEMES as readonly string[]).includes(settings.theme as string)) {
      setSettings({ theme: "light" as any });
      return;
    }
    const root = document.documentElement;
    // remove all theme classes
    THEMES.forEach((t) => root.classList.remove(`theme-${t}`));
    root.classList.remove("dark");

    const theme = settings.theme;
    root.classList.add(`theme-${theme}`);
    // keep .dark for compatibility on dark-like themes
    if (theme === "dark" || theme === "blacklime" || theme === "indigoblack") {
      root.classList.add("dark");
    }

    const accentMap: Record<string, string> = {
      amber: "#f59e0b",
      violet: "#8b5cf6",
      emerald: "#10b981",
      blue: "#3b82f6",
      rose: "#f43f5e",
    };
    root.style.setProperty("--accent", accentMap[settings.accent] || "#f59e0b");
  }, [settings.theme, settings.accent]);
  return <>{children}</>;
}
