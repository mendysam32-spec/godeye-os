"use client";
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { PROVIDERS, type ProviderId, type ProviderModel } from "./providers";
import { partsForStorage, type ContentPart, type FileKind } from "./content";
import { THEME_IDS, ACCENTS } from "./themes";
import type { InstalledSkill } from "./skill-prompt";

export type Theme = (typeof THEME_IDS)[number];
export type Accent = (typeof ACCENTS)[number]["id"];

// Capability plugins. Each toggles a behavior that hooks into whatever model is
// selected — generation plugins only fire on capable models, tool plugins feed
// the agent loop with the selected provider/model.
export type PluginId = "image" | "video" | "search" | "tools" | "terminal";

export type ReasoningEffort = "off" | "low" | "medium" | "high" | "extra-high";

export const DEFAULT_PLUGINS: Record<PluginId, boolean> = {
  image: true,
  video: true,
  search: true,
  tools: true,
  terminal: true,
};

export interface UserProfile {
  name: string;
  email: string;
  avatar: string;
  role: string;
  bio: string;
}

export interface AuthUserInfo {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: string;
  enabled: boolean;
}

export interface VaultKey {
  provider: ProviderId;
  key: string;
  connected: boolean;
  endpoint?: string;
  models?: ProviderModel[];
  lastTested?: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  provider: ProviderId;
  model: string;
  systemPrompt: string;
  temperature: number;
  color: string;
}

export interface ProgramSettings {
  theme: Theme;
  accent: Accent;
  density: "comfortable" | "compact" | "spacious";
  animations: boolean;
  soundEffects: boolean;
  autoSave: boolean;
  agentTools: boolean;
  defaultProvider: ProviderId;
  plugins: Record<PluginId, boolean>;
  agentBehavior: "balanced" | "creative" | "precise" | "autonomous";
  codeStyle: "concise" | "verbose" | "documented";
  reasoningEffort: ReasoningEffort;
  language: string;
  telemetry: boolean;
  appLockEnabled: boolean;
  lockPin: string;
}

export type ChatMode = "coding" | "image" | "plan" | "search" | "chat" | "research" | "terminal" | "video";

export interface ChatMedia {
  kind: "image" | "video";
  src: string;
  url?: string;
  mime?: string;
  filename?: string;
}

export interface ChatAttachment {
  name: string;
  type: string;
  size: number;
  preview?: string;
  kind?: FileKind;
  /** why the file could not be attached, when it was dropped */
  note?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  attachments?: ChatAttachment[];
  /** typed multimodal body (text/image/document) so attachments survive reload
   *  and can be replayed to the model on later turns */
  parts?: ContentPart[];
  media?: ChatMedia[];
  provider?: ProviderId;
  model?: string;
  mode?: ChatMode;
}

export interface ChatSession {
  id: string;
  title: string;
  mode: ChatMode;
  provider: ProviderId;
  model: string;
  projectId?: string;
  folderId?: string;
  incognito?: boolean;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  name: string;
  icon: string;
  color: string;
  parentId?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: "active" | "archived" | "draft";
  color: string;
  folderId?: string;
  agentIds: string[];
  tasksTotal: number;
  tasksDone: number;
  createdAt: string;
  updatedAt: string;
}

