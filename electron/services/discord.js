const { app, safeStorage, shell } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { Client } = require("@xhayper/discord-rpc");
const { getDB, saveDB } = require("./database");

const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PORT = 43122;
const REDIRECT_URI = `http://${CALLBACK_HOST}:${CALLBACK_PORT}/discord/callback`;
const OAUTH_API = "https://discord.com/api/v10";
const APP_CLIENT_ID = "1558920296210239498";
const DEFAULT_STATE = { clientId: APP_CLIENT_ID, accessToken: "", refreshToken: "", expiresAt: 0, user: null, presenceEnabled: true };

let state = { ...DEFAULT_STATE };
let callbackServer = null;
let pendingOAuth = null;
let rpcClient = null;
let rpcStatus = "disconnected";
let rpcConnecting = null;
let rpcRetryTimer = null;
let getMainWindow = () => null;
let lastActivityKey = "";
let lastActivityAt = 0;
let currentView = { view: "browse", category: "", query: "", source: "", game: "", runningGames: [] };
let latestDownloads = [];
const appStartedAt = Date.now();

function statePath() {
  return path.join(app.getPath("userData"), "discord-secure.json");
}

function loadState() {
  if (!safeStorage.isEncryptionAvailable()) return;
  let stored = {};
  try {
    const encrypted = fs.readFileSync(statePath(), "utf8");
    stored = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, "base64")));
  } catch (error) {
    if (error.code !== "ENOENT") console.error("[Discord] Could not load encrypted settings:", error.message);
  }
  // Public desktop OAuth uses PKCE; never persist or ship the app secret.
  state = { ...DEFAULT_STATE, ...stored, clientId: APP_CLIENT_ID };
  delete state.clientSecret;
  if (stored.clientSecret) {
    try { saveState(); } catch (error) { console.warn("[Discord] Could not remove the old saved app secret:", error.message); }
  }
}

function saveState() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure credential storage is unavailable on this device.");
  const encrypted = safeStorage.encryptString(JSON.stringify(state)).toString("base64");
  fs.writeFileSync(statePath(), encrypted, { mode: 0o600 });
}

function publicStatus(error = "") {
  return {
    configured: /^\d{17,20}$/.test(String(state.clientId || "")),
    connected: Boolean(state.user),
    user: state.user,
    clientId: state.clientId,
    presenceEnabled: state.presenceEnabled,
    presenceStatus: rpcStatus,
    error,
  };
}

function sendStatus(error = "") {
  const window = getMainWindow();
  if (window && !window.isDestroyed()) window.webContents.send("discord-status", publicStatus(error));
}

function syncDiscordProfile() {
  if (!state.user) return;
  const db = getDB();
  db.profile = { ...db.profile, name: state.user.name, avatar: state.user.avatar };
  saveDB(db);
  const window = getMainWindow();
  if (window && !window.isDestroyed()) window.webContents.send("discord-profile", db.profile);
}

