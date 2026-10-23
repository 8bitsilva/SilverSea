import { useState } from "react";
import {
  Compass,
  Heart,
  Library,
  ListFilter,
  Plus,
  Settings2,
} from "lucide-react";

const primaryNav = [
  { id: "browse", label: "Discover", icon: Compass },
  { id: "library", label: "My library", icon: Library },
  { id: "wishlist", label: "Wishlist", icon: Heart },
  { id: "downloads", label: "Downloads", icon: Download },
];

export default function Sidebar({
  sidebarOpen,
  extensions,
  setExtensions,
  activeExt,
  handleSelectExtension,
  setToast,
  loadHomepage,
  categories,
  loadCategory,
  activeCategory,
  currentView,
  setCurrentView,
  setSelectedGame,
  profile,
}) {
  const [installUrl, setInstallUrl] = useState("");
  const [showAddSource, setShowAddSource] = useState(false);
  const [installing, setInstalling] = useState(false);

  const handleInstallExtension = async () => {
    if (!installUrl.trim()) return;
    setInstalling(true);
    let finalUrl = installUrl.trim();
    if (
      finalUrl.includes("github.com") &&
      !finalUrl.includes("raw.githubusercontent.com")
    ) {
      finalUrl = finalUrl
        .replace("github.com", "raw.githubusercontent.com")
        .replace("/blob/", "/");
    }
    const result = await window.api.installExtension(finalUrl);
    if (result.success) {
      const nextExtensions = await window.api.getExtensions();
      setExtensions(nextExtensions);
      setInstallUrl("");
      setShowAddSource(false);
      setToast("Source added");
      setTimeout(() => setToast(null), 3000);
      if (nextExtensions.length === 1 || !activeExt)
        handleSelectExtension(nextExtensions[nextExtensions.length - 1]);
    } else {
      setToast(`Could not add source: ${result.message}`);
      setTimeout(() => setToast(null), 4000);
    }
    setInstalling(false);
  };

  if (!sidebarOpen) return null;

  return (
    <aside className="silver-sidebar flex h-full w-[244px] shrink-0 flex-col bg-[#111] text-white">
      <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-5">
        <div className="silver-brand-mark h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
          <img src="/silver-mascot.png" alt="SilverSea" className="h-full w-full object-cover" />
        </div>
        <div className="leading-tight">
          <div className="silver-brand-wordmark text-[15px] font-bold tracking-tight">SilverSea</div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/45">
            GAME LIBRARY
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        <p className="sidebar-label px-3 pb-2">Workspace</p>
        <nav className="flex flex-col gap-1" aria-label="Main navigation">
          {primaryNav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSelectedGame(null);
                setCurrentView(id);
                if (id === "browse") loadHomepage();
              }}
              className={`sidebar-nav-item ${currentView === id ? "is-active" : ""}`}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-section-heading mt-8">
          <p className="sidebar-label">Sources</p>
          <button
            type="button"
            onClick={() => setShowAddSource((shown) => !shown)}
            className="sidebar-add-button"
            aria-label="Add a source"
          >
            <Plus size={15} />
          </button>
        </div>
        <label className="sr-only" htmlFor="source-select">Game source</label>
        <select
          id="source-select"
          className="sidebar-source-select mt-2 w-full"
          value={activeExt}
          onChange={(event) => handleSelectExtension(event.target.value)}
        >
          {extensions.map((extension) => (
            <option key={extension} value={extension}>{extension}</option>
          ))}
        </select>

        {showAddSource && (
          <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="mb-2 text-[11px] font-medium text-white/55">Paste a raw source URL</p>
            <input
              type="url"
              placeholder="https://…/source.js"
              value={installUrl}
              onChange={(event) => setInstallUrl(event.target.value)}
              className="sidebar-source-input w-full"
            />
            <button
              type="button"
              onClick={handleInstallExtension}
              disabled={installing || !installUrl.trim()}
              className="mt-2 w-full rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              {installing ? "Adding…" : "Add source"}
            </button>
          </div>
        )}

        <div className="sidebar-section-heading mt-7">
          <p className="sidebar-label">Categories</p>
          <ListFilter size={14} className="text-white/30" />
        </div>
        <div className="mt-1 flex flex-col gap-0.5">
          {categories.map((category) => (
            <button
              type="button"
              key={category}
              onClick={() => { setSelectedGame(null); loadCategory(category); }}
              className={`sidebar-category capitalize ${activeCategory === category ? "is-selected" : ""}`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => { setSelectedGame(null); setCurrentView("profile"); }}
        className="flex items-center gap-3 border-t border-white/10 px-4 py-4 text-left hover:bg-white/[0.04]"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-xs font-semibold text-white">
          {profile?.avatar ? <img src={profile.avatar} alt="" className="h-full w-full object-cover" /> : profile?.name?.slice(0, 1)?.toUpperCase() || "U"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white">{profile?.name || "User"}</div>
          <div className="mt-0.5 text-[11px] text-white/45">Settings</div>
        </div>
        <Settings2 size={16} className="text-white/35" />
      </button>
    </aside>
  );
}
