# StatBot

A sports stats search engine in the style of StatMuse. Ask a question in plain English, like *"Jokic vs Embiid rebounds 2025-26"*, and get a one-sentence answer with a supporting stats table, built from live ESPN data.

Beyond search, the home page shows today's scores, games in progress and league leaders, and every game has its own page with a live Gamecast and ESPN-style box score.

Covers the NBA, WNBA, NFL, MLB, NHL, college football and men's college basketball.

## Getting started

Requires Node.js 20.9 or later.

```bash
npm install
npm run dev
```

Then open http://localhost:3000. No API keys or accounts are needed.

To run a production build:

```bash
npm run build
npm start
```

## Search

Questions are answered by a rule-based parser (`lib/local-agent.ts`). It picks out the league, player or team, stat, season and question type, looks the data up on ESPN, and writes the answer from templates. No AI service is involved, so answers are fast, free and repeatable.

| Question type | Examples |
| --- | --- |
| Player stats | `LeBron James stats last season`, `Steph Curry 3s per game in the playoffs 2025`, `Gerrit Cole ERA 2024`, `Steph Curry career stats` |
| Recent games | `SGA last 5 games`, `Christian McCaffrey last game` |
| Leaderboards | `who led the NBA in assists in 2025-26`, `most rushing yards nfl`, `lowest whip mlb 2025`, `top 5 scorers nba last season` |
| Comparisons | `Jokic vs Embiid rebounds 2025-26`, `who had more home runs judge or ohtani 2025` |
| Teams | `Lakers record 2025-26`, `Chiefs last game`, `Chiefs next game` |
| Standings and scores | `NHL standings last season`, `NFL scores yesterday` |

Questions it can't answer reliably, such as single-game records, career highs or splits against a specific opponent, get a short message with example questions instead of a guess.

Searches are shareable: the question is kept in the URL as `?q=`.

### Teaching it new stats

Stat names, synonyms and their ESPN fields live in `lib/stat-defs.ts`, one line per stat. Add a line there to make a new stat searchable.

## Home page

- **Today**: a strip of today's NFL, MLB, NBA and NHL games with scores and start times. Each game links to its game page.
- **Live now**: a scoreboard row for every game in progress (NFL, MLB, NBA, WNBA, NHL) with the status, team records, the score by period (R/H/E for baseball) and a detail panel: the current pitcher and batter for baseball, each team's leading scorer for basketball, the passing, rushing and receiving leaders for football, and the most recent play for hockey (or whenever the others aren't available). It refreshes every 30 seconds while the tab is open.
- **League leaders**: three leaderboards per sport, with headshots and team logos. Click a board to run that question, or a player to see their stats.

## Game pages

Every game has a page at `/game/<league>/<espn-event-id>`, for example `/game/mlb/401908015`. While a game is live, the page refreshes every 15 seconds.

- **Scoreboard**: score, status and the line score by period or inning (with R/H/E for baseball).
- **Gamecast**:
  - Baseball: a base diamond with runners, the ball/strike/out count and the current pitcher vs batter with their lines for the game.
  - Football: a field with the ball spot, line to gain and down and distance.
  - All sports: the last play, a win probability chart (when ESPN provides one) and play-by-play filtered by period. Baseball at-bats expand to show every pitch; football plays are grouped by drive.
- **Box Score**: ESPN-style player tables for each team: starters and bench (basketball), batting and pitching (baseball), passing, rushing, receiving, defense and kicking (football), forwards, defense and goalies (hockey).
- **Team Stats**: both teams' totals side by side with comparison bars (not available for baseball).

## Project structure

```
app/
  page.tsx                      Home page (server): loads scores, leaders and live games
  statbot.tsx                   Home page and search UI (client)
  layout.tsx, globals.css       Root layout and all styles
  game/[league]/[id]/
    page.tsx                    Game page (server)
    game-view.tsx               Scoreboard, Gamecast, Box Score and Team Stats (client)
  api/
    ask/route.ts                Search: streams progress steps and the answer as NDJSON
    live/route.ts               Live games, polled by the home page
    game/[league]/[id]/route.ts A game's full data, polled by the game page
lib/
  local-agent.ts                Question parser and answer templates
  stat-defs.ts                  Stat names, synonyms and ESPN fields
  espn.ts                       ESPN lookups: search, stats, game logs, leaders, standings, scoreboards, schedules
  home.ts                       Home page data (today's games, leaderboards)
  live.ts                       Live games and in-game leaders
  game.ts                       Game page data (box score, play-by-play, situation, win probability)
  logos.ts                      ESPN league and team logo URLs
  types.ts                      Shared answer and event types
```

## Data and caching

All data comes from ESPN's public site APIs. The server caches responses so that many visitors don't multiply requests to ESPN: about 5 minutes for stats and leaderboards, 15 seconds for live games and 10 seconds for game pages.

ESPN's endpoints are unofficial and undocumented, so they can change or break without notice. Answers are generated automatically and may contain mistakes.

## Built with

[Next.js 16](https://nextjs.org) (App Router), React 19 and TypeScript, with no other runtime dependencies.
