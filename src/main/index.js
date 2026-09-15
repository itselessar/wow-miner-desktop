'use strict';

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { DaemonManager } = require('./daemon-manager');
const { SettingsStore } = require('./settings-store');
const { assertPrimaryAddress, assertThreadCount } = require('./validation');

const ALLOWED_EXTERNAL_ORIGINS = new Set([
  'https://wownero.org',
  'https://github.com',
  'https://codeberg.org',
  'https://stackwallet.com'
]);

let mainWindow;
let daemon;
let settingsStore;
let quitting = false;

function safeError(error) {
  return error instanceof Error ? error.message : 'Unexpected application error.';
}

function logoPath() {
  return path.resolve(__dirname, '..', '..', 'assets', 'wownero.png');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#090b0d',
    title: 'WOW Miner',
    icon: logoPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.resolve(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.resolve(__dirname, '..', 'renderer', 'index.html'));
}

function registerIpc() {
  ipcMain.handle('app:bootstrap', async () => {
    const settings = settingsStore.read();
    return {
      version: app.getVersion(),
      platform: process.platform,
      logicalCpuCount: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Unknown CPU',
      totalMemory: os.totalmem(),
      settings,
      snapshot: await daemon.snapshot()
    };
  });

  ipcMain.handle('daemon:start', async () => {
    try {
      return { ok: true, value: await daemon.start(settingsStore.read()) };
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  });

  ipcMain.handle('daemon:stop', async () => {
    try {
      return { ok: true, value: await daemon.stopOwned() };
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  });

  ipcMain.handle('daemon:snapshot', () => daemon.snapshot());

  ipcMain.handle('mining:start', async (_event, payload) => {
    try {
      const address = assertPrimaryAddress(payload?.address);
      const threads = assertThreadCount(payload?.threads, os.cpus().length);
      const value = await daemon.startMining(address, threads);
      const current = settingsStore.read();
      settingsStore.write({ ...current, address, threads });
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  });

  ipcMain.handle('mining:stop', async () => {
    try {
      return { ok: true, value: await daemon.stopMining() };
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  });

  ipcMain.handle('settings:save', async (_event, input) => {
    try {
      const settings = settingsStore.write(input);
      app.setLoginItemSettings({ openAtLogin: settings.startWithWindows });
      return { ok: true, value: settings };
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  });

  ipcMain.handle('dialog:data-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Wownero blockchain folder',
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('shell:open-data-directory', async () => {
    const settings = settingsStore.read();
    const directory = settings.dataDirectory || daemon.defaultDataDirectory();
    const message = await shell.openPath(directory);
    return { ok: message === '', error: message || undefined };
  });

  ipcMain.handle('shell:open-external', async (_event, input) => {
    try {
      const url = new URL(String(input));
      if (url.protocol !== 'https:' || !ALLOWED_EXTERNAL_ORIGINS.has(url.origin)) {
        throw new Error('That external link is not allowlisted.');
      }
      await shell.openExternal(url.toString());
      return { ok: true };
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId('org.wownero.wowminer');
  daemon = new DaemonManager();
  settingsStore = new SettingsStore(
    path.join(app.getPath('userData'), 'settings.json'),
    os.cpus().length
  );
  registerIpc();
  createWindow();
  daemon.on('log', (entry) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('daemon:log', entry);
  });

  if (settingsStore.read().startNodeOnLaunch) {
    try {
      await daemon.start(settingsStore.read());
    } catch (error) {
      daemon.emitLog('error', safeError(error));
    }
  }
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  daemon.stopOwned().finally(() => app.quit());
});

