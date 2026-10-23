import { Search, Menu, Minus, Square, X } from "lucide-react";
import ProfileMenu from "../profile/ProfileMenu";

export default function TopBar({
  sidebarOpen,
  setSidebarOpen,
  currentView,
  activeCategory,
  searchQuery,
  setSearchQuery,
  handleSearch,
  currentTheme,
  menuOpen,
  setMenuOpen,
  profile,
  discordStatus,
  setCurrentView,
  setSelectedGame,
}) {
  return (
    <header className="silver-topbar flex h-[56px] shrink-0 items-center gap-4 px-5 sm:px-8 draggable">
      <div className="flex min-w-0 flex-1 items-center gap-3 no-drag">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? "Hide navigation" : "Show navigation"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#92969d] hover:bg-white/[0.07] hover:text-white"
        >
          <Menu size={19} />
        </button>
      </div>

      <div className="relative w-[min(34vw,360px)] min-w-[150px] no-drag">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#858a91]" />
        <input
          type="search"
          placeholder="Search games"
          aria-label="Search games"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={handleSearch}
          className="silver-search-input w-full rounded-lg border border-white/[0.09] bg-[#17191c] py-2.5 pl-10 pr-3 text-[13px] text-[#f1f2f3] outline-none placeholder:text-[#777d85] focus:border-white/25 focus:bg-[#1a1c20]"
        />
        <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-[#858a91] md:block">↵</kbd>
      </div>

      <div className="flex shrink-0 items-center gap-2 no-drag">
        <ProfileMenu
          isOpen={menuOpen}
          setOpen={setMenuOpen}
          profile={profile}
          discordStatus={discordStatus}
          currentTheme={currentTheme}
          setCurrentView={setCurrentView}
          setSelectedGame={setSelectedGame}
        />
        <div className="ml-1 flex items-center border-l border-white/[0.08] pl-2">
          <button type="button" aria-label="Minimize" title="Minimize" onClick={() => window.api.minimizeWindow()} className="window-control"><Minus size={15} /></button>
          <button type="button" aria-label="Maximize" title="Maximize" onClick={() => window.api.maximizeWindow()} className="window-control"><Square size={12} /></button>
          <button type="button" aria-label="Close" title="Close" onClick={() => window.api.closeWindow()} className="window-control hover:bg-black hover:text-white"><X size={15} /></button>
        </div>
      </div>
    </header>
  );
}
