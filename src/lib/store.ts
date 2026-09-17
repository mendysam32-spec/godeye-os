"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProviderId } from "./providers";

export type Theme = "light" | "dark" | "glass" | "midnight" | "aurora";
export type Accent = "amber" | "violet" | "emerald" | "blue" | "rose";

export interface UserProfile {
  name: string;
  email: string;
  avatar: string;
  role: string;
  bio: string;
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
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: "active" | "archived" | "draft";
  color: string;
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
  currentUser: { email: string } | null;
  setCurrentUser: (u: { email: string } | null) => void;
  chats: ChatSession[];
  activeChatId: string | null;
  createChat: (opts?: Partial<Pick<ChatSession, "mode" | "provider" | "model">>) => string;
  setActiveChat: (id: string | null) => void;
  addMessage: (chatId: string, msg: ChatMessage) => void;
  updateLastMessage: (chatId: string, content: string) => void;
  deleteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  projects: Project[];
  addProject: (p: Project) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  removeProject: (id: string) => void;
}

export const useGodEye = create<GodEyeState>()(
  persist(
    (set) => ({
      profile: {
        name: "Alex Morgan",
        email: "alex@godeye.os",
        avatar: "",
        role: "Workforce Owner",
        bio: "Building autonomous teams with GodEye OS.",
      },
      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),

      settings: {
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
      },
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

      agents: [
        { id: "1", name: "Architect", role: "System Architect", provider: "nvidia", model: "meta/llama-3.1-405b-instruct", systemPrompt: "You design scalable systems.", temperature: 0.4, color: "#76b900" },
        { id: "2", name: "Coder", role: "Full-Stack Engineer", provider: "openrouter", model: "anthropic/claude-3.5-sonnet", systemPrompt: "You write production code.", temperature: 0.2, color: "#6467f2" },
        { id: "3", name: "Writer", role: "Content Strategist", provider: "omeroute", model: "omeroute/auto", systemPrompt: "You craft compelling content.", temperature: 0.8, color: "#ff6b35" },
      ],
      addAgent: (a) => set((s) => ({ agents: [...s.agents, a] })),
      updateAgent: (id, patch) => set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      removeAgent: (id) => set((s) => ({ agents: s.agents.filter((a) => a.id !== id) })),

      currentUser: null,
      setCurrentUser: (u) => set({ currentUser: u }),

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

      projects: [
        { id: "p1", name: "GodEye Launch", description: "Landing + workforce canvas + docs", status: "active", color: "#f59e0b", agentIds: ["1", "2"], tasksTotal: 12, tasksDone: 7, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: "p2", name: "AI Blog Pipeline", description: "Research → draft → SEO → publish", status: "active", color: "#8b5cf6", agentIds: ["3"], tasksTotal: 8, tasksDone: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: "p3", name: "Nvidia Demo App", description: "Llama 405B showcase build", status: "draft", color: "#76b900", agentIds: ["1", "2", "3"], tasksTotal: 5, tasksDone: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ],
      addProject: (p) => set((s) => ({ projects: [p, ...s.projects] })),
      updateProject: (id, patch) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)) })),
      removeProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
    }),
    { name: "godeye-os-v1", partialize: (s) => ({ profile: s.profile, settings: s.settings, vault: s.vault, agents: s.agents, chats: (s as any).chats, activeChatId: (s as any).activeChatId, projects: (s as any).projects }) }
  )
);
