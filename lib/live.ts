import { LEAGUES } from "./espn";

export type LivePerson = {
  id: string;
  name: string;
  image?: string;
  team?: string;
  teamLogo?: string;
  /** e.g. "3.1 IP, 0 ER, 6 K" or "10 PTS". */
  line?: string;
  /** Small caption above the name, e.g. "Pitching". */
  label?: string;
};

/** The right-hand panel of a live game row; what it shows depends on the sport. */
export type LiveDetail =
  | { kind: "players"; title: string; people: LivePerson[] }
  | { kind: "play"; title: string; text: string; person?: LivePerson };

export type LiveTeam = {
  abbr: string;
  name: string;
  logo?: string;
  score: string;
  /** e.g. "1-1-1, 1-0-0 Away" */
  record?: string;
  linescores: string[];
  /** Totals shown after the periods: [R, H, E] for baseball, [T] otherwise. */
  totals: string[];
};

export type LiveGame = {
  id: string;
  league: string;
  status: string;
  situation?: string;
  periods: string[];
  totalLabels: string[];
  teams: LiveTeam[];
  detail?: LiveDetail;
};

export type NextGame = { league: string; name: string; date: string };

export type LiveData = { games: LiveGame[]; next?: NextGame; updated: string };

const LIVE_LEAGUES = ["nfl", "mlb", "nba", "wnba", "nhl"];

/** Football's in-game leaders, shown at the competition level. */
const FOOTBALL_LEADERS = [
  { name: "passingYards", label: "Passing" },
  { name: "rushingYards", label: "Rushing" },
  { name: "receivingYards", label: "Receiving" },
];

