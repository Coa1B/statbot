/** ESPN's league logo, in the variant drawn for dark backgrounds. */
export function leagueLogo(league: string) {
  return `https://a.espncdn.com/i/teamlogos/leagues/500-dark/${league.toLowerCase()}.png`;
}

/** Picks the dark-background team logo from an ESPN `logos` list, falling back to the default. */
export function teamLogo(logos: { href: string; rel?: string[] }[] | undefined) {
  const full = (logos ?? []).filter((l) => !l.rel?.includes("scoreboard") && l.href.includes("/teamlogos/"));
  return (full.find((l) => l.rel?.includes("dark")) ?? full[0])?.href;
}
