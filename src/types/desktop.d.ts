// Type declarations for the MEDUSA OS desktop bridge injected by
// electron/preload.js via contextBridge.exposeInMainWorld("medusa", ...).
import type { ToolResult } from "../lib/desktop";

interface MEDUSASaveResult {
  canceled: boolean;
  filePath?: string;
  error?: string;
}

interface MEDUSAFileResult {
  ok: boolean;
  path?: string;
  content?: string;
  error?: string;
}

interface MEDUSAWriteResult {
  ok: boolean;
  path?: string;
  error?: string;
}

interface MEDUSACommandResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface MEDUSASystemInfo {
  platform: string;
  arch: string;
  versions: { electron?: string; node?: string; chrome?: string };
  baseFolder: string;
  foldersExist: boolean;
}

interface MEDUSABaseFolder {
  path: string;
  exists: boolean;
}

interface MEDUSABridge {
  isDesktop: boolean;
  platform: string;
  bridgeVersion?: number;
  systemInfo: () => Promise<MEDUSASystemInfo>;
  baseFolder: () => Promise<MEDUSABaseFolder>;
  saveFile: (options: { content: string; defaultName?: string; title?: string }) => Promise<MEDUSASaveResult>;
  writeFile: (payload: { path: string; content: string }) => Promise<MEDUSAWriteResult>;
  readText: (path: string) => Promise<MEDUSAFileResult>;
  pickAndRead: (filters?: { name: string; extensions: string[] }[]) => Promise<{ canceled?: boolean; path?: string; content?: string; error?: string }>;
  runCommand: (payload: { command: string; cwd?: string; timeoutMs?: number }) => Promise<MEDUSACommandResult>;
  openPath: (target: string) => Promise<{ ok: boolean; error?: string }>;
}

export type { MEDUSABridge, MEDUSASystemInfo, ToolResult };

declare global {
  interface Window {
    medusa?: MEDUSABridge;
  }
}

export {};