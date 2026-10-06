export type Sport = "basketball" | "football" | "baseball" | "hockey";

export type StatDef = {
  id: string;
  sport: Sport;
  re: RegExp;
  /** Plural noun used in sentences, e.g. "points per game", "home runs". */
  name: string;
  /** Column label in the player season-stats tables. */
  col: string;
  /** Category keys (prefix match) to read `col` from; any category if omitted. */
  cats?: string[];
  /** Key (or label) in the game-log table. */
  log?: string;
  /** Leaderboard sort key ("category.stat"). For basketball this is the per-game version. */
  sort?: string;
  sortTotal?: string;
  totalName?: string;
  /** Lower is better (ERA, WHIP, GAA). */
  asc?: boolean;
  /** Rate stats are averaged, not summed, and have no "total" form. */
  rate?: boolean;
  say: (v: string) => string;
};

const pct = (v: string) => (v.includes("%") ? v : `${v}%`);

export const STATS: StatDef[] = [
  // Basketball. Order matters: specific phrases before generic ones.
  { id: "3p%", sport: "basketball", re: /\b(?:3|three)[- ]?(?:point|pt)?(?: field goal)?s? ?(?:percentage|pct|%)|3p%|\b3pt%/, name: "3-point percentage", col: "3P%", cats: ["averages"], log: "3P%", sort: "offensive.threePointFieldGoalPct", rate: true, say: (v) => `shot ${pct(v)} from three` },
  { id: "fg%", sport: "basketball", re: /\bfield goal (?:percentage|pct|%)|\bfg ?%|\bfg pct/, name: "field goal percentage", col: "FG%", cats: ["averages"], log: "FG%", sort: "offensive.fieldGoalPct", rate: true, say: (v) => `shot ${pct(v)} from the field` },
  { id: "ft%", sport: "basketball", re: /\bfree throw (?:percentage|pct|%)|\bft ?%|\bft pct/, name: "free throw percentage", col: "FT%", cats: ["averages"], log: "FT%", sort: "offensive.freeThrowPct", rate: true, say: (v) => `shot ${pct(v)} from the free-throw line` },
  { id: "td3", sport: "basketball", re: /\btriple[- ]doubles?\b/, name: "triple-doubles", col: "TD3", cats: ["miscellaneous"], sort: "general.tripleDouble", say: (v) => `had ${v} triple-doubles` },
  { id: "dd2", sport: "basketball", re: /\bdouble[- ]doubles?\b/, name: "double-doubles", col: "DD2", cats: ["miscellaneous"], sort: "general.doubleDouble", say: (v) => `had ${v} double-doubles` },
  { id: "3pm", sport: "basketball", re: /\b(?:threes|3s|3pm|3pt|three[- ]pointers?|3[- ]pointers?|triples)(?: made)?\b/, name: "threes per game", totalName: "threes", col: "3PT", cats: ["averages"], log: "3PT", sort: "offensive.avgThreePointFieldGoalsMade", sortTotal: "offensive.threePointFieldGoalsMade", say: (v) => `averaged ${v} threes per game` },
  { id: "pts", sport: "basketball", re: /\b(?:points?|pts|ppg|scoring|scored|scorers?)\b/, name: "points per game", totalName: "points", col: "PTS", cats: ["averages"], log: "PTS", sort: "offensive.avgPoints", sortTotal: "offensive.points", say: (v) => `averaged ${v} points per game` },
  { id: "reb", sport: "basketball", re: /\b(?:rebounds?|rebounding|rebounders?|reb|rpg|boards)\b/, name: "rebounds per game", totalName: "rebounds", col: "REB", cats: ["averages"], log: "REB", sort: "general.avgRebounds", sortTotal: "general.rebounds", say: (v) => `averaged ${v} rebounds per game` },
  { id: "ast", sport: "basketball", re: /\b(?:assists?|ast|apg|dimes)\b/, name: "assists per game", totalName: "assists", col: "AST", cats: ["averages"], log: "AST", sort: "offensive.avgAssists", sortTotal: "offensive.assists", say: (v) => `averaged ${v} assists per game` },
  { id: "stl", sport: "basketball", re: /\b(?:steals?|stl|spg)\b/, name: "steals per game", totalName: "steals", col: "STL", cats: ["averages"], log: "STL", sort: "defensive.avgSteals", sortTotal: "defensive.steals", say: (v) => `averaged ${v} steals per game` },
  { id: "blk", sport: "basketball", re: /\b(?:blocks?|blk|bpg|blocked shots)\b/, name: "blocks per game", totalName: "blocks", col: "BLK", cats: ["averages"], log: "BLK", sort: "defensive.avgBlocks", sortTotal: "defensive.blocks", say: (v) => `averaged ${v} blocks per game` },
  { id: "tov", sport: "basketball", re: /\b(?:turnovers?|tov)\b/, name: "turnovers per game", totalName: "turnovers", col: "TO", cats: ["averages"], log: "TO", sort: "offensive.avgTurnovers", sortTotal: "offensive.turnovers", say: (v) => `averaged ${v} turnovers per game` },
  { id: "min", sport: "basketball", re: /\b(?:minutes|mpg)\b/, name: "minutes per game", totalName: "minutes", col: "MIN", cats: ["averages"], log: "MIN", sort: "general.avgMinutes", sortTotal: "general.minutes", say: (v) => `averaged ${v} minutes per game` },

  // Football
  { id: "passTd", sport: "football", re: /\b(?:passing|pass|throwing) (?:touchdowns?|tds?)\b|\b(?:td|touchdown) passes\b/, name: "passing touchdowns", col: "TD", cats: ["passing"], log: "passingTouchdowns", sort: "passing.passingTouchdowns", say: (v) => `threw ${v} touchdown passes` },
  { id: "passYds", sport: "football", re: /\b(?:passing|pass|throwing) (?:yards|yds)\b|\byards passing\b/, name: "passing yards", col: "YDS", cats: ["passing"], log: "passingYards", sort: "passing.passingYards", say: (v) => `threw for ${v} yards` },
  { id: "intThrown", sport: "football", re: /\b(?:interceptions|picks|ints) thrown\b/, name: "interceptions thrown", col: "INT", cats: ["passing"], log: "interceptions", sort: "passing.interceptions", say: (v) => `threw ${v} interceptions` },
  { id: "rating", sport: "football", re: /\b(?:passer|qb|quarterback) rating\b/, name: "passer rating", col: "RTG", cats: ["passing"], log: "QBRating", sort: "passing.QBRating", rate: true, say: (v) => `had a ${v} passer rating` },
  { id: "qbr", sport: "football", re: /\bqbr\b/, name: "QBR", col: "QBR", cats: ["passing"], log: "adjQBR", sort: "passing.QBR", rate: true, say: (v) => `had a ${v} QBR` },
  { id: "cmp%", sport: "football", re: /\bcompletion (?:percentage|pct|%)|\bcmp ?%/, name: "completion percentage", col: "CMP%", cats: ["passing"], log: "completionPct", sort: "passing.completionPct", rate: true, say: (v) => `completed ${pct(v)} of his passes` },
  { id: "rushTd", sport: "football", re: /\b(?:rushing|rush) (?:touchdowns?|tds?)\b/, name: "rushing touchdowns", col: "TD", cats: ["rushing"], log: "rushingTouchdowns", sort: "rushing.rushingTouchdowns", say: (v) => `ran for ${v} touchdowns` },
  { id: "rushYds", sport: "football", re: /\b(?:rushing|rush) (?:yards|yds)\b|\byards rushing\b/, name: "rushing yards", col: "YDS", cats: ["rushing"], log: "rushingYards", sort: "rushing.rushingYards", say: (v) => `rushed for ${v} yards` },
  { id: "recTd", sport: "football", re: /\b(?:receiving) (?:touchdowns?|tds?)\b|\b(?:td|touchdown) catches\b/, name: "receiving touchdowns", col: "TD", cats: ["receiving"], log: "receivingTouchdowns", sort: "receiving.receivingTouchdowns", say: (v) => `caught ${v} touchdowns` },
  { id: "recYds", sport: "football", re: /\breceiving (?:yards|yds)\b|\byards receiving\b/, name: "receiving yards", col: "YDS", cats: ["receiving"], log: "receivingYards", sort: "receiving.receivingYards", say: (v) => `had ${v} receiving yards` },
  { id: "rec", sport: "football", re: /\b(?:receptions|catches)\b/, name: "receptions", col: "REC", cats: ["receiving"], log: "receptions", sort: "receiving.receptions", say: (v) => `caught ${v} passes` },
  { id: "sacks", sport: "football", re: /\bsacks\b/, name: "sacks", col: "SACK", cats: ["defensive"], sort: "defensive.sacks", say: (v) => `had ${v} sacks` },
  { id: "tackles", sport: "football", re: /\btackles\b/, name: "tackles", col: "TOT", cats: ["defensive"], sort: "defensive.totalTackles", say: (v) => `had ${v} tackles` },
  { id: "defInt", sport: "football", re: /\b(?:interceptions|picks|ints)\b/, name: "interceptions", col: "INT", cats: ["defensive"], sort: "defensiveinterceptions.interceptions", say: (v) => `had ${v} interceptions` },
  { id: "td", sport: "football", re: /\b(?:touchdowns|tds)\b/, name: "touchdowns", col: "TD", cats: ["scoring"], sort: "scoring.totalTouchdowns", say: (v) => `scored ${v} touchdowns` },
  { id: "yds", sport: "football", re: /\byards\b/, name: "yards", col: "YDS", sort: "passing.passingYards", say: (v) => `had ${v} yards` },

  // Baseball
  { id: "rbi", sport: "baseball", re: /\b(?:rbis?|runs batted in)\b/, name: "RBIs", col: "RBI", cats: ["career-batting", "postseason-batting"], log: "RBI", sort: "batting.RBIs", say: (v) => `drove in ${v} runs` },
  { id: "hr", sport: "baseball", re: /\b(?:home ?runs?|homers?|hrs?|dingers|bombs)\b/, name: "home runs", col: "HR", cats: ["career-batting", "postseason-batting"], log: "HR", sort: "batting.homeRuns", say: (v) => `hit ${v} home runs` },
  { id: "avg", sport: "baseball", re: /\bbatting average\b|\bbatting avg\b|\bavg\b/, name: "batting average", col: "AVG", cats: ["career-batting", "postseason-batting"], log: "AVG", sort: "batting.avg", rate: true, say: (v) => `hit ${v}` },
  { id: "ops", sport: "baseball", re: /\bops\b/, name: "OPS", col: "OPS", cats: ["career-batting", "postseason-batting"], log: "OPS", sort: "batting.OPS", rate: true, say: (v) => `had a ${v} OPS` },
  { id: "obp", sport: "baseball", re: /\bon[- ]base (?:percentage|pct)\b|\bobp\b/, name: "on-base percentage", col: "OBP", cats: ["career-batting", "postseason-batting"], log: "OBP", sort: "batting.onBasePct", rate: true, say: (v) => `had a ${v} on-base percentage` },
  { id: "slg", sport: "baseball", re: /\bslugging(?: percentage)?\b|\bslg\b/, name: "slugging percentage", col: "SLG", cats: ["career-batting", "postseason-batting"], log: "SLG", sort: "batting.slugAvg", rate: true, say: (v) => `slugged ${v}` },
  { id: "sb", sport: "baseball", re: /\b(?:stolen bases|steals|sbs?)\b/, name: "stolen bases", col: "SB", cats: ["career-batting", "postseason-batting"], log: "SB", sort: "batting.stolenBases", say: (v) => `stole ${v} bases` },
  { id: "era", sport: "baseball", re: /\b(?:era|earned run average)\b/, name: "ERA", col: "ERA", cats: ["pitching", "postseason-pitching"], sort: "pitching.ERA", asc: true, rate: true, say: (v) => `had a ${v} ERA` },
  { id: "whip", sport: "baseball", re: /\bwhip\b/, name: "WHIP", col: "WHIP", cats: ["pitching", "postseason-pitching"], sort: "pitching.WHIP", asc: true, rate: true, say: (v) => `had a ${v} WHIP` },
  { id: "k", sport: "baseball", re: /\b(?:strikeouts?|strike outs|ks|k's)\b/, name: "strikeouts", col: "K", cats: ["pitching", "postseason-pitching"], sort: "pitching.strikeouts", say: (v) => `struck out ${v} batters` },
  { id: "saves", sport: "baseball", re: /\bsaves\b/, name: "saves", col: "SV", cats: ["pitching", "postseason-pitching"], sort: "pitching.saves", say: (v) => `had ${v} saves` },
  { id: "wins", sport: "baseball", re: /\bwins\b/, name: "wins", col: "W", cats: ["pitching", "postseason-pitching"], sort: "pitching.wins", say: (v) => `won ${v} games` },
  { id: "ip", sport: "baseball", re: /\binnings(?: pitched)?\b/, name: "innings pitched", col: "IP", cats: ["pitching", "postseason-pitching"], sort: "pitching.innings", say: (v) => `pitched ${v} innings` },
  { id: "hits", sport: "baseball", re: /\bhits\b/, name: "hits", col: "H", cats: ["career-batting", "postseason-batting"], log: "H", sort: "batting.hits", say: (v) => `had ${v} hits` },
  { id: "runs", sport: "baseball", re: /\bruns(?: scored)?\b/, name: "runs", col: "R", cats: ["career-batting", "postseason-batting"], log: "R", sort: "batting.runs", say: (v) => `scored ${v} runs` },
  { id: "war", sport: "baseball", re: /\bwar\b/, name: "WAR", col: "WAR", cats: ["career-batting", "pitching"], sort: "batting.WARBR", rate: true, say: (v) => `was worth ${v} WAR` },

  // Hockey
  { id: "gaa", sport: "hockey", re: /\b(?:gaa|goals against average)\b/, name: "goals-against average", col: "GAA", sort: "defensive.avgGoalsAgainst", asc: true, rate: true, say: (v) => `had a ${v} goals-against average` },
  { id: "sv%", sport: "hockey", re: /\bsave (?:percentage|pct|%)|\bsv ?%/, name: "save percentage", col: "SV%", sort: "defensive.savePct", rate: true, say: (v) => `had a ${v} save percentage` },
  { id: "shutouts", sport: "hockey", re: /\bshutouts\b/, name: "shutouts", col: "SO", sort: "defensive.shutouts", say: (v) => `had ${v} shutouts` },
  { id: "ppg", sport: "hockey", re: /\bpower[- ]play goals\b|\bppg\b/, name: "power-play goals", col: "PPG", sort: "offensive.powerPlayGoals", say: (v) => `scored ${v} power-play goals` },
  { id: "goals", sport: "hockey", re: /\bgoals\b/, name: "goals", col: "G", log: "goals", sort: "offensive.goals", say: (v) => `scored ${v} goals` },
  { id: "hAst", sport: "hockey", re: /\bassists?\b/, name: "assists", col: "A", log: "assists", sort: "offensive.assists", say: (v) => `had ${v} assists` },
  { id: "hPts", sport: "hockey", re: /\b(?:points|pts)\b/, name: "points", col: "PTS", log: "points", sort: "offensive.points", say: (v) => `had ${v} points` },
  { id: "pm", sport: "hockey", re: /\bplus[- \/]?minus\b|\+\/-/, name: "plus-minus", col: "+/-", log: "plusMinus", sort: "general.plusMinus", say: (v) => `was a ${v.startsWith("-") ? v : `+${v}`}` },
  { id: "sog", sport: "hockey", re: /\bshots(?: on goal)?\b/, name: "shots on goal", col: "SOG", sort: "offensive.shotsTotal", say: (v) => `had ${v} shots on goal` },
  { id: "pim", sport: "hockey", re: /\bpenalty minutes\b|\bpim\b/, name: "penalty minutes", col: "PIM", sort: "penalties.penaltyMinutes", say: (v) => `had ${v} penalty minutes` },
  { id: "hWins", sport: "hockey", re: /\bwins\b/, name: "wins", col: "WINS", sort: "general.wins", say: (v) => `won ${v} games` },
];

export const SPORT_PRIORITY: Sport[] = ["basketball", "football", "baseball", "hockey"];