interface MEDUSAState {
  profile: UserProfile;
  setProfile: (p: Partial<UserProfile>) => void;
  settings: ProgramSettings;
  setSettings: (s: Partial<ProgramSettings>) => void;
  lastProvider: ProviderId;
  lastModelByProvider: Partial<Record<ProviderId, string>>;
  setLastSelection: (provider: ProviderId, model: string) => void;
  vault: Record<ProviderId, VaultKey>;
  setVaultKey: (provider: ProviderId, key: string, connected: boolean, endpoint?: string, models?: ProviderModel[]) => void;
  clearVaultKey: (provider: ProviderId) => void;
  agents: Agent[];
  addAgent: (a: Agent) => void;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  removeAgent: (id: string) => void;
  currentUser: AuthUserInfo | null;
  loginUser: (u: AuthUserInfo) => void;
  logoutUser: () => void;
  wsUpdatedAt: string;
  collectWorkspace: () => WorkspaceData;
  applyWorkspace: (data: WorkspaceData) => void;
  markWorkspaceSynced: () => void;
  /** Phase 1 cross-device chat sync status, surfaced in the UI. */
  chatSync: {
    status: "idle" | "syncing" | "synced" | "offline" | "error";
    lastSyncedAt: string;
    /** true when the server could not be reached and local edits are queued */
    pending: number;
    error?: string;
  };
  setChatSync: (patch: Partial<MEDUSAState["chatSync"]>) => void;
  /** merge remote threads into local state; used only by the sync client.
   *  `deletedIds` are server tombstones and must be dropped locally. */
  applyRemoteChats: (chats: ChatSession[], deletedIds?: string[]) => void;
  chats: ChatSession[];
  activeChatId: string | null;
  incognito: boolean;
  setIncognito: (b: boolean) => void;
  purgeIncognito: () => void;
  createChat: (opts?: Partial<Pick<ChatSession, "mode" | "provider" | "model" | "projectId" | "folderId" | "incognito">>) => string;
  setActiveChat: (id: string | null) => void;
  addMessage: (chatId: string, msg: ChatMessage) => void;
  updateLastMessage: (chatId: string, content: string | undefined, extra?: Partial<ChatMessage>) => void;
  deleteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  markChatIncognito: (id: string, b: boolean) => void;
  projects: Project[];
  addProject: (p: Project) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  removeProject: (id: string) => void;
  folders: Folder[];
  addFolder: (f: Folder) => void;
  updateFolder: (id: string, patch: Partial<Folder>) => void;
  removeFolder: (id: string) => void;
  /** Installed skill packs (metadata only — file bodies live in IndexedDB). */
  skills: InstalledSkill[];
  addSkill: (skill: InstalledSkill) => void;
  updateSkill: (id: string, patch: Partial<InstalledSkill>) => void;
  toggleSkill: (id: string, enabled: boolean) => void;
  removeSkill: (id: string) => void;
}

const LEGACY_STORAGE_KEY = "medusa-os-v1";
const MIGRATED_FLAG = "medusa:legacy:migrated";
const workspaceKey = (userId: string) => `medusa:workspace:${userId}`;

/* -------------------------------------------------------------------------- */
/* chat change notifications                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A minimal observer seam rather than a direct import of the sync client.
 * `chat-sync-client.ts` needs the store, so importing it from here would
 * create a cycle; instead it subscribes through this.
 */
const chatsListeners = new Set<() => void>();

/** Subscribe to any mutation of `chats`. Returns an unsubscribe function. */
export function subscribeChats(fn: () => void): () => void {
  chatsListeners.add(fn);
  return () => chatsListeners.delete(fn);
}

function notifyChatsChanged(): void {
  for (const fn of chatsListeners) {
    try {
      fn();
    } catch {
      /* a broken listener must not break the mutation that triggered it */
    }
  }
}

function freshProfile(): UserProfile {
  return { name: "MEDUSA User", email: "", avatar: "", role: "Member", bio: "" };
}

function freshSettings(): ProgramSettings {
  return {
    theme: "eclipse",
    accent: "cyan",
    density: "comfortable",
    animations: true,
    soundEffects: false,
    autoSave: true,
    agentTools: true,
    defaultProvider: "openrouter",
    plugins: { ...DEFAULT_PLUGINS },
    agentBehavior: "balanced",
    codeStyle: "documented",
    reasoningEffort: "medium",
    language: "en",
    telemetry: false,
    appLockEnabled: false,
    lockPin: "",
  };
}