async function exchangeToken(fields) {
  const body = new URLSearchParams({ ...fields, client_id: state.clientId });
  const response = await fetch(`${OAUTH_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json();
  if (!response.ok) {
    if (payload.error === "invalid_client") {
      throw new Error("Discord rejected SilverSea's application ID. Check the Discord application configured for this release.");
    }
    throw new Error(payload.error_description || payload.error || `Discord token request failed (${response.status}).`);
  }
  return payload;
}

async function getDiscordUser(accessToken) {
  const response = await fetch(`${OAUTH_API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Discord profile request failed (${response.status}).`);
  const user = await response.json();
  return {
    id: user.id,
    name: user.global_name || user.username,
    username: user.username,
    avatar: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`,
  };
}

function closeCallbackServer() {
  if (!callbackServer) return;
  const server = callbackServer;
  callbackServer = null;
  server.close();
}

function sendCallbackPage(response, success, message) {
  const color = success ? "#bfc7d1" : "#ff9b9b";
  const safeMessage = message.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  response.writeHead(success ? 200 : 400, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  response.end(`<!doctype html><html><meta charset="utf-8"><title>SilverSea</title><body style="margin:0;background:#090a0c;color:#eef0f3;font:16pxSegoe UI,sans-serif;display:grid;place-items:center;height:100vh"><main style="text-align:center"><h2 style="color:${color}">${success ? "Discord connected" : "Discord connection failed"}</h2><p>${safeMessage}</p><p>You can close this tab and return to SilverSea.</p></main></body></html>`);
}

async function beginLogin() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure credential storage is unavailable on this device.");
  if (!/^\d{17,20}$/.test(String(state.clientId || "").trim())) {
    throw new Error("SilverSea’s Discord application ID is invalid.");
  }
  closeCallbackServer();
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  pendingOAuth = { state: crypto.randomBytes(24).toString("hex"), codeVerifier };
  callbackServer = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${CALLBACK_HOST}:${CALLBACK_PORT}`);
    if (url.pathname !== "/discord/callback") {
      response.writeHead(404).end("Not found");
      return;
    }
    if (!pendingOAuth || url.searchParams.get("state") !== pendingOAuth.state) {
      sendCallbackPage(response, false, "The sign-in state did not match. Start Discord login again.");
      closeCallbackServer();
      pendingOAuth = null;
      sendStatus("Discord sign-in state mismatch.");
      return;
    }
    const code = url.searchParams.get("code");
    const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (!code || oauthError) {
      const rawMessage = oauthError || "Discord did not return an authorization code.";
      const message = /redirect/i.test(rawMessage)
        ? `Discord rejected the redirect URI. Register this exact URL in the app's OAuth2 settings: ${REDIRECT_URI}`
        : rawMessage;
      sendCallbackPage(response, false, message);
      closeCallbackServer();
      pendingOAuth = null;
      sendStatus(message);
      return;
    }
    if (url.searchParams.get("iss") !== "https://discord.com") {
      sendCallbackPage(response, false, "The response did not come from Discord.");
      closeCallbackServer();
      pendingOAuth = null;
      sendStatus("Discord returned an unexpected issuer.");
      return;
    }

    try {
      const token = await exchangeToken({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: pendingOAuth.codeVerifier });
      state.accessToken = token.access_token;
      state.refreshToken = token.refresh_token || "";
      state.expiresAt = Date.now() + Number(token.expires_in || 0) * 1000;
      state.user = await getDiscordUser(state.accessToken);
      state.presenceEnabled = true;
      saveState();
      syncDiscordProfile();
      sendCallbackPage(response, true, "Your account is linked.");
      closeCallbackServer();
      pendingOAuth = null;
      await startRichPresence();
      sendStatus();
    } catch (error) {
      state.user = null;
      state.accessToken = "";
      state.refreshToken = "";
      state.expiresAt = 0;
      sendCallbackPage(response, false, error.message);
      closeCallbackServer();
      pendingOAuth = null;
      sendStatus(error.message);
    }
  });

  callbackServer.on("error", (error) => {
    pendingOAuth = null;
    callbackServer = null;
    sendStatus(error.code === "EADDRINUSE" ? `Port ${CALLBACK_PORT} is in use; close the other login attempt and retry.` : error.message);
  });
  await new Promise((resolve, reject) => {
    callbackServer.once("listening", resolve);
    callbackServer.once("error", reject);
    callbackServer.listen(CALLBACK_PORT, CALLBACK_HOST);
  });

  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.search = new URLSearchParams({
    client_id: state.clientId,
    response_type: "code",
    scope: "identify",
    redirect_uri: REDIRECT_URI,
    state: pendingOAuth.state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  try {
    await shell.openExternal(authorize.toString());
  } catch (error) {
    closeCallbackServer();
    pendingOAuth = null;
    throw error;
  }
  setTimeout(() => {
    if (!pendingOAuth) return;
    pendingOAuth = null;
    closeCallbackServer();
    sendStatus("Discord sign-in timed out. Try connecting again.");
  }, 5 * 60 * 1000).unref?.();
}

async function refreshTokenIfNeeded() {
  if (!state.refreshToken) return;
  if (state.expiresAt > Date.now() + 60_000) return;
  const token = await exchangeToken({ grant_type: "refresh_token", refresh_token: state.refreshToken });
  state.accessToken = token.access_token;
  state.refreshToken = token.refresh_token || state.refreshToken;
  state.expiresAt = Date.now() + Number(token.expires_in || 0) * 1000;
  state.user = await getDiscordUser(state.accessToken);
  saveState();
}

async function applyPresence(downloads = latestDownloads) {
  if (!rpcClient?.isConnected || !rpcClient.user) return;
  const activeDownloads = downloads.filter((download) => download.status === "active" || download.status === "waiting");
  const pausedDownload = downloads.find((download) => download.status === "paused");
  const count = activeDownloads.length;
  const speed = downloads.reduce((sum, download) => sum + (download.speed || 0), 0);
  const speedMb = Math.floor(speed / (1024 * 1024));
  const currentDownload = activeDownloads[0] || pausedDownload;
  const progress = currentDownload?.total > 0
    ? Math.floor((currentDownload.completed / currentDownload.total) * 100)
    : 0;
  let details;
  let stateText;
  if (count > 0 && currentDownload) {
    const title = currentDownload.gameName || currentDownload.name || "game";
    details = `Downloading ${title}`.slice(0, 128);
    stateText = `${progress}% complete · ${formatPresenceSpeed(speed)}/s`;
    if (count > 1) stateText += ` · +${count - 1} more`;
  } else if (pausedDownload) {
    details = `Paused · ${pausedDownload.gameName || pausedDownload.name || "Download"}`.slice(0, 128);
    stateText = `${progress}% complete`;
  } else {
    ({ details, stateText } = describeAppView(currentView));
  }
  const key = `${currentView.view}:${currentView.category}:${currentView.query}:${currentView.game}:${currentView.runningGames.join(",")}:${count}:${currentDownload?.gid || ""}:${progress}:${speedMb}:${details}:${stateText}`;
  if (key === lastActivityKey && Date.now() - lastActivityAt < 15_000) return;
  lastActivityKey = key;
  lastActivityAt = Date.now();
  try {
    await rpcClient.user.setActivity({
      details,
      state: stateText,
      startTimestamp: appStartedAt,
    });
    rpcStatus = "connected";
    sendStatus();
  } catch (error) {
    console.warn("[Discord] Could not update Rich Presence:", error.message);
  }
}

function formatPresenceSpeed(bytesPerSecond) {
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB`;
  if (bytesPerSecond >= 1024) return `${Math.round(bytesPerSecond / 1024)} KB`;
  return `${Math.round(bytesPerSecond)} B`;
}

function describeAppView(context) {
  if (context.runningGames?.length) {
    const title = context.runningGames[0];
    return { details: `Playing ${title}`.slice(0, 128), stateText: "Launched from SilverSea" };
  }
  if (context.game) return { details: `Viewing ${context.game}`.slice(0, 128), stateText: "Game details · SilverSea" };
  switch (context.view) {
    case "browse":
      if (context.query) return { details: `Searching ${context.query}`.slice(0, 128), stateText: context.source || "SilverSea" };
      if (context.category) return { details: `Browsing ${context.category}`.slice(0, 128), stateText: context.source || "Game catalogue" };
      return { details: "Browsing the game catalogue", stateText: context.source || "SilverSea" };
    case "library": return { details: "Viewing personal library", stateText: "SilverSea" };
    case "wishlist": return { details: "Reviewing wishlist", stateText: "SilverSea" };
    case "downloads": return { details: "Viewing downloads", stateText: "No active transfers" };
    case "profile": return { details: "Managing app settings", stateText: "SilverSea" };
    default: return { details: "Using SilverSea", stateText: "Desktop app" };
  }
}

async function startRichPresence() {
  if (!state.presenceEnabled || !state.clientId) return;
  if (rpcClient?.clientId === state.clientId && rpcClient.isConnected) {
    await applyPresence();
    return;
  }
  if (rpcConnecting) return rpcConnecting;
  if (rpcClient) {
    try { await rpcClient.destroy(); } catch {}
  }
  rpcStatus = "connecting";
  const client = new Client({ clientId: state.clientId });
  rpcClient = client;
  client.on("ready", () => {
    rpcStatus = "connected";
    applyPresence().catch(() => {});
    sendStatus();
  });
  client.on("disconnected", () => {
    if (rpcClient !== client) return;
    rpcStatus = "disconnected";
    sendStatus("Discord desktop is not connected.");
    scheduleRpcRetry();
  });
  rpcConnecting = (async () => {
    try {
      await client.login();
    } catch (error) {
      if (rpcClient === client) {
        rpcStatus = "unavailable";
        sendStatus("Open the Discord desktop app to enable Rich Presence.");
        scheduleRpcRetry();
      }
    } finally {
      rpcConnecting = null;
    }
  })();
  return rpcConnecting;
}

function scheduleRpcRetry() {
  if (rpcRetryTimer || !state.presenceEnabled || !state.clientId) return;
  rpcRetryTimer = setTimeout(() => {
    rpcRetryTimer = null;
    startRichPresence().catch(() => {});
  }, 10_000);
  rpcRetryTimer.unref?.();
}

function clearRpcRetry() {
  if (rpcRetryTimer) clearTimeout(rpcRetryTimer);
  rpcRetryTimer = null;
}

async function restoreDiscord() {
  if (state.user && state.accessToken) {
    try {
      await refreshTokenIfNeeded();
      if (!state.expiresAt || state.expiresAt > Date.now()) state.user = await getDiscordUser(state.accessToken);
      if (state.user) syncDiscordProfile();
    } catch (error) {
      console.warn("[Discord] Could not restore account:", error.message);
    }
  }
  if (state.presenceEnabled) await startRichPresence();
  sendStatus();
}

function setDiscordPresenceEnabled(enabled) {
  state.presenceEnabled = Boolean(enabled);
  saveState();
  if (state.presenceEnabled) startRichPresence().catch(() => {});
  else {
    clearRpcRetry();
    if (rpcClient) rpcClient.destroy().catch(() => {});
    rpcClient = null;
    rpcStatus = "disconnected";
  }
  sendStatus();
  return publicStatus();
}

async function disconnectDiscord() {
  closeCallbackServer();
  pendingOAuth = null;
  clearRpcRetry();
  if (state.accessToken && state.clientId && state.clientSecret) {
    try {
      const body = new URLSearchParams({
        token: state.accessToken,
        token_type_hint: "access_token",
        client_id: state.clientId,
        client_secret: state.clientSecret,
      });
      await fetch(`${OAUTH_API}/oauth2/token/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (error) {
      console.warn("[Discord] Could not revoke OAuth token:", error.message);
    }
  }
  if (rpcClient) {
    try { await rpcClient.destroy(); } catch {}
  }
  rpcClient = null;
  rpcStatus = "disconnected";
  state = { ...DEFAULT_STATE };
  saveState();
  sendStatus();
  return publicStatus();
}

