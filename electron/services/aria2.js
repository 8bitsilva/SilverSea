const { app, BrowserWindow, session, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");
const Aria2 = require("aria2").default || require("aria2");
const { getDB, saveDB } = require("./database");
const { scrapeDirectLink } = require("./scrapers/manager");
const { updateDiscordPresence } = require("./discord");

let aria2Process;
let aria2;
const activeGameMap = new Map();
let sessionFilePath;
let labelsFilePath;
const cancellingDownloads = new Set();

function loadDownloadLabels() {
  labelsFilePath = path.join(app.getPath("userData"), "aria2-download-labels.json");
  try {
    const labels = JSON.parse(fs.readFileSync(labelsFilePath, "utf8"));
    for (const [gid, gameName] of Object.entries(labels)) activeGameMap.set(gid, gameName);
  } catch (error) {
    if (error.code !== "ENOENT") console.warn("[ARIA2] Could not restore download labels:", error.message);
  }
}

function persistDownloadLabels() {
  if (!labelsFilePath) return;
  try {
    fs.writeFileSync(labelsFilePath, JSON.stringify(Object.fromEntries(activeGameMap)), { mode: 0o600 });
  } catch (error) {
    console.error("[ARIA2] Could not save download labels:", error.message);
  }
}

function downloadInfo(value, fallbackName = "Unknown File") {
  return typeof value === "string"
    ? { gameName: value, installPath: "" }
    : { gameName: value?.gameName || fallbackName, installPath: value?.installPath || "", thumbnail_link: value?.thumbnail_link || "", categories: value?.categories || [], size: value?.size || "" };
}

function findLaunchableExecutable(root) {
  if (!root || !fs.existsSync(root)) return "";
  const ignored = /(?:setup|install|unins|crash|redist|vc_redist|dxsetup|easyanticheat|battleye|launcherupdate)/i;
  const queue = [{ dir: root, depth: 0 }];
  const candidates = [];
  let inspected = 0;
  while (queue.length && inspected < 2500) {
    const current = queue.shift();
    let entries;
    try { entries = fs.readdirSync(current.dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      inspected++;
      const fullPath = path.join(current.dir, entry.name);
      if (entry.isDirectory() && current.depth < 5 && !ignored.test(entry.name)) queue.push({ dir: fullPath, depth: current.depth + 1 });
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".exe" && !ignored.test(entry.name)) {
        try { candidates.push({ path: fullPath, size: fs.statSync(fullPath).size }); } catch {}
      }
      if (inspected >= 2500) break;
    }
  }
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0]?.path || "";
}

