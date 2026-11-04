import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, hasApiKey, MODELS } from "@/lib/llm/client";
import { getRoomContext } from "@/lib/store";
import { CauseTag, DEVICE_KIND_LABEL, SYMPTOM_LABEL, type Symptom } from "@/lib/schema";

/**
 * 写真による補助判定（F5）。
 * 「直らない」ときに先生が機器の写真を1枚送る。状態ランプ・ケーブル・端子・画面表示を見て、
 * 原因候補を1つに絞り、次の1手を返す。主役にはしない（判定は補助、最後は予備機とチケット）。
 *
 * 写真は保存しない。判定に使ったあと捨て、所見（文章）だけが記録の note に残る。
 */

export const PhotoReply = z.object({
  available: z.boolean(),
  /** 写真から分かったこと。1〜2文、先生の言葉で */
  observation: z.string(),
  suspected_cause: CauseTag.optional(),
  /** 次にする1つの動作。打つ手がなければ「予備機で授業を続け、ICT担当に知らせてください」 */
  next_step: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  source: z.enum(["ai", "none"]),
});
export type PhotoReply = z.infer<typeof PhotoReply>;

const Verdict = z.object({
  observation: z.string().describe("写真に写っている機器の状態。ランプの色、ケーブルの差さり方、画面の表示など、見えた事実だけを1〜2文で"),
  suspected_cause: CauseTag.describe("写真と教室情報から最も疑わしい原因。判断できなければ unknown"),
  next_step: z.string().describe("先生が次にする1つの動作。30字以内。場所は教室情報の具体名で。打つ手がなければ予備機とICT担当への連絡を案内"),
  confidence: z.enum(["high", "medium", "low"]),
});

export const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export async function photoAssist(input: {
  roomId: string;
  symptom: Symptom;
  deviceId: string | null;
  tried: string[];
  image: { data: string; mediaType: MediaType };
  today: string;
}): Promise<PhotoReply | null> {
  const ctx = await getRoomContext(input.roomId, input.today);
  if (!ctx) return null;

  if (!hasApiKey()) {
    return {
      available: false,
      observation: "いまは写真の判定が使えません。",
      next_step: "予備機で授業を続け、ICT担当に知らせてください。",
      confidence: "low",
      source: "none",
    };
  }

  const target = ctx.devices.find((d) => d.id === input.deviceId) ?? ctx.devices.find((d) => d.kind === "projector" || d.kind === "display");
  const devices = ctx.devices.map((d) => ({
    id: d.id,
    種類: DEVICE_KIND_LABEL[d.kind],
    機種: `${d.maker} ${d.model}（${d.installed_year}年導入）`,
    入力: d.inputs,
    いつもの入力: d.default_input,
    ケーブルの場所: d.cable_location,
    既知の確認ポイント: d.quirks,
  }));

  const system = `あなたは「映らないノート」— 県立あさひ台工業高等学校の教室ICTサポートです。
先生は授業中で、${ctx.room.name}の機器が「${SYMPTOM_LABEL[input.symptom]}」状態です。手順を試しても直らず、機器の写真を1枚送ってきました。

# ルール
- 写真に写っている事実だけを述べる。写っていないことを推測しない
- 判断は補助。断定せず、confidence を正直に
- next_step は1つの動作だけ。すでに試した手順（下に書いてある）は繰り返さない
- 写真から新しい手がかりが得られなければ、suspected_cause は unknown、next_step は予備機とICT担当への連絡
- 専門語を避け、敬体で短く
- 写真に人が写っていても、人物については一切触れない

# この教室の機器
${JSON.stringify(devices, null, 1)}
${target ? `# 対象と思われる機器\n${target.id}（${DEVICE_KIND_LABEL[target.kind]} ${target.maker} ${target.model}）` : ""}

# すでに試した手順
${input.tried.length ? input.tried.map((t) => `- ${t}`).join("\n") : "（記録なし）"}

今日は ${input.today} です。`;

  try {
    const res = await getClient().messages.parse({
      model: MODELS.deep,
      max_tokens: 2000,
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: input.image.mediaType, data: input.image.data } },
            { type: "text", text: "この写真から分かることと、次にすべき1つの動作を教えてください。" },
          ],
        },
      ],
      output_config: { effort: "low", format: zodOutputFormat(Verdict) },
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      throw new Error(`no parsed output (stop_reason=${res.stop_reason})`);
    }
    const v = res.parsed_output;
    return { available: true, ...v, source: "ai" };
  } catch (e) {
    console.error("[photo] failed:", (e as Error).message);
    return {
      available: false,
      observation: "写真をうまく読み取れませんでした。",
      next_step: "予備機で授業を続け、ICT担当に知らせてください。",
      confidence: "low",
      source: "none",
    };
  }
}
