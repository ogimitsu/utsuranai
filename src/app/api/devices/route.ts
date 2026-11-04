import { z } from "zod";
import { loadData, updateDevice } from "@/lib/store";

/**
 * 確認ポイントの承認・却下。
 * approve: suggested_quirks → quirks（教室の静的カードに出る）
 * reject : suggested_quirks → rejected_quirks（再提案しない）
 */
const Body = z.object({
  id: z.string(),
  approve: z.string().optional(),
  reject: z.string().optional(),
});

export async function PATCH(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const { id, approve, reject } = parsed.data;
  const device = (await loadData("devices")).find((d) => d.id === id);
  if (!device) return Response.json({ error: "not found" }, { status: 404 });

  const suggested = device.suggested_quirks.filter((q) => q !== approve && q !== reject);
  const quirks = approve && !device.quirks.includes(approve) ? [...device.quirks, approve] : device.quirks;
  const rejected =
    reject && !device.rejected_quirks.includes(reject) ? [...device.rejected_quirks, reject] : device.rejected_quirks;

  const updated = await updateDevice(id, { suggested_quirks: suggested, quirks, rejected_quirks: rejected });
  return Response.json(updated);
}
