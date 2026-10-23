import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import TopNav from "./GameDetail/TopNav";
import GameHeader from "./GameDetail/GameHeader";
import MediaGallery from "./GameDetail/MediaGallery";
import GameSidebar from "./GameDetail/GameSidebar";
import { getDisplayGameTitle } from "../../utils/gameTitle";

export default function GameDetail({
  selectedGame,
  activeExt,
  setSelectedGame,
  currentTheme,
  isDownloaded,
  wishlist,
  setWishlist,
  detailMenuOpen,
  setDetailMenuOpen,
  profile,
  setCurrentView,
  library,
  setLibrary,
  runningGames,
  setRunningGames,
  setToast,
}) {
  const [steamData, setSteamData] = useState(null);
  const [sourceDetails, setSourceDetails] = useState(null);
  const [contentReady, setContentReady] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [fetchingLinks, setFetchingLinks] = useState(false);
  const [downloadLinks, setDownloadLinks] = useState(
    selectedGame.download_links || [],
  );
  const [downloadedParts, setDownloadedParts] = useState({});

  const displayTitle = getDisplayGameTitle(selectedGame, activeExt);
  const displayGame = {
    ...selectedGame,
    ...sourceDetails,
    name: displayTitle,
    thumbnail_link: sourceDetails?.thumbnail_link || selectedGame.thumbnail_link,
  };

  const isInLibrary = library.some((g) => g.name === selectedGame.name);
  const libraryEntry = library.find((g) => g.name === selectedGame.name);
  const isRunning = runningGames.has(selectedGame.name);
  const hasExe = !!libraryEntry?.exePath;
  const showControls = isDownloaded(selectedGame.name) || hasExe;

  useEffect(() => {
    let cancelled = false;
    setContentReady(false);
    setSteamData(null);
    setSourceDetails(null);
    setDownloadLinks(selectedGame.download_links || []);
    setFetchingLinks(!!selectedGame.url);

    const searchName = selectedGame.clean_name || displayTitle;
    Promise.allSettled([
      window.api.getSteamMedia(searchName),
      selectedGame.url ? window.api.getGameDetails(selectedGame.url) : Promise.resolve(null),
    ]).then(([steamResult, sourceResult]) => {
      if (cancelled) return;
      if (steamResult.status === "fulfilled") setSteamData(steamResult.value);
      else console.error("Failed to load game media", steamResult.reason);

      const details = sourceResult.status === "fulfilled" ? sourceResult.value : null;
      if (sourceResult.status === "rejected") console.error("Failed to load source details", sourceResult.reason);
      if (details) {
        setSourceDetails(details);
        setDownloadLinks(details.download_links?.length ? details.download_links : selectedGame.download_links || []);
      }
      setFetchingLinks(false);
      setContentReady(true);
    });
    return () => { cancelled = true; };
  }, [selectedGame.url, selectedGame.name, selectedGame.clean_name, displayTitle]);

  useEffect(() => {
    const checkParts = async () => {
      if (!window.api.checkPartExists) return;
      const status = {};
      for (let i = 0; i < downloadLinks.length; i++) {
        const originalLink = downloadLinks[i];
        const link =
          Array.isArray(originalLink) && originalLink.length === 1
            ? originalLink[0]
            : originalLink;

        if (typeof link === "string") {
          status[`${i}`] = await window.api.checkPartExists(link);
        } else if (Array.isArray(link)) {
          for (let pIdx = 0; pIdx < link.length; pIdx++) {
            if (typeof link[pIdx] === "string") {
              status[`${i}-${pIdx}`] = await window.api.checkPartExists(
                link[pIdx],
              );
            }
          }
        }
      }
      setDownloadedParts(status);
    };
    if (downloadLinks.length > 0) checkParts();
  }, [downloadLinks]);

  const handleDownload = async (link, installPath) => {
    const links = Array.isArray(link) ? link : [link];
    if (links.length > 1) await window.api.registerMultipart(selectedGame.name, links.length);
    const metadata = {
      thumbnail_link: displayGame.thumbnail_link,
      categories: displayGame.categories || [],
      size: displayGame.size || selectedGame.size || "",
    };
    for (const item of links) window.api.startSmartDownload(item, selectedGame.name, installPath, metadata);
  };

  const handleChooseLauncher = async () => {
    const exePath = await window.api.selectExe();
    if (exePath) {
      if (!isInLibrary) await window.api.addToLibrary(selectedGame);
      const updated = await window.api.setGameExe(selectedGame.name, exePath);
      setLibrary(updated);
    }
  };

  const handleLaunchGame = async () => {
    if (!libraryEntry?.exePath) return;
    setLaunching(true);
    const result = await window.api.launchGame(
      selectedGame.name,
      libraryEntry.exePath,
      libraryEntry.launchParams || "",
    );
    setLaunching(false);
    if (!result.success) {
      setToast(`Launch failed: ${result.message}`);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleKillGame = async () => {
    await window.api.killGame(selectedGame.name);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-[#030303] flex flex-col overflow-y-auto no-scrollbar"
    >
      {contentReady ? <motion.div
        key={`${selectedGame.name}-content`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        className="flex min-h-full flex-col"
      ><TopNav
        selectedGame={selectedGame}
        setSelectedGame={setSelectedGame}
        currentTheme={currentTheme}
        wishlist={wishlist}
        setWishlist={setWishlist}
        isInLibrary={isInLibrary}
        detailMenuOpen={detailMenuOpen}
        setDetailMenuOpen={setDetailMenuOpen}
        profile={profile}
        setCurrentView={setCurrentView}
      />

      <GameHeader
        selectedGame={displayGame}
        steamData={steamData}
        activeExt={activeExt}
        isDownloaded={isDownloaded}
      />

      <div className="relative z-10 bg-[#030303] flex-1 w-full">
        <div className="max-w-[1400px] mx-auto w-full px-8 pb-12 pt-2 md:px-12 flex flex-col gap-6 lg:flex-row lg:gap-8">
          <div className="min-w-0 flex-1">
            <MediaGallery
              currentTheme={currentTheme}
              selectedGame={displayGame}
              sourceImages={sourceDetails?.images || []}
            />
          </div>
          <GameSidebar
            selectedGame={selectedGame}
            gameSize={displayGame.size || selectedGame.size}
            libraryEntry={libraryEntry}
            isRunning={isRunning}
            hasExe={hasExe}
            showControls={showControls}
            currentTheme={currentTheme}
            launching={launching}
            fetchingLinks={fetchingLinks}
            downloadLinks={downloadLinks}
            downloadedParts={downloadedParts}
            handleChooseLauncher={handleChooseLauncher}
            handleLaunchGame={handleLaunchGame}
            handleKillGame={handleKillGame}
            handleDownload={handleDownload}
            setLibrary={setLibrary}
          />
        </div>
      </div></motion.div> : <div className="min-h-full animate-pulse" aria-label="Loading game details">
        <div className="h-[440px] border-b border-white/[0.08] bg-white/[0.025] md:h-[500px]" />
        <div className="mx-auto flex max-w-[1400px] gap-8 px-8 py-8 md:px-12">
          <div className="min-h-48 flex-1 rounded-2xl bg-white/[0.035]" />
          <div className="h-56 w-full max-w-[420px] rounded-2xl bg-white/[0.035]" />
        </div>
      </div>}
    </motion.div>
  );
}
