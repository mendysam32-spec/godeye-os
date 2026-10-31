/**
 * Theme catalogue — the single source of truth for MEDUSA OS themes.
 *
 * Consumers:
 *  - `globals.css` owns the actual CSS variables (one `.theme-<id>` block per id).
 *    The `preview` hexes below MUST mirror those variables — update both together.
 *  - `theme-provider.tsx` applies the class + accent.
 *  - `settings/page.tsx` renders the scrollable theme gallery from this list.
 *  - the pre-paint script in `app/layout.tsx` re-encodes the ids/hexes (plain JS).
 */

export const THEME_IDS = [
  "daylight",
  "paper",
  "mist",
  "blush",
  "midnight",
  "graphite",
  "obsidian",
  "horizon",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export type ThemeMode = "light" | "dark";

export interface ThemePreview {
  /** Card backdrop (color or CSS gradient) behind the mini app window. */
  bg: string;
  /** Mini window surface. */
  surface: string;
  /** Mini window title bar. */
  bar: string;
  /** Mini sidebar. */
  sidebar: string;
  /** Hairline color used across the mini window. */
  border: string;
  /** Primary text color. */
  text: string;
  /** Secondary text color. */
  sub: string;
  /** Theme-native brand accent (independent of the user accent setting). */
  accent: string;
}

export interface ThemeDef {
  id: ThemeId;
  label: string;
  desc: string;
  mode: ThemeMode;
  preview: ThemePreview;
}

export const THEMES: ThemeDef[] = [
  {
    id: "daylight",
    label: "Daylight",
    desc: "Crisp white • Airy",
    mode: "light",
    preview: {
      bg: "#f4f4f5",
      surface: "#ffffff",
      bar: "#fafafa",
      sidebar: "#f7f7f7",
      border: "#e6e6e8",
      text: "#141414",
      sub: "#6b7280",
      accent: "#2563eb",
    },
  },
  {
    id: "paper",
    label: "Paper",
    desc: "Warm cream • Editorial",
    mode: "light",
    preview: {
      bg: "#efeadf",
      surface: "#fffefb",
      bar: "#f5f2e9",
      sidebar: "#efeadf",
      border: "#e2dccb",
      text: "#252019",
      sub: "#8b8175",
      accent: "#c2410c",
    },
  },
  {
    id: "mist",
    label: "Mist",
    desc: "Cool slate • Soft blue",
    mode: "light",
    preview: {
      bg: "#e8ecf2",
      surface: "#ffffff",
      bar: "#f3f5f8",
      sidebar: "#eef1f5",
      border: "#d9dfe8",
      text: "#101828",
      sub: "#64748b",
      accent: "#0ea5e9",
    },
  },
  {
    id: "blush",
    label: "Blush",
    desc: "Pastel rose • Glassy",
    mode: "light",
    preview: {
      bg:
        "radial-gradient(420px 260px at 8% 0%, rgba(244,114,182,0.38), transparent 60%)," +
        "radial-gradient(380px 240px at 100% 6%, rgba(196,181,253,0.40), transparent 60%)," +
        "radial-gradient(360px 250px at 2% 100%, rgba(253,186,116,0.34), transparent 60%)," +
        "radial-gradient(320px 220px at 96% 100%, rgba(103,232,249,0.28), transparent 60%)," +
        "linear-gradient(120deg, #fdf0f4, #f3edfc 45%, #e9f4fb 78%, #fff4ec)",
      surface: "rgba(255,255,255,0.78)",
      bar: "rgba(255,255,255,0.55)",
      sidebar: "rgba(255,255,255,0.5)",
      border: "rgba(214,120,160,0.28)",
      text: "#3b2230",
      sub: "#a06b83",
      accent: "#f43f5e",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    desc: "Deep slate • Focused",
    mode: "dark",
    preview: {
      bg: "#080b11",
      surface: "#12151d",
      bar: "#0e1118",
      sidebar: "#0e1118",
      border: "#232838",
      text: "#e5e8ef",
      sub: "#8f96a8",
      accent: "#8b93ff",
    },
  },
  {
    id: "graphite",
    label: "Graphite",
    desc: "Neutral gray • Elevated",
    mode: "dark",
    preview: {
      bg: "#0a0a0c",
      surface: "#161617",
      bar: "#131315",
      sidebar: "#131315",
      border: "#2a2a2e",
      text: "#e6e6e8",
      sub: "#9b9ba3",
      accent: "#38bdf8",
    },
  },
  {
    id: "obsidian",
    label: "Obsidian",
    desc: "True black • OLED",
    mode: "dark",
    preview: {
      bg: "#000000",
      surface: "#0a0a0b",
      bar: "#070708",
      sidebar: "#070708",
      border: "#212124",
      text: "#f1f1f2",
      sub: "#97979c",
      accent: "#e8e8ec",
    },
  },
  {
    id: "horizon",
    label: "Horizon",
    desc: "Indigo dusk • Glow",
    mode: "dark",
    preview: {
      bg:
        "radial-gradient(420px 280px at 6% 0%, rgba(167,139,250,0.5), transparent 60%)," +
        "radial-gradient(400px 260px at 100% 4%, rgba(99,102,241,0.45), transparent 60%)," +
        "radial-gradient(360px 260px at 8% 100%, rgba(244,114,182,0.28), transparent 60%)," +
        "linear-gradient(150deg, #131029, #241d55 55%, #150f33)",
      surface: "rgba(255,255,255,0.08)",
      bar: "rgba(255,255,255,0.06)",
      sidebar: "rgba(255,255,255,0.05)",
      border: "rgba(255,255,255,0.16)",
      text: "#ece9ff",
      sub: "#b9b4e4",
      accent: "#a78bfa",
    },
  },
];

export const DEFAULT_THEME: ThemeId = "midnight";

/** Accent presets the user can layer on top of any theme. */
export const ACCENTS = [
  { id: "violet", color: "#8b5cf6" },
  { id: "blue", color: "#3b82f6" },
  { id: "cyan", color: "#06b6d4" },
  { id: "emerald", color: "#10b981" },
  { id: "amber", color: "#f59e0b" },
  { id: "rose", color: "#f43f5e" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];
