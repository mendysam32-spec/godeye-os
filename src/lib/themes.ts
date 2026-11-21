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
    desc: "Neon blue · cobalt · cyan · Daylight",
    mode: "light",
    preview: {
      bg:
        "radial-gradient(circle at 80% 15%, rgba(59,91,219,0.24) 0%, transparent 45%)," +
        "radial-gradient(circle at 15% 80%, rgba(6,182,212,0.20) 0%, transparent 45%)," +
        "radial-gradient(circle at 55% 100%, rgba(124,58,237,0.16) 0%, transparent 46%)," +
        "#f4f6fb",
      surface: "linear-gradient(135deg, #ffffff 0%, #ecfeff 55%, #f5f3ff 100%)",
      bar: "rgba(248,249,253,0.88)",
      sidebar: "linear-gradient(165deg, #ffffff 0%, #e0f2fe 50%, #ede9fe 100%)",
      border: "rgba(59,91,219,0.24)",
      text: "#16181d",
      sub: "#5f6b80",
      accent: "linear-gradient(110deg, #3b5bdb 0%, #2563eb 34%, #06b6d4 66%, #7c3aed 100%)",
    },
  },
  {
    id: "sage",
    label: "Sage",
    desc: "Neon moss · lime · teal · Daylight",
    mode: "light",
    preview: {
      bg:
        "radial-gradient(circle at 80% 15%, rgba(77,124,15,0.24) 0%, transparent 45%)," +
        "radial-gradient(circle at 15% 80%, rgba(13,148,136,0.20) 0%, transparent 45%)," +
        "radial-gradient(circle at 55% 100%, rgba(20,184,166,0.16) 0%, transparent 46%)," +
        "#eaf0e5",
      surface: "linear-gradient(135deg, #fbfdf8 0%, #ecfdf5 55%, #f0fdfa 100%)",
      bar: "rgba(244,248,239,0.88)",
      sidebar: "linear-gradient(165deg, #f4f8ef 0%, #d9f99d 45%, #ccfbf1 100%)",
      border: "rgba(77,124,15,0.24)",
      text: "#1c241a",
      sub: "#5c6b54",
      accent: "linear-gradient(110deg, #4d7c0f 0%, #65a30d 34%, #0d9488 66%, #14b8a6 100%)",
    },
  },
  {
    id: "sundial",
    label: "Sundial",
    desc: "Neon amber · orange · rose · Daylight",
    mode: "light",
    preview: {
      bg:
        "radial-gradient(circle at 80% 15%, rgba(245,158,11,0.26) 0%, transparent 45%)," +
        "radial-gradient(circle at 15% 80%, rgba(249,115,22,0.20) 0%, transparent 45%)," +
        "radial-gradient(circle at 55% 100%, rgba(251,113,133,0.16) 0%, transparent 46%)," +
        "#fbeee0",
      surface: "linear-gradient(135deg, #fffaf3 0%, #fff7ed 55%, #fff1f2 100%)",
      bar: "rgba(253,243,230,0.88)",
      sidebar: "linear-gradient(165deg, #f8ecdc 0%, #fde68a 45%, #fecdd3 100%)",
      border: "rgba(217,119,6,0.24)",
      text: "#2a2018",
      sub: "#8a7259",
      accent: "linear-gradient(110deg, #f59e0b 0%, #f97316 34%, #fb7185 66%, #eab308 100%)",
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
      surface: "linear-gradient(135deg, rgba(255,255,255,0.82), rgba(243,232,255,0.6) 55%, rgba(236,254,255,0.6))",
      bar: "rgba(255,255,255,0.62)",
      sidebar: "linear-gradient(165deg, rgba(255,255,255,0.72), rgba(243,232,255,0.5) 50%, rgba(236,254,255,0.5))",
      border: "rgba(124,58,237,0.26)",
      text: "#241b3a",
      sub: "#8b7aa8",
      accent: "linear-gradient(110deg, #7c3aed 0%, #d946ef 34%, #22d3ee 66%, #ec4899 100%)",
    },
  },
  {
    id: "eclipse",
    label: "Eclipse",
    desc: "Neon cyan · blue · Ash graphite",
    mode: "dark",
    preview: {
      bg:
        "radial-gradient(circle at 80% 15%, rgba(6,182,212,0.24) 0%, transparent 45%)," +
        "radial-gradient(circle at 15% 80%, rgba(139,92,246,0.18) 0%, transparent 45%)," +
        "#1b1e1c",
      surface: "linear-gradient(135deg, #232823 0%, #26322f 55%, #2b2632 100%)",
      bar: "#20241f",
      sidebar: "linear-gradient(165deg, #232823 0%, #1c3030 50%, #2a2432 100%)",
      border: "rgba(6,182,212,0.24)",
      text: "#f2f5ea",
      sub: "#9aa694",
      accent: "linear-gradient(110deg, #06b6d4 0%, #3b82f6 34%, #8b5cf6 66%, #14b8a6 100%)",
    },
  },
  {
    id: "abyss",
    label: "Abyss",
    desc: "Neon aqua · indigo · Ash navy",
    mode: "dark",
    preview: {
      bg:
        "radial-gradient(circle at 80% 15%, rgba(34,211,238,0.24) 0%, transparent 45%)," +
        "radial-gradient(circle at 15% 80%, rgba(99,102,241,0.18) 0%, transparent 45%)," +
        "#152531",
      surface: "linear-gradient(135deg, #1b3240 0%, #1a3a45 55%, #25314b 100%)",
      bar: "#162b37",
      sidebar: "linear-gradient(165deg, #1b3240 0%, #153b47 50%, #252f4a 100%)",
      border: "rgba(34,211,238,0.24)",
      text: "#e6f6fb",
      sub: "#9cbcc9",
      accent: "linear-gradient(110deg, #22d3ee 0%, #06b6d4 34%, #3b82f6 66%, #6366f1 100%)",
    },
  },
  {
    id: "ember",
    label: "Ember",
    desc: "Neon copper · amber · Ash ember",
    mode: "dark",
    preview: {
      bg:
        "radial-gradient(circle at 80% 15%, rgba(251,146,60,0.24) 0%, transparent 45%)," +
        "radial-gradient(circle at 15% 80%, rgba(244,63,94,0.18) 0%, transparent 45%)," +
        "#241f1c",
      surface: "linear-gradient(135deg, #302823 0%, #3a2a23 55%, #33252a 100%)",
      bar: "#211c19",
      sidebar: "linear-gradient(165deg, #302823 0%, #3d2a22 50%, #38262c 100%)",
      border: "rgba(251,146,60,0.24)",
      text: "#f5ede4",
      sub: "#bda99b",
      accent: "linear-gradient(110deg, #fb923c 0%, #f59e0b 34%, #f43f5e 66%, #fb7185 100%)",
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
        "linear-gradient(150deg, #241a30, #332146 55%, #1d1729)",
      surface: "linear-gradient(135deg, rgba(52,41,68,0.72), rgba(64,50,82,0.6) 55%, rgba(78,42,74,0.55))",
      bar: "rgba(46,36,60,0.7)",
      sidebar: "linear-gradient(165deg, rgba(52,41,68,0.8), rgba(244,114,182,0.14) 55%, rgba(34,211,238,0.12))",
      border: "rgba(244,114,182,0.24)",
      text: "#f7ecff",
      sub: "#d0bce0",
      accent: "linear-gradient(110deg, #f472b6 0%, #a855f7 34%, #22d3ee 66%, #ec4899 100%)",
    },
  },
  {
    id: "aura-light",
    label: "Aura Light",
    desc: "Neon violet · cyan · Daylight",
    mode: "light",
    preview: {
      bg:
        "radial-gradient(circle at 80% 15%, rgba(124,58,237,0.26) 0%, transparent 45%)," +
        "radial-gradient(circle at 15% 85%, rgba(6,182,212,0.22) 0%, transparent 45%)," +
        "radial-gradient(circle at 55% 100%, rgba(217,70,239,0.16) 0%, transparent 46%)," +
        "#f8fafc",
      surface: "linear-gradient(135deg, rgba(255,255,255,0.82), rgba(243,232,255,0.6) 55%, rgba(236,254,255,0.6))",
      bar: "rgba(255,255,255,0.7)",
      sidebar: "linear-gradient(165deg, rgba(255,255,255,0.82), rgba(237,233,254,0.72) 50%, rgba(224,242,254,0.72))",
      border: "rgba(124,58,237,0.24)",
      text: "#0f172a",
      sub: "#475569",
      accent: "linear-gradient(110deg, #7c3aed 0%, #06b6d4 34%, #d946ef 66%, #2563eb 100%)",
    },
  },
  {
    id: "aura-dark",
    label: "Aura Dark",
    desc: "Neon violet · cyan · Ash night",
    mode: "dark",
    preview: {
      bg:
        "radial-gradient(circle at 80% 15%, rgba(168,85,247,0.30) 0%, transparent 45%)," +
        "radial-gradient(circle at 15% 85%, rgba(34,211,238,0.26) 0%, transparent 45%)," +
        "radial-gradient(circle at 55% 100%, rgba(59,130,246,0.18) 0%, transparent 46%)," +
        "#1b1b26",
      surface: "linear-gradient(135deg, rgba(29,29,44,0.75), rgba(38,36,58,0.65) 55%, rgba(27,40,56,0.6))",
      bar: "rgba(29,29,44,0.68)",
      sidebar: "linear-gradient(165deg, rgba(29,29,44,0.8), rgba(88,28,135,0.2) 50%, rgba(8,145,178,0.16))",
      border: "rgba(56,189,248,0.26)",
      text: "#f8fafc",
      sub: "#a9b4c6",
      accent: "linear-gradient(110deg, #a855f7 0%, #22d3ee 34%, #d946ef 66%, #3b82f6 100%)",
    },
  },
  {
    id: "lime-light",
    label: "Lime Light",
    desc: "Neon lime · cyan · violet · Daylight",
    mode: "light",
    preview: {
      bg:
        "radial-gradient(circle at 80% 15%, rgba(163,230,53,0.30) 0%, transparent 42%)," +
        "radial-gradient(circle at 15% 80%, rgba(34,211,238,0.24) 0%, transparent 44%)," +
        "radial-gradient(circle at 55% 100%, rgba(168,85,247,0.20) 0%, transparent 46%)," +
        "#f7f9f8",
      surface: "linear-gradient(135deg, #ffffff 0%, #ecfeff 55%, #f3e8ff 100%)",
      bar: "rgba(255,255,255,0.76)",
      sidebar: "linear-gradient(165deg, rgba(255,255,255,0.92), rgba(236,254,255,0.8) 50%, rgba(243,232,255,0.85))",
      border: "rgba(16,185,129,0.26)",
      text: "#111815",
      sub: "#4b5563",
      accent: "linear-gradient(110deg, #a3e635 0%, #34d399 34%, #22d3ee 66%, #a855f7 100%)",
    },
  },
  {
    id: "lime-dark",
    label: "Lime Dark",
    desc: "Neon lime · cyan · violet · Ash night",
    mode: "dark",
    preview: {
      bg:
        "radial-gradient(circle at 80% 15%, rgba(163,230,53,0.26) 0%, transparent 45%)," +
        "radial-gradient(circle at 15% 85%, rgba(34,211,238,0.20) 0%, transparent 45%)," +
        "radial-gradient(circle at 55% 100%, rgba(168,85,247,0.16) 0%, transparent 46%)," +
        "#18211b",
      surface: "linear-gradient(135deg, rgba(30,42,35,0.75), rgba(26,48,42,0.65) 55%, rgba(38,34,52,0.6))",
      bar: "rgba(28,39,33,0.68)",
      sidebar: "linear-gradient(165deg, rgba(30,42,35,0.8), rgba(163,230,53,0.14) 50%, rgba(34,211,238,0.12))",
      border: "rgba(163,230,53,0.28)",
      text: "#f3f4f6",
      sub: "#aab6ad",
      accent: "linear-gradient(110deg, #a3e635 0%, #10b981 34%, #22d3ee 66%, #a855f7 100%)",
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
