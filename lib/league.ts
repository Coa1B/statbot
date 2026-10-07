import { LEAGUES } from "./espn";
import { board, type BoardConfig, type HomeBoard } from "./home";
import { scoreboard, scoreRow, type LiveGame } from "./live";
import { teamLogo } from "./logos";

export const LEAGUE_NAMES: Record<string, string> = {
  nba: "NBA",
  wnba: "WNBA",
  nfl: "NFL",
  mlb: "MLB",
  nhl: "NHL",
};

export const isLeaguePage = (league: string) => league in LEAGUE_NAMES;

/* ---------- Scores ---------- */

export type ScoresPage = {
  games: LiveGame[];
  label: string;
  sublabel?: string;
  /** Query strings (without "?") for the previous/next day or week, and back to today. */
  prev?: string;
  next?: string;
  current?: string;
  live: boolean;
};

const DAY_MS = 86_400_000;

export function todayEastern() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const tabQuery = (params: Record<string, string | number>) =>
  new URLSearchParams(Object.entries({ tab: "scores", ...params }).map(([k, v]) => [k, String(v)])).toString();

async function footballWeek(league: string, week?: string, seasonType?: string): Promise<ScoresPage> {
  const d = await scoreboard(league, week ? `week=${week}&seasontype=${seasonType ?? "2"}` : "");
  const n = Number(d.week?.number ?? week ?? 1);
  const type = String(d.season?.type ?? seasonType ?? "2");
  const calendar = (d.leagues?.[0]?.calendar ?? []).find((c: any) => String(c.value) === type);
  const entries: any[] = calendar?.entries ?? [];
  const entry = entries.find((e: any) => Number(e.value) === n);
  const weeks = entries.length || 18;
  const games = (d.events ?? []).map((e: any) => scoreRow(league, e));
  return {
    games,
    label: entry?.label ?? `Week ${n}`,
    sublabel: [calendar?.label, entry?.detail].filter(Boolean).join(" · ") || undefined,
    prev: n > 1 ? tabQuery({ week: n - 1, seasontype: type }) : undefined,
    next: n < weeks ? tabQuery({ week: n + 1, seasontype: type }) : undefined,
    current: week ? tabQuery({}) : undefined,
    live: games.some((g: LiveGame) => g.state === "in"),
  };
}

export async function getScores(
  league: string,
  opts: { date?: string; week?: string; seasonType?: string },
): Promise<ScoresPage> {
  if (LEAGUES[league] === "football") return footballWeek(league, opts.week, opts.seasonType);

  const today = todayEastern();
  const date = opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date) ? opts.date : today;
  const d = await scoreboard(league, `dates=${date.replaceAll("-", "")}`);
  const games = (d.events ?? []).map((e: any) => scoreRow(league, e));
  return {
    games,
    label: dateLabel(date),
    sublabel: date === today ? "Today" : undefined,
    prev: tabQuery({ date: shiftDate(date, -1) }),
    next: tabQuery({ date: shiftDate(date, 1) }),
    current: date === today ? undefined : tabQuery({}),
    live: games.some((g: LiveGame) => g.state === "in"),
  };
}

/* ---------- Standings ---------- */

export type StandingsRow = { id: string; name: string; abbr: string; logo?: string; clinch?: string; values: string[] };
export type StandingsGroup = { name: string; columns: string[]; rows: StandingsRow[] };
export type StandingsPage = { season?: string; groups: StandingsGroup[] };

/** [column label, ESPN stat name] per league, in display order. */
const STANDINGS_COLUMNS: Record<string, [string, string][]> = {
  basketball: [
    ["W", "wins"],
    ["L", "losses"],
    ["PCT", "winPercent"],
    ["GB", "gamesBehind"],
    ["HOME", "Home"],
    ["AWAY", "Road"],
    ["L10", "Last Ten Games"],
    ["STRK", "streak"],
  ],
  football: [
    ["W", "wins"],
    ["L", "losses"],
    ["T", "ties"],
    ["PCT", "winPercent"],
    ["HOME", "Home"],
    ["AWAY", "Road"],
    ["DIV", "divisionRecord"],
    ["PF", "pointsFor"],
    ["PA", "pointsAgainst"],
    ["DIFF", "pointDifferential"],
    ["STRK", "streak"],
  ],
  baseball: [
    ["W", "wins"],
    ["L", "losses"],
    ["PCT", "winPercent"],
    ["GB", "gamesBehind"],
    ["HOME", "Home"],
    ["AWAY", "Road"],
    ["RS", "pointsFor"],
    ["RA", "pointsAgainst"],
    ["DIFF", "pointDifferential"],
    ["L10", "Last Ten Games"],
    ["STRK", "streak"],
  ],
  hockey: [
    ["GP", "gamesPlayed"],
    ["W", "wins"],
    ["L", "losses"],
    ["OTL", "otLosses"],
    ["PTS", "points"],
    ["GF", "pointsFor"],
    ["GA", "pointsAgainst"],
    ["DIFF", "pointDifferential"],
    ["HOME", "Home"],
    ["AWAY", "Road"],
    ["L10", "Last Ten Games"],
    ["STRK", "streak"],
  ],
};

