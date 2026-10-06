import { LEAGUES } from "./espn";
import { teamLogo } from "./logos";

export type GameTeam = {
  id: string;
  abbr: string;
  name: string;
  shortName: string;
  logo?: string;
  color?: string;
  score: string;
  record?: string;
  winner?: boolean;
  linescores: string[];
  extra: string[];
};

export type GamePerson = { id: string; name: string; image?: string; line?: string };

export type GameSituation = {
  balls?: number;
  strikes?: number;
  outs?: number;
  bases?: [boolean, boolean, boolean];
  batter?: GamePerson;
  pitcher?: GamePerson;
  note?: string;
  /** Football: offense's distance from its own goal line (0-100), and the line to gain. */
  ballOn?: number;
  toGain?: number;
  downDistance?: string;
  possession?: string;
  redZone?: boolean;
};

export type FeedItem = {
  id: string;
  clock?: string;
  text: string;
  teamId?: string;
  scoring?: boolean;
  score?: string;
  detail?: string[];
};

export type FeedGroup = { key: string; period: string; title: string; subtitle?: string; teamId?: string; items: FeedItem[] };

export type BoxRow = { id: string; name: string; image?: string; position?: string; stats: string[]; note?: string };
export type BoxTable = { title: string; columns: string[]; rows: BoxRow[]; totals?: string[] };
export type TeamBox = { teamId: string; tables: BoxTable[] };

export type GameData = {
  id: string;
  league: string;
  sport: string;
  state: "pre" | "in" | "post";
  status: string;
  date: string;
  venue?: string;
  teams: GameTeam[];
  periods: string[];
  extraLabels: string[];
  situation?: GameSituation;
  lastPlay?: string;
  winProbability?: number[];
  feed: FeedGroup[];
  boxscore: TeamBox[];
  teamStats: { label: string; values: string[] }[];
  updated: string;
};

const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
const ord = (n: number) => ORDINAL[n - 1] ?? `${n}th`;

/** Hockey's box score has ~20 skater columns; keep the ones ESPN's main view leads with. */
const HOCKEY_SKATER_COLS = ["G", "A", "+/-", "SOG", "PIM", "HT", "BS", "TK", "GV", "SHFT", "TOI", "FO%"];
const HOCKEY_GOALIE_COLS = ["SA", "GA", "SV", "SV%", "TOI", "PIM"];
const GROUP_TITLES: Record<string, string> = {
  forwards: "Forwards",
  defenses: "Defense",
  goalies: "Goalies",
  batting: "Batting",
  pitching: "Pitching",
  passing: "Passing",
  rushing: "Rushing",
  receiving: "Receiving",
  fumbles: "Fumbles",
  defensive: "Defense",
  interceptions: "Interceptions",
  kickReturns: "Kick returns",
  puntReturns: "Punt returns",
  kicking: "Kicking",
  punting: "Punting",
};

function periodLabels(sport: string, count: number) {
  const regulation = sport === "baseball" ? 9 : sport === "hockey" ? 3 : 4;
  return Array.from({ length: Math.max(count, regulation) }, (_, i) => {
    if (i < regulation || sport === "baseball") return String(i + 1);
    const ot = i - regulation + 1;
    if (sport === "hockey" && ot > 1) return "SO";
    return ot === 1 ? "OT" : `${ot}OT`;
  });
}

function periodName(sport: string, n: number) {
  if (sport === "baseball") return ord(n);
  if (sport === "hockey") return n <= 3 ? `${ord(n)} period` : n === 4 ? "Overtime" : "Shootout";
  if (sport === "football") return n <= 4 ? `${ord(n)} quarter` : "Overtime";
  return n <= 4 ? `${ord(n)} quarter` : n === 5 ? "Overtime" : `${n - 4}OT`;
}

