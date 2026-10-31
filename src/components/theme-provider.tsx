"use client";
import { useEffect } from "react";
import { useMEDUSA } from "@/lib/store";
import { THEMES, DEFAULT_THEME, ACCENTS, type ThemeId } from "@/lib/themes";

/** First-generation theme ids → their closest successor in the new collection. */
const MIGRATION: Record<string, ThemeId | null> = {
  light: "daylight",
  dark: "midnight",
  glass: "blush",
  blacklime: "obsidian",
  aurora: "horizon",
  indigoblack: "graphite",
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings, setSettings } = useMEDUSA();
  const raw = settings.theme as string;
  const theme: ThemeId | null = THEMES.find((t) => t.id === raw)?.id ?? null;

  useEffect(() => {
    if (!theme) {
      // Unrecognized/first-generation theme — map it forward (persist the fix).
      setSettings({ theme: MIGRATION[raw] ?? DEFAULT_THEME });
      return;
    }
    const root = document.documentElement;
    // Strip any previously applied theme class (robust against renamed ids).
    for (const c of Array.from(root.classList)) {
      if (c.startsWith("theme-")) root.classList.remove(c);
    }
    root.classList.remove("dark");

    root.classList.add(`theme-${theme}`);
    const def = THEMES.find((t) => t.id === theme);
    if (def?.mode === "dark") root.classList.add("dark");

    const hex = ACCENTS.find((a) => a.id === settings.accent)?.color;
    if (hex) root.style.setProperty("--accent", hex);
  }, [theme, raw, settings.accent, setSettings]);

  return <>{children}</>;
}
