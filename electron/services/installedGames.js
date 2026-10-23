const { dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { getDB, saveDB } = require("./database");

function readRegistryPath(key, valueName) {
  if (process.platform !== "win32") return "";
  try {
    const output = execFileSync("reg.exe", ["query", key, "/v", valueName], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
    });
    return output.match(new RegExp(`${valueName}\\s+REG_(?:SZ|EXPAND_SZ)\\s+(.+)`, "i"))?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

function steamRoots() {
  const roots = [
    readRegistryPath("HKCU\\Software\\Valve\\Steam", "SteamPath"),
    readRegistryPath("HKLM\\Software\\WOW6432Node\\Valve\\Steam", "InstallPath"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Steam"),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Steam"),
    path.join(os.homedir(), ".steam", "steam"),
    path.join(os.homedir(), ".local", "share", "Steam"),
    path.join(os.homedir(), "Library", "Application Support", "Steam"),
  ];
  return [...new Set(roots.filter((root) => root && fs.existsSync(path.join(root, "steamapps"))))];
}

function readSteamLibraryPaths(root) {
  const libraries = new Set([root]);
  const file = path.join(root, "steamapps", "libraryfolders.vdf");
  try {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/"path"\s+"((?:\\.|[^"])*)"/gi)) {
      const value = match[1].replace(/\\\\/g, "\\").replace(/\\"/g, '"');
      if (fs.existsSync(path.join(value, "steamapps"))) libraries.add(value);
    }
  } catch {}
  return [...libraries];
}

function vdfValue(source, key) {
  return source.match(new RegExp(`"${key}"\\s+"((?:\\\\.|[^"])*)"`, "i"))?.[1]
    ?.replace(/\\\\/g, "\\")
    ?.replace(/\\"/g, '"') || "";
}

const ignoredExePath = /(?:^|[\\/])(?:_commonredist|redist|redistributables|directx|support|crashreport|crashreports|thirdparty|easyanticheat|battleye|unins\w*|setup|install|update|vc_redist|dxsetup)(?:[\\/]|[^\\/]*\.exe$)/i;

function findGameExecutable(root) {
  const queue = [{ directory: root, depth: 0 }];
  let inspected = 0;
  const candidates = [];
  while (queue.length && inspected < 1600) {
    const { directory, depth } = queue.shift();
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      inspected++;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth < 3 && !ignoredExePath.test(fullPath)) queue.push({ directory: fullPath, depth: depth + 1 });
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".exe" && !ignoredExePath.test(fullPath)) {
        try { candidates.push({ path: fullPath, size: fs.statSync(fullPath).size }); } catch {}
      }
      if (inspected >= 1600) break;
    }
  }
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0]?.path || "";
}

function discoverSteamGames() {
  const games = [];
  const seenManifest = new Set();
  for (const root of steamRoots()) {
    for (const library of readSteamLibraryPaths(root)) {
      const steamapps = path.join(library, "steamapps");
      let files;
      try { files = fs.readdirSync(steamapps); } catch { continue; }
      for (const file of files) {
        const appId = file.match(/^appmanifest_(\d+)\.acf$/i)?.[1];
        if (!appId) continue;
        const manifestPath = path.join(steamapps, file);
        if (seenManifest.has(manifestPath)) continue;
        seenManifest.add(manifestPath);
        try {
          const source = fs.readFileSync(manifestPath, "utf8");
          const name = vdfValue(source, "name");
          const installDir = vdfValue(source, "installdir");
          if (!name || !installDir) continue;
          const installPath = path.join(steamapps, "common", installDir);
          if (!fs.existsSync(installPath)) continue;
          games.push({
            name,
            source: "Steam",
            sourceId: appId,
            installPath,
            exePath: findGameExecutable(installPath),
            thumbnail_link: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
            categories: [],
          });
        } catch {}
      }
    }
  }
  return games;
}

function epicManifestDirectory() {
  if (process.platform === "win32") {
    return path.join(process.env.PROGRAMDATA || "C:\\ProgramData", "Epic", "EpicGamesLauncher", "Data", "Manifests");
  }
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Epic", "EpicGamesLauncher", "Data", "Manifests");
  return path.join(os.homedir(), ".config", "Epic", "EpicGamesLauncher", "Data", "Manifests");
}

function discoverEpicGames() {
  const directory = epicManifestDirectory();
  let files;
  try { files = fs.readdirSync(directory).filter((file) => file.toLowerCase().endsWith(".item")); } catch { return []; }
  return files.flatMap((file) => {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
      const name = manifest.DisplayName || manifest.AppName;
      const installPath = manifest.InstallLocation;
      if (!name || !installPath || !fs.existsSync(installPath)) return [];
      let exePath = "";
      if (manifest.LaunchExecutable) {
        const candidate = path.resolve(installPath, manifest.LaunchExecutable.replace(/^[/\\]+/, ""));
        if (candidate.startsWith(path.resolve(installPath) + path.sep) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) exePath = candidate;
      }
      if (!exePath) exePath = findGameExecutable(installPath);
      return [{
        name,
        source: "Epic Games",
        sourceId: manifest.AppName || manifest.CatalogItemId || file,
        installPath,
        exePath,
        thumbnail_link: "",
        categories: [],
      }];
    } catch {
      return [];
    }
  });
}

function normalizedPath(value) {
  return value ? path.resolve(value).toLowerCase() : "";
}

function setupInstalledGamesIPC(ipcMain, getMainWindow) {
  ipcMain.handle("discover-installed-games", () => {
    const games = [...discoverSteamGames(), ...discoverEpicGames()];
    const seen = new Set();
    return games.filter((game) => {
      const key = normalizedPath(game.installPath);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

  ipcMain.handle("select-installed-game-executable", async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: "Select an installed game's executable",
      properties: ["openFile"],
      filters: [{ name: "Game executable", extensions: ["exe"] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("import-installed-games", (_event, candidates) => {
    if (!Array.isArray(candidates)) return getDB().library;
    const db = getDB();
    db.library ||= [];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate.name !== "string" || typeof candidate.exePath !== "string") continue;
      const exePath = path.resolve(candidate.exePath);
      if (!fs.existsSync(exePath) || !fs.statSync(exePath).isFile()) continue;
      const installPath = candidate.installPath && path.resolve(candidate.installPath);
      const existing = db.library.find((game) =>
        game.name.toLowerCase() === candidate.name.trim().toLowerCase() ||
        (installPath && game.installPath && normalizedPath(game.installPath) === normalizedPath(installPath))
      );
      if (existing) {
        existing.exePath ||= exePath;
        existing.installPath ||= installPath;
        existing.source ||= candidate.source || "Installed game";
        existing.thumbnail_link ||= candidate.thumbnail_link || "";
        continue;
      }
      db.library.push({
        name: candidate.name.trim(),
        exePath,
        installPath: installPath || path.dirname(exePath),
        source: candidate.source || "Installed game",
        sourceId: candidate.sourceId || "",
        thumbnail_link: candidate.thumbnail_link || "",
        categories: Array.isArray(candidate.categories) ? candidate.categories : [],
        launchParams: "",
        addedDate: new Date().toISOString(),
      });
    }
    saveDB(db);
    return db.library;
  });
}

module.exports = { setupInstalledGamesIPC };
