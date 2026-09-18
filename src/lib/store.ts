"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProviderId } from "./providers";

export type Theme = "light" | "dark" | "glass" | "midnight" | "aurora" | "motion";
export type Accent = "amber" | "violet" | "emerald" | "blue" | "rose";

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
  defaultProvider: ProviderId;
  agentBehavior: "balanced" | "creative" | "precise" | "autonomous";
  codeStyle: "concise" | "verbose" | "documented";
  language: string;
  telemetry: boolean;
  appLockEnabled: boolean;
  lockPin: string;
}

export type ChatMode = "coding" | "image" | "plan" | "search" | "chat" | "research" | "terminal";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  attachments?: { name: string; type: string; size: number; preview?: string }[];
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
  vault: Record<ProviderId, VaultKey>;
  setVaultKey: (provider: ProviderId, key: string, connected: boolean) => void;
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
  updateLastMessage: (chatId: string, content: string) => void;
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
    defaultProvider: "openrouter",
    agentBehavior: "balanced",
    codeStyle: "documented",
    language: "en",
    telemetry: false,
    appLockEnabled: false,
    lockPin: "",
  };
}

function freshAgents(): Agent[] {
  return [
    { id: "1", name: "Architect", role: "System Architect", provider: "nvidia", model: "meta/llama-3.1-405b-instruct", systemPrompt: "You design scalable systems.", temperature: 0.4, color: "#76b900" },
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
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      vault: {} as Record<ProviderId, VaultKey>,
      setVaultKey: (provider, key, connected) =>
        set((s) => ({ vault: { ...s.vault, [provider]: { provider, key, connected, lastTested: new Date().toISOString() } } })),
      clearVaultKey: (provider) =>
        set((s) => {
          const v = { ...s.vault };
          delete v[provider];
          return { vault: v };
        }),

      agents: freshAgents(),
      addAgent: (a) => set((s) => ({ agents: [...s.agents, a] })),
      updateAgent: (id, patch) => set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      removeAgent: (id) => set((s) => ({ agents: s.agents.filter((a) => a.id !== id) })),

      currentUser: null,
      wsUpdatedAt: "",
      loginUser: (u) => {
        const data = readUserData(u.id);
        set(() => {
          const base = freshScopedState();
          const merged = data
            ? {
                profile: data.profile ?? base.profile,
                settings: data.settings ?? base.settings,
                vault: data.vault ?? base.vault,
                agents: data.agents ?? base.agents,
                chats: data.chats ?? base.chats,
                projects: data.projects ?? base.projects,
                folders: data.folders ?? base.folders,
              }
            : base;
          return {
            ...merged,
            profile: {
              ...merged.profile,
              email: merged.profile.email || u.email,
              name: merged.profile.name === "GodEye User" ? u.displayName : merged.profile.name,
            },
            activeChatId: null,
            currentUser: u,
            wsUpdatedAt: data?.updatedAt || "",
          };
        });
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
          updatedAt: s.wsUpdatedAt,
        };
      },
      markWorkspaceSynced: () => set({ wsUpdatedAt: new Date().toISOString() }),
      applyWorkspace: (data) => {
        const u = get().currentUser;
        set((s) => {
          const base = freshScopedState();
          const merged = {
            profile: data.profile ?? base.profile,
            settings: data.settings ?? base.settings,
            vault: data.vault ?? base.vault,
            agents: data.agents ?? base.agents,
            chats: data.chats ?? base.chats,
            projects: data.projects ?? base.projects,
            folders: data.folders ?? base.folders,
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
            localStorage.setItem(workspaceKey(u.id), JSON.stringify({ ...data, updatedAt: get().wsUpdatedAt }));
          } catch {
            /* ignore */
          }
        }
      },
      logoutUser: () => {
        const s = get();
        if (s.currentUser) {
          const stamp = new Date().toISOString();
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
                updatedAt: stamp,
              })
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
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const now = new Date().toISOString();
        const chat: ChatSession = {
          id,
          title: "New chat",
          mode: opts?.mode || "chat",
          provider: opts?.provider || "openrouter",
          model: opts?.model || "anthropic/claude-3.5-sonnet",
          projectId: opts?.projectId,
          folderId: opts?.folderId,
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ chats: [chat, ...s.chats], activeChatId: id }));
        return id;
      },
      setActiveChat: (id) => set({ activeChatId: id }),
      addMessage: (chatId, msg) =>
        set((s) => ({
          chats: s.chats.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, msg], updatedAt: new Date().toISOString(), title: c.messages.length === 0 && msg.role === "user" ? msg.content.slice(0, 48) : c.title } : c)),
        })),
      updateLastMessage: (chatId, content) =>
        set((s) => ({
          chats: s.chats.map((c) => {
            if (c.id !== chatId || c.messages.length === 0) return c;
            const msgs = [...c.messages];
            msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
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
    { name: "godeye-os-v1", partialize: (s) => ({ profile: s.profile, settings: s.settings, vault: s.vault, agents: s.agents, chats: (s as any).chats, activeChatId: (s as any).activeChatId, projects: (s as any).projects, folders: (s as any).folders }) }
  )
);