function athletes(d: any) {
  const map = new Map<string, any>();
  for (const team of d.boxscore?.players ?? []) {
    for (const group of team.statistics ?? []) {
      for (const a of group.athletes ?? []) {
        const entry = map.get(a.athlete?.id) ?? { athlete: a.athlete, groups: {} };
        entry.groups[group.type ?? group.name ?? ""] = Object.fromEntries((group.labels ?? []).map((l: string, i: number) => [l, a.stats?.[i]]));
        map.set(a.athlete?.id, entry);
      }
    }
  }
  return map;
}

function person(people: Map<string, any>, id: any, line: (groups: any) => string | undefined): GamePerson | undefined {
  const p = people.get(String(id));
  if (!p) return undefined;
  return { id: String(id), name: p.athlete.displayName, image: p.athlete.headshot?.href, line: line(p.groups) };
}

function situation(sport: string, d: any, people: Map<string, any>, state: string): GameSituation | undefined {
  if (state !== "in") return undefined;
  const s = d.situation ?? d.header?.competitions?.[0]?.situation;

  if (sport === "baseball" && s) {
    return {
      balls: s.balls,
      strikes: s.strikes,
      outs: s.outs,
      bases: [!!s.onFirst, !!s.onSecond, !!s.onThird],
      batter: person(people, s.batter?.playerId, (g) => (g.batting?.["H-AB"] ? `${g.batting["H-AB"]} today` : undefined)),
      pitcher: person(people, s.pitcher?.playerId, (g) => {
        const p = g.pitching;
        return p ? `${p.IP} IP, ${p.H} H, ${p.ER} ER, ${p.K} K, ${p.PC ?? p["#P"] ?? "0"} P` : undefined;
      }),
      note: s.situationNotes?.[0]?.text,
    };
  }

  if (sport === "football") {
    // The latest play's end spot is the most reliable live position in the summary feed.
    const drive = d.drives?.current ?? d.drives?.previous?.at(-1);
    const end = drive?.plays?.at(-1)?.end ?? s;
    if (!end?.yardsToEndzone && !s?.downDistanceText) return undefined;
    const ballOn = typeof end?.yardsToEndzone === "number" ? 100 - end.yardsToEndzone : undefined;
    return {
      downDistance: s?.downDistanceText ?? end?.downDistanceText,
      possession: s?.possession ?? end?.team?.id ?? drive?.team?.id,
      ballOn,
      toGain: ballOn !== undefined && end?.distance ? Math.min(100, ballOn + end.distance) : undefined,
      redZone: s?.isRedZone ?? (end?.yardsToEndzone ?? 100) <= 20,
    };
  }
  return undefined;
}

function scoreText(p: any) {
  return typeof p.awayScore === "number" ? `${p.awayScore}-${p.homeScore}` : undefined;
}

function baseballFeed(d: any): FeedGroup[] {
  const groups: FeedGroup[] = [];
  const pitches = new Map<string, string[]>();
  for (const p of d.plays ?? []) {
    if (p.summaryType === "P" && p.text) pitches.set(p.atBatId, [...(pitches.get(p.atBatId) ?? []), p.text]);
  }
  const resolved = new Set<string>();
  for (const p of d.plays ?? []) {
    const half = `${p.period?.type ?? ""} ${ord(p.period?.number ?? 1)}`.trim();
    let group = groups.at(-1);
    if (!group || group.key !== half) {
      group = { key: half, period: String(p.period?.number ?? 1), title: half, teamId: p.team?.id, items: [] };
      groups.push(group);
    }
    const type = p.type?.type ?? "";
    if (!p.text || p.summaryType === "P" || p.summaryType === "I" || type.includes("inning") || type.includes("batterpitcher")) continue;
    if (p.summaryType === "N") resolved.add(p.atBatId);
    group.items.push({
      id: p.id,
      text: p.text,
      teamId: p.team?.id,
      scoring: p.scoringPlay,
      score: p.scoringPlay ? scoreText(p) : undefined,
      detail: p.summaryType === "N" ? pitches.get(p.atBatId) : undefined,
    });
  }
  // The at-bat in progress has pitches but no result yet.
  const current = (d.plays ?? []).findLast((p: any) => p.summaryType === "A");
  if (current && !resolved.has(current.atBatId) && groups.length) {
    groups.at(-1)!.items.push({ id: current.id, text: `${current.text} (at bat)`, teamId: current.team?.id, detail: pitches.get(current.atBatId) });
  }
  return groups.filter((g) => g.items.length).map((g) => ({ ...g, items: g.items.reverse() })).reverse();
}

