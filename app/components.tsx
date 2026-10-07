"use client";

import type { HomeBoard } from "@/lib/home";
import type { LiveGame } from "@/lib/live";
import { leagueLogo } from "@/lib/logos";

type OnAsk = (q: string) => void;

/** Runs a search in place when `onAsk` is given (home page); otherwise links to the search page. */
function Ask({ q, onAsk, className, children }: { q: string; onAsk?: OnAsk; className?: string; children: React.ReactNode }) {
  const cls = `ask${className ? ` ${className}` : ""}`;
  if (onAsk) {
    return (
      <button className={cls} onClick={() => onAsk(q)}>
        {children}
      </button>
    );
  }
  return (
    <a className={cls} href={`/?q=${encodeURIComponent(q)}`}>
      {children}
    </a>
  );
}

export function ScoreRow({ game, onAsk }: { game: LiveGame; onAsk?: OnAsk }) {
  const href = `/game/${game.league}/${game.id}`;
  const top = Math.max(...game.teams.map((t) => Number(t.score) || 0));
  // repeat(0, …) is invalid CSS, so only add columns that exist (baseball has no periods; scheduled games have no scores).
  const columns = [
    "minmax(0, 1fr)",
    game.periods.length ? `repeat(${game.periods.length}, 24px)` : "",
    game.totalLabels.length ? `repeat(${game.totalLabels.length}, 34px)` : "",
  ].join(" ");
  const detail = game.detail;

  return (
    <div className="live-card">
      <a className="live-score-side" href={href}>
        <div className="live-row live-row-head" style={{ gridTemplateColumns: columns }}>
          <span className={`live-status ${game.state}`}>
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
            className={`live-row live-team ${game.state !== "pre" && (Number(t.score) || 0) < top ? "trailing" : ""}`}
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
                  <Ask q={`${p.name} stats this season`} onAsk={onAsk}>
                    {p.image ? <img className="live-headshot" src={p.image} alt="" /> : <span className="live-headshot" />}
                    <span className="live-performer-text">
                      {p.label && <span className="live-label">{p.label}</span>}
                      <span className="live-performer-name">{p.name}</span>
                      {p.line && <span className="live-line">{p.line}</span>}
                    </span>
                    {p.team && <TeamTag team={p.team} logo={p.teamLogo} />}
                  </Ask>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function Board({ board, onAsk }: { board: HomeBoard; onAsk?: OnAsk }) {
  const [top, ...rest] = board.players;
  return (
    <div className="board">
      <Ask q={board.question} onAsk={onAsk} className="board-head">
        <span className="board-league">
          <img className="league-logo" src={leagueLogo(board.league)} alt="" />
          {board.league}
        </span>
        <span className="board-stat">{board.stat}</span>
        <span className="muted">{board.season}</span>
      </Ask>
      <Ask q={`${top.name} stats ${board.season}`} onAsk={onAsk} className="board-top">
        {top.image && <img src={top.image} alt={top.name} />}
        <span className="board-top-text">
          <span className="board-value">{top.value}</span>
          <span className="board-name">{top.name}</span>
          <TeamTag team={top.team} logo={top.teamLogo} />
        </span>
      </Ask>
      <ol start={2}>
        {rest.map((p) => (
          <li key={p.name}>
            <Ask q={`${p.name} stats ${board.season}`} onAsk={onAsk}>
              <span className="board-name">{p.name}</span>
              <TeamTag team={p.team} logo={p.teamLogo} />
              <span className="board-row-value">{p.value}</span>
            </Ask>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function TeamTag({ team, logo }: { team: string; logo?: string }) {
  return (
    <span className="muted team-tag">
      {logo && <img src={logo} alt="" />}
      {team}
    </span>
  );
}
