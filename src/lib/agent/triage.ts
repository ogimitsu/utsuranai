import { z } from "zod";
import { getClient, hasApiKey, MODELS } from "@/lib/llm/client";
import { getRoomContext, type RoomContext } from "@/lib/store";
import { CauseTag, Symptom, SYMPTOM_LABEL, DEVICE_KIND_LABEL } from "@/lib/schema";

/**
 * 教室の一次対応エージェント。
 * - 質問は最大2問、手順は3ステップ以内
 * - 返答は必ず構造化（ツール呼び出しを強制）して、画面がボタンで扱えるようにする
 * - APIキーが無い／失敗したときは playbook の手順をそのまま返す（AIなしでも成立）
 */

export const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const TriageReply = z.object({
  kind: z.enum(["question", "steps", "escalate"]),
  text: z.string(), // 先生に見せる一文（やさしい言葉で）
  steps: z.array(z.string()).default([]), // kind=steps のとき 1〜3行
  suspected_cause: CauseTag.optional(),
  device_id: z.string().optional(), // 対象と思われる機器
  spare_hint: z.string().optional(), // kind=escalate のとき、予備機の案内
  source: z.enum(["ai", "playbook"]).default("ai"),
});
export type TriageReply = z.infer<typeof TriageReply>;

const replyTool = {
  name: "reply_to_teacher",
  description:
    "先生への返答を返す。必ずこのツールで返答する。質問するか、手順を示すか、ICT担当へ引き継ぐかのどれか。",
  input_schema: {
    type: "object" as const,
    properties: {
      kind: {
        type: "string",
        enum: ["question", "steps", "escalate"],
        description: "question=1問だけ聞く / steps=手順を示す / escalate=予備機の案内とチケット",
      },
      text: { type: "string", description: "先生に見せる一文。質問ならその質問文。やさしい言葉で、専門語を避ける" },
      steps: {
        type: "array",
        items: { type: "string" },
        description: "kind=steps のとき。1〜3行。1行1動作。場所は具体名（『教卓右の引き出し』）",
      },
      suspected_cause: {
        type: "string",
        enum: CauseTag.options,
        description: "いちばん疑わしい原因",
      },
      device_id: { type: "string", description: "対象と思われる機器のid" },
      spare_hint: { type: "string", description: "kind=escalate のとき。予備機・代替手段の案内を1文で" },
    },
    required: ["kind", "text"],
  },
};

function buildSystemPrompt(ctx: RoomContext, symptom: Symptom, today: string, questionsAsked: number) {
  const devices = ctx.devices.map((d) => ({
    id: d.id,
    種類: DEVICE_KIND_LABEL[d.kind],
    機種: `${d.maker} ${d.model}（${d.installed_year}年導入）`,
    入力: d.inputs,
    いつもの入力: d.default_input,
    ケーブルの場所: d.cable_location,
    リモコンの場所: d.remote_location,
    既知の確認ポイント: d.quirks,
  }));
  const playbooks = ctx.playbooks
    .filter((p) => p.symptom === symptom)
    .map((p) => ({
      対象: `${DEVICE_KIND_LABEL[p.device_kind]}${p.model ? ` ${p.model}` : "（共通）"}`,
      聞いてよい質問: p.questions,
      手順: p.steps,
      引き継ぐ条件: p.escalate_when,
      予備機の案内: p.spare_hint,
    }));
  const recent = ctx.recentIncidents.slice(0, 5).map((i) => ({
    日時: i.datetime.slice(0, 16),
    症状: SYMPTOM_LABEL[i.symptom],
    原因: i.cause_tag,
    メモ: i.note,
  }));
  const spares = ctx.spares
    .filter((s) => ["projector", "display", "cable", "adapter", "battery", "speaker", "mic"].includes(s.kind))
    .map((s) => `${s.name}：${s.location}（${s.qty}）`);

  const remaining = Math.max(0, 2 - questionsAsked);

  return `あなたは「映らないノート」— 県立あさひ台工業高等学校の教室ICTサポートです。
いま先生は授業中で、教室の機器が「${SYMPTOM_LABEL[symptom]}」状態です。先生は30秒しか待てません。

# 絶対のルール
- 返答は必ず reply_to_teacher ツールで返す
- 質問はあと ${remaining} 問まで。${remaining === 0 ? "もう質問はできません。手順を示すか、引き継いでください。" : "1回の返答で1問だけ。聞かなくても手順が出せるなら聞かない。"}
- 手順は3行以内、1行1動作。場所は下の情報にある具体名で言う（「教卓右の引き出し」）
- 下の情報にないことは推測しない。わからなければ kind=escalate で予備機を案内し、ICT担当に引き継ぐ
- 専門語を避け、やさしい言葉で。敬体で短く
- 既知の確認ポイントに当てはまるなら、それを最初に試す

# 今日
${today}

# この教室
${ctx.room.name}（${ctx.room.building} ${ctx.room.floor}階）
静的メモ: ${JSON.stringify(ctx.room.notes_static, null, 0)}

# 機器
${JSON.stringify(devices, null, 1)}

# この症状の手順集（playbook）
${JSON.stringify(playbooks, null, 1)}

# この教室の最近の記録
${JSON.stringify(recent, null, 1)}

# 予備機・消耗品（ICT準備室）
${spares.join("\n")}
`;
}

