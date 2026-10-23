// Renders the grid layout mapping over the user's game library.
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import GameCard from "./GameCard";

export default function GameGrid({
  games,
  currentTheme,
  openGame,
  activeDownloads,
  isDownloaded,
  hasMore,
  loadMore,
  loadingMore,
}) {
  if (games.length === 0) {
    return (
      <div className="catalogue-no-results">
        <p>No games found in this view.</p>
        <span>Try another category or search term.</span>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {games.map((game, index) => {
          const activeDl = activeDownloads.find(
            (d) => d.gameName === game.name,
          );
          const progress =
            activeDl && activeDl.total > 0
              ? (activeDl.completed / activeDl.total) * 100
              : 0;
          return (
            <motion.div
              key={game.name}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
            <GameCard
              game={game}
              currentTheme={currentTheme}
              openGame={openGame}
              isDownloadedStatus={isDownloaded(game.name)}
              activeDl={activeDl}
              activeDlProgress={progress}
            />
            </motion.div>
          );
        })}
      </div>
      {hasMore && (
        <div className="mt-12 mb-4 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#16181b] px-5 py-2.5 text-sm font-semibold text-[#e7e9ec] hover:bg-[#202327] disabled:opacity-50"
          >
            {loadingMore ? (
              <>
                <Loader2
                  className={`animate-spin ${currentTheme.iconColor}`}
                  size={18}
                />{" "}
                LOADING...
              </>
            ) : (
              "LOAD MORE"
            )}
          </button>
        </div>
      )}
    </>
  );
}
