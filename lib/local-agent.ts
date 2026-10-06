import * as espn from "./espn";
import type { AgentEvent, FinalAnswer } from "./types";
import { SPORT_PRIORITY, STATS, type Sport, type StatDef } from "./stat-defs";

type Emit = (e: AgentEvent) => void;

type Time =
  | { kind: "current"; explicit: boolean }
  | { kind: "last" }
  | { kind: "career" }
  | { kind: "season"; year?: number; start?: number }
  | { kind: "games"; n: number };

type Plan = {
  intent: "standings" | "scores" | "leaders" | "compare" | "entity";
  league?: string;
  postseason: boolean;
  time: Time;
  stats: Partial<Record<Sport, StatDef>>;
  total: boolean;
  limit: number;
  names: string[];
  worst: boolean;
  date?: { iso: string; past: boolean };
  teamQuery: "record" | "last" | "next";
  wording: string;
};

type Entity = { type: "player" | "team"; id: string; name: string; league: string; team?: string; image?: string };

const SPORT_OF: Record<string, Sport> = espn.LEAGUES as Record<string, Sport>;
const DEFAULT_LEAGUE: Record<Sport, string> = { basketball: "nba", football: "nfl", baseball: "mlb", hockey: "nhl" };
const LEAGUE_LABEL: Record<string, string> = {
  nba: "NBA",
  wnba: "WNBA",
  nfl: "NFL",
  mlb: "MLB",
  nhl: "NHL",
  "college-football": "college football",
  "mens-college-basketball": "men's college basketball",
};

const LEAGUE_WORDS: [RegExp, string][] = [
  [/\bcollege football\b|\bcfb\b|\bncaaf\b/, "college-football"],
  [/\bcollege basketball\b|\bncaab\b|\bncaa basketball\b|\bmarch madness\b/, "mens-college-basketball"],
  [/\bwnba\b/, "wnba"],
  [/\bnba\b/, "nba"],
  [/\bnfl\b/, "nfl"],
  [/\bmlb\b|\bbaseball\b/, "mlb"],
  [/\bnhl\b|\bhockey\b/, "nhl"],
  [/\bbasketball\b/, "nba"],
  [/\bfootball\b/, "nfl"],
];

/** Questions the rule-based parser can't answer reliably; these are turned away rather than guessed at. */
const TOO_COMPLEX =
  /\b(in a game|single[- ]game|career[- ]high|all[- ]time|ever|history|since|before|after|when|streak|how many times|per 36|per 100|against|rookie|first|record for|without|with the|clutch|percentile|rank(?:ed)?)\b/;

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20,
};

const NICKNAMES: [RegExp, string][] = [
  [/\bkd\b/, "kevin durant"],
  [/\blbj\b|\bking james\b|\bbron\b/, "lebron james"],
  [/\bsga\b/, "shai gilgeous-alexander"],
  [/\bcp3\b/, "chris paul"],
  [/\b(?:the )?greek freak\b/, "giannis antetokounmpo"],
  [/\b(?:the )?joker\b/, "nikola jokic"],
  [/\bshaq\b/, "shaquille o'neal"],
  [/\bmj\b/, "michael jordan"],
  [/\bkat\b/, "karl-anthony towns"],
  [/\bdame\b/, "damian lillard"],
  [/\bwemby\b/, "victor wembanyama"],
  [/\bsteph\b(?! curry)/, "stephen curry"],
  [/\bpg13\b/, "paul george"],
  [/\bovi\b/, "alex ovechkin"],
  [/\bsixers\b/, "76ers"],
  [/\bniners\b/, "49ers"],
  [/\bcavs\b/, "cavaliers"],
  [/\bmavs\b/, "mavericks"],
  [/\bwolves\b/, "timberwolves"],
  [/\bblazers\b/, "trail blazers"],
  [/\bdubs\b/, "warriors"],
  [/\bbucs\b/, "buccaneers"],
  [/\bpats\b/, "patriots"],
  [/\bjags\b/, "jaguars"],
];

