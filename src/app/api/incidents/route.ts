import { z } from "zod";
import { IdString, rateLimit } from "@/lib/api-guard";
import { CauseTag, Symptom } from "@/lib/schema";
import { appendIncident, getRoomContext, newIncidentId, updateIncident } from "@/lib/store";
import { getToday, nowOn } from "@/lib/today";

/** 1タップ記録。先生が「直った」「直らない」を押したときに呼ばれる */
const CreateBody = z.object({
  roomId: IdString,
  deviceId: IdString.nullable().default(null),
  symptom: Symptom,
  cause_tag: CauseTag.default("unknown"),
  resolved: z.enum(["self", "spare", "ticket"]),
  resolved_by: z.enum(["teacher", "ict", "student"]).default("teacher"),
  minutes_lost: z.number().min(0).max(60).default(5),
  note: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "incidents", 20);
  if (limited) return limited;
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;
  const today = await getToday();
  // 実在する教室・機器にだけ記録を残す
  const ctx = await getRoomContext(b.roomId, today);
  if (!ctx) return Response.json({ error: "room not found" }, { status: 404 });
  if (b.deviceId && !ctx.devices.some((d) => d.id === b.deviceId)) {
    return Response.json({ error: "device not in room" }, { status: 404 });
  }
  const datetime = nowOn(today);
  const incident = await appendIncident({
    id: newIncidentId(datetime),
    datetime,
    room_id: b.roomId,
    device_id: b.deviceId,
    symptom: b.symptom,
    cause_tag: b.cause_tag,
    resolved: b.resolved,
    resolved_by: b.resolved_by,
    minutes_lost: b.minutes_lost,
    note: b.note,
    // 自分で直せなかったときは、予備機で続ける場合も含めてICT担当に知らせる
    ticket_status: b.resolved === "self" ? "none" : "open",
  });
  return Response.json(incident, { status: 201 });
}

/** ICT担当がチケットを閉じる／原因を直す */
const PatchBody = z.object({
  id: IdString,
  ticket_status: z.enum(["none", "open", "done"]).optional(),
  cause_tag: CauseTag.optional(),
  note: z.string().max(300).optional(),
});

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "incidents", 20);
  if (limited) return limited;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const { id, ...patch } = parsed.data;
  const updated = await updateIncident(id, patch);
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(updated);
}
