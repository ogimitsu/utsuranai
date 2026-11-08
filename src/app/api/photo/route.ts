import { z } from "zod";
import { MEDIA_TYPES, photoAssist } from "@/lib/agent/photo";
import { IdString, rateLimit } from "@/lib/api-guard";
import { Symptom } from "@/lib/schema";
import { getToday } from "@/lib/today";

/**
 * 写真1枚の補助判定。画像はこのリクエストの中だけで使い、保存しない。
 * 端末側で長辺1024pxに縮小してから送る（Triage.tsx）。
 */
const MAX_BYTES = 1_500_000; // base64 文字列長の上限（縮小済みなら数百KB）

const Body = z.object({
  roomId: IdString,
  symptom: Symptom,
  deviceId: IdString.nullable().default(null),
  tried: z.array(z.string().max(200)).max(12).default([]),
  /** data URL（data:image/jpeg;base64,...） */
  image: z.string().max(MAX_BYTES + 64),
});

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export async function POST(request: Request) {
  // 画像入力はいちばん費用がかかるので、1人あたり毎分6枚まで
  const limited = rateLimit(request, "photo", 6);
  if (limited) return limited;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const m = DATA_URL.exec(parsed.data.image);
  if (!m) return Response.json({ error: "image must be a jpeg/png/webp data URL" }, { status: 400 });
  const mediaType = m[1] as (typeof MEDIA_TYPES)[number];
  if (!MEDIA_TYPES.includes(mediaType)) return Response.json({ error: "unsupported image type" }, { status: 400 });

  const today = await getToday();
  const reply = await photoAssist({
    roomId: parsed.data.roomId,
    symptom: parsed.data.symptom,
    deviceId: parsed.data.deviceId,
    tried: parsed.data.tried,
    image: { data: m[2], mediaType },
    today,
  });
  if (!reply) return Response.json({ error: "room not found" }, { status: 404 });
  return Response.json(reply, { headers: { "cache-control": "no-store" } });
}
