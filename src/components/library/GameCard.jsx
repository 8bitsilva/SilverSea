import { useState } from "react";
import { Check, Gamepad2, Loader2, ArrowUpRight } from "lucide-react";

export default function GameCard({
  game,
  openGame,
  isDownloadedStatus,
  activeDlProgress,
  activeDl,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article
      onClick={() => openGame(game)}
      onKeyDown={(event) => event.key === "Enter" && openGame(game)}
      role="button"
      tabIndex={0}
      className="game-card group"
    >
      <div className="game-card-art">
        {game.thumbnail_link && !imageFailed ? (
          <img src={game.thumbnail_link} alt="" loading="lazy" onError={() => setImageFailed(true)} />
        ) : (
          <div className="game-card-placeholder"><Gamepad2 size={30} strokeWidth={1.3} /></div>
        )}
        <div className="game-card-art-top">
          {game.tag ? <span className="game-card-tag">{game.tag}</span> : <span />}
          {isDownloadedStatus && <span className="game-card-download-state"><Check size={12} /> In library</span>}
        </div>
        {activeDl && (
          <div className="game-card-progress">
            <div className="flex items-center justify-between text-[11px] font-medium text-white">
              <span>{activeDlProgress > 0 ? "Downloading" : "Preparing download"}</span>
              {activeDlProgress > 0 && <span>{Math.round(activeDlProgress)}%</span>}
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${Math.max(activeDlProgress, 4)}%` }} />
            </div>
            {activeDlProgress === 0 && <Loader2 size={15} className="absolute right-3 top-3 animate-spin text-white" />}
          </div>
        )}
        {!activeDl && (
          <span className="game-card-open"><ArrowUpRight size={14} /> Open details</span>
        )}
      </div>

      <div className="min-w-0 px-0.5 pt-3">
        <h3 className="truncate text-[13px] font-semibold leading-5 text-[#e7e9ec]">{game.name}</h3>
        <div className="mt-1 flex min-h-4 items-center gap-1.5 overflow-hidden text-[10px] font-medium uppercase tracking-[0.08em] text-[#858a92]">
          {Array.isArray(game.categories) && game.categories.length > 0
            ? game.categories.slice(0, 2).join(" · ")
            : game.tag || (isDownloadedStatus ? "In library" : "Game")}
        </div>
      </div>
    </article>
  );
}
