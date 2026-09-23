"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PROVIDERS, type ProviderId, type ProviderModel } from "./providers";

export type Theme = "light" | "dark" | "glass" | "midnight" | "aurora" | "motion";
export type Accent = "amber" | "violet" | "emerald" | "blue" | "rose";

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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  attachments?: { name: string; type: string; size: number; preview?: string }[];
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

interface GodEyeState {
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
  chats: ChatSession[];
  activeChatId: string | null;
  createChat: (opts?: Partial<Pick<ChatSession, "mode" | "provider" | "model" | "projectId" | "folderId">>) => string;
  setActiveChat: (id: string | null) => void;
  addMessage: (chatId: string, msg: ChatMessage) => void;
  updateLastMessage: (chatId: string, content: string | undefined, extra?: Partial<ChatMessage>) => void;
  deleteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  projects: Project[];
  addProject: (p: Project) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  removeProject: (id: string) => void;
  folders: Folder[];
  addFolder: (f: Folder) => void;
  updateFolder: (id: string, patch: Partial<Folder>) => void;
  removeFolder: (id: string) => void;
}

const LEGACY_STORAGE_KEY = "godeye-os-v1";
const MIGRATED_FLAG = "godeye:legacy:migrated";
const workspaceKey = (userId: string) => `godeye:workspace:${userId}`;

function freshProfile(): UserProfile {
  return { name: "GodEye User", email: "", avatar: "", role: "Member", bio: "" };
}

function freshSettings(): ProgramSettings {
  return {
    theme: "light",
    accent: "amber",
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
    { id: "1", name: "Architect", role: "System Architect", provider: "nvidia", model: "meta/llama-3.3-70b-instruct", systemPrompt: "You design scalable systems.", temperature: 0.4, color: "#76b900" },
    { id: "2", name: "Coder", role: "Full-Stack Engineer", provider: "openrouter", model: "anthropic/claude-3.5-sonnet", systemPrompt: "You write production code.", temperature: 0.2, color: "#6467f2" },
    { id: "3", name: "Writer", role: "Content Strategist", provider: "omeroute", model: "omeroute/auto", systemPrompt: "You craft compelling content.", temperature: 0.8, color: "#ff6b35" },
  ];
}

function freshProjects(): Project[] {
  const now = new Date().toISOString();
  return [
    { id: "p1", name: "GodEye Launch", description: "Landing + workforce canvas + docs", status: "active", color: "#f59e0b", agentIds: ["1", "2"], tasksTotal: 12, tasksDone: 7, createdAt: now, updatedAt: now },
    { id: "p2", name: "AI Blog Pipeline", description: "Research → draft → SEO → publish", status: "active", color: "#8b5cf6", agentIds: ["3"], tasksTotal: 8, tasksDone: 3, createdAt: now, updatedAt: now },
    { id: "p3", name: "Nvidia Demo App", description: "Llama 405B showcase build", status: "draft", color: "#76b900", agentIds: ["1", "2", "3"], tasksTotal: 5, tasksDone: 1, createdAt: now, updatedAt: now },
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

export const useGodEye = create<GodEyeState>()(
  persist(
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
      loginUser: (u) => {
        const data = readUserData(u.id);
        const current = get();
        const hasData =
          current.chats.length > 0 ||
          current.projects.length > 0 ||
          current.agents.length > 0 ||
          current.folders.length > 0 ||
          Object.keys(current.vault).length > 0 ||
          current.profile.email !== "" ||
          current.profile.bio !== "" ||
          current.settings.theme !== "light" ||
          current.settings.accent !== "amber";
        // Priority: saved per-user workspace > current (persist-rehydrated) state > fresh defaults.
        // Never clobber rehydrated data just because the per-user localStorage slot is empty or stale.
        const fallback = hasData ? current : freshScopedState();
        // Vault needs union merge — per-user slot can be stale (Connect wrote only to
        // godeye-os-v1 before). Rehydrated current has the just-connected keys.
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
            name: base.profile.name === "GodEye User" ? u.displayName : base.profile.name,
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
          chats: s.chats,
          projects: s.projects,
          folders: s.folders,
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
          const merged = {
            profile: data.profile ?? base.profile,
            settings: data.settings ?? base.settings,
            vault: mergedVault,
            agents: data.agents ?? base.agents,
            chats: data.chats ?? base.chats,
            projects: data.projects ?? base.projects,
            folders: data.folders ?? base.folders,
            lastProvider: data.lastProvider ?? base.lastProvider,
            lastModelByProvider: data.lastModelByProvider
              ? { ...(base.lastModelByProvider as Record<ProviderId, string>), ...(data.lastModelByProvider as Record<ProviderId, string>) }
              : base.lastModelByProvider,
          };
          const profile = {
            ...merged.profile,
            email: merged.profile.email || u?.email || "",
            name: merged.profile.name === "GodEye User" ? u?.displayName || merged.profile.name : merged.profile.name,
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
          try {
            const after = get();
            localStorage.setItem(workspaceKey(u.id), JSON.stringify({ ...after.collectWorkspace(), updatedAt: after.wsUpdatedAt }));
          } catch {
            /* ignore */
          }
        }
      },
      logoutUser: () => {
        const s = get();
        if (s.currentUser) {
          try {
            localStorage.setItem(
              workspaceKey(s.currentUser.id),
              JSON.stringify({ ...s.collectWorkspace(), updatedAt: new Date().toISOString() })
            );
          } catch {
            /* ignore */
          }
        }
        set({ ...freshScopedState(), activeChatId: null, currentUser: null, wsUpdatedAt: "" });
      },

      chats: [],
      activeChatId: null,
      createChat: (opts) => {
        const s = get();
        const provider = opts?.provider || s.lastProvider || "openrouter";
        const remembered = opts?.model || s.lastModelByProvider?.[provider];
        const fallback = PROVIDERS.find(p => p.id === provider)?.models.find(m => m.id === remembered)?.id
          || PROVIDERS.find(p => p.id === provider)?.models[0]?.id
          || "anthropic/claude-3.5-sonnet";
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
        return id;
      },
      setActiveChat: (id) => set({ activeChatId: id }),
      addMessage: (chatId, msg) =>
        set((s) => ({
          chats: s.chats.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, msg], updatedAt: new Date().toISOString(), title: c.messages.length === 0 && msg.role === "user" ? msg.content.slice(0, 48) : c.title } : c)),
        })),
      updateLastMessage: (chatId, content, extra) =>
        set((s) => ({
          chats: s.chats.map((c) => {
            if (c.id !== chatId || c.messages.length === 0) return c;
            const msgs = [...c.messages];
            msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...(content !== undefined ? { content } : {}), ...(extra || {}) };
            return { ...c, messages: msgs };
          }),
        })),
      deleteChat: (id) => set((s) => ({ chats: s.chats.filter((c) => c.id !== id), activeChatId: s.activeChatId === id ? s.chats[0]?.id || null : s.activeChatId })),
      renameChat: (id, title) => set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, title } : c)) })),

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
    }),
    { name: "godeye-os-v1", partialize: (s) => ({ profile: s.profile, settings: s.settings, vault: s.vault, agents: s.agents, chats: (s as any).chats, activeChatId: (s as any).activeChatId, projects: (s as any).projects, folders: (s as any).folders, lastProvider: (s as any).lastProvider, lastModelByProvider: (s as any).lastModelByProvider, wsUpdatedAt: (s as any).wsUpdatedAt }) }
  )
);
