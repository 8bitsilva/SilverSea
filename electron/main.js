require('v8-compile-cache');
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const fetch = require("cross-fetch");
const { ElectronBlocker } = require("@cliqz/adblocker-electron");
const { autoUpdater } = require("electron-updater");

// Keep the existing profile folder so upgrades retain the database, Discord
// session, and resumable aria2 state after the product rename.
app.setName("SilverSea");
app.setPath("userData", path.join(app.getPath("appData"), "Silver Downloader"));

// --- Global Request Hooking ---
const Module = require("module");
const originalRequire = Module.prototype.require;
const sharedAxios = originalRequire.call(module, "axios");
let sharedCheerio;
try {
  sharedCheerio = originalRequire.call(module, "cheerio");
} catch (e) {}

Module.prototype.require = function (request) {
  if (request === "axios") return sharedAxios;
  if (request === "cheerio" && sharedCheerio) return sharedCheerio;
  return originalRequire.apply(this, arguments);
};

// --- Import Services ---
const { setupDatabaseIPC } = require("./services/database");
const { loadSteamCache, setupSteamIPC } = require("./services/steam");
const { loadExtensions, setupExtensionsIPC } = require("./services/extensions");
const { setupLauncherIPC, killAllGames } = require("./services/launcher");
const { setupInstalledGamesIPC } = require("./services/installedGames");
const { setupDiscordIPC, stopDiscord } = require("./services/discord");
const {
  startAria2,
  connectAria2,
  startPolling,
  setupAria2IPC,
  shutdownAria2,
} = require("./services/aria2");

let mainWindow;
let tray;
let isQuitting = false;
let shutdownComplete = false;
let adBlocker = null;
let updateStatus = { state: "idle", version: app.getVersion(), progress: 0, message: "" };

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;

function publishUpdateStatus(nextStatus) {
  updateStatus = { ...updateStatus, ...nextStatus };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("update-status", updateStatus);
}

autoUpdater.on("checking-for-update", () => publishUpdateStatus({ state: "checking", message: "Checking for updates…" }));
autoUpdater.on("update-available", (info) => publishUpdateStatus({ state: "downloading", version: info.version, progress: 0, message: `Downloading version ${info.version}…` }));
autoUpdater.on("update-not-available", (info) => publishUpdateStatus({ state: "current", version: info.version || app.getVersion(), progress: 0, message: "SilverSea is up to date." }));
autoUpdater.on("download-progress", (progress) => publishUpdateStatus({ state: "downloading", progress: Math.round(progress.percent), message: `Downloading update… ${Math.round(progress.percent)}%` }));
autoUpdater.on("update-downloaded", (info) => publishUpdateStatus({ state: "downloaded", version: info.version, progress: 100, message: `Version ${info.version} is ready to install.` }));
autoUpdater.on("error", (error) => publishUpdateStatus({ state: "error", message: error.message || "Could not check for updates." }));

app.whenReady().then(async () => {
  console.log("[App] Ready initializing modules...");

  loadExtensions();
  loadSteamCache();
  createWindow();
  createTray();

  setupDatabaseIPC(ipcMain);
  setupSteamIPC(ipcMain);
  setupExtensionsIPC(ipcMain);
  setupLauncherIPC(ipcMain, () => mainWindow);
  setupInstalledGamesIPC(ipcMain, () => mainWindow);
  setupAria2IPC(ipcMain, () => adBlocker);
  setupDiscordIPC(ipcMain, () => mainWindow);
  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates().catch((error) => publishUpdateStatus({ state: "error", message: error.message })), 8000);
  }

// Background processes
  startAria2().then((started) => {
    if (started) {
      connectAria2().then((ok) => {
        if (ok) {
          console.log("[App] Aria2 background init complete");
          startPolling(() => mainWindow);
        }
      });
    }
  });
  ElectronBlocker.fromLists(fetch, [
      "https://easylist.to/easylist/easylist.txt",
      "https://easylist.to/easylist/easyprivacy.txt",
      "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt",
      "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt",
      "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt",
      "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt",
      "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=1&mimetype=plaintext"
    ])
    .then((b) => {
      adBlocker = b;
      console.log("[App] AdBlocker ready");
    })
    .catch((e) => console.error("[App] AdBlocker failed:", e));
});



