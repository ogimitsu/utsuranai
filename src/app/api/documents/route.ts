import { z } from "zod";
import { DOC_KINDS, draftDocument } from "@/lib/agent/documents";
import { getToday } from "@/lib/today";

/** 書類の下書きをストリーミングで返す。本文は text/plain（Markdown） */
const Body = z.object({
  kind: z.enum(DOC_KINDS),
  deviceId: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const today = await getToday();
  const { source, stream } = await draftDocument({ ...parsed.data, today });
  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-doc-source": source,
    },
  });
}
