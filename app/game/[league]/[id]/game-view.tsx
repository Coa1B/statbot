"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeedGroup, GameData, GameSituation, GameTeam } from "@/lib/game";
import { leagueLogo } from "@/lib/logos";

const LIVE_REFRESH_MS = 15_000;
const PRE_REFRESH_MS = 60_000;

type Tab = "gamecast" | "box" | "team";

function easternTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function chipLabel(sport: string, period: string) {
  const n = Number(period);
  if (sport === "baseball") return ["1st", "2nd", "3rd"][n - 1] ?? `${n}th`;
  if (sport === "hockey") return n <= 3 ? `P${n}` : n === 4 ? "OT" : "SO";
  return n <= 4 ? `Q${n}` : n === 5 ? "OT" : `${n - 4}OT`;
}

export default function GameView({ initial }: { initial: GameData }) {
  const [game, setGame] = useState(initial);
  const [tab, setTab] = useState<Tab>("gamecast");

  useEffect(() => {
    if (game.state === "post") return;
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/game/${game.league}/${game.id}`, { cache: "no-store" });
        if (res.ok && !cancelled) setGame(await res.json());
      } catch {
        // Keep the last snapshot; the next tick retries.
      }
    };
    const timer = setInterval(refresh, game.state === "in" ? LIVE_REFRESH_MS : PRE_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [game.league, game.id, game.state]);

  const teamsById = useMemo(() => Object.fromEntries(game.teams.map((t) => [t.id, t])), [game.teams]);
  const tabs: [Tab, string][] = [
    ["gamecast", "Gamecast"],
    ["box", "Box Score"],
    ...(game.teamStats.length ? ([["team", "Team Stats"]] as [Tab, string][]) : []),
  ];

  return (
    <div className="site">
      <header className="nav">
        <div className="container nav-inner">
          <a className="brand" href="/">
            <span className="brand-mark" />
            StatBot
          </a>
          <form className="search search-compact" action="/">
            <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input name="q" placeholder="Search stats" aria-label="Ask a sports stats question" />
          </form>
        </div>
      </header>

      <main>
        <Scoreboard game={game} />

        <div className="container">
          <nav className="game-tabs" role="tablist">
            {tabs.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
            {game.state === "in" && (
              <span className="game-tabs-live">
                <span className="live-dot" /> Live · updates every 15s
              </span>
            )}
          </nav>

          {tab === "gamecast" && <Gamecast game={game} teamsById={teamsById} />}
          {tab === "box" && <BoxScore game={game} />}
          {tab === "team" && <TeamStats game={game} />}
        </div>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <span className="brand small">
            <span className="brand-mark" />
            StatBot
          </span>
          <span className="muted">Data from ESPN. Live data can lag the broadcast.</span>
        </div>
      </footer>
    </div>
  );
}

function Scoreboard({ game }: { game: GameData }) {
  const [away, home] = game.teams;
  const showScores = game.state !== "pre";
  const side = (t: GameTeam, align: "left" | "right") => {
    const lost = game.state === "post" && !t.winner;
    return (
      <div className={`sb-team ${align} ${lost ? "lost" : ""}`}>
        {t.logo && <img src={t.logo} alt="" />}
        <div className="sb-team-text">
          <span className="sb-team-name">{t.shortName}</span>
          <span className="muted">{t.record}</span>
        </div>
        {showScores && <span className="sb-score">{t.score}</span>}
      </div>
    );
  };

  return (
    <section className="sb-band">
      <div className="container">
        <div className="sb-league">
          <img className="league-logo" src={leagueLogo(game.league)} alt="" />
          {game.league.toUpperCase()}
          {game.venue && <span className="muted"> · {game.venue}</span>}
        </div>
        <div className="sb-main">
          {side(away, "left")}
          <div className={`sb-status ${game.state}`}>
            {game.state === "in" && <span className="live-dot" />}
            {game.state === "pre" ? easternTime(game.date) + " ET" : game.status}
          </div>
          {side(home, "right")}
        </div>

        {game.periods.length > 0 && (
          <div className="table-scroll sb-lines">
            <table>
              <thead>
                <tr>
                  <th className="text" />
                  {game.periods.map((p, i) => (
                    <th key={i}>{p}</th>
                  ))}
                  {game.extraLabels.map((l) => (
                    <th key={l} className="sb-extra">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {game.teams.map((t) => (
                  <tr key={t.id}>
                    <td className="text sb-lines-team">
                      {t.logo && <img src={t.logo} alt="" />}
                      {t.abbr}
                    </td>
                    {game.periods.map((_, i) => (
                      <td key={i}>{t.linescores[i] ?? ""}</td>
                    ))}
                    {t.extra.map((v, i) => (
                      <td key={i} className="sb-extra">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Gamecast({ game, teamsById }: { game: GameData; teamsById: Record<string, GameTeam> }) {
  const hasSide = !!game.situation || !!game.lastPlay || (game.winProbability?.length ?? 0) > 1;
  return (
    <div className={`gamecast ${hasSide ? "" : "single"}`}>
      {hasSide && (
        <div className="gamecast-side">
          {game.situation && game.sport === "baseball" && <Diamond s={game.situation} />}
          {game.situation && game.sport === "football" && <Field s={game.situation} teamsById={teamsById} teams={game.teams} />}
          {game.lastPlay && (
            <div className="gc-card">
              <h3 className="gc-title">Last play</h3>
              <p className="gc-last">{game.lastPlay}</p>
            </div>
          )}
          {(game.winProbability?.length ?? 0) > 1 && <WinProbability game={game} />}
        </div>
      )}
      <PlayByPlay game={game} teamsById={teamsById} />
    </div>
  );
}

function Diamond({ s }: { s: GameSituation }) {
  const [first, second, third] = s.bases ?? [false, false, false];
  const dots = (n: number, max: number, cls: string) =>
    Array.from({ length: max }, (_, i) => <span key={i} className={`count-dot ${i < n ? cls : ""}`} />);
  return (
    <div className="gc-card">
      <div className="diamond-row">
        <svg className="diamond" viewBox="0 0 120 90" aria-label="Bases">
          {[
            [60, 14, second],
            [96, 48, first],
            [24, 48, third],
          ].map(([x, y, on], i) => (
            <rect
              key={i}
              x={(x as number) - 13}
              y={(y as number) - 13}
              width="26"
              height="26"
              transform={`rotate(45 ${x} ${y})`}
              className={on ? "base on" : "base"}
            />
          ))}
          <rect x="51" y="70" width="18" height="18" transform="rotate(45 60 79)" className="base home" />
        </svg>
        <div className="count">
          <div>
            <span>B</span>
            {dots(s.balls ?? 0, 3, "ball")}
          </div>
          <div>
            <span>S</span>
            {dots(s.strikes ?? 0, 2, "strike")}
          </div>
          <div>
            <span>O</span>
            {dots(s.outs ?? 0, 2, "out")}
          </div>
        </div>
      </div>
      <div className="matchup">
        {[
          ["Pitching", s.pitcher],
          ["At bat", s.batter],
        ].map(([label, p]: any) =>
          p ? (
            <a key={label} className="matchup-player" href={`/?q=${encodeURIComponent(`${p.name} stats this season`)}`}>
              {p.image ? <img src={p.image} alt="" /> : <span className="live-headshot" />}
              <span>
                <span className="muted matchup-label">{label}</span>
                <span className="matchup-name">{p.name}</span>
                {p.line && <span className="muted matchup-line">{p.line}</span>}
              </span>
            </a>
          ) : null,
        )}
      </div>
      {s.note && <p className="muted gc-note">{s.note}</p>}
    </div>
  );
}

function Field({ s, teams, teamsById }: { s: GameSituation; teams: GameTeam[]; teamsById: Record<string, GameTeam> }) {
  const offense = s.possession ? teamsById[s.possession] : undefined;
  const defense = teams.find((t) => t.id !== offense?.id);
  return (
    <div className="gc-card">
      <div className="field-head">
        {offense?.logo && <img src={offense.logo} alt="" />}
        <strong>{offense?.abbr ?? ""} ball</strong>
        {s.downDistance && <span className={s.redZone ? "red-zone" : "muted"}>{s.downDistance}</span>}
      </div>
      <div className="field" aria-label="Field position">
        <div className="endzone" style={{ background: offense?.color }}>
          {offense?.abbr}
        </div>
        <div className="field-play">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="yard-line" style={{ left: `${(i + 1) * 10}%` }}>
              {[10, 20, 30, 40, 50, 40, 30, 20, 10][i]}
            </span>
          ))}
          {s.toGain !== undefined && <span className="to-gain" style={{ left: `${s.toGain}%` }} />}
          {s.ballOn !== undefined && <span className="field-ball" style={{ left: `${s.ballOn}%` }} />}
        </div>
        <div className="endzone" style={{ background: defense?.color }}>
          {defense?.abbr}
        </div>
      </div>
      <p className="muted gc-note">{offense?.abbr ?? "Offense"} driving →</p>
    </div>
  );
}

function WinProbability({ game }: { game: GameData }) {
  const wp = game.winProbability ?? [];
  const [away, home] = game.teams;
  const W = 300;
  const H = 120;
  // Away team at the top, like ESPN: y = 0 means a 100% away win chance.
  const points = wp.map((h, i) => `${((i / (wp.length - 1)) * W).toFixed(1)},${(h * H).toFixed(1)}`).join(" ");
  const last = wp.at(-1) ?? 0.5;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <div className="gc-card">
      <h3 className="gc-title">Win probability</h3>
      <div className="wp-legend">
        <span>
          {away.logo && <img src={away.logo} alt="" />}
          {away.abbr} <strong>{pct(1 - last)}</strong>
        </span>
        <span>
          {home.logo && <img src={home.logo} alt="" />}
          {home.abbr} <strong>{pct(last)}</strong>
        </span>
      </div>
      <svg className="wp-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Win probability over the game">
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="wp-mid" />
        <polyline points={points} className="wp-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="wp-axis muted">
        <span>▲ {away.abbr} favored</span>
        <span>▼ {home.abbr} favored</span>
      </div>
    </div>
  );
}

function PlayByPlay({ game, teamsById }: { game: GameData; teamsById: Record<string, GameTeam> }) {
  const periods = useMemo(() => [...new Set(game.feed.map((g) => g.period))].sort((a, b) => Number(a) - Number(b)), [game.feed]);
  const [period, setPeriod] = useState<string>("latest");
  const active = period === "latest" ? periods.at(-1) : period;
  const groups: FeedGroup[] = period === "all" ? game.feed : game.feed.filter((g) => g.period === active);
  const showScore = game.sport === "basketball" || game.sport === "hockey";

  if (!game.feed.length) {
    return (
      <div className="gc-card pbp">
        <h3 className="gc-title">Play-by-play</h3>
        <p className="muted">{game.state === "pre" ? "Plays will appear here once the game starts." : "No plays available yet."}</p>
      </div>
    );
  }

  return (
    <div className="gc-card pbp">
      <div className="pbp-head">
        <h3 className="gc-title">Play-by-play</h3>
        <div className="chips">
          {periods.map((p) => (
            <button key={p} className={active === p && period !== "all" ? "active" : ""} onClick={() => setPeriod(p)}>
              {chipLabel(game.sport, p)}
            </button>
          ))}
          <button className={period === "all" ? "active" : ""} onClick={() => setPeriod("all")}>
            All
          </button>
        </div>
      </div>
      {groups.map((g) => {
        const team = g.teamId ? teamsById[g.teamId] : undefined;
        return (
          <section key={g.key} className="pbp-group">
            <header className="pbp-group-head">
              {game.sport === "football" && team?.logo && <img src={team.logo} alt="" />}
              <span className="pbp-group-title">{g.title}</span>
              {g.subtitle && <span className="muted">{g.subtitle}</span>}
            </header>
            <ol className="pbp-list">
              {g.items.map((item) => {
                const t = item.teamId ? teamsById[item.teamId] : undefined;
                return (
                  <li key={item.id} className={item.scoring ? "scoring" : ""}>
                    {item.clock && <span className="pbp-clock">{item.clock}</span>}
                    <span className="pbp-logo">{t?.logo && <img src={t.logo} alt="" />}</span>
                    <span className="pbp-text">
                      {game.sport === "football" && item.detail && <span className="muted pbp-down">{item.detail[0]}</span>}
                      {item.text}
                      {game.sport === "hockey" && item.detail && <span className="muted"> · {item.detail[0]}</span>}
                      {game.sport === "baseball" && item.detail?.length ? (
                        <details className="pbp-pitches">
                          <summary>
                            {item.detail.length} pitch{item.detail.length === 1 ? "" : "es"}
                          </summary>
                          <ol>
                            {item.detail.map((d, i) => (
                              <li key={i}>{d.replace(/^Pitch \d+ : /, "")}</li>
                            ))}
                          </ol>
                        </details>
                      ) : null}
                    </span>
                    {(showScore || item.scoring) && item.score && <span className="pbp-score">{item.score}</span>}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function BoxScore({ game }: { game: GameData }) {
  const [teamId, setTeamId] = useState(game.teams[0]?.id);
  const box = game.boxscore.find((b) => b.teamId === teamId);
  if (!game.boxscore.length) {
    return <p className="muted box-empty">The box score will be available once the game starts.</p>;
  }
  return (
    <div className="box">
      <div className="box-teams" role="tablist">
        {game.teams.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === teamId} className={t.id === teamId ? "active" : ""} onClick={() => setTeamId(t.id)}>
            {t.logo && <img src={t.logo} alt="" />}
            {t.name}
          </button>
        ))}
      </div>
      {box?.tables.map((table) => (
        <section key={table.title} className="box-table">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="text box-player">{table.title}</th>
                  {table.columns.map((c, i) => (
                    <th key={i}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="text box-player">
                      <a href={`/?q=${encodeURIComponent(`${r.name} last game`)}`}>{r.name}</a>
                      {r.position && <span className="muted"> {r.position}</span>}
                    </td>
                    {r.note ? (
                      <td colSpan={table.columns.length} className="text muted box-note">
                        {r.note}
                      </td>
                    ) : (
                      r.stats.map((v, i) => <td key={i}>{v}</td>)
                    )}
                  </tr>
                ))}
                {table.totals && table.totals.some(Boolean) && (
                  <tr className="total">
                    <td className="text box-player">Team</td>
                    {table.totals.map((v, i) => (
                      <td key={i}>{v}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function TeamStats({ game }: { game: GameData }) {
  const [away, home] = game.teams;
  return (
    <div className="team-stats">
      <div className="team-stats-head">
        <span>
          {away.logo && <img src={away.logo} alt="" />}
          {away.abbr}
        </span>
        <span>
          {home.abbr}
          {home.logo && <img src={home.logo} alt="" />}
        </span>
      </div>
      {game.teamStats.map((s) => {
        const plain = s.values.every((v) => /^-?[\d.]+%?$/.test(String(v)));
        const [a, h] = s.values.map((v) => parseFloat(String(v)));
        const share = plain && a >= 0 && h >= 0 && a + h > 0 ? a / (a + h) : undefined;
        return (
          <div key={s.label} className="team-stat">
            <span className="team-stat-value">{s.values[0]}</span>
            <span className="team-stat-label">
              {s.label}
              {share !== undefined && (
                <span className="team-stat-bar">
                  <span style={{ width: `${share * 100}%`, background: away.color }} />
                  <span style={{ width: `${(1 - share) * 100}%`, background: home.color }} />
                </span>
              )}
            </span>
            <span className="team-stat-value">{s.values[1]}</span>
          </div>
        );
      })}
    </div>
  );
}