export async function getStandings(league: string): Promise<StandingsPage> {
  const sport = LEAGUES[league];
  const res = await fetch(`https://site.web.api.espn.com/apis/v2/sports/${sport}/${league}/standings`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`ESPN standings failed (${res.status})`);
  const d = await res.json();
  const columns = STANDINGS_COLUMNS[sport] ?? STANDINGS_COLUMNS.basketball;

  const groups = (d.children ?? []).map((g: any): StandingsGroup => {
    const rows = (g.standings?.entries ?? []).map((e: any) => {
      const stats: Record<string, any> = {};
      for (const s of e.stats ?? []) stats[s.name] = s;
      return {
        id: e.team?.id,
        name: e.team?.displayName,
        abbr: e.team?.abbreviation,
        logo: teamLogo(e.team?.logos),
        clinch: stats.clincher?.displayValue || undefined,
        // Hockey records carry a points suffix ("3-1-0, 6 PTS") that the PTS column already shows.
        values: columns.map(([, name]) => String(stats[name]?.displayValue ?? "").replace(/, \d+ PTS$/, "")),
        sort: [Number(stats.points?.value ?? 0), Number(stats.winPercent?.value ?? 0), Number(stats.wins?.value ?? 0)],
      };
    });
    rows.sort((a: any, b: any) =>
      sport === "hockey"
        ? b.sort[0] - a.sort[0] || b.sort[2] - a.sort[2]
        : b.sort[1] - a.sort[1] || b.sort[2] - a.sort[2],
    );
    return { name: g.name, columns: columns.map(([label]) => label), rows: rows.map(({ sort, ...r }: any) => r) };
  });
  return { season: d.seasons?.[0]?.displayName ?? d.season?.displayName, groups };
}

/* ---------- Stats ---------- */

const BASKETBALL_LEADERS = (L: string): BoardConfig[] => [
  { league: L, stat: "Points per game", sort: "offensive.avgPoints", question: `top scorers ${L}` },
  { league: L, stat: "Rebounds per game", sort: "general.avgRebounds", question: `most rebounds ${L}` },
  { league: L, stat: "Assists per game", sort: "offensive.avgAssists", question: `most assists ${L}` },
  { league: L, stat: "Steals per game", sort: "defensive.avgSteals", question: `most steals ${L}` },
  { league: L, stat: "Blocks per game", sort: "defensive.avgBlocks", question: `most blocks ${L}` },
  { league: L, stat: "3-pointers made", sort: "offensive.threePointFieldGoalsMade", question: `most 3s ${L}` },
  { league: L, stat: "Field goal %", sort: "offensive.fieldGoalPct", question: `best field goal percentage ${L}` },
  { league: L, stat: "Free throw %", sort: "offensive.freeThrowPct", question: `best free throw percentage ${L}` },
];

const LEADERS: Record<string, BoardConfig[]> = {
  nba: BASKETBALL_LEADERS("nba"),
  wnba: BASKETBALL_LEADERS("wnba"),
  nfl: [
    { league: "nfl", stat: "Passing yards", sort: "passing.passingYards", question: "most passing yards nfl" },
    { league: "nfl", stat: "Passing TDs", sort: "passing.passingTouchdowns", question: "most passing touchdowns nfl" },
    { league: "nfl", stat: "Rushing yards", sort: "rushing.rushingYards", question: "most rushing yards nfl" },
    { league: "nfl", stat: "Rushing TDs", sort: "rushing.rushingTouchdowns", question: "most rushing touchdowns nfl" },
    { league: "nfl", stat: "Receiving yards", sort: "receiving.receivingYards", question: "most receiving yards nfl" },
    { league: "nfl", stat: "Receptions", sort: "receiving.receptions", question: "most receptions nfl" },
    { league: "nfl", stat: "Sacks", sort: "defensive.sacks", question: "most sacks nfl" },
    { league: "nfl", stat: "Interceptions", sort: "defensiveInterceptions.interceptions", question: "most interceptions nfl" },
  ],
  mlb: [
    { league: "mlb", stat: "Home runs", sort: "batting.homeRuns", question: "most home runs mlb" },
    { league: "mlb", stat: "RBIs", sort: "batting.RBIs", question: "most rbis mlb" },
    { league: "mlb", stat: "Batting average", sort: "batting.avg", question: "best batting average mlb" },
    { league: "mlb", stat: "Stolen bases", sort: "batting.stolenBases", question: "most stolen bases mlb" },
    { league: "mlb", stat: "ERA", sort: "pitching.ERA:asc", question: "lowest era mlb" },
    { league: "mlb", stat: "Strikeouts", sort: "pitching.strikeouts", question: "most strikeouts mlb" },
    { league: "mlb", stat: "Wins", sort: "pitching.wins", question: "most wins mlb" },
    { league: "mlb", stat: "Saves", sort: "pitching.saves", question: "most saves mlb" },
  ],
  nhl: [
    { league: "nhl", stat: "Points", sort: "offensive.points", question: "most points nhl" },
    { league: "nhl", stat: "Goals", sort: "offensive.goals", question: "most goals nhl" },
    { league: "nhl", stat: "Assists", sort: "offensive.assists", question: "most assists nhl" },
    { league: "nhl", stat: "Plus/minus", sort: "general.plusMinus", question: "best plus minus nhl" },
    { league: "nhl", stat: "Power play goals", sort: "offensive.powerPlayGoals", question: "most power play goals nhl" },
    { league: "nhl", stat: "Shots", sort: "offensive.shotsTotal", question: "most shots nhl" },
    { league: "nhl", stat: "Goalie wins", sort: "general.wins", question: "most wins nhl" },
    { league: "nhl", stat: "Save %", sort: "defensive.savePct", question: "best save percentage nhl" },
  ],
};

export async function getLeaders(league: string): Promise<HomeBoard[]> {
  const boards = await Promise.all((LEADERS[league] ?? []).map((cfg) => board(cfg).catch(() => null)));
  return boards.filter((b): b is HomeBoard => !!b);
}
