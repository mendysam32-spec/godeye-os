/* eslint-disable @typescript-eslint/no-require-imports */
// GodEye OS desktop bridge — exposes a tightly-scoped API to the renderer.
// The web UI talks to the real filesystem + shell only through this surface.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('godeye', {
  isDesktop: true,
  platform: process.platform,
  bridgeVersion: 3,
  systemInfo: () => ipcRenderer.invoke('godeye:system-info'),
  baseFolder: () => ipcRenderer.invoke('godeye:base-folder'),
  // Save dialog: hand a file to the user via the OS save dialog.
  saveFile: (options) => ipcRenderer.invoke('godeye:save-file', options),
  // Direct write to an absolute path (auto-save inside the godEye base folder).
  writeFile: (payload) => ipcRenderer.invoke('godeye:write-file', payload),
  // Direct binary write from base64 (ZIP / DOCX / PDF / images).
  writeBinary: (payload) => ipcRenderer.invoke('godeye:write-binary', payload),
  // Create a folder (recursively).
  createFolder: (folderPath) => ipcRenderer.invoke('godeye:create-folder', folderPath),
  // Read a text file at an absolute path.
  readText: (path) => ipcRenderer.invoke('godeye:read-text', path),
  // Open dialog to pick a file and load it as text.
  pickAndRead: (filters) => ipcRenderer.invoke('godeye:pick-read', filters),
  // Run a shell command; returns { exitCode, stdout, stderr, timedOut }.
  runCommand: (payload) => ipcRenderer.invoke('godeye:run-command', payload),
  openPath: (target) => ipcRenderer.invoke('godeye:open-path', target),
});