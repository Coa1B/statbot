import { getGame } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await params;
  const game = await getGame(league, id);
  if (!game) return Response.json({ error: "Game not found" }, { status: 404 });
  return Response.json(game, { headers: { "Cache-Control": "no-cache" } });
}
