import { rateLimit } from "@/lib/api-guard";
import { proposeQuirks } from "@/lib/agent/patterns";
import { getToday } from "@/lib/today";

/** 履歴から確認ポイントを提案し、devices[].suggested_quirks に積む（承認は別） */
export async function POST(request: Request) {
  const limited = rateLimit(request, "patterns", 3);
  if (limited) return limited;
  const today = await getToday();
  const result = await proposeQuirks(today);
  return Response.json(result);
}
