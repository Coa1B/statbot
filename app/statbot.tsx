"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, FinalAnswer } from "@/lib/types";
import type { HomeBoard, HomeData, HomeGame } from "@/lib/home";
import type { LiveData, LiveGame } from "@/lib/live";
import { leagueLogo } from "@/lib/logos";

const LEAGUES = ["NBA", "NFL", "MLB", "NHL"];

const TRENDING = [
  "Steph Curry 3s per game in the playoffs 2025",
  "Patrick Mahomes passing yards this season",
  "Jokic vs Embiid rebounds 2025-26",
  "Chiefs next game",
  "Shohei Ohtani home runs 2025",
  "SGA last 5 games",
  "Lowest WHIP MLB 2025",
  "NHL standings last season",
];

type Result = { question: string; steps: string[]; answer?: FinalAnswer; error?: string; done: boolean };

export default function StatBot({ home, live }: { home: HomeData; live: LiveData }) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const abort = useRef<AbortController | null>(null);

  const ask = useCallback(async (question: string) => {
    question = question.trim();
    if (!question) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setInput(question);
    setResult({ question, steps: [], done: false });
    window.scrollTo({ top: 0 });
    const url = new URL(window.location.href);
    url.searchParams.set("q", question);
    window.history.replaceState(null, "", url);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });
      if (!res.body) throw new Error(`Request failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as AgentEvent;
          setResult((r) => {
            if (!r) return r;
            if (ev.type === "step") return { ...r, steps: [...r.steps, ev.label] };
            if (ev.type === "answer") return { ...r, answer: ev.data };
            return { ...r, error: ev.message };
          });
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setResult((r) => r && { ...r, error: err?.message ?? "Something went wrong." });
    }
    setResult((r) => r && { ...r, done: true });
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) ask(q);
  }, [ask]);

  const reset = () => {
    abort.current?.abort();
    setResult(null);
    setInput("");
    window.history.replaceState(null, "", window.location.pathname);
  };

  const search = (size: "large" | "compact") => (
    <form
      className={`search search-${size}`}
      onSubmit={(e) => {
        e.preventDefault();
        ask(input);
      }}
    >
      <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        autoFocus={size === "large"}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={size === "large" ? 'Try "LeBron James stats last season"' : "Search stats"}
        aria-label="Ask a sports stats question"
      />
      {size === "large" && (
        <button type="submit" disabled={!input.trim()}>
          Search
        </button>
      )}
    </form>
  );

  return (
    <div className="site">
      <header className="nav">
        <div className="container nav-inner">
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              reset();
            }}
          >
            <span className="brand-mark" />
            StatBot
          </a>
          {result && search("compact")}
          <nav className="leagues">
            {LEAGUES.map((league) => (
              <button key={league} onClick={() => ask(`${league} standings`)}>
                <img className="league-logo" src={leagueLogo(league)} alt="" />
                {league}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main>{result ? <ResultView result={result} onAsk={ask} /> : <Landing home={home} live={live} search={search("large")} onAsk={ask} />}</main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <span className="brand small">
            <span className="brand-mark" />
            StatBot
          </span>
          <span>Live stats for the NBA, WNBA, NFL, MLB, NHL and college sports.</span>
          <span className="muted">Data from ESPN. Answers are generated automatically and may contain mistakes.</span>
        </div>
      </footer>
    </div>
  );
}

function Landing({
  home,
  live,
  search,
  onAsk,
}: {
  home: HomeData;
  live: LiveData;
  search: React.ReactNode;
  onAsk: (q: string) => void;
}) {
  return (
    <>
      {home.games.length > 0 && <Scores games={home.games} onAsk={onAsk} />}

      <section className="container intro">
        <h1>Search stats</h1>
        {search}
        <div className="trending">
          <span className="muted">Trending</span>
          {TRENDING.map((q) => (
            <button key={q} className="link" onClick={() => onAsk(q)}>
              {q}
            </button>
          ))}
        </div>
      </section>

      <LiveNow initial={live} onAsk={onAsk} />

      {home.boards.length > 0 && (
        <section className="container boards">
          <h2 className="heading">League leaders</h2>
          <div className="boards-grid">
            {home.boards.map((b) => (
              <Board key={`${b.league}-${b.stat}`} board={b} onAsk={onAsk} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Scores({ games, onAsk }: { games: HomeGame[]; onAsk: (q: string) => void }) {
  return (
    <div className="scores">
      <div className="container scores-inner">
        <span className="scores-label">Today</span>
        {games.map((g) => (
          <a key={g.id} className="game" href={`/game/${g.league}/${g.id}`}>
            <span className={`game-status ${g.state}`}>
              {g.state === "in" && <span className="live-dot" />}
              <img className="league-logo" src={leagueLogo(g.league)} alt="" />
              {g.league.toUpperCase()} · {g.status}
            </span>
            {g.teams.map((t) => (
              <span key={t.abbr} className={`game-team ${g.state === "post" && !t.winner ? "lost" : ""}`}>
                {t.logo && <img src={t.logo} alt="" />}
                <span className="abbr">{t.abbr}</span>
                <span className="score">{t.score ?? ""}</span>
              </span>
            ))}
          </a>
        ))}
      </div>
    </div>
  );
}

const LIVE_REFRESH_MS = 30_000;

function easternTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET";
}

function LiveNow({ initial, onAsk }: { initial: LiveData; onAsk: (q: string) => void }) {
  const [live, setLive] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (res.ok && !cancelled) setLive(await res.json());
      } catch {
        // Keep showing the last snapshot; the next tick will try again.
      }
    };
    refresh();
    const timer = setInterval(refresh, LIVE_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return (
    <section className="container live">
      <div className="live-head">
        <h2 className="heading">
          <span className="live-dot" />
          Live now
        </h2>
        <span className="muted">Updates every 30 seconds · as of {easternTime(live.updated)}</span>
      </div>
      {live.games.length > 0 ? (
        <div className="live-grid">
          {live.games.map((g) => (
            <LiveCard key={g.id} game={g} onAsk={onAsk} />
          ))}
        </div>
      ) : (
        <p className="live-empty">
          No games are live right now.
          {live.next && (
            <>
              {" "}
              Next up:{" "}
              <img className="league-logo" src={leagueLogo(live.next.league)} alt="" />
              {live.next.league.toUpperCase()} {live.next.name} at {easternTime(live.next.date)}.
            </>
          )}
        </p>
      )}
    </section>
  );
}

function LiveCard({ game, onAsk }: { game: LiveGame; onAsk: (q: string) => void }) {
  const href = `/game/${game.league}/${game.id}`;
  const top = Math.max(...game.teams.map((t) => Number(t.score) || 0));
  // repeat(0, …) is invalid CSS, so only add the period columns when there are some (baseball has none).
  const columns = [
    "minmax(0, 1fr)",
    game.periods.length ? `repeat(${game.periods.length}, 24px)` : "",
    `repeat(${game.totalLabels.length}, 34px)`,
  ].join(" ");
  const detail = game.detail;

  return (
    <div className="live-card">
      <a className="live-score-side" href={href}>
        <div className="live-row live-row-head" style={{ gridTemplateColumns: columns }}>
          <span className="live-status">
            {game.status}
            {game.situation && <span className="muted live-situation"> · {game.situation}</span>}
          </span>
          {game.periods.map((p) => (
            <span key={p}>{p}</span>
          ))}
          {game.totalLabels.map((l) => (
            <span key={l} className="live-total-label">
              {l}
            </span>
          ))}
        </div>
        {game.teams.map((t) => (
          <div
            key={t.abbr}
            className={`live-row live-team ${(Number(t.score) || 0) < top ? "trailing" : ""}`}
            style={{ gridTemplateColumns: columns }}
          >
            <span className="live-team-id">
              {t.logo && <img src={t.logo} alt="" />}
              <span className="live-team-text">
                <span className="live-team-name">{t.name}</span>
                {t.record && <span className="muted live-record">({t.record})</span>}
              </span>
            </span>
            {game.periods.map((p, i) => (
              <span key={p} className="live-period">
                {t.linescores[i] ?? ""}
              </span>
            ))}
            {t.totals.map((v, i) => (
              <span key={i} className={i === 0 ? "live-score" : "live-period"}>
                {v}
              </span>
            ))}
          </div>
        ))}
        <span className="live-card-foot">
          <img className="league-logo" src={leagueLogo(game.league)} alt="" />
          {game.league.toUpperCase()}
          <span className="live-gamecast">Gamecast →</span>
        </span>
      </a>

      {detail && (
        <div className="live-detail">
          <h3 className="live-detail-title">{detail.title}</h3>
          {detail.kind === "play" ? (
            <div className="live-play">
              {detail.person?.image ? <img className="live-headshot" src={detail.person.image} alt="" /> : null}
              <p>{detail.text}</p>
            </div>
          ) : (
            <ul className="live-performers">
              {detail.people.map((p) => (
                <li key={p.id}>
                  <button onClick={() => onAsk(`${p.name} stats this season`)}>
                    {p.image ? <img className="live-headshot" src={p.image} alt="" /> : <span className="live-headshot" />}
                    <span className="live-performer-text">
                      {p.label && <span className="live-label">{p.label}</span>}
                      <span className="live-performer-name">{p.name}</span>
                      {p.line && <span className="live-line">{p.line}</span>}
                    </span>
                    {p.team && <TeamTag team={p.team} logo={p.teamLogo} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Board({ board, onAsk }: { board: HomeBoard; onAsk: (q: string) => void }) {
  const [top, ...rest] = board.players;
  return (
    <div className="board">
      <button className="board-head" onClick={() => onAsk(board.question)}>
        <span className="board-league">
          <img className="league-logo" src={leagueLogo(board.league)} alt="" />
          {board.league}
        </span>
        <span className="board-stat">{board.stat}</span>
        <span className="muted">{board.season}</span>
      </button>
      <button className="board-top" onClick={() => onAsk(`${top.name} stats ${board.season}`)}>
        {top.image && <img src={top.image} alt={top.name} />}
        <span className="board-top-text">
          <span className="board-value">{top.value}</span>
          <span className="board-name">{top.name}</span>
          <TeamTag team={top.team} logo={top.teamLogo} />
        </span>
      </button>
      <ol start={2}>
        {rest.map((p) => (
          <li key={p.name}>
            <button onClick={() => onAsk(`${p.name} stats ${board.season}`)}>
              <span className="board-name">{p.name}</span>
              <TeamTag team={p.team} logo={p.teamLogo} />
              <span className="board-row-value">{p.value}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TeamTag({ team, logo }: { team: string; logo?: string }) {
  return (
    <span className="muted team-tag">
      {logo && <img src={logo} alt="" />}
      {team}
    </span>
  );
}

function ResultView({ result, onAsk }: { result: Result; onAsk: (q: string) => void }) {
  const { answer, steps, error, done } = result;
  const loading = !answer && !error;

  return (
    <>
      <section className="answer-band">
        <div className="container answer-inner">
          <div className="answer-text">
            <p className="question">{result.question}</p>
            {loading && (
              <>
                <div className="skeleton" />
                <div className="skeleton short" />
                <p className="status">
                  <span className="pulse" />
                  {steps.at(-1) ?? "Understanding the question"}
                  {!done && "…"}
                </p>
              </>
            )}
            {error && <p className="error">{error}</p>}
            {answer && (
              <>
                <h1 className="answer">{answer.answer}</h1>
                {answer.subject && (
                  <p className="subject">
                    {answer.subject.name}
                    {answer.subject.subtitle ? <span> · {answer.subject.subtitle}</span> : null}
                  </p>
                )}
              </>
            )}
          </div>
          {answer?.subject?.image && <img className="headshot" src={answer.subject.image} alt={answer.subject.name} />}
        </div>
      </section>

      {answer && (
        <div className="container results-body">
          {answer.table && answer.table.columns?.length > 0 && <StatTable table={answer.table} />}

          {answer.followups?.length ? (
            <section className="related">
              <h2 className="section-title">Related questions</h2>
              <ul>
                {answer.followups.map((q) => (
                  <li key={q}>
                    <button className="link" onClick={() => onAsk(q)}>
                      {q}
                      <span className="arrow">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

const NUMERIC = /^[-+]?[\d.,:%/\-]*\d[\d.,:%/\-]*$|^—?$/;

function StatTable({ table }: { table: NonNullable<FinalAnswer["table"]> }) {
  const textCols = table.columns.map((_, c) => table.rows.some((row) => !NUMERIC.test(String(row[c] ?? ""))));
  const align = (c: number) => (textCols[c] ? "text" : undefined);
  return (
    <section className="stat-table">
      {table.title && <h2 className="section-title">{table.title}</h2>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {table.columns.map((c, i) => (
                <th key={i} className={align(i)}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r} className={String(row[0]) === "Career" ? "total" : undefined}>
                {row.map((cell, c) => (
                  <td key={c} className={align(c)}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
