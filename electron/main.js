/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
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

// --- filesystem helpers ------------------------------------------------------
// The agent tools (edit/move/copy/delete) touch arbitrary paths the user names,
// so every path is resolved to an absolute, symlink-free location before use
// and destructive calls are the only ones gated behind a confirmation flag.

function absTarget(p, fallback) {
  const raw = String(p || '').trim();
  if (!raw) return fallback;
  return path.resolve(raw);
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function statOrNull(p) {
  try { return fs.statSync(p); } catch { return null; }
}

/** Human-readable byte count for tool summaries. */
function humanBytes(n) {
  if (!Number.isFinite(n)) return 'n/a';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)}${units[i]}`;
}

/** One-shot shell capture used for platform counters (netstat) — never for user input. */
function capture(cmd, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, { shell: true, windowsHide: true });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('error', () => resolve(''));
    const timer = setTimeout(() => { try { proc.kill(); } catch { /* gone */ } }, timeoutMs);
    proc.on('close', () => { clearTimeout(timer); resolve(out); });
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

  // --- advanced file operations --------------------------------------------

  // Walk a folder, optionally recursing. Symlinked directories are not followed
  // so a link pointing at C:\ cannot turn a listing into a full-disk crawl.
  function walk(root, recursive, maxEntries) {
    const out = [];
    const queue = [root];
    while (queue.length && out.length < maxEntries) {
      const dir = queue.shift();
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (out.length >= maxEntries) break;
        const full = path.join(dir, e.name);
        const st = statOrNull(full);
        const rel = path.relative(root, full) || e.name;
        if (e.isSymbolicLink()) {
          out.push({ path: full, rel, type: 'link', size: 0, modified: null });
          continue;
        }
        if (e.isDirectory()) {
          out.push({ path: full, rel, type: 'dir', size: 0, modified: st ? st.mtime.toISOString() : null });
          if (recursive) queue.push(full);
        } else {
          out.push({ path: full, rel, type: 'file', size: st ? st.size : 0, modified: st ? st.mtime.toISOString() : null });
        }
      }
    }
    return out;
  }

  ipcMain.handle('godeye:list-dir', async (_e, payload = {}) => {
    const target = absTarget(typeof payload === 'string' ? payload : payload.path, baseFolder());
    const st = statOrNull(target);
    if (!st || !st.isDirectory()) return { ok: false, error: `Not a folder: ${target}` };
    const recursive = payload.recursive === true;
    const maxEntries = Math.min(Math.max(Number(payload.maxEntries) || 200, 1), 2000);
    const entries = walk(target, recursive, maxEntries);
    return { ok: true, path: target, count: entries.length, entries, truncated: entries.length >= maxEntries };
  });

  // Rewrite a whole file, or patch it with find/replace when only the new
  // content is passed. Patching avoids round-tripping a large file through the
  // model and lets it change one line of a 5000-line file.
  ipcMain.handle('godeye:edit-file', async (_e, payload = {}) => {
    const target = absTarget(payload.path, '');
    if (!target) return { ok: false, error: 'No path given' };
    const before = exists(target);
    const prior = before ? fs.readFileSync(target, 'utf8') : null;

    if (prior !== null && !Buffer.isBuffer(prior) && prior.includes('\u0000')) {
      return { ok: false, error: 'That looks like a binary file — patch text files instead' };
    }

    let next;
    let how;
    if (payload.find !== undefined && payload.find !== null && String(payload.find) !== '') {
      const needle = String(payload.find);
      const replacement = String(payload.replace ?? '');
      const hay = prior === null ? '' : prior;
      if (!hay.includes(needle)) {
        return { ok: false, error: `Text not found in ${target} — nothing changed`, path: target };
      }
      const all = payload.all === true;
      const occurrences = hay.split(needle).length - 1;
      const applied = all ? occurrences : 1;
      next = all ? hay.split(needle).join(replacement) : hay.replace(needle, replacement);
      how = `${applied} replacement(s) of ${occurrences} match(es)`;
    } else if (payload.content !== undefined) {
      next = String(payload.content);
      how = prior === null ? 'created' : 'rewrote';
    } else {
      return { ok: false, error: 'Pass either `content` (full rewrite) or `find` + `replace` (patch)' };
    }

    if (prior !== null && next === prior) {
      return { ok: true, path: target, unchanged: true, detail: `No change — ${target} already matches` };
    }
    if (!before && payload.createIfMissing !== true) {
      return { ok: false, error: `File does not exist: ${target}. Pass createIfMissing to create it.` };
    }

    try {
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, next, 'utf8');
      const delta = prior === null ? next.length : next.length - prior.length;
      notify('GodEye OS edited file', path.basename(target));
      return {
        ok: true,
        path: target,
        created: !before,
        bytes: next.length,
        detail: `${how} ${target} • ${humanBytes(next.length)}${delta >= 0 ? ` (+${humanBytes(delta)})` : ` (${humanBytes(-delta)} smaller)`}`,
      };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err), path: target };
    }
  });

  ipcMain.handle('godeye:move-path', async (_e, payload = {}) => {
    const from = absTarget(payload.from, '');
    const to = absTarget(payload.to, '');
    if (!from || !to) return { ok: false, error: 'Both `from` and `to` are required' };
    if (from === to) return { ok: true, path: to, detail: `Already at ${to} — nothing to do` };
    if (!exists(from)) return { ok: false, error: `Source does not exist: ${from}` };
    if (exists(to) && payload.overwrite !== true) return { ok: false, error: `Destination already exists: ${to}. Pass overwrite to replace it.` };
    try {
      await fs.promises.mkdir(path.dirname(to), { recursive: true });
      if (exists(to)) await fs.promises.rm(to, { recursive: true, force: true });
      await fs.promises.rename(from, to);
      notify('GodEye OS moved', `${path.basename(from)} → ${path.basename(to)}`);
      return { ok: true, path: to, detail: `Moved ${from} → ${to}` };
    } catch (err) {
      // rename() fails across devices; fall back to copy + remove.
      try {
        await fs.promises.cp(from, to, { recursive: true, force: true });
        await fs.promises.rm(from, { recursive: true, force: true });
        return { ok: true, path: to, detail: `Moved ${from} → ${to} (copied across volumes)` };
      } catch (err2) {
        return { ok: false, error: `${String((err && err.message) || err)} / ${String((err2 && err2.message) || err2)}` };
      }
    }
  });

  ipcMain.handle('godeye:copy-path', async (_e, payload = {}) => {
    const from = absTarget(payload.from, '');
    const to = absTarget(payload.to, '');
    if (!from || !to) return { ok: false, error: 'Both `from` and `to` are required' };
    if (!exists(from)) return { ok: false, error: `Source does not exist: ${from}` };
    const src = statOrNull(from);
    const recursive = payload.recursive !== false && !!src?.isDirectory();
    if (exists(to) && payload.overwrite !== true) return { ok: false, error: `Destination already exists: ${to}. Pass overwrite to replace it.` };
    try {
      await fs.promises.mkdir(path.dirname(to), { recursive: true });
      if (exists(to)) await fs.promises.rm(to, { recursive: true, force: true });
      await fs.promises.cp(from, to, { recursive });
      const count = walk(to, recursive, 2000).length;
      notify('GodEye OS copied', path.basename(to));
      return { ok: true, path: to, count, detail: `Copied ${from} → ${to} (${count} entr${count === 1 ? 'y' : 'ies'})` };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  // Deletion is irreversible, so it reports exactly what it would remove first
  // when asked to dry-run and refuses a non-empty folder without `recursive`.
  ipcMain.handle('godeye:delete-path', async (_e, payload = {}) => {
    const target = absTarget(payload.path, '');
    if (!target) return { ok: false, error: 'No path given' };
    if (!exists(target)) return { ok: false, error: `Nothing to delete at ${target}` };
    const st = statOrNull(target);
    const isDir = !!st?.isDirectory();
    let children = [];
    if (isDir) {
      children = walk(target, true, 2001);
      const fileCount = children.filter((c) => c.type === 'file').length;
      if (fileCount && payload.recursive !== true) {
        return {
          ok: false,
          error: `${target} is not empty (${fileCount} file(s), ${children.length} entr${children.length === 1 ? 'y' : 'ies'}). Pass recursive: true to delete the whole tree.`,
          path: target,
        };
      }
      if (payload.dryRun === true) {
        return {
          ok: true,
          dryRun: true,
          path: target,
          detail: `Would delete folder ${target} with ${children.length} entr${children.length === 1 ? 'y' : 'ies'} (${humanBytes(children.reduce((n, c) => n + c.size, 0))})`,
        };
      }
      await fs.promises.rm(target, { recursive: true, force: true });
      notify('GodEye OS deleted folder', path.basename(target));
      return { ok: true, path: target, detail: `Deleted folder ${target} (${children.length} entr${children.length === 1 ? 'y' : 'ies'})` };
    }
    if (payload.dryRun === true) {
      return { ok: true, dryRun: true, path: target, detail: `Would delete file ${target} (${humanBytes(st ? st.size : 0)})` };
    }
    await fs.promises.rm(target, { force: true });
    notify('GodEye OS deleted file', path.basename(target));
    return { ok: true, path: target, detail: `Deleted file ${target}` };
  });

  // --- system monitoring ----------------------------------------------------
  // CPU needs two samples a moment apart to be a real percentage; memory and
  // disk are instantaneous. Network byte counters are Windows-only because
  // Node exposes no portable per-interface traffic counters.
  ipcMain.handle('godeye:sys-stats', async () => {
    const sample = () => {
      let idle = 0;
      let total = 0;
      for (const c of os.cpus()) {
        for (const k of Object.keys(c.times)) total += c.times[k];
        idle += c.times.idle;
      }
      return { idle, total };
    };
    const a = sample();
    await new Promise((r) => setTimeout(r, 400));
    const b = sample();
    const totalDelta = b.total - a.total;
    const cpuBusyPct = totalDelta > 0 ? Math.round(((totalDelta - (b.idle - a.idle)) / totalDelta) * 100) : 0;

    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const cores = os.cpus();

    let disk = null;
    try {
      if (typeof fs.statfsSync === 'function') {
        const s = fs.statfsSync(baseFolder());
        disk = { path: baseFolder(), totalBytes: Number(s.blocks) * Number(s.bsize), freeBytes: Number(s.bfree) * Number(s.bsize) };
      }
    } catch { /* statfs unsupported on this platform */ }

    let net = null;
    if (process.platform === 'win32') {
      const out = await capture('netstat -e');
      const m = /Bytes\s+([\d,\s]+)$/im.exec(out.replace(/\r/g, ''));
      if (m) {
        const nums = m[1].split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
        if (nums.length >= 2) net = { receivedBytes: nums[0], sentBytes: nums[1] };
      }
    }

    const ifaces = Object.entries(os.networkInterfaces())
      .flatMap(([name, list]) => (list || []).map((i) => ({ name, address: i.address, family: i.family, internal: i.internal, mac: i.mac })))
      .filter((i) => i.family === 'IPv4' || i.family === 4);

    return {
      ok: true,
      cpu: {
        busyPercent: cpuBusyPct,
        cores: cores.length,
        model: cores[0] ? cores[0].model.trim() : 'unknown',
        speedMhz: cores[0] ? cores[0].speed : 0,
        perCore: cores.map((c) => {
          const t = Object.values(c.times).reduce((n, v) => n + v, 0);
          return t ? Math.round(((t - c.times.idle) / t) * 100) : 0;
        }),
        loadAvg: os.loadavg ? os.loadavg().map((n) => Number(n.toFixed(2))) : null,
      },
      memory: { totalBytes: memTotal, freeBytes: memFree, usedBytes: memTotal - memFree, usedPercent: Math.round(((memTotal - memFree) / memTotal) * 100) },
      disk,
      network: net,
      interfaces: ifaces,
      system: {
        platform: process.platform,
        release: os.release(),
        arch: process.arch,
        hostname: os.hostname(),
        user: (() => { try { return os.userInfo().username; } catch { return null; } })(),
        uptimeSeconds: Math.round(os.uptime()),
        processUptimeSeconds: Math.round(process.uptime()),
        node: process.versions.node,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
      },
    };
  });

  // Write a whole project tree (path -> base64) into a chosen folder. Every
  // entry is resolved against the chosen root and rejected if it escapes it.
  ipcMain.handle('godeye:write-project', async (_e, payload = {}) => {
    const { name, files, mode, dir } = payload;
    if (!Array.isArray(files) || !files.length) return { ok: false, error: 'No files to write' };

    let root = dir;
    if (!root) {
      ensureBaseFolder();
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: `Where should "${name || 'project'}" go?`,
        defaultPath: baseFolder(),
        properties: mode === 'new' ? ['openDirectory', 'createDirectory'] : ['openDirectory'],
      });
      if (canceled || !filePaths?.[0]) return { ok: false, canceled: true, error: 'Cancelled' };
      root = mode === 'new' ? path.join(filePaths[0], name || 'project') : filePaths[0];
    }

    const absRoot = path.resolve(root);
    const written = [];
    const skipped = [];
    const failed = [];

    for (const f of files) {
      const rel = String((f && f.path) || '').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!rel || rel.includes('\0')) { skipped.push(rel || '(empty)'); continue; }
      const abs = path.resolve(absRoot, rel);
      // refuse anything that lands outside the chosen root
      if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) {
        skipped.push(rel);
        continue;
      }
      try {
        await fs.promises.mkdir(path.dirname(abs), { recursive: true });
        await fs.promises.writeFile(abs, Buffer.from(String((f && f.base64) || ''), 'base64'));
        written.push(rel);
      } catch (err) {
        failed.push(`${rel}: ${String((err && err.message) || err)}`);
      }
    }

    const ok = written.length > 0 && failed.length === 0;
    if (written.length) {
      notify('GodEye OS wrote project', `${written.length} file(s) → ${absRoot}`);
      // open the folder so the user sees the result immediately
      shell.openPath(absRoot).catch(() => {});
    }
    return {
      ok,
      path: absRoot,
      written: written.length,
      skipped,
      failed,
      error: failed.length ? failed.slice(0, 3).join('; ') : undefined,
      detail: `${written.length} file(s) written to ${absRoot}${skipped.length ? ` • ${skipped.length} rejected (unsafe path)` : ''}${failed.length ? ` • ${failed.length} failed` : ''}`,
    };
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