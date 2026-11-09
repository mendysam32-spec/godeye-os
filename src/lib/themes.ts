/**
 * Theme catalogue - the single source of truth for MEDUSA OS themes.
 *
 * Consumers:
 *  - `globals.css` owns the actual CSS variables (one `.theme-<id>` block per id).
 *    The `preview` hexes below MUST mirror those variables - update both together.
 *  - `theme-provider.tsx` applies the class + accent.
 *  - `settings/page.tsx` renders the scrollable theme gallery from this list.
 *  - the pre-paint script in `app/layout.tsx` re-encodes the ids/hexes (plain JS).
 */

export const THEME_IDS = [
  "porcelain",
  "sage",
  "sundial",
  "lilac",
  "eclipse",
  "abyss",
  "ember",
  "vapor",
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
    id: "porcelain",
    label: "Porcelain",
    desc: "Cool white · Cobalt",
    mode: "light",
    preview: {
      bg: "#f4f6fb",
      surface: "#ffffff",
      bar: "#f8f9fd",
      sidebar: "#eef1f8",
      border: "#e2e6f0",
      text: "#16181d",
      sub: "#6b7280",
      accent: "#3b5bdb",
    },
  },
  {
    id: "sage",
    label: "Sage",
    desc: "Botanical calm · Moss",
    mode: "light",
    preview: {
      bg: "#eaf0e5",
      surface: "#fbfdf8",
      bar: "#f4f8ef",
      sidebar: "#e6ede0",
      border: "#d8e2cf",
      text: "#1c241a",
      sub: "#6b7a63",
      accent: "#4d7c0f",
    },
  },
  {
    id: "sundial",
    label: "Sundial",
    desc: "Sunlit cream · Amber",
    mode: "light",
    preview: {
      bg: "#fbeee0",
      surface: "#fffaf3",
      bar: "#fdf3e6",
      sidebar: "#f8ecdc",
      border: "#eddfc9",
      text: "#2a2018",
      sub: "#8a7259",
      accent: "#d97706",
    },
  },
  {
    id: "lilac",
    label: "Lilac",
    desc: "Pale violet · Glass",
    mode: "light",
    preview: {
      bg:
        "radial-gradient(420px 260px at 8% 0%, rgba(196,181,253,0.45), transparent 60%)," +
        "radial-gradient(380px 240px at 100% 6%, rgba(251,207,232,0.42), transparent 60%)," +
        "radial-gradient(360px 250px at 2% 100%, rgba(165,243,252,0.30), transparent 60%)," +
        "linear-gradient(120deg, #f7f2ff, #f1ecfd 48%, #eef5fd 78%, #fdf2f8)",
      surface: "rgba(255,255,255,0.78)",
      bar: "rgba(255,255,255,0.55)",
      sidebar: "rgba(255,255,255,0.5)",
      border: "rgba(124,58,237,0.22)",
      text: "#241b3a",
      sub: "#8b7aa8",
      accent: "#7c3aed",
    },
  },
  {
    id: "eclipse",
    label: "Eclipse",
    desc: "True black · Electric cyan",
    mode: "dark",
    preview: {
      bg: "#050505",
      surface: "#0c0d0c",
      bar: "#080908",
      sidebar: "#080908",
      border: "#1e211a",
      text: "#f2f5ea",
      sub: "#8f9a84",
      accent: "#06b6d4",
    },
  },
  {
    id: "abyss",
    label: "Abyss",
    desc: "Deep ocean · Aqua",
    mode: "dark",
    preview: {
      bg: "#04101a",
      surface: "#0a1a24",
      bar: "#061520",
      sidebar: "#061520",
      border: "#143243",
      text: "#e6f6fb",
      sub: "#7fa6b5",
      accent: "#22d3ee",
    },
  },
  {
    id: "ember",
    label: "Ember",
    desc: "Warm charcoal · Copper",
    mode: "dark",
    preview: {
      bg: "#100e0c",
      surface: "#1a1714",
      bar: "#15120f",
      sidebar: "#15120f",
      border: "#2f2822",
      text: "#f5ede4",
      sub: "#a89383",
      accent: "#fb923c",
    },
  },
  {
    id: "vapor",
    label: "Vapor",
    desc: "Synth dusk · Neon pink",
    mode: "dark",
    preview: {
      bg:
        "radial-gradient(420px 280px at 6% 0%, rgba(244,114,182,0.45), transparent 60%)," +
        "radial-gradient(400px 260px at 100% 4%, rgba(34,211,238,0.32), transparent 60%)," +
        "radial-gradient(360px 260px at 8% 100%, rgba(167,139,250,0.35), transparent 60%)," +
        "linear-gradient(150deg, #150b24, #241038 55%, #0e0a1c)",
      surface: "rgba(255,255,255,0.07)",
      bar: "rgba(255,255,255,0.05)",
      sidebar: "rgba(255,255,255,0.04)",
      border: "rgba(255,255,255,0.14)",
      text: "#f7ecff",
      sub: "#c4a9d9",
      accent: "#f472b6",
    },
  },
];

export const DEFAULT_THEME: ThemeId = "eclipse";

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
