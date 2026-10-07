"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, FinalAnswer } from "@/lib/types";
import type { HomeData, HomeGame } from "@/lib/home";
import type { LiveData } from "@/lib/live";
import { Board, ScoreRow } from "./components";
import { SiteHeader } from "./site-header";
import { leagueLogo } from "@/lib/logos";

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
      <SiteHeader search={result ? search("compact") : false} onHome={reset} />

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
            <ScoreRow key={g.id} game={g} onAsk={onAsk} />
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