function updateDiscordPresence(downloads) {
  latestDownloads = downloads || [];
  if (state.presenceEnabled && rpcClient?.isConnected) applyPresence(latestDownloads).catch(() => {});
}

function updateDiscordContext(context = {}) {
  currentView = {
    view: context.view || "browse",
    category: context.category || "",
    query: context.query || "",
    source: context.source || "",
    game: context.game || "",
    runningGames: Array.isArray(context.runningGames) ? context.runningGames : [],
  };
  if (state.presenceEnabled && rpcClient?.isConnected) applyPresence().catch(() => {});
  return publicStatus();
}

async function stopDiscord() {
  closeCallbackServer();
  pendingOAuth = null;
  clearRpcRetry();
  if (rpcClient) {
    try { await rpcClient.destroy(); } catch {}
    rpcClient = null;
  }
}

function setupDiscordIPC(ipcMain, windowGetter) {
  getMainWindow = windowGetter;
  loadState();
  ipcMain.handle("get-discord-status", () => publicStatus());
  ipcMain.handle("connect-discord", async () => {
    try {
      await beginLogin();
      return { success: true };
    } catch (error) {
      sendStatus(error.message);
      return { success: false, error: error.message };
    }
  });
  ipcMain.handle("set-discord-presence", (_event, enabled) => setDiscordPresenceEnabled(enabled));
  ipcMain.handle("set-discord-context", (_event, context) => updateDiscordContext(context));
  ipcMain.handle("disconnect-discord", () => disconnectDiscord());
  restoreDiscord().catch((error) => sendStatus(error.message));
}

module.exports = { setupDiscordIPC, updateDiscordPresence, stopDiscord };