/** AIを使わない保険：playbook の手順をそのまま返す */
function playbookFallback(ctx: RoomContext, symptom: Symptom): TriageReply {
  const main = ctx.devices.find((d) => d.kind === "projector" || d.kind === "display") ?? ctx.devices[0];
  const pb =
    ctx.playbooks.find((p) => p.symptom === symptom && main && p.model === main.model) ??
    ctx.playbooks.find((p) => p.symptom === symptom && main && p.device_kind === main.kind) ??
    ctx.playbooks.find((p) => p.symptom === symptom);
  if (!pb) {
    return {
      kind: "escalate",
      text: "この症状の手順がまだ登録されていません。ICT担当に引き継ぎます。",
      steps: [],
      spare_hint: "ICT準備室の予備機で授業を続けてください。",
      source: "playbook",
    };
  }
  return {
    kind: "steps",
    text: `まず次を試してください（${DEVICE_KIND_LABEL[pb.device_kind]}の基本手順）。`,
    steps: pb.steps.slice(0, 3),
    device_id: main?.id,
    spare_hint: pb.spare_hint,
    source: "playbook",
  };
}

export async function triage(input: {
  roomId: string;
  symptom: Symptom;
  messages: ChatMessage[];
  today: string;
}): Promise<TriageReply | null> {
  const ctx = await getRoomContext(input.roomId, input.today);
  if (!ctx) return null;

  if (!hasApiKey()) return playbookFallback(ctx, input.symptom);

  const questionsAsked = input.messages.filter((m) => m.role === "assistant").length;
  const system = buildSystemPrompt(ctx, input.symptom, input.today, questionsAsked);

  const messages =
    input.messages.length === 0
      ? [{ role: "user" as const, content: `症状：${SYMPTOM_LABEL[input.symptom]}。どうすればいいですか。` }]
      : input.messages.map((m) => ({ role: m.role, content: m.text }));

  try {
    const res = await getClient().messages.create({
      model: MODELS.fast,
      max_tokens: 600,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: [replyTool],
      tool_choice: { type: "tool", name: "reply_to_teacher" },
      messages,
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return playbookFallback(ctx, input.symptom);
    const parsed = TriageReply.safeParse({ ...(block.input as object), source: "ai" });
    if (!parsed.success) return playbookFallback(ctx, input.symptom);
    const reply = parsed.data;
    // 質問上限の保険
    if (reply.kind === "question" && questionsAsked >= 2) return playbookFallback(ctx, input.symptom);
    return reply;
  } catch (e) {
    console.error("[triage] fallback:", (e as Error).message);
    return playbookFallback(ctx, input.symptom);
  }
}