const STOP = new Set(
  (
    "what whats what's is are was were did does do how many much has have had the a an in on of for per game games " +
    "season seasons year years stats stat statistics numbers line statline average averages averaged averaging total " +
    "totals his her their this that so far during over with by get got make made put up puts score scores scored record " +
    "schedule show me tell give find who which whom led leads lead leading leader leaders most fewest least highest " +
    "lowest best worst top league player players compare more better regular current previous past next recent latest " +
    "team teams been last play played plays playing it all career lifetime playoff playoffs postseason pg thus far " +
    "standings standing scoreboard about tell please me i want know see like you can could would should us he she they " +
    "them its now there then also again and hey yo vs versus or "
  ).split(" "),
);

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[?!,;:"()]/g, " ")
    .replace(/\.(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function currentSeason(league: string, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  switch (league) {
    case "nba":
    case "nhl":
      return m >= 10 ? y + 1 : y;
    case "mens-college-basketball":
      return m >= 11 ? y + 1 : y;
    case "wnba":
      return m >= 5 ? y : y - 1;
    case "mlb":
      return m >= 3 ? y : y - 1;
    default:
      return m >= 9 ? y : y - 1;
  }
}

const splitYear = (league: string) => ["nba", "nhl", "mens-college-basketball"].includes(league);

function seasonLabel(league: string, year: number) {
  return splitYear(league) ? `${year - 1}-${String(year % 100).padStart(2, "0")}` : String(year);
}

/** Whether `year` is a season still being played (so answers should say "so far"). */
function inProgress(league: string, year: number) {
  if (year !== currentSeason(league)) return false;
  return !(league === "mlb" && new Date().getMonth() + 1 >= 10);
}

function explicitYear(league: string, time: Time): number | undefined {
  if (time.kind === "season") return time.start !== undefined ? (splitYear(league) ? time.start + 1 : time.start) : time.year;
  if (time.kind === "last") return currentSeason(league) - 1;
  return undefined;
}

const pronoun = (league: string) => (league === "wnba" ? "her" : "his");

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(t: string): { iso: string; past: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let d = new Date(today);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  let m: RegExpMatchArray | null;
  if (/\byesterday\b|\blast night\b/.test(t)) d.setDate(d.getDate() - 1);
  else if (/\btomorrow\b/.test(t)) d.setDate(d.getDate() + 1);
  else if ((m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) d = new Date(+m[1], +m[2] - 1, +m[3]);
  else if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const yr = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : today.getFullYear();
    d = new Date(yr, +m[1] - 1, +m[2]);
  } else if ((m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?\b/))) {
    d = new Date(m[3] ? +m[3] : today.getFullYear(), months.indexOf(m[1]), +m[2]);
  }
  return { iso: toIso(d), past: d < today };
}

function parse(question: string): Plan | null {
  const original = normalize(question);
  if (!original || TOO_COMPLEX.test(original)) return null;
  let t = ` ${original} `;
  const cut = (re: RegExp) => {
    const m = t.match(re);
    if (m) t = t.replace(re, " ");
    return m;
  };

  let league: string | undefined;
  for (const [re, lg] of LEAGUE_WORDS) {
    if (cut(re)) {
      league = lg;
      break;
    }
  }

  const postseason = !!cut(/\b(?:playoffs?|postseason|post[- ]season)\b/);
  const worst = /\bworst\b/.test(original);
  const total = /\b(?:total|totals|most)\b/.test(original) && !/\bper game\b|\baverag/.test(original);
  const limitMatch = cut(/\btop (\d+|five|ten)\b/);
  const limit = limitMatch ? Math.min(NUMBER_WORDS[limitMatch[1]] ?? Number(limitMatch[1]), 25) : 10;

  const isScores =
    /\b(?:scores?|scoreboard)\b/.test(original) ||
    /\bgames? (?:today|tonight|yesterday|tomorrow|last night|on)\b/.test(original) ||
    /\bwho (?:plays|played|is playing)\b/.test(original);

  let date: Plan["date"];
  let time: Time = { kind: "current", explicit: false };
  if (isScores) {
    date = parseDate(original);
    cut(/\b(?:today|tonight|yesterday|tomorrow|last night)\b/);
    cut(/\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/);
    cut(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?(?: \d{4})?\b/);
  } else {
    let m: RegExpMatchArray | null;
    if ((m = cut(/\b(?:last|past|previous) (\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty) games\b/))) {
      time = { kind: "games", n: Math.min(NUMBER_WORDS[m[1]] ?? Number(m[1]), 82) };
    } else if (cut(/\b(?:last|most recent|latest|previous) game\b/) && !/\bnext game\b/.test(original)) {
      time = { kind: "games", n: 1 };
    } else if (cut(/\b(?:career|lifetime)\b/)) {
      time = { kind: "career" };
    } else if ((m = cut(/\b((?:19|20)\d{2}) ?[-–\/] ?((?:19|20)?\d{2})\b/))) {
      time = { kind: "season", start: Number(m[1]) };
    } else if ((m = cut(/\b((?:19|20)\d{2})\b/))) {
      time = { kind: "season", year: Number(m[1]) };
    } else if (cut(/\b(?:this|current) (?:season|year|postseason)\b|\bso far\b|\bthis szn\b/)) {
      time = { kind: "current", explicit: true };
    } else if (cut(/\b(?:last|previous|past) (?:season|year)\b/)) {
      time = { kind: "last" };
    }
  }

  const stats: Plan["stats"] = {};
  const matched: string[] = [];
  for (const def of STATS) {
    if (stats[def.sport]) continue;
    const m = t.match(def.re);
    if (m) {
      stats[def.sport] = def;
      matched.push(m[0]);
    }
  }
  for (const m of matched) t = t.replace(m, " ");

  let intent: Plan["intent"] = "entity";
  let names: string[] = [];
  const pair =
    t.match(/^\s*compare (.+?) (?:and|with|to) (.+)$/) ?? t.match(/^(.+?) (?:vs\.?|versus|v\.?|or|compared (?:to|with)) (.+)$/);
  if (pair && tokens(pair[1]).length && tokens(pair[2]).length) {
    intent = "compare";
    names = [pair[1], pair[2]];
  } else {
    names = [t];
  }

  const leaderWords =
    /^(?:who|which|whom)\b|\b(?:leaders?|leading|led|leads|most|fewest|least|highest|lowest|best|top)\b/.test(original);
  const residual = tokens(names[0]);

  if (/\bstandings?\b|\b(?:best|worst) records?\b/.test(original) && !residual.length) intent = "standings";
  else if (isScores && !residual.length) intent = "scores";
  else if (intent !== "compare" && leaderWords && !residual.length) intent = "leaders";
  else if (intent !== "compare" && !residual.length) return null;

  if (intent === "leaders" && (time.kind === "career" || time.kind === "games")) return null;
  if (intent === "leaders" && !Object.keys(stats).length) return null;
  if ((intent === "standings" || intent === "scores") && !league) return null;

  const teamQuery: Plan["teamQuery"] = /\bnext game\b|\bplay next\b/.test(original)
    ? "next"
    : time.kind === "games" || isScores
      ? "last"
      : "record";

  return { intent, league, postseason, time, stats, total, limit, names, worst, date, teamQuery, wording: original };
}

function tokens(text: string): string[] {
  let s = ` ${text} `;
  for (const [re, full] of NICKNAMES) s = s.replace(re, full);
  return s
    .split(/\s+/)
    .map((w) => w.replace(/'s$/, "").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter((w) => w && !STOP.has(w));
}

function nameMatches(query: string[], name: string) {
  const parts = normalize(name).split(/[\s-]+/);
  const hits = query.filter((q) =>
    parts.some((p) => p === q || (Math.min(p.length, q.length) >= 3 && (p.startsWith(q) || q.startsWith(p)))),
  ).length;
  const exact = query.some((q) => parts.includes(q));
  return exact && hits >= Math.ceil(query.length / 2);
}

async function resolveEntity(text: string, plan: Plan, emit: Emit): Promise<Entity | null> {
  const words = tokens(text);
  if (!words.length) return null;
  const sports = Object.keys(plan.stats) as Sport[];

  const queries: string[][] = [words];
  for (let size = words.length - 1; size >= 1 && queries.length < 5; size--) {
    for (let i = 0; i + size <= words.length && queries.length < 5; i++) {
      const w = words.slice(i, i + size);
      if (size === 1 && w[0].length < 3) continue;
      queries.push(w);
    }
  }

  for (const q of queries) {
    const label = q.join(" ");
    emit({ type: "step", label: `Searching for "${label}"` });
    const res = await espn.search(label);
    if (!Array.isArray(res)) continue;
    const hit = res.find(
      (r: any) =>
        r.id &&
        (!plan.league || r.league === plan.league) &&
        (plan.league || !sports.length || sports.includes(SPORT_OF[r.league])) &&
        nameMatches(q, r.name),
    );
    if (hit) return hit as Entity;
  }
  return null;
}

// ---------- Player season / career stats ----------

type Category = {
  key: string;
  category: string;
  columns: string[];
  seasonYears: number[];
  rows: string[][];
  career?: string[];
};

type Summary = { cats: string[]; primary: string; table?: string[]; text: (v: (col: string) => string) => string };

function position(pos: string | undefined) {
  return (pos ?? "").toUpperCase();
}

function isPitcher(pos: string) {
  return ["SP", "RP", "P", "CL"].includes(pos);
}

function summaryFor(sport: Sport, pos: string, postseason: boolean): Summary {
  switch (sport) {
    case "basketball":
      return {
        cats: ["averages"],
        primary: "PTS",
        table: ["GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "FG%", "3P%", "FT%"],
        text: (v) => `averaged ${v("PTS")} points, ${v("REB")} rebounds and ${v("AST")} assists`,
      };
    case "football":
      if (pos === "QB")
        return { cats: ["passing"], primary: "YDS", text: (v) => `threw for ${v("YDS")} yards, ${v("TD")} touchdowns and ${v("INT")} interceptions` };
      if (pos === "RB" || pos === "FB")
        return { cats: ["rushing"], primary: "YDS", text: (v) => `rushed for ${v("YDS")} yards and ${v("TD")} touchdowns on ${v("CAR")} carries` };
      if (pos === "WR" || pos === "TE")
        return { cats: ["receiving"], primary: "YDS", text: (v) => `caught ${v("REC")} passes for ${v("YDS")} yards and ${v("TD")} touchdowns` };
      return { cats: ["defensive"], primary: "TOT", text: (v) => `had ${v("TOT")} tackles, ${v("SACK")} sacks and ${v("INT")} interceptions` };
    case "baseball":
      if (isPitcher(pos))
        return {
          cats: [postseason ? "postseason-pitching" : "pitching"],
          primary: "K",
          table: ["GP", "GS", "W", "L", "ERA", "IP", "K", "BB", "WHIP", "SV"],
          text: (v) => `went ${v("W")}-${v("L")} with a ${v("ERA")} ERA and ${v("K")} strikeouts`,
        };
      return {
        cats: [postseason ? "postseason-batting" : "career-batting"],
        primary: "HR",
        table: ["GP", "AB", "R", "H", "HR", "RBI", "SB", "AVG", "OBP", "SLG", "OPS"],
        text: (v) => `hit ${v("AVG")} with ${v("HR")} home runs and ${v("RBI")} RBIs`,
      };
    case "hockey":
      if (pos === "G")
        return { cats: [], primary: "SV%", text: (v) => `went ${v("WINS")}-${v("L")}-${v("OTL")} with a ${v("GAA")} GAA and a ${v("SV%")} save percentage` };
      return { cats: [], primary: "PTS", text: (v) => `had ${v("G")} goals and ${v("A")} assists for ${v("PTS")} points` };
  }
}

/** Turns a generic stat ("yards", "touchdowns", "strikeouts") into the one that fits the player's position. */
function specialize(def: StatDef, sport: Sport, pos: string, postseason: boolean): StatDef {
  const byId = (id: string) => STATS.find((s) => s.id === id)!;
  if (sport === "football") {
    const role = pos === "QB" ? "qb" : pos === "RB" || pos === "FB" ? "rb" : pos === "WR" || pos === "TE" ? "wr" : "def";
    const table: Record<string, Partial<Record<string, string>>> = {
      yds: { qb: "passYds", rb: "rushYds", wr: "recYds" },
      td: { qb: "passTd", rb: "rushTd", wr: "recTd" },
      defInt: { qb: "intThrown" },
    };
    const id = table[def.id]?.[role];
    return id ? byId(id) : def;
  }
  if (sport === "baseball" && def.id === "k" && !isPitcher(pos)) {
    return { ...def, col: postseason ? "K" : "SO", cats: ["career-batting", "postseason-batting"], say: (v) => `struck out ${v} times` };
  }
  if (sport === "baseball" && def.id === "war" && isPitcher(pos)) return { ...def, cats: ["pitching"] };
  return def;
}

function pickCategory(cats: Category[], wanted: string[], col?: string): Category | undefined {
  const pool = wanted.length ? cats.filter((c) => wanted.some((w) => c.key.startsWith(w))) : cats;
  return pool.find((c) => !col || c.columns.includes(col)) ?? (col ? cats.find((c) => c.columns.includes(col)) : undefined);
}

function filterSeasonType(cats: Category[], league: string, postseason: boolean) {
  if (league !== "mlb") return cats;
  return cats.filter((c) => c.key.startsWith("postseason-") === postseason);
}

/** Index of the row to report, plus the season year it represents. */
function pickRow(cat: Category, league: string, time: Time): { index: number; year: number } | null {
  if (!cat.rows.length) return null;
  const gp = cat.columns.indexOf("GP");
  const played = (i: number) => gp < 0 || Number(cat.rows[i][gp]) > 0;
  const rowsFor = (year: number) => cat.seasonYears.map((y, i) => (y === year && played(i) ? i : -1)).filter((i) => i >= 0);
  const best = (idx: number[]) => (gp < 0 ? idx.at(-1)! : idx.reduce((a, b) => (Number(cat.rows[b][gp]) > Number(cat.rows[a][gp]) ? b : a)));

  const year = explicitYear(league, time);
  if (year !== undefined) {
    const idx = rowsFor(year);
    return idx.length ? { index: best(idx), year } : null;
  }
  for (let i = cat.rows.length - 1; i >= 0; i--) if (played(i)) return { index: i, year: cat.seasonYears[i] };
  return null;
}

function cellValue(col: string, raw: string | undefined) {
  if (raw === undefined || raw === "") return "—";
  const v = col === "3PT" ? raw.split("-")[0] : raw;
  return /^\d{4,}$/.test(v) ? Number(v).toLocaleString("en-US") : v;
}

/** "the NBA", but "MLB" and "college football" read better without an article. */
function theLeague(league: string) {
  return ["mlb", "college-football", "mens-college-basketball"].includes(league) ? LEAGUE_LABEL[league] : `the ${LEAGUE_LABEL[league]}`;
}

function whenPhrase(league: string, year: number, postseason: boolean) {
  const label = seasonLabel(league, year);
  if (postseason) return `in the ${label} playoffs`;
  return inProgress(league, year) ? `in ${label} so far` : `in ${label}`;
}

function seasonTable(league: string, cat: Category, cols: string[], title: string, highlightYear?: number, careerOnly = false) {
  const idx = cols.map((c) => cat.columns.indexOf(c)).filter((i) => i >= 0);
  const header = ["SEASON", "TEAM", ...idx.map((i) => cat.columns[i])];
  const order = cat.rows.map((_, i) => i).reverse();
  const picked = careerOnly ? order : order.filter((i) => highlightYear === undefined || cat.seasonYears[i] <= highlightYear).slice(0, 10);
  const rows = picked.map((i) => [seasonLabel(league, cat.seasonYears[i]), cat.rows[i][1], ...idx.map((j) => cat.rows[i][j])]);
  if (cat.career?.length) rows.push(["Career", "", ...idx.map((j) => cat.career![j - 2] ?? "")]);
  return { title, columns: header, rows };
}

async function playerAnswer(p: Entity, plan: Plan, emit: Emit): Promise<FinalAnswer | null> {
  const league = p.league;
  const sport = SPORT_OF[league];
  emit({ type: "step", label: `Pulling ${p.name}'s ${plan.postseason ? "playoff" : "season"} stats` });
  const data: any = await espn.playerStats(league, p.id, plan.postseason ? "postseason" : undefined);
  const cats = filterSeasonType(data.categories as Category[], league, plan.postseason);
  if (!cats.length) return null;

  const pos = position(data.player?.positionAbbr);
  const name = data.player?.name ?? p.name;
  const summary = summaryFor(sport, pos, plan.postseason);
  const rawDef = plan.stats[sport];
  const def = rawDef && specialize(rawDef, sport, pos, plan.postseason);
  const wantTotals = !!def && sport === "basketball" && plan.total && !!def.totalName;

  const cat = def
    ? pickCategory(cats, wantTotals ? ["totals"] : (def.cats ?? []), def.col)
    : pickCategory(cats, summary.cats);
  if (!cat) return null;

  const cols = def
    ? Array.from(new Set([...(cat.key.startsWith(summary.cats[0] ?? "~") && summary.table ? summary.table : cat.columns.slice(2)), def.col]))
    : (summary.table ?? cat.columns.slice(2));
  const title = `${name} ${plan.postseason ? "playoff " : ""}${cat.category.toLowerCase().replace(/^(?:career|regular season|postseason) /, "")}`;
  const subject = { name, subtitle: [data.player?.team, data.player?.position].filter(Boolean).join(" · "), image: data.player?.image ?? p.image };
  const followups = [
    `${name} last 5 games`,
    plan.time.kind === "career" ? `${name} stats this season` : `${name} career stats`,
    plan.postseason ? `${name} regular season stats` : `${name} playoff stats`,
  ];
  const say = (v: string) => (wantTotals ? `had ${v} ${def!.totalName}` : def!.say(v));

  if (plan.time.kind === "career") {
    if (!cat.career?.length) return null;
    const v = (col: string) => cellValue(col, cat.career![cat.columns.indexOf(col) - 2]);
    const games = cellValue("GP", cat.career[cat.columns.indexOf("GP") - 2]);
    const body = def ? say(v(def.col)) : summary.text(v);
    const scope = plan.postseason ? `in ${pronoun(league)} playoff career` : `in ${pronoun(league)} career`;
    return {
      answer: `${name} has ${body.replace(/^(\w+)/, (w) => pastParticiple(w))} ${scope}${games ? ` (${games} games)` : ""}.`,
      subject,
      table: seasonTable(league, cat, cols, title, undefined, true),
      followups,
    };
  }

  const row = pickRow(cat, league, plan.time);
  if (!row) {
    const year = explicitYear(league, plan.time);
    return {
      answer: `${name} has no ${plan.postseason ? "playoff " : ""}stats ${year ? `for ${seasonLabel(league, year)}` : "yet"}.`,
      subject,
      table: seasonTable(league, cat, cols, title),
      followups,
    };
  }
  const v = (col: string) => cellValue(col, cat.rows[row.index][cat.columns.indexOf(col)]);
  const body = def ? say(v(def.col)) : summary.text(v);
  const fellBack = plan.time.kind === "current" && plan.time.explicit && row.year !== currentSeason(league);
  return {
    answer: `${name} ${body} ${whenPhrase(league, row.year, plan.postseason)}.${fellBack ? ` (The ${seasonLabel(league, currentSeason(league))} season hasn't started yet.)` : ""}`,
    subject,
    table: seasonTable(league, cat, cols, title, row.year),
    followups,
  };
}

const PARTICIPLES: Record<string, string> = {
  averaged: "averaged", threw: "thrown", rushed: "rushed", caught: "caught", had: "had", hit: "hit", went: "gone",
  shot: "shot", scored: "scored", ran: "run", completed: "completed", drove: "driven", stole: "stolen", struck: "struck",
  slugged: "slugged", won: "won", pitched: "pitched", was: "been",
};
const pastParticiple = (w: string) => PARTICIPLES[w] ?? w;

// ---------- Game logs ----------

const LOG_NAMES: Record<string, string> = {
  PTS: "points", REB: "rebounds", AST: "assists", STL: "steals", BLK: "blocks", "3PT": "threes", TO: "turnovers",
  passingYards: "passing yards", passingTouchdowns: "passing touchdowns", interceptions: "interceptions",
  rushingYards: "rushing yards", rushingTouchdowns: "rushing touchdowns", receptions: "receptions",
  receivingYards: "receiving yards", receivingTouchdowns: "receiving touchdowns",
  H: "hits", HR: "home runs", RBI: "RBIs", R: "runs", SB: "stolen bases",
  goals: "goals", assists: "assists", points: "points",
};

function countOf(value: string, noun: string) {
  return value === "1" ? `1 ${noun.replace(/s$/, "")}` : `${value} ${noun}`;
}

function num(raw: string | undefined) {
  if (!raw) return NaN;
  return Number(String(raw).split("-")[0].replace(/,/g, ""));
}

async function gameLogAnswer(p: Entity, plan: Plan, n: number, emit: Emit): Promise<FinalAnswer | null> {
  const league = p.league;
  const sport = SPORT_OF[league];
  emit({ type: "step", label: `Reading ${p.name}'s game log` });
  let log: any = await espn.playerGameLog(league, p.id);
  const gamesOf = (l: any) =>
    (l.sections as any[])
      .filter((s) => (plan.postseason ? /postseason/i.test(s.seasonType) : !/preseason/i.test(s.seasonType)))
      .flatMap((s) => s.games as string[][])
      .sort((a, b) => b[0].localeCompare(a[0]));
  let games = gamesOf(log);
  if (!games.length) {
    log = await espn.playerGameLog(league, p.id, currentSeason(league) - 1);
    games = gamesOf(log);
  }
  if (!games.length) return null;
  games = games.slice(0, n);

  const keys: string[] = log.keys;
  const col = (k: string) => {
    const i = keys.indexOf(k);
    return i >= 0 ? i : (log.columns as string[]).indexOf(k);
  };
  const def = plan.stats[sport];
  let wanted: string[] = def?.log && col(def.log) >= 0 ? [def.log] : [];
  if (!wanted.length) {
    const defaults: Record<Sport, string[][]> = {
      basketball: [["PTS", "REB", "AST"]],
      football: [["passingYards", "passingTouchdowns", "interceptions"], ["rushingYards", "rushingTouchdowns"], ["receptions", "receivingYards", "receivingTouchdowns"]],
      baseball: [["H", "HR", "RBI"]],
      hockey: [["goals", "assists", "points"], ["G", "A", "PTS"]],
    };
    wanted = defaults[sport].find((set) => set.every((k) => col(k) >= 0)) ?? [];
  }

  const name = p.name;
  const nice = (k: string) => LOG_NAMES[k] ?? def?.name ?? k;
  const average = sport === "basketball" || !!def?.rate;
  const parts = wanted.map((k) => {
    const vals = games.map((g) => num(g[col(k)])).filter((x) => !Number.isNaN(x));
    const sum = vals.reduce((a, b) => a + b, 0);
    if (n === 1) return countOf(cellValue(k, games[0][col(k)]), nice(k));
    return average ? `${(sum / Math.max(vals.length, 1)).toFixed(1)} ${nice(k)}` : countOf(sum.toLocaleString("en-US"), nice(k));
  });
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  const g = games[0];
  const answer = !list
    ? `Here are ${name}'s last ${games.length} games.`
    : n === 1
      ? `In ${pronoun(league)} last game (${g[0]}, ${g[1]}, ${g[2]}), ${name} had ${list}.`
      : `Over ${pronoun(league)} last ${games.length} games, ${name} ${average ? "averaged" : "had"} ${list}.`;

  return {
    answer,
    subject: { name, subtitle: p.team, image: p.image },
    table: { title: `${name} game log`, columns: log.columns, rows: games },
    followups: [`${name} stats this season`, `${name} last 10 games`, `${name} career stats`],
  };
}

// ---------- Leaderboards ----------

async function leadersAnswer(plan: Plan, emit: Emit): Promise<FinalAnswer | null> {
  const sport = plan.league ? SPORT_OF[plan.league] : SPORT_PRIORITY.find((s) => plan.stats[s]);
  if (!sport) return null;
  const league = plan.league ?? DEFAULT_LEAGUE[sport];
  const def = plan.stats[sport];
  if (!def?.sort) return null;

  const useTotal = sport === "basketball" && plan.total && !!def.sortTotal;
  const sort = useTotal ? def.sortTotal! : def.sort;
  const asc = def.asc ? !/\b(?:highest|worst)\b/.test(plan.wording) : /\b(?:fewest|lowest|least)\b/.test(plan.wording);
  const statName = useTotal ? def.totalName! : def.name;
  let season = explicitYear(league, plan.time);
  const st = plan.postseason ? "postseason" : undefined;

  emit({ type: "step", label: `Ranking ${LEAGUE_LABEL[league]} players by ${statName}` });
  let data: any = await espn.leagueLeaders(league, `${sort}:${asc ? "asc" : "desc"}`, season, st, plan.limit);
  if (data.error) return null;
  if (!data.rows?.length && season === undefined) {
    season = currentSeason(league) - 1;
    data = await espn.leagueLeaders(league, `${sort}:${asc ? "asc" : "desc"}`, season, st, plan.limit);
  }
  if (!data.rows?.length) return null;

  const key = sort.split(".")[1];
  const vi = (data.columns as string[]).indexOf(key);
  const gpi = (data.columns as string[]).findIndex((c) => c === "gamesPlayed" || c === "games");
  const top = data.rows[0];
  const label: string = data.season;
  const ongoing = label === seasonLabel(league, currentSeason(league)) && inProgress(league, currentSeason(league));
  const where = plan.postseason ? `the ${label} playoffs` : label;
  const value = def.id.endsWith("%") ? `${top[vi]}%` : top[vi];
  const verb = asc && !def.asc ? "had the fewest" : ongoing ? "leads" : "led";
  const answer =
    verb === "had the fewest"
      ? `${top[1]} had the fewest ${statName} in ${theLeague(league)} in ${where} with ${value}.`
      : `${top[1]} ${verb} ${theLeague(league)} in ${statName} in ${where}${ongoing ? " so far" : ""} with ${value}.`;

  const popular: Record<Sport, string[]> = {
    basketball: ["pts", "reb", "ast", "3pm"],
    football: ["passYds", "rushYds", "recYds", "sacks"],
    baseball: ["hr", "avg", "era", "k"],
    hockey: ["goals", "hPts", "hAst", "sv%"],
  };
  const others = popular[sport]
    .filter((id) => id !== def.id)
    .slice(0, 2)
    .map((id) => STATS.find((s) => s.id === id)!);
  return {
    answer,
    subject: { name: top[1], subtitle: top[2], image: data.players?.[0]?.image },
    table: {
      title: `${LEAGUE_LABEL[league]} ${statName} leaders, ${where}`,
      columns: ["RANK", "PLAYER", "TEAM", ...(gpi >= 0 ? ["GP"] : []), def.col],
      rows: data.rows.map((r: any[]) => [r[0], r[1], r[2], ...(gpi >= 0 ? [r[gpi]] : []), r[vi]]),
    },
    followups: [`${top[1]} stats ${label}`, ...others.map((o) => `Who led ${theLeague(league)} in ${o.totalName ?? o.name} in ${label}?`)],
  };
}

// ---------- Standings ----------

function shortGroup(name: string) {
  if (/football conference|league$/i.test(name)) return name.split(" ").map((w) => w[0]).join("").toUpperCase();
  return name.replace(/ern conference$/i, "").replace(/ conference$/i, "");
}

async function standingsAnswer(plan: Plan, emit: Emit): Promise<FinalAnswer | null> {
  const league = plan.league!;
  let season = explicitYear(league, plan.time);
  emit({ type: "step", label: `Checking ${LEAGUE_LABEL[league]} standings` });
  let data: any = await espn.standings(league, season);
  // Before a season really gets going (or while only preseason games count), show last season instead.
  const minGames = league === "nfl" || league === "college-football" ? 1 : 3;
  const empty = (d: any) =>
    Math.max(0, ...d.groups.flatMap((g: any) => g.teams.map((t: any) => Number(t.wins) + Number(t.losses)))) < minGames;
  if ((!data.groups.length || empty(data)) && season === undefined) {
    season = currentSeason(league) - 1;
    data = await espn.standings(league, season);
  }
  if (!data.groups.length) return null;
  const year = season ?? currentSeason(league);
  const label = seasonLabel(league, year);
  const ongoing = inProgress(league, year);

  const all = data.groups.flatMap((g: any) => g.teams.map((t: any) => ({ ...t, group: shortGroup(g.group) })));
  const score = (t: any) => (league === "nhl" ? Number(t.points) : Number(t.winPercent));
  const sorted = [...all].sort((a, b) => score(b) - score(a));
  const pick = plan.worst ? sorted.at(-1) : sorted[0];
  const rec = [pick.wins, pick.losses, pick.ties && pick.ties !== "0" ? pick.ties : null, pick.otLosses].filter(Boolean).join("-");
  const answer = `The ${pick.team} ${ongoing ? "have" : "had"} the ${plan.worst ? "worst" : "best"} record in ${theLeague(league)} ${ongoing ? `so far in ${label}` : `in ${label}`} at ${rec}.`;

  const extra = league === "nhl" ? ["otLosses", "points"] : league === "nfl" ? ["ties", "winPercent"] : ["winPercent", "gamesBehind"];
  const heads: Record<string, string> = { otLosses: "OTL", points: "PTS", ties: "T", winPercent: "PCT", gamesBehind: "GB" };
  return {
    answer,
    subject: { name: pick.team },
    table: {
      title: `${LEAGUE_LABEL[league]} standings, ${label}`,
      columns: ["", "TEAM", "W", "L", ...extra.map((e) => heads[e]), "STRK"],
      rows: all.map((t: any) => [t.group, t.team, t.wins, t.losses, ...extra.map((e) => t[e] ?? ""), t.streak ?? ""]),
    },
    followups: [`${pick.team} record ${label}`, `${LEAGUE_LABEL[league]} scores today`],
  };
}

// ---------- Teams ----------

async function teamAnswer(team: Entity, plan: Plan, emit: Emit): Promise<FinalAnswer | null> {
  const league = team.league;
  let season = explicitYear(league, plan.time);
  emit({ type: "step", label: `Loading the ${team.name} schedule` });
  const st = plan.postseason ? "postseason" : undefined;
  let data: any = await espn.teamSchedule(league, team.id, season ?? currentSeason(league), st);
  const done = (d: any) => d.games.filter((g: any) => /^[WL] /.test(g.result ?? ""));
  if (!done(data).length && season === undefined && plan.teamQuery !== "next") {
    season = currentSeason(league) - 1;
    data = await espn.teamSchedule(league, team.id, season, st);
  }
  const year = season ?? currentSeason(league);
  const label = seasonLabel(league, year);
  const played = done(data);
  const subject = { name: team.name, subtitle: LEAGUE_LABEL[league], image: data.image ?? team.image };
  const followups = [`${LEAGUE_LABEL[league]} standings`, `${team.name} last game`, `${team.name} next game`];
  const table = (games: any[], title: string) => ({
    title,
    columns: ["DATE", "OPPONENT", "RESULT"],
    rows: games.map((g) => [g.date, g.opponent, g.result]),
  });

  if (plan.teamQuery === "next") {
    const upcoming = data.games.filter((g: any) => !/^[WL] /.test(g.result ?? ""));
    if (!upcoming.length) return { answer: `The ${team.name} have no upcoming games scheduled.`, subject, followups };
    const g = upcoming[0];
    return {
      answer: `The ${team.name}' next game is ${g.opponent.replace(/^vs /, "vs. ").replace(/^@ /, "at ")} on ${g.date}.`,
      subject,
      table: table(upcoming.slice(0, 5), "Upcoming games"),
      followups,
    };
  }

  if (!played.length) return null;
  if (plan.teamQuery === "last") {
    const g = played.at(-1);
    const [wl, score] = g.result.split(" ");
    const opp = g.opponent.replace(/^(vs|@) /, "");
    return {
      answer: `The ${team.name} ${wl === "W" ? "beat" : "lost to"} ${opp} ${score} on ${g.date}.`,
      subject,
      table: table(played.slice(-10).reverse(), "Recent results"),
      followups,
    };
  }

  const wins = played.filter((g: any) => g.result.startsWith("W")).length;
  const losses = played.length - wins;
  const where = plan.postseason ? `in the ${label} playoffs` : `in ${label}`;
  const ongoing = inProgress(league, year) && !plan.postseason;
  return {
    answer: `The ${team.name} ${ongoing ? "are" : "went"} ${wins}-${losses} ${where}${ongoing ? " so far" : ""}.`,
    subject,
    table: table(played.slice(-15).reverse(), `${team.name} results, ${label}${plan.postseason ? " playoffs" : ""}`),
    followups,
  };
}

// ---------- Comparisons ----------

async function compareAnswer(plan: Plan, emit: Emit): Promise<FinalAnswer | null> {
  const a = await resolveEntity(plan.names[0], plan, emit);
  if (!a || a.type !== "player") return null;
  const b = await resolveEntity(plan.names[1], { ...plan, league: a.league }, emit);
  if (!b || b.type !== "player" || b.league !== a.league) return null;

  const league = a.league;
  const sport = SPORT_OF[league];
  emit({ type: "step", label: `Pulling stats for ${a.name} and ${b.name}` });
  const [da, db]: any[] = await Promise.all([
    espn.playerStats(league, a.id, plan.postseason ? "postseason" : undefined),
    espn.playerStats(league, b.id, plan.postseason ? "postseason" : undefined),
  ]);

  const pos = position(da.player?.positionAbbr);
  const summary = summaryFor(sport, pos, plan.postseason);
  const raw = plan.stats[sport];
  const def = raw && specialize(raw, sport, pos, plan.postseason);
  const wantTotals = !!def && sport === "basketball" && plan.total && !!def.totalName;
  const catsWanted = def ? (wantTotals ? ["totals"] : (def.cats ?? [])) : summary.cats;

  const side = (d: any) => {
    const cats = filterSeasonType(d.categories as Category[], league, plan.postseason);
    const cat = pickCategory(cats, catsWanted, def?.col);
    if (!cat) return null;
    if (plan.time.kind === "career") {
      return { cat, values: cat.career ?? [], offset: 2, label: "career" };
    }
    const row = pickRow(cat, league, plan.time);
    return row ? { cat, values: cat.rows[row.index], offset: 0, label: seasonLabel(league, row.year), year: row.year } : null;
  };
  const sa = side(da);
  const sb = side(db);
  if (!sa || !sb) return null;

  const cols = summary.table ?? sa.cat.columns.slice(2);
  const show = def ? Array.from(new Set([...cols, def.col])) : cols;
  const get = (s: any, col: string) => cellValue(col, s.values[s.cat.columns.indexOf(col) - s.offset]);
  const primary = def?.col ?? summary.primary;
  const say = def ? (v: string) => (wantTotals ? `had ${v} ${def.totalName}` : def.say(v)) : (v: string) => `had ${v} ${primary}`;

  const when =
    plan.time.kind === "career"
      ? "their careers"
      : sa.label === sb.label
        ? `${plan.postseason ? "the " : ""}${sa.label}${plan.postseason ? " playoffs" : ""}`
        : `${sa.label} and ${sb.label} respectively`;
  const textA = def ? say(get(sa, def.col)) : summary.text((c) => get(sa, c));
  const textB = def ? say(get(sb, def.col)) : summary.text((c) => get(sb, c));
  const va = num(get(sa, primary));
  const vb = num(get(sb, primary));
  const aBetter = def?.asc ? va <= vb : va >= vb;
  const leader = aBetter ? da : db;

  return {
    answer: `In ${when}, ${a.name} ${textA}, while ${b.name} ${textB}.`,
    subject: { name: leader.player?.name, subtitle: leader.player?.team, image: leader.player?.image },
    table: {
      title: `${a.name} vs ${b.name}, ${plan.time.kind === "career" ? "career" : sa.label}${plan.postseason ? " playoffs" : ""}`,
      columns: ["PLAYER", ...show],
      rows: [
        [a.name, ...show.map((c) => get(sa, c))],
        [b.name, ...show.map((c) => get(sb, c))],
      ],
    },
    followups: [`${a.name} vs ${b.name} career stats`, `${a.name} last 5 games`, `${b.name} last 5 games`],
  };
}

// ---------- Scoreboard ----------

async function scoresAnswer(plan: Plan, emit: Emit): Promise<FinalAnswer | null> {
  const league = plan.league!;
  const date = plan.date ?? parseDate("today");
  emit({ type: "step", label: `Loading ${LEAGUE_LABEL[league]} scores for ${date.iso}` });
  const data: any = await espn.scoreboard(league, date.iso);
  const games: any[] = data.games ?? [];
  const nice = new Date(`${date.iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  if (!games.length) {
    return { answer: `There ${date.past ? "were" : "are"} no ${LEAGUE_LABEL[league]} games on ${nice}.`, followups: [`${LEAGUE_LABEL[league]} standings`] };
  }
  const rows = games.map((g) => {
    const away = g.teams.find((t: any) => t.homeAway === "away");
    const home = g.teams.find((t: any) => t.homeAway === "home");
    return [away?.team, away?.score ?? "", home?.team, home?.score ?? "", g.status];
  });
  return {
    answer: `There ${games.length === 1 ? (date.past ? "was" : "is") : date.past ? "were" : "are"} ${games.length} ${LEAGUE_LABEL[league]} game${games.length === 1 ? "" : "s"} on ${nice}.`,
    table: { title: `${LEAGUE_LABEL[league]} scoreboard, ${nice}`, columns: ["AWAY", "", "HOME", "", "STATUS"], rows },
    followups: [`${LEAGUE_LABEL[league]} scores yesterday`, `${LEAGUE_LABEL[league]} standings`],
  };
}

// ---------- Entry point ----------

async function execute(plan: Plan, emit: Emit): Promise<FinalAnswer | null> {
  switch (plan.intent) {
    case "standings":
      return standingsAnswer(plan, emit);
    case "scores":
      return scoresAnswer(plan, emit);
    case "leaders":
      return leadersAnswer(plan, emit);
    case "compare":
      return compareAnswer(plan, emit);
    case "entity": {
      const e = await resolveEntity(plan.names[0], plan, emit);
      if (!e) return null;
      if (e.type === "team") return teamAnswer(e, plan, emit);
      if (plan.time.kind === "games") return gameLogAnswer(e, plan, plan.time.n, emit);
      if (plan.teamQuery === "last") return gameLogAnswer(e, plan, 1, emit);
      return playerAnswer(e, plan, emit);
    }
  }
}

/** Answers the question from ESPN data. Returns false if it can't handle the question. */
export async function runLocalAgent(question: string, emit: Emit): Promise<boolean> {
  const plan = parse(question);
  if (!plan) return false;
  try {
    const answer = await execute(plan, emit);
    if (!answer) return false;
    emit({ type: "answer", data: answer });
    return true;
  } catch {
    return false;
  }
}
