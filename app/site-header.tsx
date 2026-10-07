import type { ReactNode } from "react";
import { leagueLogo } from "@/lib/logos";

export const NAV_LEAGUES = ["nba", "nfl", "mlb", "nhl", "wnba"];

function SearchForm() {
  return (
    <form className="search search-compact" action="/">
      <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input name="q" placeholder="Search stats" aria-label="Ask a sports stats question" />
    </form>
  );
}

/**
 * Top navigation shared by every page. `search` replaces the default search box (`false` hides it);
 * `onHome` lets the home page reset in place instead of reloading.
 */
export function SiteHeader({ search, onHome, active }: { search?: ReactNode | false; onHome?: () => void; active?: string }) {
  return (
    <header className="nav">
      <div className="container nav-inner">
        <a
          className="brand"
          href="/"
          onClick={
            onHome
              ? (e) => {
                  e.preventDefault();
                  onHome();
                }
              : undefined
          }
        >
          <span className="brand-mark" />
          StatBot
        </a>
        {search === undefined ? <SearchForm /> : search || null}
        <nav className="leagues">
          {NAV_LEAGUES.map((league) => (
            <a key={league} href={`/${league}`} className={active === league ? "active" : undefined}>
              <img className="league-logo" src={leagueLogo(league)} alt="" />
              {league.toUpperCase()}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
