import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { initDatabase, closeDatabase } from '../../database/database';
import { chromeCDP } from '../../automation/cdp/ChromeCDPManager';
import { registerIpc } from './ipc';

const isDev = !app.isPackaged;

app.setName('JobPilot');

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    title: 'JobPilot',
    backgroundColor: '#0b1020',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // 外部链接一律交给系统浏览器，禁止在应用内打开新窗口。
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (isDev && devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    // __dirname = <root>/dist-electron/electron/main，向上三级到项目根，
    // 再进入 dist/renderer。生产打包后同样适用（app.asar 内）。
    void win.loadFile(path.join(__dirname, '../../../dist/renderer/index.html'));
  }
}

app.whenReady().then(() => {
  initDatabase();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 退出前关闭 JobPilot 管理的专用 Chrome（不删除 Profile 数据）。
app.on('before-quit', (event) => {
  if (chromeCDP.isActive()) {
    event.preventDefault();
    void chromeCDP.closeActive().finally(() => app.quit());
  }
});

app.on('quit', () => {
  closeDatabase();
});
