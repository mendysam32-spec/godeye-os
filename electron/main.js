/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let win, tray;
const CLOUD_URL = process.env.GODEYE_URL || 'http://localhost:3000';

function baseFolder() {
  return path.join(app.getPath('documents'), 'GodEye');
}

function ensureBaseFolder() {
  try { fs.mkdirSync(baseFolder(), { recursive: true }); } catch { /* best effort */ }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800,
    title: 'GodEye OS — by S&P Group',
    backgroundColor: '#fcfcf9',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadURL(CLOUD_URL);
  win.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); win.hide(); }
  });
}

function notify(title, body) {
  try {
    new Notification({ title, body }).show();
  } catch { /* not supported */ }
}

// Runs a command with a shell, streaming output. Returns { exitCode, stdout, stderr, timedOut }.
function runShellCommand(command, cwd, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const proc = spawn(command, { cwd: cwd || baseFolder(), shell: true, windowsHide: true });
    let stdout = '', stderr = '', timedOut = false;
    const cap = 20000;
    const push = (buf, s) => (buf + s).length > cap ? (buf + s).slice(buf.length - cap) : buf + s;
    proc.stdout.on('data', (d) => { stdout = push(stdout, d.toString()); });
    proc.stderr.on('data', (d) => { stderr = push(stderr, d.toString()); });
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true });
      else proc.kill('SIGKILL');
    }, timeoutMs);
    proc.on('error', (e) => { clearTimeout(timer); resolve({ exitCode: -1, stdout, stderr: stderr || String(e.message || e), timedOut }); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      notify('GodEye OS command finished', `${command.slice(0, 60)}${timedOut ? ' (timed out)' : ` → exit ${code}`}`);
      resolve({ exitCode: code ?? -1, stdout, stderr, timedOut });
    });
  });
}

function registerIpc() {
  ipcMain.handle('godeye:system-info', () => ({
    platform: process.platform,
    arch: process.arch,
    versions: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    },
    baseFolder: baseFolder(),
    foldersExist: fs.existsSync(baseFolder()),
  }));

  ipcMain.handle('godeye:base-folder', () => ({ path: baseFolder(), exists: fs.existsSync(baseFolder()) }));

  ipcMain.handle('godeye:save-file', async (_e, options = {}) => {
    const { content, defaultName, title } = options;
    ensureBaseFolder();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: title || 'Save with GodEye OS',
      defaultPath: path.join(baseFolder(), defaultName || 'godeye-output.txt'),
    });
    if (canceled || !filePath) return { canceled: true };
    try {
      await fs.promises.writeFile(filePath, content, 'utf8');
      return { canceled: false, filePath };
    } catch (err) {
      return { canceled: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('godeye:write-file', async (_e, payload = {}) => {
    const { path: filePath, content } = payload;
    if (!filePath) return { ok: false, error: 'No path given' };
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, content ?? '', 'utf8');
      notify('GodEye OS saved file', path.basename(filePath));
      return { ok: true, path: filePath };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err), path: filePath };
    }
  });

  // Write a binary file (ZIP / DOCX / PDF / images) from base64.
  ipcMain.handle('godeye:write-binary', async (_e, payload = {}) => {
    const { path: filePath, base64 } = payload;
    if (!filePath) return { ok: false, error: 'No path given' };
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, Buffer.from(base64 || '', 'base64'));
      notify('GodEye OS saved file', path.basename(filePath));
      return { ok: true, path: filePath };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err), path: filePath };
    }
  });

  // Create a folder (recursively) anywhere on disk.
  ipcMain.handle('godeye:create-folder', async (_e, folderPath) => {
    if (!folderPath) return { ok: false, error: 'No path given' };
    try {
      await fs.promises.mkdir(folderPath, { recursive: true });
      return { ok: true, path: folderPath };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err), path: folderPath };
    }
  });

  ipcMain.handle('godeye:read-text', async (_e, filePath) => {
    if (!filePath) return { ok: false, error: 'No path given' };
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return { ok: true, path: filePath, content };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('godeye:pick-read', async (_e, filters = []) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: filters.length ? filters : [{ name: 'All files', extensions: ['*'] }],
    });
    if (canceled || !filePaths?.[0]) return { canceled: true };
    try {
      const content = await fs.promises.readFile(filePaths[0], 'utf8');
      return { canceled: false, path: filePaths[0], content };
    } catch (err) {
      return { canceled: false, error: String((err && err.message) || err), path: filePaths[0] };
    }
  });

  ipcMain.handle('godeye:run-command', async (_e, payload = {}) => {
    const { command, cwd, timeoutMs } = payload;
    if (!command || typeof command !== 'string') return { ok: false, exitCode: -1, stdout: '', stderr: 'No command given', timedOut: false };
    const r = await runShellCommand(command, cwd, timeoutMs);
    return { ok: r.exitCode === 0, ...r };
  });

  ipcMain.handle('godeye:open-path', async (_e, target) => {
    try {
      const res = await shell.openPath(target || baseFolder());
      return res ? { ok: false, error: res } : { ok: true };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });
}

app.whenReady().then(() => {
  ensureBaseFolder();
  registerIpc();
  createWindow();
  try {
    tray = new Tray(path.join(__dirname, 'icon.png'));
    tray.setToolTip('GodEye OS — Workforce OS');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show GodEye OS', click: () => win.show() },
      { label: 'Dashboard', click: () => { win.show(); win.loadURL(CLOUD_URL + '/dashboard'); } },
      { label: 'Providers Vault', click: () => { win.show(); win.loadURL(CLOUD_URL + '/vault'); } },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
    ]));
  } catch { /* missing icon is non-fatal */ }
  globalShortcut.register('Ctrl+Shift+G', () => { if (win) win.show(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });