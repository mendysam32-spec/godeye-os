/* eslint-disable @typescript-eslint/no-require-imports */
// MEDUSA OS desktop bridge — exposes a tightly-scoped API to the renderer.
// The web UI talks to the real filesystem + shell only through this surface.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('medusa', {
  isDesktop: true,
  platform: process.platform,
  bridgeVersion: 5,
  systemInfo: () => ipcRenderer.invoke('medusa:system-info'),
  baseFolder: () => ipcRenderer.invoke('medusa:base-folder'),
  // Save dialog: hand a file to the user via the OS save dialog.
  saveFile: (options) => ipcRenderer.invoke('medusa:save-file', options),
  // Direct write to an absolute path (auto-save inside the medusa base folder).
  writeFile: (payload) => ipcRenderer.invoke('medusa:write-file', payload),
  // Direct binary write from base64 (ZIP / DOCX / PDF / images).
  writeBinary: (payload) => ipcRenderer.invoke('medusa:write-binary', payload),
  // Create a folder (recursively).
  createFolder: (folderPath) => ipcRenderer.invoke('medusa:create-folder', folderPath),
  // Read a text file at an absolute path.
  readText: (path) => ipcRenderer.invoke('medusa:read-text', path),
  // Open dialog to pick a file and load it as text.
  pickAndRead: (filters) => ipcRenderer.invoke('medusa:pick-read', filters),
  // Run a shell command; returns { exitCode, stdout, stderr, timedOut }.
  runCommand: (payload) => ipcRenderer.invoke('medusa:run-command', payload),
  // Write a whole project tree (files: [{ path, base64 }]) into a picked folder.
  writeProject: (payload) => ipcRenderer.invoke('medusa:write-project', payload),
  openPath: (target) => ipcRenderer.invoke('medusa:open-path', target),
  // --- advanced file operations ---
  listDir: (payload) => ipcRenderer.invoke('medusa:list-dir', payload),
  editFile: (payload) => ipcRenderer.invoke('medusa:edit-file', payload),
  movePath: (payload) => ipcRenderer.invoke('medusa:move-path', payload),
  copyPath: (payload) => ipcRenderer.invoke('medusa:copy-path', payload),
  deletePath: (payload) => ipcRenderer.invoke('medusa:delete-path', payload),
  // --- system monitoring ---
  sysStats: () => ipcRenderer.invoke('medusa:sys-stats'),
});