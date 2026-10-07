import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLeaders, getScores, getStandings, isLeaguePage, LEAGUE_NAMES } from "@/lib/league";
import { leagueLogo } from "@/lib/logos";
import { AutoRefresh } from "../auto-refresh";
import { Board, ScoreRow } from "../components";
import { SiteHeader } from "../site-header";

type Tab = "scores" | "standings" | "stats";
const TABS: [Tab, string][] = [
  ["scores", "Scores"],
  ["standings", "Standings"],
  ["stats", "Stats"],
];

type Props = {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ tab?: string; date?: string; week?: string; seasontype?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { league } = await params;
  const { tab } = await searchParams;
  if (!isLeaguePage(league)) return { title: "Not found — StatBot" };
  const label = TABS.find(([id]) => id === tab)?.[1] ?? "Scores";
  return { title: `${LEAGUE_NAMES[league]} ${label} — StatBot` };
}

export default async function LeaguePage({ params, searchParams }: Props) {
  const { league } = await params;
  if (!isLeaguePage(league)) notFound();
  const query = await searchParams;
  const tab: Tab = TABS.some(([id]) => id === query.tab) ? (query.tab as Tab) : "scores";
  const name = LEAGUE_NAMES[league];

  return (
    <div className="site">
      <SiteHeader active={league} />
      <main>
        <section className="league-band">
          <div className="container">
            <h1 className="league-title">
              <img src={leagueLogo(league)} alt="" />
              {name}
            </h1>
            <nav className="game-tabs league-tabs">
              {TABS.map(([id, label]) => (
                <a key={id} href={id === "scores" ? `/${league}` : `/${league}?tab=${id}`} className={tab === id ? "active" : ""}>
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </section>

        <div className="container league-body">
          {tab === "scores" && <Scores league={league} query={query} />}
          {tab === "standings" && <Standings league={league} />}
          {tab === "stats" && <Stats league={league} />}
        </div>
      </main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <span className="brand small">
            <span className="brand-mark" />
            StatBot
          </span>
          <span className="muted">Data from ESPN. Answers are generated automatically and may contain mistakes.</span>
        </div>
      </footer>
    </div>
  );
}

async function Scores({ league, query }: { league: string; query: { date?: string; week?: string; seasontype?: string } }) {
  const page = await getScores(league, { date: query.date, week: query.week, seasonType: query.seasontype }).catch(() => null);
  if (!page) return <p className="muted">Scores are unavailable right now. Try again in a minute.</p>;
  return (
    <>
      {page.live && <AutoRefresh seconds={30} />}
      <div className="scores-nav">
        {page.prev ? (
          <a className="scores-step" href={`/${league}?${page.prev}`} aria-label="Previous">
            ‹
          </a>
        ) : (
          <span className="scores-step disabled">‹</span>
        )}
        <div className="scores-when">
          <strong>{page.label}</strong>
          {page.sublabel && <span className="muted">{page.sublabel}</span>}
        </div>
        {page.next ? (
          <a className="scores-step" href={`/${league}?${page.next}`} aria-label="Next">
            ›
          </a>
        ) : (
          <span className="scores-step disabled">›</span>
        )}
        {page.current && (
          <a className="scores-today" href={`/${league}`}>
            {league === "nfl" ? "This week" : "Today"}
          </a>
        )}
        {page.live && (
          <span className="game-tabs-live">
            <span className="live-dot" /> Live · updates every 30s
          </span>
        )}
      </div>
      {page.games.length ? (
        <div className="live-grid">
          {page.games.map((g) => (
            <ScoreRow key={g.id} game={g} />
          ))}
        </div>
      ) : (
        <p className="muted league-empty">No games scheduled.</p>
      )}
    </>
  );
}

async function Standings({ league }: { league: string }) {
  const page = await getStandings(league).catch(() => null);
  if (!page?.groups.length) return <p className="muted">Standings are unavailable right now.</p>;
  return (
    <div className="standings">
      {page.season && <p className="muted standings-season">{page.season} season</p>}
      {page.groups.map((g) => (
        <section key={g.name} className="box-table">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="text box-player">{g.name}</th>
                  {g.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="text box-player standings-team">
                      <span className="muted standings-rank">{i + 1}</span>
                      {r.logo && <img src={r.logo} alt="" />}
                      <a href={`/?q=${encodeURIComponent(`${r.name} record`)}`}>{r.name}</a>
                      {r.clinch && <span className="muted standings-clinch">{r.clinch}</span>}
                    </td>
                    {r.values.map((v, j) => (
                      <td key={j}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <p className="muted standings-note">Clinch markers (x, y, z, e) are shown as ESPN reports them.</p>
    </div>
  );
}

async function Stats({ league }: { league: string }) {
  const boards = await getLeaders(league).catch(() => []);
  if (!boards.length) return <p className="muted">Stat leaders are unavailable right now.</p>;
  return (
    <div className="boards-grid league-boards">
      {boards.map((b) => (
        <Board key={b.stat} board={b} />
      ))}
    </div>
  );
}