function footballFeed(d: any): FeedGroup[] {
  const drives = [...(d.drives?.previous ?? []), ...(d.drives?.current ? [d.drives.current] : [])];
  return drives
    .map((drive: any, i: number): FeedGroup => ({
      key: drive.id ?? String(i),
      period: String(drive.start?.period?.number ?? drive.plays?.[0]?.period?.number ?? 1),
      title: `${drive.team?.abbreviation ?? drive.team?.shortDisplayName ?? ""} · ${drive.displayResult ?? drive.result ?? "Drive in progress"}`,
      subtitle: drive.description,
      teamId: drive.team?.id,
      items: (drive.plays ?? [])
        .filter((p: any) => p.text)
        .map((p: any) => ({
          id: p.id,
          clock: `${(p.period?.number ?? 1) <= 4 ? `Q${p.period?.number ?? 1}` : "OT"} ${p.clock?.displayValue ?? ""}`.trim(),
          text: p.text,
          teamId: drive.team?.id,
          scoring: p.scoringPlay,
          score: p.scoringPlay ? scoreText(p) : undefined,
          detail: p.start?.downDistanceText ? [p.start.downDistanceText] : undefined,
        }))
        .reverse(),
    }))
    .filter((g) => g.items.length)
    .reverse();
}

function clockFeed(sport: string, d: any): FeedGroup[] {
  const groups: FeedGroup[] = [];
  for (const p of d.plays ?? []) {
    if (!p.text) continue;
    const n = p.period?.number ?? 1;
    let group = groups.at(-1);
    if (!group || group.period !== String(n)) {
      group = { key: String(n), period: String(n), title: periodName(sport, n), items: [] };
      groups.push(group);
    }
    group.items.push({
      id: p.id,
      clock: p.clock?.displayValue,
      text: p.text,
      teamId: p.team?.id,
      scoring: p.scoringPlay,
      score: scoreText(p),
      detail: p.strength?.text && p.scoringPlay ? [p.strength.text] : undefined,
    });
  }
  return groups.map((g) => ({ ...g, items: g.items.reverse() })).reverse();
}

function boxscore(sport: string, d: any): TeamBox[] {
  return (d.boxscore?.players ?? []).map((team: any): TeamBox => {
    const tables: BoxTable[] = [];
    for (const group of team.statistics ?? []) {
      const key = group.type ?? group.name ?? "";
      if (!group.athletes?.length) continue;
      let labels: string[] = group.labels ?? [];
      let pick = labels.map((_, i) => i);
      if (sport === "hockey") {
        const wanted = key === "goalies" ? HOCKEY_GOALIE_COLS : HOCKEY_SKATER_COLS;
        pick = wanted.map((c) => labels.indexOf(c)).filter((i) => i >= 0);
      }
      const columns = pick.map((i) => labels[i]);
      const row = (a: any): BoxRow => ({
        id: a.athlete?.id,
        name: a.athlete?.displayName,
        image: a.athlete?.headshot?.href,
        position: a.position?.abbreviation ?? a.athlete?.position?.abbreviation,
        stats: a.didNotPlay ? [] : pick.map((i) => a.stats?.[i] ?? ""),
        note: a.didNotPlay ? (a.reason ? `DNP · ${a.reason.toLowerCase()}` : "Did not play") : a.ejected ? "Ejected" : undefined,
      });
      const totals = group.totals?.length ? pick.map((i) => group.totals[i] ?? "") : undefined;

      if (sport === "basketball") {
        const starters = group.athletes.filter((a: any) => a.starter);
        const bench = group.athletes.filter((a: any) => !a.starter);
        if (starters.length) tables.push({ title: "Starters", columns, rows: starters.map(row) });
        tables.push({ title: "Bench", columns, rows: bench.map(row), totals });
      } else {
        tables.push({ title: GROUP_TITLES[key] ?? key, columns, rows: group.athletes.map(row), totals });
      }
    }
    return { teamId: team.team?.id, tables };
  });
}

