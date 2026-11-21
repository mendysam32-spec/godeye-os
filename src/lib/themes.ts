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
  "aura-light",
  "aura-dark",
  "lime-light",
  "lime-dark",
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
  {
    id: "aura-light",
    label: "Aura Light",
    desc: "Violet & cyan glass · Daylight",
    mode: "light",
    preview: {
      bg:
        "radial-gradient(420px 280px at 6% 0%, rgba(167,139,250,0.30), transparent 60%)," +
        "radial-gradient(400px 260px at 100% 4%, rgba(34,211,238,0.26), transparent 60%)," +
        "linear-gradient(130deg, #f8fafc, #f5f3ff 55%, #ecfeff)",
      surface: "rgba(255,255,255,0.75)",
      bar: "rgba(255,255,255,0.65)",
      sidebar: "rgba(255,255,255,0.6)",
      border: "rgba(124,58,237,0.12)",
      text: "#0f172a",
      sub: "#475569",
      accent: "#7c3aed",
    },
  },
  {
    id: "aura-dark",
    label: "Aura Dark",
    desc: "Violet & cyan glass · Night",
    mode: "dark",
    preview: {
      bg:
        "radial-gradient(420px 280px at 6% 0%, rgba(147,51,234,0.42), transparent 60%)," +
        "radial-gradient(400px 260px at 100% 4%, rgba(6,182,212,0.36), transparent 60%)," +
        "linear-gradient(145deg, #09090f, #160f2b 55%, #06202b)",
      surface: "rgba(18,19,31,0.65)",
      bar: "rgba(18,19,31,0.55)",
      sidebar: "rgba(18,19,31,0.5)",
      border: "rgba(56,189,248,0.2)",
      text: "#f8fafc",
      sub: "#94a3b8",
      accent: "#9333ea",
    },
  },
  {
    id: "lime-light",
    label: "Lime Light",
    desc: "Lime & emerald · Daylight",
    mode: "light",
    preview: {
      bg:
        "radial-gradient(420px 280px at 6% 0%, rgba(163,230,53,0.28), transparent 60%)," +
        "radial-gradient(400px 260px at 100% 4%, rgba(52,211,153,0.22), transparent 60%)," +
        "linear-gradient(130deg, #f7f9f8, #f7fee7 55%, #ecfdf5)",
      surface: "rgba(255,255,255,0.8)",
      bar: "rgba(255,255,255,0.7)",
      sidebar: "rgba(255,255,255,0.65)",
      border: "rgba(16,185,129,0.18)",
      text: "#111815",
      sub: "#4b5563",
      accent: "#65a30d",
    },
  },
  {
    id: "lime-dark",
    label: "Lime Dark",
    desc: "Electric lime wireframe · Night",
    mode: "dark",
    preview: {
      bg:
        "radial-gradient(420px 280px at 6% 0%, rgba(132,204,22,0.32), transparent 60%)," +
        "radial-gradient(400px 260px at 100% 4%, rgba(16,185,129,0.26), transparent 60%)," +
        "linear-gradient(145deg, #0a0d0c, #142017 55%, #04140f)",
      surface: "rgba(17,25,22,0.7)",
      bar: "rgba(17,25,22,0.6)",
      sidebar: "rgba(17,25,22,0.55)",
      border: "rgba(163,230,53,0.22)",
      text: "#f3f4f6",
      sub: "#9ca3af",
      accent: "#a3e635",
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
