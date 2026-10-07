import { teamLogo } from "./logos";

const WEB = "https://site.web.api.espn.com/apis";
const SITE = "https://site.api.espn.com/apis";

export const LEAGUES: Record<string, string> = {
  nba: "basketball",
  wnba: "basketball",
  "mens-college-basketball": "basketball",
  nfl: "football",
  "college-football": "football",
  mlb: "baseball",
  nhl: "hockey",
};

function sportFor(league: string): string {
  const sport = LEAGUES[league];
  if (!sport) {
    throw new Error(`Unsupported league "${league}". Use one of: ${Object.keys(LEAGUES).join(", ")}`);
  }
  return sport;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`ESPN request failed (${res.status}) for ${url}`);
  return res.json();
}

/** Game date in US Eastern time, which is how leagues schedule and report games. */
function gameDay(iso: string | undefined) {
  if (!iso) return undefined;
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function idFromUid(uid: string | undefined, key: "a" | "t"): string | undefined {
  return uid?.match(new RegExp(`${key}:(\\d+)`))?.[1];
}

export async function search(query: string) {
  const data = await getJson(`${WEB}/search/v2?query=${encodeURIComponent(query)}&limit=8`);
  const out: any[] = [];
  for (const group of data.results ?? []) {
    if (group.type !== "player" && group.type !== "team") continue;
    for (const c of group.contents ?? []) {
      const league = c.defaultLeagueSlug;
      if (!LEAGUES[league]) continue;
      out.push({
        type: group.type,
        id: idFromUid(c.uid, group.type === "player" ? "a" : "t"),
        name: c.displayName,
        league,
        team: c.subtitle,
        image: c.image?.default ?? c.image?.defaultDark,
      });
    }
  }
  return out.length ? out : { results: [], note: "No players or teams found. Try a different spelling." };
}

export async function playerStats(league: string, athleteId: string, seasonType?: string) {
  const sport = sportFor(league);
  // MLB returns postseason tables alongside regular-season ones, so it never needs seasontype.
  const qs = seasonType === "postseason" && league !== "mlb" ? "?seasontype=3" : "";
  const [stats, bio] = await Promise.all([
    getJson(`${WEB}/common/v3/sports/${sport}/${league}/athletes/${athleteId}/stats${qs}`),
    getJson(`${WEB}/common/v3/sports/${sport}/${league}/athletes/${athleteId}`).catch(() => null),
  ]);

  const teamAbbr: Record<string, string> = {};
  for (const t of Object.values<any>(stats.teams ?? {})) teamAbbr[t.id] = t.abbreviation;

  const a = bio?.athlete;
  return {
    player: a && {
      name: a.displayName,
      team: a.team?.displayName,
      position: a.position?.displayName,
      positionAbbr: a.position?.abbreviation,
      image: a.headshot?.href,
      age: a.age,
      experience: a.displayExperience,
    },
    seasonType: seasonType === "postseason" ? "postseason" : "regular season",
    categories: (stats.categories ?? []).map((c: any) => ({
      key: c.name,
      category: c.displayName ?? c.name,
      columns: ["SEASON", "TEAM", ...(c.labels ?? [])],
      seasonYears: (c.statistics ?? []).map((s: any) => s.season?.year),
      rows: (c.statistics ?? []).map((s: any) => [
        s.season?.displayName,
        teamAbbr[s.teamId] ?? s.teamSlug ?? "",
        ...s.stats,
      ]),
      career: c.totals,
    })),
    glossary: compactGlossary(stats.glossary),
  };
}

export async function playerGameLog(league: string, athleteId: string, season?: number, lastN?: number) {
  const sport = sportFor(league);
  const qs = season ? `?season=${season}` : "";
  const data = await getJson(`${WEB}/common/v3/sports/${sport}/${league}/athletes/${athleteId}/gamelog${qs}`);

  const sections = (data.seasonTypes ?? []).map((st: any) => {
    const games: any[] = [];
    for (const cat of st.categories ?? []) {
      for (const ev of cat.events ?? []) {
        const meta = data.events?.[ev.eventId];
        if (!meta) continue;
        games.push([
          gameDay(meta.gameDate),
          `${meta.atVs} ${meta.opponent?.abbreviation}`,
          `${meta.gameResult ?? ""} ${meta.score ?? ""}`.trim(),
          ...ev.stats,
        ]);
      }
    }
    games.sort((x, y) => String(y[0]).localeCompare(String(x[0])));
    return { seasonType: st.displayName, games: lastN ? games.slice(0, lastN) : games };
  });

  return {
    columns: ["DATE", "OPP", "RESULT", ...(data.labels ?? [])],
    keys: ["date", "opponent", "result", ...(data.names ?? data.labels ?? [])],
    sections,
    note: "Games are sorted newest first.",
  };
}

export async function leagueLeaders(
  league: string,
  sort: string,
  season?: number,
  seasonType?: string,
  limit = 10,
) {
  const sport = sportFor(league);
  const params = new URLSearchParams({
    seasontype: seasonType === "postseason" ? "3" : "2",
    limit: String(Math.min(Math.max(limit, 1), 25)),
    sort: sort.includes(":") ? sort : `${sort}:desc`,
  });
  if (season) params.set("season", String(season));
  const base = `${WEB}/common/v3/sports/${sport}/${league}/statistics/byathlete`;

  let data: any;
  try {
    data = await getJson(`${base}?${params}`);
  } catch {
    const fallback = await getJson(`${base}?limit=1`);
    return {
      error: `Invalid sort key "${sort}". Use "category.statName" from this list.`,
      validSortKeys: (fallback.categories ?? []).flatMap((c: any) =>
        (c.names ?? []).map((n: string) => `${c.name}.${n}`),
      ),
    };
  }

  const sortCategory = sort.split(".")[0];
  const cats: any[] = data.categories ?? [];
  const keep = cats.filter((c) => c.name === "general" || c.name.toLowerCase() === sortCategory.toLowerCase());
  const columns = ["RANK", "PLAYER", "TEAM", ...keep.flatMap((c) => c.names)];

  return {
    season: data.requestedSeason?.displayName ?? data.currentSeason?.displayName,
    sortedBy: sort,
    columns,
    rows: (data.athletes ?? []).map((row: any, i: number) => {
      const values = keep.flatMap((c) => {
        const match = row.categories?.find((rc: any) => rc.name === c.name);
        return match?.totals ?? c.names.map(() => "");
      });
      return [i + 1, row.athlete?.displayName, row.athlete?.teamShortName, ...values];
    }),
    players: (data.athletes ?? []).map((row: any) => ({
      id: row.athlete?.id,
      name: row.athlete?.displayName,
      image: row.athlete?.headshot?.href,
      teamLogo: teamLogo(row.athlete?.teamLogos),
    })),
  };
}

export async function standings(league: string, season?: number) {
  const sport = sportFor(league);
  const qs = season ? `?season=${season}` : "";
  const data = await getJson(`${WEB}/v2/sports/${sport}/${league}/standings${qs}`);
  const wanted = ["wins", "losses", "ties", "otLosses", "winPercent", "gamesBehind", "playoffSeed", "streak", "differential"];
  if (league === "nhl") wanted.push("points");

  const groups = (data.children ?? []).map((g: any) => ({
    group: g.name,
    teams: (g.standings?.entries ?? [])
      .map((e: any) => {
        const row: Record<string, string> = { team: e.team?.displayName, id: e.team?.id };
        for (const s of e.stats ?? []) if (wanted.includes(s.name)) row[s.name] = s.displayValue;
        return row;
      })
      .sort((x: any, y: any) => Number(x.playoffSeed ?? 99) - Number(y.playoffSeed ?? 99)),
  }));
  return { season: data.seasons?.[0]?.displayName ?? season, groups };
}

export async function scoreboard(league: string, date?: string) {
  const sport = sportFor(league);
  const qs = date ? `?dates=${date.replaceAll("-", "")}` : "";
  const data = await getJson(`${SITE}/site/v2/sports/${sport}/${league}/scoreboard${qs}`);
  return {
    date: data.day?.date ?? date,
    games: (data.events ?? []).map((e: any) => {
      const comp = e.competitions?.[0];
      return {
        id: e.id,
        name: e.name,
        date: e.date,
        status: e.status?.type?.detail,
        state: e.status?.type?.state,
        shortStatus: e.status?.type?.shortDetail,
        teams: (comp?.competitors ?? []).map((c: any) => ({
          team: c.team?.abbreviation,
          logo: c.team?.logo,
          homeAway: c.homeAway,
          score: c.score,
          winner: c.winner,
          record: c.records?.[0]?.summary,
        })),
        leaders: (comp?.leaders ?? []).map((l: any) => ({
          stat: l.displayName,
          leader: l.leaders?.[0]?.athlete?.displayName,
          value: l.leaders?.[0]?.displayValue,
        })),
      };
    }),
  };
}

export async function teamSchedule(league: string, teamId: string, season?: number, seasonType?: string) {
  const sport = sportFor(league);
  const params = new URLSearchParams();
  if (season) params.set("season", String(season));
  params.set("seasontype", seasonType === "postseason" ? "3" : "2");
  const data = await getJson(`${SITE}/site/v2/sports/${sport}/${league}/teams/${teamId}/schedule?${params}`);

  const games = (data.events ?? []).map((e: any) => {
    const comp = e.competitions?.[0];
    const us = comp?.competitors?.find((c: any) => c.id === String(teamId));
    const them = comp?.competitors?.find((c: any) => c.id !== String(teamId));
    const score = (c: any) => c?.score?.displayValue ?? c?.score ?? "";
    const done = comp?.status?.type?.completed;
    return {
      id: e.id,
      date: gameDay(e.date),
      opponent: `${us?.homeAway === "home" ? "vs" : "@"} ${them?.team?.abbreviation}`,
      result: done ? `${us?.winner ? "W" : "L"} ${score(us)}-${score(them)}` : comp?.status?.type?.detail,
    };
  });
  const wins = games.filter((g: any) => g.result?.startsWith("W ")).length;
  const losses = games.filter((g: any) => g.result?.startsWith("L ")).length;

  return {
    team: data.team?.displayName,
    season: data.season?.displayName,
    recordInTheseGames: `${wins}-${losses}`,
    image: data.team?.logo,
    games,
  };
}

export async function gameBoxScore(league: string, eventId: string) {
  const sport = sportFor(league);
  const data = await getJson(`${SITE}/site/v2/sports/${sport}/${league}/summary?event=${eventId}`);
  const header = data.header?.competitions?.[0];
  return {
    game: (header?.competitors ?? [])
      .map((c: any) => `${c.team?.abbreviation} ${c.score ?? ""}`)
      .join(" - "),
    date: header?.date,
    status: header?.status?.type?.detail,
    teams: (data.boxscore?.players ?? []).map((t: any) => ({
      team: t.team?.displayName,
      groups: (t.statistics ?? []).map((g: any) => ({
        group: g.name ?? g.type,
        columns: ["PLAYER", ...(g.labels ?? [])],
        rows: (g.athletes ?? [])
          .filter((p: any) => p.stats?.length)
          .map((p: any) => [p.athlete?.displayName, ...p.stats]),
      })),
    })),
  };
}

function compactGlossary(glossary: any[] | undefined) {
  if (!glossary) return undefined;
  return Object.fromEntries(glossary.map((g: any) => [g.abbreviation, g.displayName]));
}
