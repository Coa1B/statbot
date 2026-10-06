import { runLocalAgent } from "@/lib/local-agent";
import type { AgentEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNSUPPORTED =
  "I couldn't understand that one. Try a player's stats (\"Jalen Brunson assists 2025-26\"), recent games (\"Aaron Judge last 10 games\"), " +
  "a leaderboard (\"who led the NHL in goals last season\"), a comparison (\"Jokic vs Embiid rebounds\"), a team's record (\"Chiefs record\"), " +
  "standings or scores.";

export async function POST(req: Request) {
  const { question } = (await req.json()) as { question?: string };
  if (!question?.trim()) {
    return Response.json({ error: "Missing question" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      const q = question.trim().slice(0, 500);
      try {
        if (!(await runLocalAgent(q, emit))) emit({ type: "error", message: UNSUPPORTED });
      } catch (err: any) {
        emit({ type: "error", message: err?.message ?? "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
