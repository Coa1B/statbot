import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGame } from "@/lib/game";
import GameView from "./game-view";

type Props = { params: Promise<{ league: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league, id } = await params;
  const game = await getGame(league, id).catch(() => null);
  if (!game) return { title: "Game not found — StatBot" };
  const [away, home] = game.teams;
  return { title: `${away.abbr} ${away.score} @ ${home.abbr} ${home.score} · ${game.status} — StatBot` };
}

export default async function GamePage({ params }: Props) {
  const { league, id } = await params;
  const game = await getGame(league, id).catch(() => null);
  if (!game) notFound();
  return <GameView initial={game} />;
}