// --- DYNAMIC PORT SCANNER ---
function findFreePort(startPort, maxPort = 6900) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        if (startPort < maxPort) {
          console.log(
            `[ARIA2] Port ${startPort} is busy, trying ${startPort + 1}...`,
          );
          resolve(findFreePort(startPort + 1, maxPort));
        } else {
          reject(new Error("No free ports available for Aria2"));
        }
      } else {
        reject(err);
      }
    });
    server.listen(startPort, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

async function startAria2() {
  const binaryName =
    process.platform === "darwin"
      ? "aria2c"
      : process.platform === "linux"
        ? "aria2c-linux"
        : "aria2c.exe";

  const ariaPath = app.isPackaged
    ? path.join(process.resourcesPath, binaryName)
    : path.join(app.getAppPath(), binaryName);

  if (!fs.existsSync(ariaPath)) {
    console.error("ARIA2 BINARY NOT FOUND at:", ariaPath);
    return false;
  }

  try {
    const freePort = await findFreePort(6800);
    console.log(`[ARIA2] Found free port: ${freePort}`);

    const userDataPath = app.getPath("userData");
    sessionFilePath = path.join(userDataPath, "aria2.session");
    fs.mkdirSync(userDataPath, { recursive: true });
    if (!fs.existsSync(sessionFilePath)) fs.writeFileSync(sessionFilePath, "", { mode: 0o600 });
    loadDownloadLabels();

    aria2 = new Aria2({
      host: "127.0.0.1",
      port: freePort,
      secure: false,
      secret: "",
    });

    aria2Process = spawn(
      ariaPath,
      [
        "--enable-rpc",
        "--rpc-listen-all=false",
        `--rpc-listen-port=${freePort}`,
        "--max-connection-per-server=16",
        "--split=32",
        "--continue=true",
        `--input-file=${sessionFilePath}`,
        `--save-session=${sessionFilePath}`,
        "--save-session-interval=30",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    aria2Process.stderr.on("data", (d) =>
      console.error("[ARIA2 ERR]", d.toString().trim()),
    );
    aria2Process.on("error", (err) => console.error("ARIA2 ERROR:", err));
    aria2Process.on("exit", (code) => console.log("ARIA2 EXIT:", code));

    return true;
  } catch (err) {
    console.error("FAILED TO START ARIA2:", err);
    return false;
  }
}

async function connectAria2(maxRetries = 15) {
  if (!aria2) return false;
  for (let i = 1; i <= maxRetries; i++) {
    try {
      await aria2.open();
      console.log(`[ARIA2] Connected successfully on port ${aria2.port}`);
      return true;
    } catch (err) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.error("[ARIA2] Failed to connect after all retries");
  return false;
}

function startPolling(getMainWindow) {
  setInterval(async () => {
    const mainWindow = getMainWindow();
    if (!aria2Process || !aria2) return;

    try {
      const active = await aria2.call("tellActive");
      const waiting = await aria2.call("tellWaiting", 0, 100);
      const stopped = await aria2.call("tellStopped", 0, 100);
      const completed = stopped.filter((d) => d.status === "complete" && !cancellingDownloads.has(d.gid));

      if (completed.length > 0) {
        let db = getDB();
        let updated = false;
        let libraryChanged = false;

        for (const c of completed) {
          // BUG FIX: Ignore metadata file completions from torrents!
          // If followedBy is present, this gid was just a .torrent payload which spawned the real download
          if (c.followedBy && c.followedBy.length > 0) {
            const newGid = c.followedBy[0];
            const metadata = activeGameMap.get(c.gid);
            if (metadata) {
              activeGameMap.set(newGid, metadata);
              persistDownloadLabels();
            }

            try {
              await aria2.call("removeDownloadResult", c.gid);
            } catch (e) {}
            continue; // Skip adding to completedDownloads
          }

          const fileName =
            c.bittorrent?.info?.name ||
            c.files[0]?.path?.split(/[/\\]/).pop() ||
            "Unknown File";
          const metadata = downloadInfo(activeGameMap.get(c.gid), fileName);
          const gameName = metadata.gameName;

          if (metadata.installPath) {
            db.library ||= [];
            const exePath = findLaunchableExecutable(metadata.installPath);
            const existingGame = db.library.find((game) => game.name.toLowerCase() === gameName.toLowerCase());
            if (existingGame) {
              existingGame.installPath ||= metadata.installPath;
              if (exePath) existingGame.exePath = exePath;
              existingGame.thumbnail_link ||= metadata.thumbnail_link;
              existingGame.categories ||= metadata.categories;
              existingGame.size ||= metadata.size;
              existingGame.source ||= "SilverSea";
            } else {
              db.library.push({
                name: gameName,
                exePath: exePath || null,
                installPath: metadata.installPath,
                source: "SilverSea",
                thumbnail_link: metadata.thumbnail_link,
                categories: metadata.categories,
                size: metadata.size,
                launchParams: "",
                addedDate: new Date().toISOString(),
              });
            }
            updated = true;
            libraryChanged = true;
          }

          if (!db.completedDownloads.find((x) => x.gid === c.gid)) {
            db.completedDownloads.push({
              gid: c.gid,
              name: fileName,
              gameName,
              date: new Date().toISOString(),
            });
            updated = true;
          }

          activeGameMap.delete(c.gid);
          persistDownloadLabels();

          try {
            await aria2.call("removeDownloadResult", c.gid);
          } catch (e) {}
        }

        if (updated) saveDB(db);
        if (libraryChanged && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("library-updated", db.library);
        }
      }

      const downloadState = [...active, ...waiting].filter((d) => !cancellingDownloads.has(d.gid)).map((d) => {
          let name = d.files[0]?.path?.split(/[/\\]/).pop() || "Resolving...";
          if (d.bittorrent && d.bittorrent.info && d.bittorrent.info.name) {
            name = d.bittorrent.info.name;
          }

          // Parse inner files for UI tracking
          const files = d.files
            ? d.files
                .filter((f) => f.path && f.selected === "true")
                .map((f) => ({
                  path: f.path.split(/[/\\]/).pop(),
                  completed: Number(f.completedLength || 0),
                  total: Number(f.length || 0),
                }))
            : [];

          return {
            gid: d.gid,
            gameName: downloadInfo(activeGameMap.get(d.gid), name).gameName,
            name: name,
            total: Number(d.totalLength || 0),
            completed: Number(d.completedLength || 0),
            speed: Number(d.downloadSpeed || 0),
            status: d.status,
            connections: Number(d.connections || 0),
            numSeeders: Number(d.numSeeders || 0),
            files: files,
            isTorrent: !!d.bittorrent,
          };
        });
      updateDiscordPresence(downloadState);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("download-update", downloadState);
    } catch (e) {}
  }, 1000);
}

function setupAria2IPC(ipcMain, getAdBlocker, getMainWindow = () => null) {
  ipcMain.handle(
    "pause-download",
    async (e, gid) => await aria2.call("pause", gid),
  );
  ipcMain.handle(
    "resume-download",
    async (e, gid) => await aria2.call("unpause", gid),
  );
  ipcMain.handle("cancel-download", async (_event, gid) => {
    const mainWindow = getMainWindow();
    const options = {
      type: "question",
      title: "Remove download?",
      message: "Do you also want to delete the files downloaded so far?",
      detail: "Keeping the files leaves them on your drive. Deleting removes partial files and their resume data.",
      buttons: ["Delete files and remove", "Keep files and remove", "Cancel"],
      defaultId: 1,
      cancelId: 2,
      noLink: true,
    };
    const result = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options);
    if (result.response === 2) return { cancelled: true };

    cancellingDownloads.add(gid);
    try {
      const status = await aria2.call("tellStatus", gid);
      await aria2.call("forceRemove", gid);
      activeGameMap.delete(gid);
      persistDownloadLabels();
      if (result.response === 0 && status?.files) {
        const filesToDelete = status.files.flatMap((file) => file.path ? [file.path, `${file.path}.aria2`] : []);
        await Promise.allSettled(filesToDelete.map(async (filePath) => {
          try {
            await fs.promises.unlink(filePath);
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }));
      }
      try { await aria2.call("removeDownloadResult", gid); } catch {}
      cancellingDownloads.delete(gid);
      return { cancelled: false, removed: true };
    } catch (err) {
      cancellingDownloads.delete(gid);
      console.error("Cancel Error:", err);
      throw new Error(`Could not remove download: ${err.message}`);
    }
  });

  ipcMain.on("start-smart-download", async (event, hostUrl, gameName, requestedInstallPath, gameMetadata = {}) => {
    const db = getDB();
    const installPath = requestedInstallPath ? path.resolve(requestedInstallPath) : (db.profile.downloadPath || app.getPath("downloads"));
    try { fs.mkdirSync(installPath, { recursive: true }); } catch (error) {
      console.error("Could not create install folder:", error);
      event.sender.send("download-error", { gameName, message: `Could not create install folder: ${error.message}` });
      return;
    }

    // REMOVED MULTIPART: Ensure it's treated strictly as a single string link
    const currentUrl = Array.isArray(hostUrl) ? hostUrl[0] : hostUrl;

    if (currentUrl.startsWith("magnet:")) {
      try {
        const gid = await aria2.call("addUri", [currentUrl], {
          dir: installPath,
        });
        activeGameMap.set(gid, { gameName, installPath, ...gameMetadata });
        persistDownloadLabels();
        event.sender.send("download-started", {
          gameName,
          fileName: "Torrent Download",
        });
      } catch (e) {
        console.error("Magnet error:", e);
      }
      return;
    }

    const scrapeResult = await scrapeDirectLink(currentUrl);
    if (scrapeResult) {
      let targetUrl = "";
      let customHeaders = [];

      if (typeof scrapeResult === "string") {
        targetUrl = scrapeResult;
      } else if (typeof scrapeResult === "object" && scrapeResult.url) {
        targetUrl = scrapeResult.url;
        customHeaders = scrapeResult.headers || [];
      }

      console.log("[Scraper] Success! Sending to Aria2:", targetUrl);
      const fileName =
        targetUrl.split("?")[0].split("/").pop() || "game_download";

      try {
        const ariaOptions = {
          dir: installPath,
          out: `[SilverSea] ${fileName}`,
        };

        if (customHeaders.length > 0) {
          ariaOptions.header = customHeaders;
        }

        const gid = await aria2.call("addUri", [targetUrl], ariaOptions);

        activeGameMap.set(gid, { gameName, installPath, ...gameMetadata });
        persistDownloadLabels();
        event.sender.send("download-started", { gameName, fileName });

        return;
      } catch (err) {
        console.error(
          "[ARIA2] Direct download failed, falling back to window.",
        );
      }
    }

    console.log("[Scraper] Failed or unsupported. Opening Stealth Window.");

    const uniqueSessionId = `stealth_${Date.now()}_${Math.random()}`;
    const dlSession = session.fromPartition(uniqueSessionId);
    const adBlocker = getAdBlocker();
    if (adBlocker) adBlocker.enableBlockingInSession(dlSession);

    const realUA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    dlSession.setUserAgent(realUA);

    let downloadWin = new BrowserWindow({
      width: 1100,
      height: 750,
      show: true,
      title: "SilverSea - Please solve captcha or click Download...",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        session: dlSession,
        disableBlinkFeatures: "AutomationControlled",
      },
    });

    downloadWin.webContents.setWindowOpenHandler(() => {
      return { action: "deny" };
    });

    downloadWin.webContents.on("did-start-navigation", () => {
      downloadWin.webContents
        .executeJavaScript(
          `
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
          Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
          Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] }); // Fake having browser plugins
      `,
        )
        .catch(() => {});
    });

    downloadWin.webContents.on("did-finish-load", () => {
      const injectedUI = `
        Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
        if (!document.getElementById('bp-back-btn')) {
          const btn = document.createElement('button');
          btn.id = 'bp-back-btn';
          btn.innerHTML = '⬅ Go Back';
          btn.style.cssText = 'position:fixed; bottom:20px; left:20px; z-index:2147483647; padding:12px 20px; background:#ef4444; color:white; border:none; border-radius:8px; font-weight:bold; font-family:sans-serif; cursor:pointer; box-shadow:0 4px 10px rgba(0,0,0,0.5); font-size: 14px;';
          btn.onclick = (e) => { e.preventDefault(); window.history.back(); };
          document.body.appendChild(btn);
        }
      `;
      downloadWin.webContents.executeJavaScript(injectedUI).catch(() => {});
    });

    let hasIntercepted = false;
    dlSession.on("will-download", async (e, item) => {
      if (hasIntercepted) {
        e.preventDefault();
        return;
      }
      hasIntercepted = true;
      e.preventDefault();
      if (downloadWin.isDestroyed()) return;

      const directUrlItem = item.getURLChain().pop();
      const downloadedFileName = item.getFilename();

      try {
        const cookies = await dlSession.cookies.get({});
        const exactReferer = downloadWin.webContents.getURL();

        const gid = await aria2.call("addUri", [directUrlItem], {
          header: [
            `Cookie: ${cookies.map((c) => `${c.name}=${c.value}`).join("; ")}`,
            `User-Agent: ${realUA}`,
            `Referer: ${exactReferer}`,
          ],
          dir: installPath,
          out: `[SilverSea] ${downloadedFileName}`,
        });
        activeGameMap.set(gid, { gameName, installPath, ...gameMetadata });
        persistDownloadLabels();
        event.sender.send("download-started", {
          gameName,
          fileName: downloadedFileName,
        });
      } catch (err) {
        console.error(err);
      } finally {
        if (!downloadWin.isDestroyed()) downloadWin.close();
      }
    });

    downloadWin.loadURL(currentUrl);
  });
}

async function shutdownAria2() {
  const child = aria2Process;
  if (!child) return;

  const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);

  try { await withTimeout(aria2?.call("saveSession"), 2000); } catch (error) {
    console.warn("[ARIA2] Could not save the active queue through RPC:", error.message);
  }

  let exited = child.exitCode !== null;
  const exitPromise = new Promise((resolve) => {
    if (exited) return resolve(true);
    child.once("exit", () => {
      exited = true;
      resolve(true);
    });
    setTimeout(() => resolve(false), 5000).unref?.();
  });

  try { await withTimeout(aria2?.call("shutdown"), 2500); } catch (error) {
    console.warn("[ARIA2] Graceful shutdown failed; stopping the worker:", error.message);
  }

  if (!(await exitPromise) && !exited) {
    child.kill();
    await new Promise((resolve) => {
      if (exited) return resolve();
      child.once("exit", resolve);
      setTimeout(resolve, 1500).unref?.();
    });
  }
  aria2Process = null;
  aria2 = null;
}

module.exports = {
  startAria2,
  connectAria2,
  startPolling,
  setupAria2IPC,
  shutdownAria2,
};
