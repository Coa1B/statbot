import * as espn from "./espn";

export type HomeGame = {
  id: string;
  league: string;
  state: "pre" | "in" | "post";
  status: string;
  teams: { abbr: string; logo?: string; score?: string; winner?: boolean }[];
};

export type HomeBoard = {
  league: string;
  stat: string;
  season: string;
  question: string;
  players: { name: string; team: string; teamLogo?: string; value: string; image?: string }[];
};

export type HomeData = { games: HomeGame[]; boards: HomeBoard[] };

const BOARDS = [
  { league: "nba", stat: "Points per game", sort: "offensive.avgPoints", question: "Who led the NBA in scoring" },
  { league: "nfl", stat: "Passing yards", sort: "passing.passingYards", question: "Most passing yards NFL" },
  { league: "mlb", stat: "Home runs", sort: "batting.homeRuns", question: "Most home runs in MLB this year" },
  { league: "nhl", stat: "Points", sort: "offensive.points", question: "Who leads the NHL in points" },
  { league: "nba", stat: "Assists per game", sort: "offensive.avgAssists", question: "Who led the NBA in assists" },
  { league: "nfl", stat: "Rushing yards", sort: "rushing.rushingYards", question: "Most rushing yards NFL" },
  { league: "mlb", stat: "ERA", sort: "pitching.ERA:asc", question: "Who has the best ERA in MLB" },
  { league: "nhl", stat: "Goals", sort: "offensive.goals", question: "Who leads the NHL in goals" },
  { league: "nba", stat: "Rebounds per game", sort: "general.avgRebounds", question: "Who led the NBA in rebounds" },
  { league: "nfl", stat: "Receiving yards", sort: "receiving.receivingYards", question: "Most receiving yards NFL" },
  { league: "mlb", stat: "Strikeouts", sort: "pitching.strikeouts", question: "Most strikeouts MLB this year" },
  { league: "nhl", stat: "Assists", sort: "offensive.assists", question: "Who leads the NHL in assists" },
];

function todayEastern() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function startTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET";
}

async function games(): Promise<HomeGame[]> {
  const date = todayEastern();
  const boards = await Promise.all(
    ["nfl", "mlb", "nba", "nhl"].map((league) =>
      espn.scoreboard(league, date).then((d) => ({ league, games: d.games }), () => ({ league, games: [] as any[] })),
    ),
  );
  const order: Record<string, number> = { in: 0, pre: 1, post: 2 };
  return boards
    .flatMap(({ league, games }) =>
      games.map((g: any): HomeGame => ({
        id: g.id,
        league,
        state: g.state ?? "pre",
        status: g.state === "pre" ? startTime(g.date) : (g.shortStatus ?? g.status),
        teams: ["away", "home"].map((side) => {
          const t = g.teams.find((x: any) => x.homeAway === side) ?? {};
          return { abbr: t.team, logo: t.logo, score: g.state === "pre" ? undefined : t.score, winner: t.winner };
        }),
      })),
    )
    .sort((a, b) => order[a.state] - order[b.state])
    .slice(0, 14);
}

export type BoardConfig = { league: string; stat: string; sort: string; question: string };

export async function board(cfg: BoardConfig): Promise<HomeBoard | null> {
  const data: any = await espn.leagueLeaders(cfg.league, cfg.sort, undefined, undefined, 5);
  if (data.error || !data.rows?.length) return null;
  const vi = (data.columns as string[]).indexOf(cfg.sort.split(".")[1].split(":")[0]);
  return {
    league: cfg.league.toUpperCase(),
    stat: cfg.stat,
    season: data.season,
    question: cfg.question,
    players: data.rows.map((r: any[], i: number) => ({
      name: r[1],
      team: r[2],
      value: r[vi],
      image: data.players?.[i]?.image,
      teamLogo: data.players?.[i]?.teamLogo,
    })),
  };
}

export async function getHomeData(): Promise<HomeData> {
  const [g, boards] = await Promise.all([
    games().catch(() => []),
    Promise.all(BOARDS.map((b) => board(b).catch(() => null))),
  ]);
  return { games: g, boards: boards.filter((b): b is HomeBoard => !!b) };
}
