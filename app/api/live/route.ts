import { getLiveData } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getLiveData();
  return Response.json(data, { headers: { "Cache-Control": "no-cache" } });
}
