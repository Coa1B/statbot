import { getHomeData } from "@/lib/home";
import { getLiveData } from "@/lib/live";
import StatBot from "./statbot";

export const revalidate = 300;

export default async function Page() {
  const [home, live] = await Promise.all([
    getHomeData().catch(() => ({ games: [], boards: [] })),
    getLiveData().catch(() => ({ games: [], updated: new Date().toISOString() })),
  ]);
  return <StatBot home={home} live={live} />;
}
