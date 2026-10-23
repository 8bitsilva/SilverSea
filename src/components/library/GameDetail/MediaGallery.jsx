import { useRef } from "react";
import { PlaySquare, ChevronLeft, ChevronRight, Info } from "lucide-react";

function plainText(html = "") {
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, " ").trim();
  const element = document.createElement("div");
  element.innerHTML = html;
  return element.textContent?.replace(/\s+/g, " ").trim() || "";
}

export default function MediaGallery({ currentTheme, selectedGame, sourceImages = [] }) {
  const carouselRef = useRef(null);
  const media = sourceImages
    .filter((src) => typeof src === "string" && /^https?:\/\//i.test(src) && !/torrent-stats|gravatar|emoji|logo|avatar/i.test(src))
    .map((src, index) => ({ id: `source-${index}`, src }));
  const about = plainText(selectedGame?.important_info || selectedGame?.description || "");

  const scroll = (direction) => carouselRef.current?.scrollBy({ left: direction * 520, behavior: "smooth" });

  return (
    <div className="w-full min-w-0 py-8">
      {about && <section className="silver-glass-panel mb-8 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 md:p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Info size={16} className={currentTheme.iconColor} /> About this game</h2>
        <p className="max-w-5xl text-sm leading-7 text-white/65">{about}</p>
      </section>}

      {media.length > 0 && <section className="mb-2">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><PlaySquare size={17} className={currentTheme.iconColor} /> Screenshots & videos <span className="font-normal text-white/35">{media.length}</span></h2>
          {media.length > 1 && <div className="flex gap-2"><button aria-label="Scroll media left" onClick={() => scroll(-1)} className="rounded-lg border border-white/10 p-2 text-white/60 hover:bg-white/10 hover:text-white"><ChevronLeft size={16} /></button><button aria-label="Scroll media right" onClick={() => scroll(1)} className="rounded-lg border border-white/10 p-2 text-white/60 hover:bg-white/10 hover:text-white"><ChevronRight size={16} /></button></div>}
        </div>
        <div ref={carouselRef} className="flex gap-3 overflow-x-auto pb-3 no-scrollbar scroll-smooth">
          {media.map((item) => <img key={item.id} src={item.src} alt={`${selectedGame.name} screenshot`} loading="lazy" className="h-44 w-auto max-w-full shrink-0 rounded-lg object-cover md:h-56" />)}
        </div>
      </section>}
    </div>
  );
}
