import { z } from "zod";
import { ChatMessage, triage } from "@/lib/agent/triage";
import { IdString, rateLimit } from "@/lib/api-guard";
import { Symptom } from "@/lib/schema";
import { getToday } from "@/lib/today";

const Body = z.object({
  roomId: IdString,
  symptom: Symptom,
  // 質問は最大2問なので、やり取りは往復3回ぶんで足りる
  messages: z.array(ChatMessage).max(6).default([]),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "triage", 30);
  if (limited) return limited;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const today = await getToday();
  const reply = await triage({ ...parsed.data, today });
  if (!reply) return Response.json({ error: "room not found" }, { status: 404 });
  return Response.json(reply);
}
