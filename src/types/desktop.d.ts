// Type declarations for the GodEye OS desktop bridge injected by
// electron/preload.js via contextBridge.exposeInMainWorld("godeye", ...).
import type { ToolResult } from "../lib/desktop";

interface GodEyeSaveResult {
  canceled: boolean;
  filePath?: string;
  error?: string;
}

interface GodEyeFileResult {
  ok: boolean;
  path?: string;
  content?: string;
  error?: string;
}

interface GodEyeWriteResult {
  ok: boolean;
  path?: string;
  error?: string;
}

interface GodEyeCommandResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface GodEyeSystemInfo {
  platform: string;
  arch: string;
  versions: { electron?: string; node?: string; chrome?: string };
  baseFolder: string;
  foldersExist: boolean;
}

interface GodEyeBaseFolder {
  path: string;
  exists: boolean;
}

interface GodEyeBridge {
  isDesktop: boolean;
  platform: string;
  bridgeVersion?: number;
  systemInfo: () => Promise<GodEyeSystemInfo>;
  baseFolder: () => Promise<GodEyeBaseFolder>;
  saveFile: (options: { content: string; defaultName?: string; title?: string }) => Promise<GodEyeSaveResult>;
  writeFile: (payload: { path: string; content: string }) => Promise<GodEyeWriteResult>;
  readText: (path: string) => Promise<GodEyeFileResult>;
  pickAndRead: (filters?: { name: string; extensions: string[] }[]) => Promise<{ canceled?: boolean; path?: string; content?: string; error?: string }>;
  runCommand: (payload: { command: string; cwd?: string; timeoutMs?: number }) => Promise<GodEyeCommandResult>;
  openPath: (target: string) => Promise<{ ok: boolean; error?: string }>;
}

export type { GodEyeBridge, GodEyeSystemInfo, ToolResult };

declare global {
  interface Window {
    godeye?: GodEyeBridge;
  }
}

export {};