function freshAgents(): Agent[] {
  return [
    { id: "1", name: "Architect", role: "System Architect", provider: "nvidia", model: "meta/llama-3.3-70b-instruct", systemPrompt: "You design scalable systems. Given a task you break it into components, define interfaces, trade-offs and a build plan before any code is written.", temperature: 0.4, color: "#76b900" },
    { id: "2", name: "Devin", role: "Autonomous Software Engineer", provider: "openrouter", model: "anthropic/claude-sonnet-4", systemPrompt: "You are an autonomous software engineer like Cognition's Devin/Claude Code. You plan, write, run and self-review code end-to-end on well-scoped tasks: implement features, write tests, run them, and only then present a reviewable diff.", temperature: 0.2, color: "#6467f2" },
    { id: "3", name: "Researcher", role: "Deep Research Analyst", provider: "google", model: "gemini-2.0-pro", systemPrompt: "You are a Gemini Deep Research analyst. Gather, cross-check and synthesize multi-source information, cite sources, separate fact from speculation, and deliver a cited report — not a list of search results.", temperature: 0.3, color: "#4285f4" },
    { id: "4", name: "Reviewer", role: "QA & Security Reviewer", provider: "nvidia", model: "deepseek-ai/deepseek-r1", systemPrompt: "You are a strict QA and security reviewer. Adversarially review code and content: bugs, edge cases, security flaws, hallucinations and wrong assumptions. Ship verdicts (approve / changes requested) with specific line-level reasoning — never rubber-stamp.", temperature: 0.2, color: "#76b900" },
    { id: "5", name: "Operator", role: "Web & Browser Agent", provider: "openrouter", model: "openai/gpt-4o", systemPrompt: "You are an OpenAI Operator-style web agent. Perform browser-class tasks: research the live web, fill workflows, extract structured data, and automate repetitive tasks. Report steps taken and results with URLs.", temperature: 0.4, color: "#6467f2" },
    { id: "6", name: "Writer", role: "Content Strategist", provider: "omeroute", model: "omeroute/auto", systemPrompt: "You craft compelling content. Translate raw research and code into polished copy, blogs, docs and marketing that keeps a consistent voice. Output final deliverable-ready text.", temperature: 0.8, color: "#ff6b35" },
  ];
}

function freshProjects(): Project[] {
  const now = new Date().toISOString();
  return [
    { id: "p1", name: "MEDUSA Launch", description: "Landing + workforce canvas + docs", status: "active", color: "#f59e0b", agentIds: ["1", "2", "4"], tasksTotal: 12, tasksDone: 7, createdAt: now, updatedAt: now },
    { id: "p2", name: "AI Blog Pipeline", description: "Research → draft → SEO → publish", status: "active", color: "#8b5cf6", agentIds: ["3", "5", "6"], tasksTotal: 8, tasksDone: 3, createdAt: now, updatedAt: now },
    { id: "p3", name: "Nvidia Demo App", description: "Llama 405B showcase build", status: "draft", color: "#76b900", agentIds: ["1", "2", "4", "6"], tasksTotal: 5, tasksDone: 1, createdAt: now, updatedAt: now },
  ];
}

