import { z } from "zod";
import { ChatMessage, triage } from "@/lib/agent/triage";
import { Symptom } from "@/lib/schema";
import { getToday } from "@/lib/today";

const Body = z.object({
  roomId: z.string(),
  symptom: Symptom,
  messages: z.array(ChatMessage).default([]),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const today = await getToday();
  const reply = await triage({ ...parsed.data, today });
  if (!reply) return Response.json({ error: "room not found" }, { status: 404 });
  return Response.json(reply);
}
