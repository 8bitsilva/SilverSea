import { useEffect, useMemo, useState } from "react";
import {
  UserRound, Image as ImageIcon, HardDrive, Gamepad2, Search, LoaderCircle,
  Plus, Check, MonitorDown, Library, FolderSearch,
} from "lucide-react";

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function pathName(filePath) {
  return String(filePath || "").split(/[\\/]/).filter(Boolean).at(-1) || "Installed game";
}

export default function ProfileSettings({
  profile,
  setProfile,
  setToast,
  discordStatus,
  library = [],
  setLibrary,
}) {
  const [draftName, setDraftName] = useState(profile?.name || "");
  const [scanningGames, setScanningGames] = useState(false);
  const [foundGames, setFoundGames] = useState([]);
  const [scanMessage, setScanMessage] = useState("");
  const [scanError, setScanError] = useState("");
  const [importingGames, setImportingGames] = useState(false);
  const [discordBusy, setDiscordBusy] = useState(false);
  const [discordError, setDiscordError] = useState("");

  useEffect(() => setDraftName(profile?.name || ""), [profile?.name]);

  const availableGames = useMemo(() => {
    const names = new Set(library.map((game) => normalized(game.name)));
    const paths = new Set(library.map((game) => normalized(game.installPath)));
    return foundGames.filter((game) =>
      !names.has(normalized(game.name)) &&
      (!game.installPath || !paths.has(normalized(game.installPath)))
    );
  }, [foundGames, library]);

  const persistProfile = async (nextProfile, message) => {
    setProfile(nextProfile);
    try {
      await window.api.updateProfile(nextProfile);
      if (message) setToast?.(message);
    } catch (error) {
      setToast?.(`Could not save profile: ${error.message}`);
    }
  };

  const handleAvatarUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => persistProfile({ ...profile, avatar: reader.result }, "Profile photo updated");
    reader.readAsDataURL(file);
  };

  const handleSaveName = () => {
    const name = draftName.trim();
    if (!name) return;
    persistProfile({ ...profile, name }, "Display name saved");
  };

  const handleDirectorySelect = async () => {
    const newPath = await window.api.selectDirectory();
    if (newPath) persistProfile({ ...profile, downloadPath: newPath }, "Download folder updated");
  };

  const handleDiscordLogin = async () => {
    setDiscordBusy(true);
    setDiscordError("");
    try {
      const result = await window.api.connectDiscord();
      if (!result.success) setDiscordError(result.error || "Could not open Discord login.");
    } catch (error) {
      setDiscordError(error.message || "Could not open Discord login.");
    } finally {
      setDiscordBusy(false);
    }
  };

  const handleScanInstalledGames = async () => {
    setScanningGames(true);
    setScanError("");
    setScanMessage("");
    try {
      const games = await window.api.discoverInstalledGames();
      setFoundGames(games);
      setScanMessage(games.length
        ? `Found ${games.length} installed game${games.length === 1 ? "" : "s"} in Steam and Epic libraries.`
        : "No Steam or Epic installs were found. You can add a game by selecting its executable.");
    } catch (error) {
      setScanError(error.message || "Could not scan installed games.");
    } finally {
      setScanningGames(false);
    }
  };

  const handleImportGames = async (games) => {
    if (!games.length) return;
    setImportingGames(true);
    setScanError("");
    try {
      const nextLibrary = await window.api.importInstalledGames(games);
      setLibrary?.(nextLibrary);
      setFoundGames((current) => current.filter((game) => !games.includes(game)));
      setToast?.(`Added ${games.length} game${games.length === 1 ? "" : "s"} to your library`);
    } catch (error) {
      setScanError(error.message || "Could not add these games to your library.");
    } finally {
      setImportingGames(false);
    }
  };

  const handleAddManually = async () => {
    setScanError("");
    try {
      const exePath = await window.api.selectInstalledGameExecutable();
      if (!exePath) return;
      const name = pathName(exePath.replace(/[\\/][^\\/]+$/, ""));
      const nextLibrary = await window.api.importInstalledGames([{
        name,
        source: "Manual",
        installPath: exePath.replace(/[\\/][^\\/]+$/, ""),
        exePath,
        categories: [],
      }]);
      setLibrary?.(nextLibrary);
      setToast?.(`${name} added to your library`);
    } catch (error) {
      setScanError(error.message || "Could not add this game.");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8 md:px-10 md:py-10">
      <header className="mb-1">
        <p className="discover-eyebrow">ACCOUNT & PREFERENCES</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">Profile settings</h1>
        <p className="mt-2 text-sm text-white/55">Manage your Silver profile, game library and storage.</p>
      </header>

      <section className="border-t border-white/[0.09] py-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Your profile</h2>
            <p className="mt-1 text-xs text-white/45">Your account identity across SilverSea.</p>
          </div>
          {discordStatus?.connected && (
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[11px] text-white/65">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-200 shadow-[0_0_9px_rgba(226,232,240,.65)]" />
              Synced with Discord
            </span>
          )}
        </div>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <label className="group relative h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-full border border-white/15 bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,.08)]">
            {profile?.avatar ? <img src={profile.avatar} alt="Profile avatar" className="h-full w-full object-cover" /> : <UserRound className="m-auto mt-7 text-white/45" size={38} />}
            <span className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              <ImageIcon size={18} className="mb-1" /> Change photo
            </span>
            <input type="file" accept="image/*" aria-label="Upload profile photo" className="absolute inset-0 cursor-pointer opacity-0" onChange={handleAvatarUpload} />
          </label>

          <div className="min-w-0 flex-1">
            <label htmlFor="profile-display-name" className="mb-2 block text-xs font-medium text-white/55">Display name</label>
            <div className="flex max-w-2xl flex-col gap-2 sm:flex-row">
              <input
                id="profile-display-name"
                type="text"
                maxLength={48}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleSaveName()}
                className="silver-search-input min-w-0 flex-1 rounded-xl px-4 py-3 text-sm text-white outline-none"
                placeholder="Your name"
              />
              <button type="button" onClick={handleSaveName} disabled={!draftName.trim() || draftName.trim() === profile?.name} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-semibold text-white/80 disabled:cursor-default disabled:opacity-40">
                Save name
              </button>
            </div>
            {discordStatus?.connected && <p className="mt-2 text-[11px] text-white/40">Discord display name: {discordStatus.user?.name || "Connected"}</p>}
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.09] py-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.045] text-white/70"><FolderSearch size={19} /></div>
            <div>
              <h2 className="text-base font-semibold text-white">Installed games</h2>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/45">Find games registered in Steam and Epic libraries, or add another installed game by selecting its executable.</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <button type="button" onClick={handleScanInstalledGames} disabled={scanningGames} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-white/85 disabled:opacity-50">
              {scanningGames ? <LoaderCircle size={15} className="animate-spin" /> : <Search size={15} />}
              {scanningGames ? "Scanning…" : "Scan Steam & Epic"}
            </button>
            <button type="button" onClick={handleAddManually} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-white/65">
              <Plus size={15} /> Add executable
            </button>
          </div>
        </div>

        {scanMessage && <p className="mt-4 text-xs text-white/55" role="status">{scanMessage}</p>}
        {scanError && <p className="mt-4 text-xs text-red-200" role="alert">{scanError}</p>}

        {availableGames.length > 0 && <div className="mt-5 overflow-hidden border-y border-white/[0.08]">
          <div className="flex items-center justify-between gap-3 py-3">
            <span className="text-xs font-medium text-white/70">{availableGames.length} ready to add</span>
            <button type="button" onClick={() => handleImportGames(availableGames)} disabled={importingGames} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[11px] font-semibold text-white/85 disabled:opacity-50">
              {importingGames ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}
              Add to library
            </button>
          </div>
          <div className="max-h-56 divide-y divide-white/[0.06] overflow-y-auto">
            {availableGames.map((game) => <div key={`${game.source}-${game.sourceId}-${game.installPath}`} className="flex min-w-0 items-center gap-3 py-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/55"><Gamepad2 size={16} /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white/85">{game.name}</p>
                <p className="mt-1 truncate text-[10px] text-white/35">{game.source} · {game.installPath}</p>
              </div>
              <MonitorDown size={15} className="shrink-0 text-white/35" />
            </div>)}
          </div>
        </div>}
        {foundGames.length > 0 && availableGames.length === 0 && <p className="mt-4 inline-flex items-center gap-2 text-xs text-white/50"><Check size={14} /> All detected games are already in your library.</p>}
      </section>

      <section className="border-t border-white/[0.09] py-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Discord activity</h2>
          <p className="mt-1 text-xs text-white/45">Choose whether SilverSea shares your browsing and download activity.</p>
        </div>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            {discordStatus?.connected && discordStatus.user?.avatar
              ? <img src={discordStatus.user.avatar} alt="" className="h-9 w-9 rounded-full border border-white/10 object-cover" />
              : <div className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/60"><Gamepad2 size={16} /></div>}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white/85">{discordStatus?.connected ? discordStatus.user?.name || "Discord connected" : "Discord not connected"}</p>
              <p className="mt-1 text-[11px] text-white/40">{discordStatus?.connected ? discordStatus.presenceStatus === "connected" ? "Rich Presence is active in Discord desktop." : "Account linked; open Discord desktop to show activity." : "Connect your account to share app activity."}</p>
            </div>
          </div>
          {discordStatus?.connected ? (
            <label className="flex shrink-0 cursor-pointer items-center gap-3 text-xs text-white/70">
              <span>Share Rich Presence</span>
              <input type="checkbox" checked={Boolean(discordStatus.presenceEnabled)} onChange={(event) => window.api.setDiscordPresence(event.target.checked)} className="silver-toggle" />
            </label>
          ) : (
            <button type="button" onClick={handleDiscordLogin} disabled={discordBusy} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-white/80 disabled:opacity-50">
              {discordBusy ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}
              Connect Discord
            </button>
          )}
        </div>
        {discordError && <p role="alert" className="mt-3 text-xs text-red-200">{discordError}</p>}
      </section>

      <section className="border-t border-white/[0.09] py-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.045] text-white/70"><HardDrive size={18} /></div>
          <div>
            <h2 className="text-base font-semibold text-white">Download location</h2>
            <p className="mt-1 text-xs text-white/45">New downloads will be saved here.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input type="text" readOnly value={profile?.downloadPath || ""} aria-label="Download directory" className="silver-search-input min-w-0 flex-1 cursor-default rounded-xl px-4 py-3 font-mono text-xs text-white/70 outline-none" />
          <button type="button" onClick={handleDirectorySelect} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-semibold text-white/80">
            <HardDrive size={14} /> Change folder
          </button>
        </div>
      </section>

      <div className="flex items-center gap-2 px-1 text-[10px] text-white/30"><Library size={13} /> Library contains {library.length} game{library.length === 1 ? "" : "s"}.</div>
    </div>
  );
}
