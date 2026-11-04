import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, hasApiKey, MODELS } from "@/lib/llm/client";
import { loadData, saveData } from "@/lib/store";
import { buildFactPack, type DeviceFact } from "./facts";

/**
 * 確認ポイントの抽出（F3）。
 * 履歴から「教室のメモに載せられる1行」を提案し、devices[].suggested_quirks に積む。
 * 承認はICT担当が行う（/api/devices PATCH）。AIの推測を勝手に正にしない。
 *
 * Sonnet 5.5 はツール呼び出しの強制（tool_choice: tool）を受け付けないため、
 * 構造化出力（output_config.format）で JSON を受け取る。
 */

export const QuirkProposal = z.object({
  device_id: z.string().describe("対象機器のid。事実にあるものだけ"),
  quirk: z.string().describe("教室のメモに載せる1文、60字以内。先生が次に何をすればよいかが分かる形"),
  evidence: z.string().describe("根拠。件数と時期を具体的に"),
  confidence: z.enum(["high", "medium", "low"]),
});
export type QuirkProposal = z.infer<typeof QuirkProposal>;
const QuirkProposals = z.object({ proposals: z.array(QuirkProposal) });

export type ProposeResult = {
  source: "ai" | "rules";
  proposals: QuirkProposal[];
  /** 実際に suggested_quirks に追加した件数（重複・却下済みは除く） */
  added: number;
};

const MIN_RECORDS = 3;

export async function proposeQuirks(today: string): Promise<ProposeResult> {
  const facts = await buildFactPack(today);
  const candidates = facts.devices.filter((d) => d.n >= MIN_RECORDS).slice(0, 15);

  let proposals: QuirkProposal[];
  let source: ProposeResult["source"];
  if (hasApiKey()) {
    try {
      proposals = await proposeWithAi(candidates, today);
      source = "ai";
    } catch (e) {
      console.error("[patterns] fallback to rules:", (e as Error).message);
      proposals = proposeByRules(candidates);
      source = "rules";
    }
  } else {
    proposals = proposeByRules(candidates);
    source = "rules";
  }

  const devices = await loadData("devices");
  let added = 0;
  for (const p of proposals) {
    const d = devices.find((x) => x.id === p.device_id);
    const text = p.quirk.trim();
    if (!d || !text) continue;
    if (p.confidence === "low") continue; // 根拠の弱い案は画面に積まない（返答には残す）
    if (d.quirks.includes(text) || d.suggested_quirks.includes(text) || d.rejected_quirks.includes(text)) continue;
    d.suggested_quirks.push(text);
    added++;
  }
  if (added > 0) await saveData("devices", devices);
  return { source, proposals, added };
}

function evidenceOf(d: DeviceFact) {
  return {
    device_id: d.id,
    教室: d.room,
    機器: `${d.kind} ${d.maker} ${d.model}（${d.installed_year}年導入）`,
    件数: d.n,
    原因: Object.fromEntries(d.by_cause),
    症状: Object.fromEntries(d.by_symptom),
    時間帯: Object.fromEntries(d.by_period),
    月別: Object.fromEntries(d.by_month),
    記録: d.records.slice(-15),
    既知の確認ポイント: d.quirks,
    未承認の提案: d.suggested,
    却下済み: d.rejected,
  };
}

async function proposeWithAi(candidates: DeviceFact[], today: string): Promise<QuirkProposal[]> {
  if (candidates.length === 0) return [];
  const system = `あなたは県立あさひ台工業高等学校の校内ICT担当の分析係です。教室機器のトラブル記録から「機器の確認ポイント」を見つけます。
確認ポイントとは、教室のメモ（先生が最初に見る1行メモ）に載せられる、先生の次の行動につながる事実です。
例：「HDMI端子が3つ。ケーブルが挿さっている番号と入力切替の番号を合わせる」「電子黒板は無線投影。右上のWi-Fiマークが消えていたらHDMIでつなぐ」「教卓側のHDMI端子がゆるい。まっすぐ抜き差し。ぐらつくならICT担当へ」

# ルール
- 根拠は${MIN_RECORDS}件以上の記録。1〜2件で断定しない。記録にないことを推測しない
- 既知の確認ポイント・未承認の提案・却下済みの提案と同じ内容は出さない
- quirk は60字以内の1文。「〜のとき〜。まず〜」のように、先生が次に何をすればよいかが分かる形。文末に実際の件数を添える。例：「（今年度6件中5件）」。N や M のような記号を書かない
- 専門語を避ける。カードの文体（常体）でよい
- 機器ごとに最大2件、全体で最大8件。confidence は正直に
- 出すものがなければ proposals を空にする

今日は ${today} です。`;

  const res = await getClient().messages.parse({
    model: MODELS.deep,
    max_tokens: 16000,
    system,
    messages: [
      {
        role: "user",
        content: `# 記録のある機器（件数順）\n${JSON.stringify(candidates.map(evidenceOf), null, 1)}`,
      },
    ],
    output_config: { effort: "medium", format: zodOutputFormat(QuirkProposals) },
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) {
    throw new Error(`no parsed output (stop_reason=${res.stop_reason})`);
  }
  return res.parsed_output.proposals;
}

/** AIを使わない保険：単純な集計ルールで提案する */
const ACTION: Record<string, string> = {
  入力切替: "まず入力切替を確認",
  "ケーブル・アダプタ": "まずケーブルを挿し直す。続くなら交換",
  "電池・リモコン": "まずリモコンの電池を交換",
  端末の設定: "まず教卓PCの出力先設定を確認",
  電源: "まず主電源を確認",
  "Wi-Fi・無線": "まず電子黒板のWi-Fi表示を確認。切れていればHDMIでつないで続ける",
  機器故障: "故障が続いている。業者点検を検討",
};

export function proposeByRules(candidates: DeviceFact[]): QuirkProposal[] {
  const out: QuirkProposal[] = [];
  // 朝の集中は学校全体でも起きる。全体の朝の割合より明らかに高いときだけ確認ポイントとみなす
  const all = candidates.reduce((s, d) => s + d.n, 0);
  const morningAll = candidates.reduce((s, d) => s + (d.by_period.find(([p]) => p.startsWith("朝"))?.[1] ?? 0), 0);
  const morningBase = all > 0 ? morningAll / all : 0;
  for (const d of candidates) {
    if (d.n < 4) continue;
    const [cause, m] = d.by_cause[0] ?? ["", 0];
    const [symptom] = d.by_symptom[0] ?? ["トラブル"];
    if (m / d.n >= 0.5 && ACTION[cause]) {
      out.push({
        device_id: d.id,
        quirk: `「${symptom}」のときは${ACTION[cause]}（今年度${d.n}件中${m}件が${cause}）`,
        evidence: `${d.n}件中${m}件が${cause}`,
        confidence: m / d.n >= 0.7 ? "high" : "medium",
      });
    }
    const [period, k] = d.by_period[0] ?? ["", 0];
    if (period.startsWith("朝") && k / d.n >= Math.max(0.7, morningBase + 0.2)) {
      out.push({
        device_id: d.id,
        quirk: `トラブルが朝（1〜2限）に集中（今年度${d.n}件中${k}件）。1限に使う日は始業前に電源を入れておく`,
        evidence: `${d.n}件中${k}件が朝`,
        confidence: "medium",
      });
    }
  }
  return out.slice(0, 8);
}