function teamStats(d: any, teams: GameTeam[]) {
  const byTeam = new Map<string, any[]>((d.boxscore?.teams ?? []).map((t: any) => [t.team?.id, t.statistics ?? []]));
  const away = byTeam.get(teams[0]?.id) ?? [];
  const home = byTeam.get(teams[1]?.id) ?? [];
  return away
    .filter((s: any) => s.label && s.displayValue !== undefined)
    .map((s: any) => ({
      label: s.label,
      values: [s.displayValue, home.find((h: any) => h.name === s.name)?.displayValue ?? ""],
    }));
}

export async function getGame(league: string, id: string): Promise<GameData | null> {
  const sport = LEAGUES[league];
  if (!sport || !/^\d+$/.test(id)) return null;
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/summary?event=${id}`, {
    next: { revalidate: 10 },
  });
  if (!res.ok) return null;
  const d = await res.json();
  const comp = d.header?.competitions?.[0];
  if (!comp) return null;

  const state = comp.status?.type?.state ?? "pre";
  const teams: GameTeam[] = ["away", "home"].map((side) => {
    const c = comp.competitors.find((x: any) => x.homeAway === side) ?? {};
    return {
      id: c.team?.id,
      abbr: c.team?.abbreviation,
      name: c.team?.displayName,
      shortName: c.team?.name ?? c.team?.shortDisplayName ?? c.team?.abbreviation,
      logo: teamLogo(c.team?.logos) ?? c.team?.logo,
      color: c.team?.color ? `#${c.team.color}` : undefined,
      score: c.score ?? "",
      record: c.record?.[0]?.displayValue ?? c.record?.[0]?.summary,
      winner: c.winner,
      linescores: (c.linescores ?? []).map((l: any) => l.displayValue ?? String(l.value ?? "")),
      extra: sport === "baseball" ? [c.score ?? "", String(c.hits ?? ""), String(c.errors ?? "")] : [c.score ?? ""],
    };
  });
  const people = athletes(d);
  const plays = d.plays ?? [];

  return {
    id,
    league,
    sport,
    state,
    status: comp.status?.type?.shortDetail ?? comp.status?.type?.detail ?? "",
    date: comp.date,
    venue: d.gameInfo?.venue?.fullName,
    teams,
    periods: state === "pre" ? [] : periodLabels(sport, Math.max(...teams.map((t) => t.linescores.length))),
    extraLabels: sport === "baseball" ? ["R", "H", "E"] : ["T"],
    situation: situation(sport, d, people, state),
    lastPlay:
      state === "in"
        ? (d.situation?.lastPlay?.text ??
          plays.findLast((p: any) => p.text && p.summaryType !== "A" && p.summaryType !== "I")?.text ??
          d.drives?.current?.plays?.at(-1)?.text)
        : undefined,
    winProbability: (d.winprobability ?? []).map((w: any) => w.homeWinPercentage).filter((n: any) => typeof n === "number"),
    feed: sport === "baseball" ? baseballFeed(d) : sport === "football" ? footballFeed(d) : clockFeed(sport, d),
    boxscore: boxscore(sport, d),
    teamStats: teamStats(d, teams),
    updated: new Date().toISOString(),
  };
}