function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    titleBarStyle: "hiddenInset",
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), app.isPackaged ? "dist" : "public", "silver-mascot.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      backgroundThrottling: true
    },
  });

  mainWindow.on("close", (event) => {
    if (isQuitting || !tray) return;
    event.preventDefault();
    mainWindow.hide();
    tray.setToolTip("SilverSea — downloads continue in the background");
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function createTray() {
  const iconPath = path.join(app.getAppPath(), app.isPackaged ? "dist" : "public", "silver-mascot.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 24, height: 24 });
  tray = new Tray(icon);
  tray.setToolTip("SilverSea — downloads continue in the background");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open SilverSea", click: () => { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); } } },
    { type: "separator" },
    { label: "Quit and save downloads", click: () => app.quit() },
  ]));
  tray.on("click", () => { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); } });
}

app.on("window-all-closed", () => {
  // Keep aria2 running after the window is hidden so active transfers continue.
});

app.on("before-quit", (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (isQuitting) return;
  isQuitting = true;
  Promise.allSettled([shutdownAria2(), stopDiscord()]).then(() => {
    killAllGames();
    if (tray) tray.destroy();
    shutdownComplete = true;
    app.quit();
  });
});

ipcMain.handle("select-directory", async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("get-update-status", () => updateStatus);
ipcMain.handle("check-for-updates", async () => {
  if (!app.isPackaged) return { ...updateStatus, state: "unavailable", message: "Updates are available in the installed version." };
  try {
    publishUpdateStatus({ state: "checking", message: "Checking for updates…" });
    await autoUpdater.checkForUpdates();
  } catch (error) {
    publishUpdateStatus({ state: "error", message: error.message || "Could not check for updates." });
  }
  return updateStatus;
});
ipcMain.handle("install-update", () => {
  if (updateStatus.state !== "downloaded") return false;
  autoUpdater.quitAndInstall();
  return true;
});

ipcMain.on("open-external", (event, url) => {
  shell.openExternal(url);
});
ipcMain.on("window-minimize", () => mainWindow.minimize());
ipcMain.on("window-maximize", () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on("window-close", () => mainWindow.close());

ipcMain.handle("check-part-exists", (e, url) => {
  try {
    const { getDB } = require("./services/database");
    const db = getDB();
    const rawName = url.split("?")[0].split("/").pop();
    if (!rawName) return false;

    const fileName = rawName.startsWith("[SilverSea]") || rawName.startsWith("[SilverDownloader]") ||
      rawName.startsWith("[BlackPearl]")
      ? rawName
      : `[SilverSea] ${rawName}`;
    const dlPath = db.profile?.downloadPath || app.getPath("downloads");
    const legacyName = rawName.startsWith("[BlackPearl]")
      ? rawName
      : fileName.replace("[SilverSea]", "[BlackPearl]");

    return fs.existsSync(path.join(dlPath, fileName)) ||
      fs.existsSync(path.join(dlPath, legacyName));
  } catch (err) {
    return false;
  }
});

ipcMain.handle("choose-game-install-folder", async (_event, { gameName, requiredBytes } = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: `Choose install location for ${gameName || "game"}`,
    buttonLabel: "Preview install",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const parentPath = result.filePaths[0];
  const safeName = String(gameName || "Game").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "Game";
  const installPath = path.join(parentPath, safeName);
  try {
    const stats = fs.statfsSync(parentPath);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const required = Number.isFinite(Number(requiredBytes)) && Number(requiredBytes) > 0 ? Number(requiredBytes) : null;
    return { parentPath, installPath, freeBytes, requiredBytes: required, enoughSpace: required == null || freeBytes >= required };
  } catch (error) {
    return { parentPath, installPath, freeBytes: null, requiredBytes: Number(requiredBytes) || null, enoughSpace: true, spaceError: error.message };
  }
});
