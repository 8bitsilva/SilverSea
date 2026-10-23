import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Download, Heart, BookOpen, Link2, Unlink, Radio, ChevronDown } from "lucide-react";

export default function ProfileMenu({
  isOpen,
  setOpen,
  isOverlay = false,
  profile,
  discordStatus,
  setCurrentView,
  setSelectedGame,
}) {
  const [discordExpanded, setDiscordExpanded] = useState(false);
  const [discordBusy, setDiscordBusy] = useState(false);
  const [discordError, setDiscordError] = useState("");
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, setOpen]);
  const items = [
    { icon: User, label: "Profile settings", view: "profile" },
    { icon: BookOpen, label: "Library", view: "library" },
    { icon: Download, label: "Downloads", view: "downloads" },
    { icon: Heart, label: "Wishlist", view: "wishlist" },
  ];

  const handleDiscordConnect = async () => {
    setDiscordBusy(true);
    setDiscordError("");
    try {
      const result = await window.api.connectDiscord();
      if (!result.success) setDiscordError(result.error || "Could not start Discord login.");
    } catch (error) {
      setDiscordError(error.message || "Could not start Discord login.");
    } finally {
      setDiscordBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setDiscordBusy(true);
    try {
      await window.api.disconnectDiscord();
    } finally {
      setDiscordBusy(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-label="Open profile menu"
        aria-expanded={isOpen}
        onClick={() => setOpen(!isOpen)}
        className={`profile-trigger flex items-center gap-2.5 rounded-lg border border-white/[0.08] px-2 py-1.5 text-left hover:bg-white/[0.06] ${isOverlay ? "profile-trigger-overlay" : ""}`}
      >
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-white/10 text-[#e4e7eb]">
          {profile?.avatar ? <img src={profile.avatar} alt="" className="h-full w-full object-cover" /> : <User size={15} />}
        </div>
        <div className="hidden min-w-0 sm:block">
          <span className="block max-w-24 truncate text-xs font-semibold text-[#e7e9ec]">{profile?.name || "User"}</span>
          <span className="mt-0.5 block text-[10px] text-[#858a92]">Account</span>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="profile-menu-popover silver-glass-panel absolute right-0 top-12 z-[100] flex max-h-[82vh] w-[min(360px,calc(100vw-32px))] flex-col overflow-y-auto rounded-xl border border-white/10 bg-[#1b1e22] p-2 shadow-2xl"
          >
            <div className="flex flex-col gap-1">
              {items.map(({ icon: Icon, label, view }) => (
                <button
                  key={view}
                  onClick={() => {
                    setCurrentView(view);
                    setOpen(false);
                    setSelectedGame(null);
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#d9dce1] hover:bg-white/[0.07]"
                >
                  <Icon size={16} className="text-[#969ca5]" />
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-2 border-t border-white/[0.08] pt-2">
              <button
                type="button"
                aria-expanded={discordExpanded}
                onClick={() => setDiscordExpanded((expanded) => !expanded)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#d9dce1] hover:bg-white/[0.07]"
              >
                <Link2 size={16} className="text-[#bfc7d1]" />
                <span className="flex-1">Discord</span>
                <span className={`profile-discord-dot ${discordStatus?.connected ? "is-connected" : ""}`} />
                <span className="text-[10px] text-[#858a92]">{discordStatus?.connected ? "Connected" : "Connect"}</span>
                <ChevronDown size={14} className={`text-[#777d85] transition-transform ${discordExpanded ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence initial={false}>
                {discordExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="profile-discord-panel px-3 pb-3 pt-2">
                      {discordStatus?.connected ? (
                        <>
                          <div className="profile-discord-account">
                            {discordStatus.user?.avatar ? <img src={discordStatus.user.avatar} alt="" /> : <span>{discordStatus.user?.name?.slice(0, 1) || "D"}</span>}
                            <div className="min-w-0"><strong>{discordStatus.user?.name || "Discord user"}</strong><small>@{discordStatus.user?.username || "connected"}</small></div>
                          </div>
                          <label className="profile-discord-toggle">
                            <input type="checkbox" checked={Boolean(discordStatus.presenceEnabled)} onChange={(event) => window.api.setDiscordPresence(event.target.checked)} />
                            <span><Radio size={14} /> Share Rich Presence</span>
                          </label>
                          <p className="profile-discord-status">
                            {discordStatus.presenceStatus === "connected" ? "Discord desktop is sharing your app activity." : discordStatus.presenceEnabled ? "Open the Discord desktop app to share activity." : "Presence sharing is off."}
                          </p>
                          {(discordStatus.error || discordError) && <p className="profile-discord-error" role="alert">{discordError || discordStatus.error}</p>}
                          <button type="button" className="profile-discord-secondary" disabled={discordBusy} onClick={handleDisconnect}><Unlink size={13} /> Disconnect</button>
                        </>
                      ) : discordStatus?.configured ? (
                        <>
                          <p className="profile-discord-description">Sign in once to show browsing and download activity in Discord.</p>
                          {(discordStatus?.error || discordError) && <p className="profile-discord-error" role="alert">{discordError || discordStatus.error}</p>}
                          <button type="button" className="profile-discord-primary" disabled={discordBusy} onClick={handleDiscordConnect}><Link2 size={13} /> {discordBusy ? "Opening Discord…" : "Continue with Discord"}</button>
                        </>
                      ) : (
                        <p className="profile-discord-description">Discord sign-in isn’t configured for this build.</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