function freshScopedState() {
  return {
    profile: freshProfile(),
    settings: freshSettings(),
    vault: {} as Record<ProviderId, VaultKey>,
    agents: freshAgents(),
    chats: [] as ChatSession[],
    projects: freshProjects(),
    folders: [] as Folder[],
    skills: [] as InstalledSkill[],
    lastProvider: "openrouter" as ProviderId,
    lastModelByProvider: {} as Partial<Record<ProviderId, string>>,
  };
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export interface WorkspaceData {
  profile?: UserProfile;
  settings?: ProgramSettings;
  vault?: Record<ProviderId, VaultKey>;
  agents?: Agent[];
  chats?: ChatSession[];
  projects?: Project[];
  folders?: Folder[];
  skills?: InstalledSkill[];
  lastProvider?: ProviderId;
  lastModelByProvider?: Partial<Record<ProviderId, string>>;
  activeChatId?: string | null;
  updatedAt?: string;
}

function readUserData(userId: string): WorkspaceData | null {
  const own = readJSON<WorkspaceData>(workspaceKey(userId));
  if (own) return own;
  // migrate the pre-auth single-user data once, into the first account that logs in
  if (localStorage.getItem(MIGRATED_FLAG)) return null;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    const state = raw ? (JSON.parse(raw) as { state?: WorkspaceData }).state : null;
    const hasData =
      state &&
      (state.projects?.length || state.chats?.length || state.agents?.length || state.folders?.length || (state.vault && Object.keys(state.vault).length > 0));
    if (hasData) {
      localStorage.setItem(MIGRATED_FLAG, userId);
      return state;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Binary bodies are the only unbounded part of the persisted blob. */
function slimHeavyPayload(value: string): string {
  const parsed = JSON.parse(value) as { state?: Record<string, unknown> } & Record<string, unknown>;
  const slim = (state: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...state };
    if (Array.isArray(state.chats)) {
      out.chats = state.chats.map((c) => {
        const chat = c as { messages?: Array<Record<string, unknown>> };
        if (!Array.isArray(chat.messages)) return c;
        return { ...chat, messages: chat.messages.map((m) => ({ ...m, ...(m.parts ? { parts: slimParts(m.parts) } : {}) })) };
      });
    }
    if (Array.isArray(state.projects)) {
      out.projects = state.projects.map((p) => {
        const proj = p as { files?: Array<Record<string, unknown>> };
        if (!Array.isArray(proj.files)) return p;
        return { ...proj, files: proj.files.map((f) => (f.binary ? { path: f.path, text: "", binary: true } : f)) };
      });
    }
    return out;
  };
  // persist() wraps the payload as { state, version }; the per-user workspace
  // blob stores the state fields at the top level. Handle both.
  if (parsed.state && typeof parsed.state === "object") return JSON.stringify({ ...parsed, state: slim(parsed.state) });
  return JSON.stringify(slim(parsed));
}

function slimParts(parts: unknown): unknown {
  if (!Array.isArray(parts)) return parts;
  return parts.map((p) => {
    const part = p as { type?: string; data?: string };
    if (!part || part.type === "text") return p;
    return { ...part, data: "", note: "attachment body too large to keep in local cache - re-attach it" };
  });
}

/**
 * localStorage is ~5MB per origin and zustand's persist calls setItem straight
 * from every store action with no try/catch, so one QuotaExceededError (a couple
 * of image attachments, or a project folder holding binaries) escapes the action
 * and takes the UI down with it. Degrade instead of throwing: full payload, then
 * the same payload with attachment bodies stripped, then memory for this session.
 */
function writeLocal(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    /* quota exceeded, or storage disabled - fall through */
  }
  try {
    localStorage.setItem(key, slimHeavyPayload(value));
    return true;
  } catch {
    return false;
  }
}

function quotaSafeStorage(): StateStorage<void> {
  const memory = new Map<string, string>();
  return {
    getItem: (name) => {
      const cached = memory.get(name);
      if (cached != null) return cached;
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      if (writeLocal(name, value)) return;
      memory.set(name, value); // session-only, but nothing throws
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
      memory.delete(name);
    },
  };
}

/** Exactly the slice that reaches localStorage (see partialize below). */
type PersistedSlice = Pick<
  MEDUSAState,
  "profile" | "settings" | "vault" | "agents" | "chats" | "activeChatId" | "projects" | "folders" | "skills" | "lastProvider" | "lastModelByProvider" | "wsUpdatedAt"
>;

export const useMEDUSA = create<MEDUSAState>()(
  persist<MEDUSAState, [], [], PersistedSlice>(
    (set, get) => ({
      profile: freshProfile(),
      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),

      settings: freshSettings(),
      setSettings: (patch) => {
        const stamp = new Date().toISOString();
        set((s) => ({ settings: { ...s.settings, ...patch }, wsUpdatedAt: stamp }));
        // persist immediately to per-user slot + server so a refresh/logout keeps the last settings
        const s = get();
        if (s.currentUser) {
          try {
            localStorage.setItem(
              workspaceKey(s.currentUser.id),
              JSON.stringify({
                profile: s.profile,
                settings: s.settings,
                vault: s.vault,
                agents: s.agents,
                chats: s.chats,
                projects: s.projects,
                folders: s.folders,
                skills: s.skills,
                lastProvider: s.lastProvider,
                lastModelByProvider: s.lastModelByProvider,
                activeChatId: s.activeChatId,
                updatedAt: s.wsUpdatedAt,
              })
            );
          } catch { /* ignore */ }
          fetch("/api/auth/workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: s.collectWorkspace() }),
          }).catch(() => { /* offline — local copy keeps it */ });
        }
      },

      vault: {} as Record<ProviderId, VaultKey>,
      lastProvider: "openrouter" as ProviderId,
      lastModelByProvider: {} as Partial<Record<ProviderId, string>>,
      setLastSelection: (provider, model) =>
        set((s) => ({
          lastProvider: provider,
          lastModelByProvider: { ...s.lastModelByProvider, [provider]: model },
        })),
      setVaultKey: (provider, key, connected, endpoint, models) => {
        const stamp = new Date().toISOString();
        set((s) => ({
          vault: {
            ...s.vault,
            [provider]: {
              provider,
              key,
              connected,
              ...(endpoint ? { endpoint } : {}),
              ...(models && models.length ? { models } : {}),
              lastTested: stamp,
            },
          },
          wsUpdatedAt: stamp,
        }));
        // persist immediately to per-user slot + server so a refresh keeps the key
        const s = get();
        if (s.currentUser) {
          try {
            localStorage.setItem(
              workspaceKey(s.currentUser.id),
              JSON.stringify({
                profile: s.profile,
                settings: s.settings,
                vault: s.vault,
                agents: s.agents,
                chats: s.chats,
                projects: s.projects,
                folders: s.folders,
                skills: s.skills,
                lastProvider: s.lastProvider,
                lastModelByProvider: s.lastModelByProvider,
                activeChatId: s.activeChatId,
                updatedAt: s.wsUpdatedAt,
              })
            );
          } catch { /* ignore */ }
          // fire-and-forget server sync (vault is small)
          fetch("/api/auth/workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: s.collectWorkspace() }),
          }).catch(() => { /* offline — local copy keeps it */ });
        }
      },
      clearVaultKey: (provider) => {
        const stamp = new Date().toISOString();
        set((s) => {
          const v = { ...s.vault };
          delete v[provider];
          return { vault: v, wsUpdatedAt: stamp };
        });
        const s = get();
        if (s.currentUser) {
          try {
            localStorage.setItem(
              workspaceKey(s.currentUser.id),
              JSON.stringify({
                profile: s.profile,
                settings: s.settings,
                vault: s.vault,
                agents: s.agents,
                chats: s.chats,
                projects: s.projects,
                folders: s.folders,
                skills: s.skills,
                lastProvider: s.lastProvider,
                lastModelByProvider: s.lastModelByProvider,
                activeChatId: s.activeChatId,
                updatedAt: s.wsUpdatedAt,
              })
            );
          } catch { /* ignore */ }
          fetch("/api/auth/workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: s.collectWorkspace() }),
          }).catch(() => {});
        }
      },

      agents: freshAgents(),
      addAgent: (a) => set((s) => ({ agents: [...s.agents, a] })),
      updateAgent: (id, patch) => set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      removeAgent: (id) => set((s) => ({ agents: s.agents.filter((a) => a.id !== id) })),

      currentUser: null,
      wsUpdatedAt: "",
      chatSync: { status: "idle", lastSyncedAt: "", pending: 0 },
      setChatSync: (patch) => set((s) => ({ chatSync: { ...s.chatSync, ...patch } })),
      // `incoming` is the full merged set from `mergeThreads` (local + remote,
      // LWW already resolved), so entries present here must overwrite the local
      // copy. Threads absent from it are kept as-is: incognito threads are
      // filtered out of the merge and must survive untouched.
      //
      // Server tombstones are the exception — they arrive as an *absence*, so
      // without `deletedIds` a chat deleted on another device would linger here
      // forever and reappear on the next push.
      applyRemoteChats: (incoming, deletedIds) =>
        set((s) => {
          const doomed = new Set(deletedIds ?? []);
          const kept = s.chats.filter((c) => !doomed.has(c.id));
          if (!incoming.length && !doomed.size) return {};
          const incomingById = new Map(incoming.map((c) => [c.id, c]));
          // keep local ordering stable and append genuinely new threads
          const replaced = kept.map((c) => incomingById.get(c.id) ?? c);
          const known = new Set(replaced.map((c) => c.id));
          const additions = incoming.filter((c) => !known.has(c.id)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
          const chats = [...additions, ...replaced];
          return {
            chats,
            activeChatId:
              s.activeChatId && chats.some((c) => c.id === s.activeChatId) ? s.activeChatId : chats[0]?.id ?? null,
          };
        }),
      loginUser: (u) => {
        const data = readUserData(u.id);
        const current = get();
        const hasData =
          current.chats.length > 0 ||
          current.projects.length > 0 ||
          current.agents.length > 0 ||
          current.folders.length > 0 ||
          current.skills.length > 0 ||
          Object.keys(current.vault).length > 0 ||
          current.profile.email !== "" ||
          current.profile.bio !== "" ||
          current.settings.theme !== "eclipse" ||
          current.settings.accent !== "cyan";
        // Priority: saved per-user workspace > current (persist-rehydrated) state > fresh defaults.
        // Never clobber rehydrated data just because the per-user localStorage slot is empty or stale.
        const fallback = hasData ? current : freshScopedState();
        // Vault needs union merge — per-user slot can be stale (Connect wrote only to
        // medusa-os-v1 before). Rehydrated current has the just-connected keys.
        const mergedVault = (() => {
          const a = data?.vault as Record<ProviderId, VaultKey> | undefined;
          const b = fallback.vault as Record<ProviderId, VaultKey> | undefined;
          const aEmpty = !a || Object.keys(a).length === 0;
          const bEmpty = !b || Object.keys(b).length === 0;
          if (aEmpty && bEmpty) return {} as Record<ProviderId, VaultKey>;
          if (aEmpty) return b!;
          if (bEmpty) return a!;
          // both have data — union, with rehydrated (b) winning on conflict
          return { ...a, ...b } as Record<ProviderId, VaultKey>;
        })();
        const base = {
          profile: data?.profile ?? fallback.profile,
          // Settings: prefer the freshly rehydrated local state (last session's values)
          // over a possibly-stale per-user slot, same as the vault union below. Fresh
          // browsers fall back to the slot/server values.
          settings: hasData ? fallback.settings : (data?.settings ?? fallback.settings),
          vault: mergedVault,
          agents: data?.agents ?? fallback.agents,
          chats: data?.chats ?? fallback.chats,
          projects: data?.projects ?? fallback.projects,
          folders: data?.folders ?? fallback.folders,
          skills: data?.skills ?? fallback.skills,
          lastProvider: data?.lastProvider ?? fallback.lastProvider,
          lastModelByProvider: data?.lastModelByProvider
            ? { ...(fallback.lastModelByProvider as Record<ProviderId, string>), ...(data.lastModelByProvider as Record<ProviderId, string>) }
            : fallback.lastModelByProvider,
        };
        // wsUpdatedAt: keep the newest stamp so syncWorkspace comparison doesn't flip
        const candidates = [data?.updatedAt as string | undefined, current.wsUpdatedAt].filter(Boolean) as string[];
        let wsUpdatedAt = "";
        if (candidates.length) {
          let best = candidates[0];
          let bestT = Date.parse(best) || 0;
          for (const c of candidates.slice(1)) {
            const t = Date.parse(c) || 0;
            if (t > bestT) { best = c; bestT = t; }
          }
          wsUpdatedAt = best;
        }
        set({
          ...base,
          profile: {
            ...base.profile,
            email: base.profile.email || u.email,
            name: base.profile.name === "MEDUSA User" ? u.displayName : base.profile.name,
          },
          activeChatId: data?.activeChatId ?? (hasData ? current.activeChatId : null),
          currentUser: u,
          wsUpdatedAt,
        });
        // Make the merge durable right away so a reload without an explicit logout
        // still finds this user's data locally.
        try {
          const after = get();
          localStorage.setItem(
            workspaceKey(u.id),
            JSON.stringify({ ...after.collectWorkspace(), updatedAt: after.wsUpdatedAt })
          );
        } catch {
          /* ignore */
        }
      },
      collectWorkspace: () => {
        const s = get();
        return {
          profile: s.profile,
          settings: s.settings,
          vault: s.vault,
          agents: s.agents,
          // incognito chats never leave memory — filtered from every local + cloud write
          chats: s.chats.filter((c) => !c.incognito),
          projects: s.projects,
          folders: s.folders,
          skills: s.skills,
          lastProvider: s.lastProvider,
          lastModelByProvider: s.lastModelByProvider,
          updatedAt: s.wsUpdatedAt,
        };
      },
      markWorkspaceSynced: () => set({ wsUpdatedAt: new Date().toISOString() }),
      applyWorkspace: (data) => {
        const u = get().currentUser;
        set((s) => {
          const base = freshScopedState();
          // Vault union: keep local-only keys when remote is newer but missing them
          // Remote wins on same provider, local-only keys are preserved.
          const remoteVault = (data.vault as Record<string, VaultKey> | undefined);
          const localVault = s.vault as Record<string, VaultKey>;
          const mergedVault = (() => {
            if (!remoteVault || Object.keys(remoteVault).length === 0) return remoteVault ?? base.vault;
            if (!localVault || Object.keys(localVault).length === 0) return remoteVault;
            return { ...localVault, ...remoteVault } as Record<ProviderId, VaultKey>;
          })();
          // Skills: remote metadata wins per id, but local-only installs survive
          // (the file bodies are device-local in IndexedDB either way).
          const mergedSkills = (() => {
            const local = s.skills ?? [];
            const remote = data.skills ?? [];
            if (!remote.length) return local;
            if (!local.length) return remote;
            const byId = new Map(local.map((k) => [k.id, k]));
            for (const r of remote) byId.set(r.id, { ...byId.get(r.id), ...r });
            return [...byId.values()];
          })();
          const merged = {
            profile: data.profile ?? base.profile,
            settings: data.settings ?? base.settings,
            vault: mergedVault,
            agents: data.agents ?? base.agents,
            // Legacy workspaces stored whole chat arrays. Import them only when
            // this device has nothing local, then let the per-thread sync path
            // own chat state — otherwise a stale blob would clobber live edits.
            chats: s.chats.length ? s.chats : (data.chats ?? base.chats),
            projects: data.projects ?? base.projects,
            folders: data.folders ?? base.folders,
            skills: mergedSkills,
            lastProvider: data.lastProvider ?? base.lastProvider,
            lastModelByProvider: data.lastModelByProvider
              ? { ...(base.lastModelByProvider as Record<ProviderId, string>), ...(data.lastModelByProvider as Record<ProviderId, string>) }
              : base.lastModelByProvider,
          };
          const profile = {
            ...merged.profile,
            email: merged.profile.email || u?.email || "",
            name: merged.profile.name === "MEDUSA User" ? u?.displayName || merged.profile.name : merged.profile.name,
          };
          const wsUpdatedAt = data.updatedAt || s.wsUpdatedAt || new Date().toISOString();
          return {
            ...merged,
            profile,
            activeChatId: data.activeChatId ?? null,
            wsUpdatedAt,
          };
        });
        if (u) {
          writeLocal(workspaceKey(u.id), JSON.stringify({ ...get().collectWorkspace(), updatedAt: get().wsUpdatedAt }));
        }
      },
      logoutUser: () => {
        const s = get();
        if (s.currentUser) {
          writeLocal(
            workspaceKey(s.currentUser.id),
            JSON.stringify({ ...s.collectWorkspace(), updatedAt: new Date().toISOString() })
          );
        }
        set({ ...freshScopedState(), activeChatId: null, currentUser: null, wsUpdatedAt: "" });
      },

      chats: [],
      activeChatId: null,
      incognito: false,
      setIncognito: (b) => set({ incognito: b }),
      purgeIncognito: () => {
        set((s) => {
          const doomed = new Set(s.chats.filter((c) => c.incognito).map((c) => c.id));
          if (!doomed.size) return { activeChatId: s.activeChatId };
          return {
            chats: s.chats.filter((c) => !doomed.has(c.id)),
            activeChatId: s.activeChatId && doomed.has(s.activeChatId) ? s.chats.find((c) => !doomed.has(c.id))?.id ?? null : s.activeChatId,
          };
        });
        notifyChatsChanged();
      },
      createChat: (opts) => {
        const s = get();
        const provider = opts?.provider || s.lastProvider || "openrouter";
        const remembered = opts?.model || s.lastModelByProvider?.[provider];
        const fallback = PROVIDERS.find(p => p.id === provider)?.models.find(m => m.id === remembered)?.id
          || PROVIDERS.find(p => p.id === provider)?.models[0]?.id
          || "anthropic/claude-sonnet-4";
        const model = remembered || fallback;
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const now = new Date().toISOString();
        const chat: ChatSession = {
          id,
          title: "New chat",
          mode: opts?.mode || "chat",
          provider,
          model,
          projectId: opts?.projectId,
          folderId: opts?.folderId,
          incognito: opts?.incognito ?? s.incognito,
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        set((st) => ({
          chats: [chat, ...st.chats],
          activeChatId: id,
          lastProvider: provider,
          lastModelByProvider: { ...st.lastModelByProvider, [provider]: model },
        }));
        notifyChatsChanged();
        return id;
      },
      setActiveChat: (id) => set({ activeChatId: id }),
      addMessage: (chatId, msg) => {
        set((s) => ({
          chats: s.chats.map((c) => {
            if (c.id !== chatId) return c;
            // binary parts are heavy — clamp to what localStorage can survive
            const stored: ChatMessage = msg.parts?.length ? { ...msg, parts: partsForStorage(msg.parts) } : msg;
            return {
              ...c,
              messages: [...c.messages, stored],
              updatedAt: new Date().toISOString(),
              title: c.messages.length === 0 && msg.role === "user" ? msg.content.slice(0, 48) : c.title,
            };
          }),
        }));
        notifyChatsChanged();
      },
      updateLastMessage: (chatId, content, extra) => {
        set((s) => ({
          chats: s.chats.map((c) => {
            if (c.id !== chatId || c.messages.length === 0) return c;
            const msgs = [...c.messages];
            msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...(content !== undefined ? { content } : {}), ...(extra || {}) };
            return { ...c, messages: msgs };
          }),
        }));
        notifyChatsChanged();
      },
      deleteChat: (id) => {
        set((s) => ({ chats: s.chats.filter((c) => c.id !== id), activeChatId: s.activeChatId === id ? s.chats[0]?.id || null : s.activeChatId }));
        notifyChatsChanged();
      },
      renameChat: (id, title) => {
        set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, title } : c)) }));
        notifyChatsChanged();
      },
      markChatIncognito: (id, b) => {
        set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, incognito: b } : c)) }));
        notifyChatsChanged();
      },


      projects: freshProjects(),
      addProject: (p) => set((s) => ({ projects: [p, ...s.projects] })),
      updateProject: (id, patch) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)) })),
      removeProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),

      folders: [],
      addFolder: (f) => set((s) => ({ folders: [...s.folders, f] })),
      updateFolder: (id, patch) => set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      removeFolder: (id) =>
        set((s) => {
          const doomed = new Set<string>([id]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const f of s.folders) {
              if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) {
                doomed.add(f.id);
                grew = true;
              }
            }
          }
          return {
            folders: s.folders.filter((f) => !doomed.has(f.id)),
            projects: s.projects.map((p) => (p.folderId && doomed.has(p.folderId) ? { ...p, folderId: undefined } : p)),
          };
        }),

      skills: [],
      addSkill: (skill) =>
        set((s) => ({
          skills: s.skills.some((k) => k.id === skill.id)
            ? s.skills.map((k) => (k.id === skill.id ? { ...k, ...skill } : k))
            : [skill, ...s.skills],
          wsUpdatedAt: new Date().toISOString(),
        })),
      updateSkill: (id, patch) =>
        set((s) => ({
          skills: s.skills.map((k) => (k.id === id ? { ...k, ...patch, updatedAt: new Date().toISOString() } : k)),
          wsUpdatedAt: new Date().toISOString(),
        })),
      toggleSkill: (id, enabled) =>
        set((s) => ({
          skills: s.skills.map((k) => (k.id === id ? { ...k, enabled, updatedAt: new Date().toISOString() } : k)),
          wsUpdatedAt: new Date().toISOString(),
        })),
      removeSkill: (id) =>
        set((s) => ({ skills: s.skills.filter((k) => k.id !== id), wsUpdatedAt: new Date().toISOString() })),
    }),
    { name: "medusa-os-v1", storage: createJSONStorage<PersistedSlice, void>(() => quotaSafeStorage()), partialize: (s) => ({ profile: s.profile, settings: s.settings, vault: s.vault, agents: s.agents, chats: (s as any).chats.filter((c: ChatSession) => !c.incognito), activeChatId: (s as any).activeChatId, projects: (s as any).projects, folders: (s as any).folders, skills: (s as any).skills, lastProvider: (s as any).lastProvider, lastModelByProvider: (s as any).lastModelByProvider, wsUpdatedAt: (s as any).wsUpdatedAt }) }
  )
);

export type { ContentPart, FileKind };
