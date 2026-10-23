import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gamepad2, Play, Square, Loader2, RefreshCw, FolderOpen, Download, ChevronLeft, ChevronRight, CheckCircle, Magnet, HardDrive, X, AlertTriangle } from "lucide-react";

function parseRequiredBytes(value) {
  const matches = [...String(value || "").matchAll(/([\d,.]+)\s*(TB|GB|MB|KB|B)\b/gi)];
  if (!matches.length) return null;
  const multiplier = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  return Math.max(...matches.map((match) => Number(match[1].replace(/,/g, "")) * multiplier[match[2].toUpperCase()]));
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit++; }
  return `${amount.toFixed(unit > 0 ? 1 : 0)} ${units[unit]}`;
}

export default function GameSidebar({
  selectedGame, gameSize, libraryEntry, isRunning, hasExe, showControls, currentTheme,
  launching, fetchingLinks, downloadLinks, downloadedParts,
  handleChooseLauncher, handleLaunchGame, handleKillGame, handleDownload, setLibrary
}) {
  const [localParams, setLocalParams] = useState(libraryEntry?.launchParams || "");
  const [expandedSources, setExpandedSources] = useState({});
  const [installPreview, setInstallPreview] = useState(null);
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [installError, setInstallError] = useState("");

  useEffect(() => setLocalParams(libraryEntry?.launchParams || ""), [libraryEntry]);

  const toggleSource = (index) => {
    setExpandedSources(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const prepareDownload = async (link) => {
    setChoosingFolder(true);
    setInstallError("");
    try {
      const requiredBytes = parseRequiredBytes(gameSize || selectedGame.size);
      const choice = await window.api.chooseGameInstallFolder(selectedGame.name, requiredBytes);
      if (choice) setInstallPreview({ ...choice, link });
    } catch (error) {
      setInstallError(error.message || "Could not choose an install location.");
    } finally { setChoosingFolder(false); }
  };

  const confirmInstall = () => {
    if (!installPreview || !installPreview.enoughSpace) return;
    handleDownload(installPreview.link, installPreview.installPath);
    setInstallPreview(null);
  };

  return (
    <div className="w-full shrink-0 flex flex-col gap-4 lg:w-[380px] xl:w-[420px]">
      {showControls && (
        <div className={`silver-glass-panel bg-black/40 backdrop-blur-2xl border p-8 rounded-3xl relative overflow-hidden shadow-2xl ${isRunning ? "border-gray-500/40 shadow-gray-500/10" : "border-white/10"}`}>
          <div className={`absolute top-0 left-0 w-full h-1.5 bg-linear-to-r ${isRunning ? "from-gray-500 to-gray-400" : currentTheme.textGradient}`} />
          <h3 className={`text-xl font-black mb-6 flex items-center gap-3 uppercase tracking-widest bg-clip-text text-transparent bg-linear-to-r ${isRunning ? "from-gray-400 to-gray-300" : currentTheme.textGradient}`}>
            <Gamepad2 className={isRunning ? "text-gray-400" : currentTheme.iconColor} size={24} /> Game Controls
          </h3>
          <div className="flex flex-col gap-3">
            {libraryEntry?.exePath && (
              <button onClick={() => window.api.openGameFolder(libraryEntry.exePath)} className="flex items-center justify-between bg-black/60 border border-white/5 p-4 rounded-xl hover:bg-white/10 transition-all text-left group">
                <span className="text-sm font-bold text-gray-200 group-hover:text-white">Open Game Folder</span>
                <FolderOpen size={18} className="text-gray-400 group-hover:text-white transition-colors" />
              </button>
            )}

            {!hasExe ? (
              <button onClick={handleChooseLauncher} className="flex items-center justify-center gap-3 p-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all border border-dashed border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white">
                <Gamepad2 size={18} /> Choose Launcher
              </button>
            ) : isRunning ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-center gap-3 p-3 rounded-xl bg-gray-500/10 border border-gray-500/30">
                  <div className="w-2 h-2 bg-gray-400 rounded-full" />
                  <span className="text-sm font-black text-gray-300 uppercase tracking-widest">Game Running</span>
                </div>
                <button onClick={handleKillGame} className="flex items-center justify-center gap-3 p-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all bg-gray-500/20 border border-gray-500/40 hover:bg-gray-500/30 text-gray-300 hover:text-gray-200">
                  <Square size={16} fill="currentColor" /> Exit Game
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button onClick={handleLaunchGame} disabled={launching} className="silver-action-button flex items-center justify-center gap-3 rounded-xl border p-4 text-sm font-bold uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60">
                  {launching ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                  {launching ? "Launching..." : "Play"}
                </button>
                <button onClick={handleChooseLauncher} className="flex items-center justify-center gap-2 p-3 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all border border-transparent hover:border-white/10">
                  <RefreshCw size={13} /> Reselect Executable
                </button>
              </div>
            )}

            {hasExe && (
              <div className="mt-1 flex flex-col gap-2 p-3 bg-black/40 rounded-xl border border-white/5">
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Executable</p>
                  <p className="text-xs text-gray-300 truncate font-mono" title={libraryEntry.exePath}>{libraryEntry.exePath.split(/[/\\]/).pop()}</p>
                </div>
                <div className="border-t border-white/5 pt-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Launch Parameters</p>
                  <input type="text" placeholder='-fullscreen' value={localParams} onChange={(e) => setLocalParams(e.target.value)} onBlur={async () => { if (localParams !== (libraryEntry.launchParams || "")) { const updated = await window.api.setLaunchParams(selectedGame.name, localParams); setLibrary(updated); } }} className="w-full bg-black/60 border border-white/10 rounded-lg py-2 px-3 text-xs text-gray-200 focus:outline-none focus:border-white/30 font-mono shadow-inner" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="silver-glass-panel rounded-2xl border border-white/[0.08] bg-[#191c20] p-5">
        <h3 className="mb-4 flex items-center gap-2.5 text-base font-semibold text-white">
          <Download className="text-white/55" size={18} /> Download options
        </h3>

        <div className="flex flex-col gap-3">
          {fetchingLinks ? (
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-sm text-white/55">
              <Loader2 size={18} className="animate-spin" /> Scraping Links...
            </div>
          ) : downloadLinks.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 text-center text-sm text-white/40">
              No Direct Links Found
            </div>
          ) : (
            downloadLinks.map((originalLink, i) => {
              // BUG FIX: Convert 1-item arrays to pure strings to correctly render them as Single Links instead of Accordions
              const link = (Array.isArray(originalLink) && originalLink.length === 1) ? originalLink[0] : originalLink;

              // 1. ARRAY OF LINKS (Multi-Part)
              if (Array.isArray(link)) {
                const isExpanded = expandedSources[i];
                let siteName = "Direct Download";
                try { siteName = new URL(link[0]).hostname.replace('www.', ''); } catch(e){}
                const allPartsDone = link.every((_, pIdx) => downloadedParts[`${i}-${pIdx}`]);

                return (
                  <div key={i} className={`overflow-hidden rounded-xl border ${allPartsDone ? 'border-emerald-300/20 bg-emerald-300/[0.03]' : 'border-white/[0.07] bg-[#15161a]'}`}>
                    <button onClick={() => toggleSource(i)} className="w-full flex items-center justify-between p-3.5 text-left transition-colors hover:bg-white/[0.04] group">
                       <div className="flex flex-col">
                          <span className={`text-[15px] font-bold uppercase tracking-wider transition-colors ${allPartsDone ? 'text-gray-400' : 'text-gray-200 group-hover:text-white'}`}>
                            {siteName}
                          </span>
                          <span className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-0.5">{link.length} Parts</span>
                       </div>
                       <div className="p-2 rounded-lg bg-white/5 transition-all text-gray-400">
                          {isExpanded ? <ChevronLeft className="-rotate-90" size={16}/> : <ChevronRight size={16}/>}
                       </div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                         <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className={`border-t ${allPartsDone ? 'border-gray-500/30 bg-gray-900/20' : 'border-white/5 bg-black/40'}`}>
                           <div className="p-3 grid grid-cols-2 gap-2">
                             {link.map((partUrl, pIdx) => {
                                const isPartDone = downloadedParts[`${i}-${pIdx}`];
                                return (
                                  <button key={pIdx} onClick={() => prepareDownload(partUrl)} disabled={choosingFolder} className={`flex items-center justify-center gap-2 p-2.5 rounded-lg text-xs font-bold transition-all border disabled:opacity-50 ${isPartDone ? "bg-gray-500/20 border-gray-500/50 text-gray-400 hover:bg-gray-500/30" : "bg-white/5 hover:bg-white/15 border-white/5 hover:border-white/15 text-gray-300 hover:text-white"}`}>
                                    {isPartDone ? <CheckCircle size={14} /> : <Download size={14} />} Part {pIdx + 1}
                                  </button>
                                )
                             })}
                           </div>
                           {!allPartsDone && (
                             <div className="p-3 border-t border-white/5 flex justify-end">
                               <button onClick={() => prepareDownload(link)} disabled={choosingFolder} className={`px-4 py-2 ${currentTheme.color} hover:brightness-110 text-black rounded-lg font-bold text-xs shadow-lg transition-all disabled:opacity-50`}>
                                 {choosingFolder ? "Choose location…" : "Download Missing Parts"}
                               </button>
                             </div>
                           )}
                         </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }

              // 2. MAGNET / TORRENT LINK
              if (typeof link === 'string' && link.startsWith('magnet:')) {
                return (
                  <button key={i} onClick={() => prepareDownload(link)} disabled={choosingFolder} className="group flex items-center justify-between rounded-xl border border-white/[0.07] bg-[#15161a] px-3.5 py-3 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.05] disabled:opacity-50">
                    <span className="truncate text-sm font-medium text-white/75 group-hover:text-white">FitGirl torrent</span>
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.035] p-2 text-white/45 transition-colors group-hover:text-white/75">
                      <Magnet size={16} />
                    </div>
                  </button>
                );
              }

              // 3. STANDARD DIRECT LINK (Single Link)
              if (typeof link === 'string') {
                let hostname = "Download Link";
                try { hostname = new URL(link).hostname.replace('www.', ''); } catch(e){}
                const isPartDone = downloadedParts[`${i}`];

                return (
                <button key={i} onClick={() => prepareDownload(link)} disabled={choosingFolder} className={`group flex items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-colors disabled:opacity-50 ${isPartDone ? "border-emerald-300/20 bg-emerald-300/[0.04]" : "border-white/[0.07] bg-[#15161a] hover:border-white/[0.14] hover:bg-white/[0.05]"}`}>
                    <span className={`truncate text-sm font-medium transition-colors ${isPartDone ? "text-emerald-100/70" : "text-white/75 group-hover:text-white"}`}>
                      {hostname}
                    </span>
                    <div className={`${isPartDone ? "text-emerald-200/70" : "text-white/40 group-hover:text-white/75"} rounded-lg border border-white/[0.08] bg-white/[0.035] p-2 transition-colors`}>
                      {isPartDone ? <CheckCircle size={18} /> : <Download size={18} />}
                    </div>
                  </button>
                );
              }
            })
          )}
        </div>
      </div>

      {installError && <p role="alert" className="text-xs text-red-200">{installError}</p>}
      {installPreview && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setInstallPreview(null)}>
        <section role="dialog" aria-modal="true" aria-labelledby="install-preview-title" className="silver-glass-panel w-full max-w-lg rounded-2xl border border-white/15 bg-[#171a1f] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/40">Install preview</p><h2 id="install-preview-title" className="mt-2 text-xl font-semibold text-white">{selectedGame.name}</h2></div>
            <button type="button" aria-label="Close preview" onClick={() => setInstallPreview(null)} className="rounded-lg border border-white/10 p-2 text-white/60"><X size={16} /></button>
          </div>
          <div className="mt-5 space-y-3 border-y border-white/10 py-4 text-sm">
            <div className="flex justify-between gap-4"><span className="text-white/50">Estimated required space</span><strong className="text-white">{formatBytes(installPreview.requiredBytes)}</strong></div>
            <div className="flex justify-between gap-4"><span className="text-white/50">Available on selected drive</span><strong className="text-white">{formatBytes(installPreview.freeBytes)}</strong></div>
            <div><p className="mb-1 text-white/50">Install folder</p><p className="break-all rounded-lg bg-white/[0.04] px-3 py-2 font-mono text-xs text-white/75">{installPreview.installPath}</p></div>
          </div>
          {!installPreview.enoughSpace ? <p className="mt-4 flex items-center gap-2 text-sm text-red-200"><AlertTriangle size={16} /> Not enough free space. Choose another drive to continue.</p> : installPreview.requiredBytes == null && <p className="mt-4 text-xs text-amber-100/75">The catalog did not provide a size estimate, so available space cannot be verified.</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setInstallPreview(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-white/70">Cancel</button>
            <button type="button" onClick={confirmInstall} disabled={!installPreview.enoughSpace} className="silver-action-button rounded-xl border px-4 py-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40">Start download</button>
          </div>
        </section>
      </div>}
    </div>
  );
}
