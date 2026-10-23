/** Return a user-facing title without FitGirl's version/repack suffix. */
export function getDisplayGameTitle(game, source) {
  const title = game?.clean_name || game?.name || "";
  if (source?.toLowerCase() !== "fitgirl") return title;

  return title
    .replace(/\s+[–—-]\s+v\d.*$/i, "")
    .trim();
}
