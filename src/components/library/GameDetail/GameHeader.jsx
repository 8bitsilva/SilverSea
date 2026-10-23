import { CheckCircle2, CalendarDays, HardDrive, Star, Tag, Building2, Library } from "lucide-react";
import { getDisplayGameTitle } from "../../../utils/gameTitle";

function list(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

export default function GameHeader({ selectedGame, steamData, activeExt, isDownloaded }) {
  const title = getDisplayGameTitle(selectedGame, activeExt);
  const steamGenres = steamData?.genres?.map((genre) => genre.description).filter(Boolean) || [];
  const genres = steamGenres.length ? steamGenres : list(selectedGame.categories);
  const sizeMatch = selectedGame.size?.match(/^(.+?)\s*\(Real\)\s*\/\s*(.+?)\s*\(Compressed\)$/i);
  const facts = [
    (steamData?.developers?.length || steamData?.publishers?.length) && {
      icon: Building2,
      label: steamData?.developers?.length ? "Developer" : "Publisher",
      value: (steamData?.developers || steamData?.publishers)?.slice(0, 2).join(", "),
    },
    steamData?.release_date?.date && { icon: CalendarDays, label: "Release date", value: steamData.release_date.date },
    steamData?.metacritic?.score && { icon: Star, label: "Metacritic", value: `${steamData.metacritic.score} / 100` },
    activeExt && { icon: Library, label: "Catalog source", value: activeExt },
  ].filter(Boolean);

  return (
    <section className="relative isolate flex min-h-[440px] w-full overflow-hidden border-b border-white/[0.08] bg-[#0a0b0d]/35 md:min-h-[500px]">
      {selectedGame.thumbnail_link && (
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img src={selectedGame.thumbnail_link} alt="" className="h-full w-full scale-110 object-cover opacity-25 blur-[22px]" />
          <div className="game-detail-backdrop absolute inset-0 bg-gradient-to-r from-[#111315]/80 via-[#111315]/45 to-[#111315]/20" />
          <div className="game-detail-backdrop-shade absolute inset-0 bg-gradient-to-t from-[#111315]/90 via-[#111315]/10 to-black/10" />
        </div>
      )}
      <div className="relative z-10 mx-auto mt-auto flex w-full max-w-[1400px] items-end gap-8 px-8 pb-10 pt-24 md:px-12 md:pb-12">
        <div className="relative hidden w-52 shrink-0 overflow-hidden rounded-xl bg-black/20 shadow-[0_20px_60px_rgba(0,0,0,0.55)] md:block lg:w-60">
          {selectedGame.thumbnail_link ? <img src={selectedGame.thumbnail_link} alt={`${title} cover`} className="aspect-[3/4] w-full object-cover" /> : <div className="aspect-[3/4]" />}
          {selectedGame.tag && <span className="absolute left-3 top-3 rounded-md border border-white/15 bg-black/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/85">{selectedGame.tag}</span>}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {isDownloaded(selectedGame.name) && <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-200"><CheckCircle2 size={14} /> In your library</span>}
            {selectedGame.tag && <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-white/65">{selectedGame.tag}</span>}
          </div>
          <h1 className="max-w-4xl text-4xl font-bold leading-tight tracking-tight text-white drop-shadow-lg md:text-5xl lg:text-6xl">{title}</h1>
          {steamData?.publishers?.length > 0 && steamData.publishers[0] !== steamData.developers?.[0] && <p className="mt-2 text-sm text-white/55">Published by {steamData.publishers.slice(0, 2).join(", ")}</p>}

          {selectedGame.size && <div className="mt-5 inline-flex max-w-full items-center gap-3 rounded-xl border border-white/[0.12] bg-black/30 px-4 py-3">
            <HardDrive size={18} className="shrink-0 text-white/60" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/45">Download size</p>
              {sizeMatch ? <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-white"><span>{sizeMatch[2]}</span><span className="text-xs font-normal text-white/45">compressed · {sizeMatch[1]} unpacked</span></p> : <p className="mt-1 break-words text-sm font-semibold text-white">{selectedGame.size}</p>}
            </div>
          </div>}

          <div className="mt-4 flex flex-wrap gap-2">
            {genres.slice(0, 6).map((genre) => <span key={genre} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-xs text-white/70"><Tag size={12} className="text-white/40" />{genre}</span>)}
          </div>

          {facts.length > 0 && <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {facts.map(({ icon: Icon, label, value }) => <div key={label} className="min-w-0 border-l border-white/15 pl-3"><p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-white/45"><Icon size={12} />{label}</p><p className="mt-1 truncate text-sm font-medium text-white/90" title={value}>{value}</p></div>)}
          </div>}

          {selectedGame.important_info && <p className="mt-5 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-white/60">{selectedGame.important_info}</p>}
        </div>
      </div>
    </section>
  );
}
