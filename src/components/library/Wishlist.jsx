// Renders the user's saved wishlist of games in a grid format.
import { motion } from "framer-motion";
import { Heart } from "lucide-react";

export default function Wishlist({
  wishlist,
  currentTheme,
  setCurrentView,
  openGame,
}) {
  return (
    <div className="p-8 w-full">
      <h2
        className={`text-3xl font-black mb-8 bg-clip-text text-transparent bg-linear-to-r ${currentTheme.textGradient}`}
      >
        <Heart className="inline mb-1 mr-2" /> Wishlist
      </h2>
      {wishlist.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[50vh] text-gray-500 gap-4">
          <Heart size={72} className={`opacity-30 ${currentTheme.iconColor}`} />
          <p className="text-lg font-bold text-center">Your wishlist is empty</p>
          <p className="text-sm text-center max-w-xs text-gray-600">
            Heart a game in its detail page to save it here
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {wishlist.map((game, i) => (
            <motion.div
              key={i}
              onClick={() => {
                setCurrentView("browse");
                openGame(game);
              }}
              className="group cursor-pointer flex flex-col gap-3"
            >
              <div className="relative rounded-2xl overflow-hidden aspect-3/4 bg-black/40 border border-white/10 hover:border-white/30 transition-all duration-300">
                <img
                  src={game.thumbnail_link}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
              </div>
              <h3 className="font-semibold text-sm text-gray-100 group-hover:text-white line-clamp-2">
                {game.name}
              </h3>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