async function scoreboard(league: string) {
  const sport = LEAGUES[league];
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`, {
    next: { revalidate: 15 },
  });
  if (!res.ok) throw new Error(`ESPN scoreboard failed (${res.status})`);
  return res.json();
}

function headshot(a: any): string | undefined {
  return typeof a?.headshot === "string" ? a.headshot : a?.headshot?.href;
}

function periodLabels(sport: string, played: number) {
  const regulation = sport === "hockey" ? 3 : 4;
  return Array.from({ length: Math.max(played, regulation) }, (_, i) => {
    if (i < regulation) return String(i + 1);
    if (sport === "hockey" && i > regulation) return "SO";
    return i === regulation ? "OT" : `${i - regulation + 1}OT`;
  });
}

/** ESPN's pitcher line can contain an empty stat ("0 ER, H, 6 K"); drop those pieces. */
function cleanLine(line: string | undefined) {
  return line
    ?.split(",")
    .map((s) => s.trim())
    .filter((s) => /\d/.test(s))
    .join(", ");
}

function baseballSituation(sit: any, status: string) {
  if (!sit || typeof sit.outs !== "number" || /^(Mid|End)\b/.test(status)) return undefined;
  const bases = [sit.onFirst && "1st", sit.onSecond && "2nd", sit.onThird && "3rd"].filter(Boolean);
  const count = typeof sit.balls === "number" ? `${sit.balls}-${sit.strikes}, ` : "";
  return `${count}${sit.outs} out${sit.outs === 1 ? "" : "s"}` + (bases.length ? `, on ${bases.join(" & ")}` : "");
}

function lastPlay(comp: any, status: string, teams: Record<string, any>): LiveDetail | undefined {
  const play = comp.situation?.lastPlay;
  if (!play?.text) return undefined;
  const athlete = play.athletesInvolved?.[0];
  const team = teams[play.team?.id ?? athlete?.team?.id];
  return {
    kind: "play",
    title: `Last play · ${status}`,
    text: team ? `${team.abbreviation} - ${play.text}` : play.text,
    person: athlete
      ? { id: athlete.id, name: athlete.displayName, image: headshot(athlete), team: team?.abbreviation, teamLogo: team?.logo }
      : undefined,
  };
}

function detail(sport: string, comp: any, status: string, teams: Record<string, any>): LiveDetail | undefined {
  const sit = comp.situation;

  if (sport === "baseball") {
    const people = [
      ["Pitching", sit?.pitcher],
      ["At bat", sit?.batter],
    ]
      .filter(([, p]) => p?.athlete)
      .map(([label, p]: any): LivePerson => {
        const team = teams[p.athlete.team?.id];
        return {
          id: p.athlete.id,
          label,
          name: p.athlete.displayName,
          image: headshot(p.athlete),
          team: team?.abbreviation,
          teamLogo: team?.logo,
          line: cleanLine(p.summary),
        };
      });
    // Between half-innings there's no matchup yet; fall back to the last play.
    return people.length ? { kind: "players", title: "At the plate", people } : lastPlay(comp, status, teams);
  }

  if (sport === "basketball") {
    const awayFirst = [...(comp.competitors ?? [])].sort((a: any, b: any) => (a.homeAway === "away" ? -1 : b.homeAway === "away" ? 1 : 0));
    const people = awayFirst.flatMap((c: any): LivePerson[] => {
      const top = c.leaders?.find((l: any) => l.name === "points")?.leaders?.[0];
      if (!top?.athlete) return [];
      return [
        {
          id: top.athlete.id,
          name: top.athlete.displayName,
          image: headshot(top.athlete),
          team: c.team?.abbreviation,
          teamLogo: c.team?.logo,
          line: `${top.displayValue} PTS`,
        },
      ];
    });
    return people.length ? { kind: "players", title: "Leading scorers", people } : lastPlay(comp, status, teams);
  }

  if (sport === "football") {
    const people = FOOTBALL_LEADERS.flatMap(({ name, label }): LivePerson[] => {
      const top = comp.leaders?.find((l: any) => l.name === name)?.leaders?.[0];
      if (!top?.athlete) return [];
      const team = teams[top.team?.id ?? top.athlete.team?.id];
      return [
        {
          id: top.athlete.id,
          label,
          name: top.athlete.displayName,
          image: headshot(top.athlete),
          team: team?.abbreviation,
          teamLogo: team?.logo,
          line: top.displayValue,
        },
      ];
    });
    return people.length ? { kind: "players", title: "Game leaders", people } : lastPlay(comp, status, teams);
  }

  return lastPlay(comp, status, teams);
}

function liveGame(league: string, e: any): LiveGame {
  const sport = LEAGUES[league];
  const comp = e.competitions?.[0] ?? {};
  const status = e.status?.type?.shortDetail ?? e.status?.type?.detail ?? "";
  const teamsById: Record<string, any> = {};
  for (const c of comp.competitors ?? []) teamsById[c.team?.id] = c.team;

  const teams = ["away", "home"].map((side): LiveTeam => {
    const c = (comp.competitors ?? []).find((x: any) => x.homeAway === side) ?? {};
    const records = c.records ?? [];
    const total = records.find((r: any) => r.type === "total")?.summary;
    const split = records.find((r: any) => r.type === (side === "home" ? "home" : "road"))?.summary;
    return {
      abbr: c.team?.abbreviation,
      name: c.team?.shortDisplayName ?? c.team?.displayName,
      logo: c.team?.logo,
      score: c.score ?? "0",
      record: total ? (split ? `${total}, ${split} ${side === "home" ? "Home" : "Away"}` : total) : undefined,
      linescores: (c.linescores ?? []).map((l: any) => l.displayValue ?? String(l.value ?? "")),
      totals: sport === "baseball" ? [c.score ?? "0", String(c.hits ?? 0), String(c.errors ?? 0)] : [c.score ?? "0"],
    };
  });

  return {
    id: e.id,
    league,
    status,
    situation: sport === "baseball" ? baseballSituation(comp.situation, status) : comp.situation?.downDistanceText,
    // Nine innings don't fit a compact row, so baseball shows R/H/E only, like ESPN's scoreboard.
    periods: sport === "baseball" ? [] : periodLabels(sport, Math.max(...teams.map((t) => t.linescores.length))),
    totalLabels: sport === "baseball" ? ["R", "H", "E"] : ["T"],
    teams,
    detail: detail(sport, comp, status, teamsById),
  };
}

export async function getLiveData(): Promise<LiveData> {
  const boards = await Promise.all(
    LIVE_LEAGUES.map((league) =>
      scoreboard(league).then(
        (d) => ({ league, events: (d.events ?? []) as any[] }),
        () => ({ league, events: [] as any[] }),
      ),
    ),
  );

  const games: LiveGame[] = [];
  let next: NextGame | undefined;
  const now = Date.now();
  for (const { league, events } of boards) {
    for (const e of events) {
      const state = e.status?.type?.state;
      if (state === "in") games.push(liveGame(league, e));
      else if (state === "pre" && Date.parse(e.date) > now && (!next || Date.parse(e.date) < Date.parse(next.date))) {
        next = { league, name: e.shortName ?? e.name, date: e.date };
      }
    }
  }
  return { games, next, updated: new Date().toISOString() };
}
