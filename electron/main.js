const { app, BrowserWindow, Tray, Menu, globalShortcut } = require('electron');
const path = require('path');

let win, tray;
const CLOUD_URL = process.env.GODEYE_URL || 'http://localhost:3000';

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800,
    title: 'GodEye OS — by S&P Group',
    backgroundColor: '#fcfcf9',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  win.loadURL(CLOUD_URL);
  win.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); win.hide(); }
  });
}

app.whenReady().then(() => {
  createWindow();
  tray = new Tray(path.join(__dirname, 'icon.png'));
  tray.setToolTip('GodEye OS — Workforce OS');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show GodEye OS', click: () => win.show() },
    { label: 'Dashboard', click: () => { win.show(); win.loadURL(CLOUD_URL + '/dashboard'); } },
    { label: 'Providers Vault', click: () => { win.show(); win.loadURL(CLOUD_URL + '/vault'); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  globalShortcut.register('Ctrl+Shift+G', () => win.show());
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
