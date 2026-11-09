// Pure skill types + prompt building. Imported by both the browser (Skills page,
// chat composer) and the server (`/api/chat`), so it must never touch `window`,
// IndexedDB or any other browser-only API.

export type SkillSource = "builtin" | "upload";

export interface InstalledSkill {
  /** Stable slug used for the IndexedDB package key and the on-disk folder. */
  id: string;
  name: string;
  description: string;
  version?: string;
  source: SkillSource;
  enabled: boolean;
  /** SKILL.md body, sent to the model when the skill is enabled. */
  instructions: string;
  /** Relative path of the manifest inside the package (normally "SKILL.md"). */
  entry: string;
  /** Relative paths of every file in the package (capped for the store). */
  files: string[];
  fileCount: number;
  bytes: number;
  /** Absolute folder when the package was written to disk (desktop app). */
  diskPath?: string;
  installedAt: string;
  updatedAt: string;
}

/** The slice of a skill the server needs to brief the model. */
export interface SkillPromptSkill {
  name: string;
  description?: string;
  instructions: string;
  diskPath?: string;
  files?: string[];
}

const MAX_INSTRUCTIONS_PER_SKILL = 14_000;
const MAX_PROMPT_TOTAL = 40_000;
const MAX_FILES_LISTED = 60;

/**
 * Build the "Installed skills" block appended to the system prompt.
 *
 * Skills are instruction packs (the same `SKILL.md` + scripts convention used by
 * Claude/OpenCode). The model only gets the manifest body here; its files live
 * in IndexedDB (or on disk when the desktop app saved them), and the manifest
 * tells the model how to read/run them.
 */
export function buildSkillsPrompt(skills?: SkillPromptSkill[] | null): string {
  const list = (skills ?? []).filter((s) => s && typeof s.name === "string" && typeof s.instructions === "string" && s.instructions.trim());
  if (!list.length) return "";

  const blocks: string[] = [];
  let total = 0;

  for (const skill of list) {
    const body = skill.instructions.trim().slice(0, MAX_INSTRUCTIONS_PER_SKILL);
    const files = (skill.files ?? []).slice(0, MAX_FILES_LISTED);
    const fileNote = skill.diskPath
      ? `Skill files are on disk at: ${skill.diskPath}\n` +
        `Read files with medusa_readFile / medusa_listDir and run its scripts with medusa_runCommand using cwd="${skill.diskPath}". ` +
        `For dependency installs and long renders pass a large timeoutMs (e.g. 600000, max 900000).`
      : `Skill files are stored inside MEDUSA${files.length ? ` (${files.join(", ")}${(skill.files?.length ?? 0) > files.length ? ", …" : ""})` : ""}. ` +
        `If you need them on disk, tell the user to open Skills and choose "Save to disk".`;

    const block = [
      `### ${skill.name}`,
      skill.description ? skill.description : "",
      body,
      fileNote,
    ]
      .filter(Boolean)
      .join("\n");

    if (total + block.length > MAX_PROMPT_TOTAL) break;
    blocks.push(block);
    total += block.length;
  }

  if (!blocks.length) return "";

  return [
    "## Installed skills",
    "The user has installed the skills below in MEDUSA. A skill is a set of instructions and files that changes how you handle matching requests.",
    "When a request matches a skill, follow that skill's instructions exactly. They take precedence over your default habits for that task, including how you plan, which files you create, and which commands you run. Do not mention this instruction block unless the user asks about skills.",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

/** True when a request looks like an explicit skill invocation (`/stickman ...`). */
export function requestedSkillSlug(text: string): string | null {
  const m = /^\s*\/([a-z0-9][a-z0-9_-]*)\b/i.exec(text || "");
  return m ? m[1].toLowerCase() : null;
}
