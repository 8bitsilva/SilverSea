import { useState, useEffect } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Layers, RefreshCw } from "lucide-react";
import { useLibrary } from "./hooks/useLibrary.js";
import { DEFAULT_THEMES } from "./constants/themes.js";
import Sidebar from "./components/layout/Sidebar.jsx";
import TopBar from "./components/layout/TopBar.jsx";
import GameGrid from "./components/library/GameGrid.jsx";
import GameDetail from "./components/library/GameDetail.jsx";
import DownloadToast from "./components/downloads/DownloadToast.jsx";
import DownloadsView from "./components/downloads/DownloadsView.jsx";
import Wishlist from "./components/library/Wishlist.jsx";
import LibraryView from "./components/library/LibraryView.jsx";
import ProfileSettings from "./components/profile/ProfileSettings.jsx";

export default function App() {
  const [appReady, setAppReady] = useState(false); // Added blocking state

  const [currentView, setCurrentView] = useState("browse");
  const currentTheme = DEFAULT_THEMES[0];

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const [extensions, setExtensions] = useState([]);
  const [activeExt, setActiveExt] = useState("");
  const [categories, setCategories] = useState([]);
  const [capabilities, setCapabilities] = useState({});
  const [selectedGame, setSelectedGame] = useState(null);

  const [profile, setProfile] = useState({
    name: "User",
    avatar: "",
    downloadPath: "",
  });
  const [discordStatus, setDiscordStatus] = useState({
    configured: false,
    connected: false,
    presenceEnabled: true,
    presenceStatus: "disconnected",
    user: null,
  });
  const [wishlist, setWishlist] = useState([]);
  const [library, setLibrary] = useState([]);
  const [completedDownloads, setCompletedDownloads] = useState([]);
  const [activeDownloads, setActiveDownloads] = useState([]);
  const [runningGames, setRunningGames] = useState(new Set());

  const handleSelectExtension = async (name) => {
    setActiveExt(name);
    const data = await window.api.setExtension(name);
    setCategories(data.categories);
    setCapabilities(data.capabilities);
    clearCache();
    loadHomepage(name);
  };

  const {
    games,
    loading,
    loadError,
    setLoading,
    searchQuery,
    setSearchQuery,
    activeCategory,
    hasMore,
    loadingMore,
    loadHomepage,
    loadCategory,
    handleSearch,
    loadMore,
    clearCache,
  } = useLibrary(activeExt, capabilities, setCurrentView);

  useEffect(() => {
    if (window.api) {
      window.api.getDiscordStatus().then(setDiscordStatus).catch(() => {});
      window.api.onDiscordStatus(setDiscordStatus);
      window.api.onDiscordProfile((discordProfile) => {
        setProfile((current) => ({ ...current, ...discordProfile }));
      });
      window.api.getExtensions().then((exts) => {
        setExtensions(exts);
        if (exts.length > 0) handleSelectExtension(exts[0]);
        else setLoading(false);
      });

      // Fetch DB and unlock app UI once profile is loaded
      window.api.getDB().then((db) => {
        setProfile((current) => ({ ...current, ...(db.profile || {}) }));
        setWishlist(db.wishlist);
        setCompletedDownloads(db.completedDownloads);
        setLibrary(db.library || []);
        setAppReady(true);
      });

      window.api.onDownloadUpdate((data) => {
        setActiveDownloads(data);
        window.api
          .getDB()
          .then((db) => setCompletedDownloads(db.completedDownloads));
      });

      window.api.onLibraryUpdated?.((updatedLibrary) => setLibrary(updatedLibrary || []));

      window.api.onDownloadStarted((data) => {
        setToast(`Intercepted! Downloading: ${data.gameName}`);
        setTimeout(() => setToast(null), 5000);
      });

      window.api.onGameStarted((gameName) => {
        setRunningGames((prev) => {
          const next = new Set(prev);
          next.add(gameName);
          return next;
        });
      });

      window.api.onGameExited((gameName) => {
        setRunningGames((prev) => {
          const next = new Set(prev);
          next.delete(gameName);
          return next;
        });
      });
    } else {
      setAppReady(true); // Fallback if API isn't available
    }
  }, []);

  useEffect(() => {
    if (!window.api?.setDiscordContext) return;
    const timer = setTimeout(() => {
      window.api.setDiscordContext({
        view: currentView,
        category: activeCategory,
        query: searchQuery,
        source: activeExt,
        game: selectedGame?.name || "",
        runningGames: [...runningGames],
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [currentView, activeCategory, searchQuery, activeExt, selectedGame?.name, runningGames]);

  useEffect(() => {
    const discordUser = discordStatus.user;
    if (!discordStatus.connected || !discordUser?.name) return;
    const nextProfile = { ...profile, name: discordUser.name, avatar: discordUser.avatar || profile.avatar };
    if (nextProfile.name === profile.name && nextProfile.avatar === profile.avatar) return;
    setProfile(nextProfile);
    window.api.updateProfile(nextProfile).catch(() => {});
  }, [discordStatus.connected, discordStatus.user?.name, discordStatus.user?.avatar, profile.name, profile.avatar]);

  const isDownloaded = (gameName) =>
    !!gameName &&
    completedDownloads.some(
      (c) =>
        c.gameName === gameName ||
        (c.name && c.name.includes(gameName)),
    );

  const handleRemoveFromLibrary = async (gameName) => {
    const updated = await window.api.removeFromLibrary(gameName);
    setLibrary(updated);
  };

  // Block rendering until the saved profile loads.
  if (!appReady) {
    return <div className="h-screen w-screen bg-[#090a0c]" />;
  }

  return (
    <MotionConfig transition={{ duration: 0 }} reducedMotion="always">
      <div
        className={`silver-app flex h-screen w-screen overflow-hidden bg-[#090a0c] text-[#f1f2f3] ${
          currentTheme.class
        }`}
      >
        <DownloadToast
          toast={toast}
          setToast={setToast}
          setCurrentView={setCurrentView}
          setSelectedGame={setSelectedGame}
          currentTheme={currentTheme}
        />

        <Sidebar
          sidebarOpen={sidebarOpen}
          extensions={extensions}
          setExtensions={setExtensions}
          activeExt={activeExt}
          handleSelectExtension={handleSelectExtension}
          setToast={setToast}
          loadHomepage={loadHomepage}
          categories={categories}
          loadCategory={loadCategory}
          activeCategory={activeCategory}
          currentView={currentView}
          searchQuery={searchQuery}
          setCurrentView={setCurrentView}
          setSelectedGame={setSelectedGame}
          profile={profile}
        />

        <main className="silver-main relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#090a0c]">
          <TopBar
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            currentView={currentView}
            activeCategory={activeCategory}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            handleSearch={(event) => {
              if (event.key === "Enter") setSelectedGame(null);
              handleSearch(event);
            }}
            currentTheme={currentTheme}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            profile={profile}
            discordStatus={discordStatus}
            setCurrentView={setCurrentView}
            setSelectedGame={setSelectedGame}
          />

          <div className="silver-scroll-area relative flex-1 overflow-y-auto no-scrollbar">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={currentView}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="min-h-full"
              >
                {currentView === "profile" && (
                  <ProfileSettings
                    profile={profile}
                    setProfile={setProfile}
                    currentTheme={currentTheme}
                    setToast={setToast}
                    discordStatus={discordStatus}
                    library={library}
                    setLibrary={setLibrary}
                  />
                )}
                {currentView === "library" && (
                  <LibraryView
                    library={library}
                    currentTheme={currentTheme}
                    openGame={(game) => setSelectedGame(game)}
                    onRemove={handleRemoveFromLibrary}
                    runningGames={runningGames}
                  />
                )}
                {currentView === "wishlist" && (
                  <Wishlist
                    wishlist={wishlist}
                    currentTheme={currentTheme}
                    setCurrentView={setCurrentView}
                    openGame={setSelectedGame}
                  />
                )}
                {currentView === "downloads" && (
                  <DownloadsView
                    activeDownloads={activeDownloads}
                    completedDownloads={completedDownloads}
                    setCompletedDownloads={setCompletedDownloads}
                    currentTheme={currentTheme}
                  />
                )}

                {currentView === "browse" && (
                  <div className="discover-page">
                    {extensions.length === 0 ? (
                      <div className="discover-empty-state">
                        <div className="discover-empty-icon"><Layers size={22} /></div>
                        <p className="discover-eyebrow">YOUR CATALOGUE</p>
                        <h2>No sources connected yet</h2>
                        <p>Add a source to start browsing games. FitGirl and SteamRIP are included with the desktop app.</p>
                      </div>
                    ) : (
                      <>
                        <div className="discover-heading-row">
                          <div>
                            <p className="discover-eyebrow">YOUR GAME CATALOGUE</p>
                            <h2>{searchQuery ? "Search results" : activeCategory || "Discover games"}</h2>
                            <p>Browse, compare and manage your games in one place.</p>
                          </div>
                          <div className="catalogue-source-chip">
                            <span className="source-indicator" />
                            <span>Source</span>
                            <strong>{activeExt}</strong>
                          </div>
                        </div>

                        <div className="catalogue-divider">
                          <span>{searchQuery ? `Results for “${searchQuery}”` : activeCategory ? `In ${activeCategory}` : "Discover picks"}</span>
                          <div className="flex items-center gap-3">
                            <span>{loading ? "Loading catalogue" : `${games.length} ${games.length === 1 ? "game" : "games"}`}</span>
                            {!searchQuery && !activeCategory && <button type="button" onClick={() => loadHomepage(activeExt)} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 disabled:opacity-45" title="Refresh Discover picks"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh</button>}
                          </div>
                        </div>

                        {loadError ? (
                          <div className="catalogue-error" role="alert">
                            <strong>Could not load this source</strong>
                            <span>{loadError}</span>
                            {activeExt === "SteamRIP" && <span>The site is currently returning HTTP 403. Try FitGirl or retry later; the app does not bypass the site’s access controls.</span>}
                          </div>
                        ) : loading ? (
                          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                            {[...Array(15)].map((_, i) => (
                              <div key={i} className="flex flex-col gap-3">
                                <div className="skeleton aspect-[0.76] rounded-xl" />
                                <div className="skeleton h-4 w-3/4 rounded" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <GameGrid
                            games={games}
                            currentTheme={currentTheme}
                            openGame={setSelectedGame}
                            activeDownloads={activeDownloads}
                            isDownloaded={isDownloaded}
                            hasMore={hasMore}
                            loadMore={loadMore}
                            loadingMore={loadingMore}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {selectedGame && (
              <GameDetail
                selectedGame={selectedGame}
                activeExt={activeExt}
                setSelectedGame={setSelectedGame}
                currentTheme={currentTheme}
                isDownloaded={isDownloaded}
                wishlist={wishlist}
                setWishlist={setWishlist}
                detailMenuOpen={detailMenuOpen}
                setDetailMenuOpen={setDetailMenuOpen}
                profile={profile}
                setCurrentView={setCurrentView}
                library={library}
                setLibrary={setLibrary}
                runningGames={runningGames}
                setRunningGames={setRunningGames}
                setToast={setToast}
              />
            )}
          </AnimatePresence>
        </main>
      </div>
    </MotionConfig>
  );
}
