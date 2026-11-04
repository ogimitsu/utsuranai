import { getClient, hasApiKey, MODELS } from "@/lib/llm/client";
import { buildFactPack, factPackToText, pairs, type DeviceFact, type FactPack } from "./facts";

/**
 * 書類の下書き（F4）。
 * 引継ぎ文書／備品購入計画／修理依頼文を、事実パックだけを材料に Sonnet が書く。
 * 文字はストリーミングで返す（ICT担当は読みながら待てる）。
 * APIキーが無い／失敗したときは、同じ事実パックから雛形を組み立てて返す（AIなしでも成立）。
 */

export type DocKind = "handover" | "purchase" | "repair";
export const DOC_KINDS: DocKind[] = ["handover", "purchase", "repair"];
export const DOC_LABEL: Record<DocKind, string> = {
  handover: "引継ぎ文書",
  purchase: "備品購入計画",
  repair: "修理依頼文",
};
export const DOC_DESC: Record<DocKind, string> = {
  handover: "次のICT担当へ。1年分の記録・確認ポイント・業者・予備機・行事をまとめる",
  purchase: "管理職・事務室へ。件数・導入年・寿命を根拠に優先順位を付ける",
  repair: "業者へ。機器・症状の経過・試したことをまとめる",
};

export type DraftResult = { source: "ai" | "template"; stream: ReadableStream<Uint8Array> };

export async function draftDocument(input: {
  kind: DocKind;
  deviceId?: string | null;
  today: string;
}): Promise<DraftResult> {
  const facts = await buildFactPack(input.today);
  const target = input.kind === "repair" ? pickRepairTarget(facts, input.deviceId) : null;
  const template = renderTemplate(input.kind, facts, target);
  if (!hasApiKey()) return { source: "template", stream: textStream(template) };
  return { source: "ai", stream: aiStream(input.kind, facts, target, template) };
}

/** 修理依頼の対象：指定があればそれ、なければ「機器故障」が最も多い機器 */
export function pickRepairTarget(facts: FactPack, deviceId?: string | null): DeviceFact | null {
  if (deviceId) return facts.devices.find((d) => d.id === deviceId) ?? null;
  const byFault = [...facts.devices].sort((a, b) => b.fault_count - a.fault_count || b.n - a.n);
  return byFault[0] ?? null;
}

const encoder = new TextEncoder();

function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function aiStream(kind: DocKind, facts: FactPack, target: DeviceFact | null, template: string) {
  const rules = `あなたは県立あさひ台工業高等学校の校内ICT担当の文書作成を手伝う助手です。

# 絶対のルール
- 下の「事実」にある数字・機種名・業者名・日付だけを使う。事実にないものを作らない。推定を書くときは「推定」と明記する
- 個人名・電話番号・メールアドレスを書かない。差出人は「県立あさひ台工業高等学校 ICT担当」
- 読み手は専門家ではない。専門語を避け、場所と手順は具体的に書く
- Markdown で書く。見出しは ## まで。表は必要なときだけ。前置きや「以下に示します」は書かず、本文から始める`;

  const stream = getClient().messages.stream({
    model: MODELS.deep,
    max_tokens: 16000,
    system: [
      { type: "text", text: rules },
      { type: "text", text: `# 事実（${facts.today} 時点）\n\n${factPackToText(facts)}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: instruction(kind, facts, target) }],
    output_config: { effort: "medium" },
  });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let wrote = false;
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(ev.delta.text));
            wrote = true;
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal" || !wrote) {
          controller.enqueue(encoder.encode(`${wrote ? "\n\n---\n" : ""}（AIが文書を生成できなかったため、手順集モードの雛形を示します）\n\n${template}`));
        }
      } catch (e) {
        console.error("[documents] stream failed:", (e as Error).message);
        controller.enqueue(
          encoder.encode(`${wrote ? "\n\n---\n" : ""}（AI生成が中断しました。手順集モードの雛形を示します）\n\n${template}`),
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });
}

function instruction(kind: DocKind, facts: FactPack, target: DeviceFact | null): string {
  const fy = facts.school.fiscal_year;
  switch (kind) {
    case "handover":
      return `${fy}年度のICT担当から、来年度に初めてICT担当になる先生への引継ぎ文書を書いてください。
題は「ICT担当 引継ぎ文書（${fy}年度）」。構成：
## 1. まず知っておくこと（今年度の数字を3〜5行で。何が多く、いつ多いか）
## 2. 教室と機器の確認ポイント（教室ごとに箇条書き。承認済みの確認ポイントを中心に。未承認の提案は「確認してください」と添えて別に）
## 3. 年間の山場（行事の日付順に、前日までにやることを1行ずつ）
## 4. 業者と保守契約（誰に何を頼めるか、期限）
## 5. 予備機・消耗品の場所
## 6. 来年度に判断すること（ランプ寿命・保守期限・更新候補。候補は記録の件数と導入年を根拠に）
## 7. 未対応のチケット
## 8. 前任者から一言（記録から言える助言を3つ。精神論は書かない）
引継ぎファイルを読む時間がない人が、4月の最初の1週間を乗り切れるように書いてください。`;
    case "purchase":
      return `管理職・事務室に出す「${fy + 1}年度 教室ICT機器 備品購入計画（案）」を書いてください。構成：
## 1. 要約（今年度の件数と、更新が必要な機器が何台あるか）
## 2. 優先順位（表：優先／機器／教室／導入年／今年度の件数／主な原因／理由。件数・導入年・寿命・故障を根拠に。最大6件）
## 3. 更新ではなく消耗品で済むもの（ケーブル・電池・ランプの交換で減らせるもの）
## 4. 見積の依頼先（業者名と対象）
## 5. 備考（金額は見積後に記入。授業への影響の大きさを「失った授業時間」で示す）
金額は書かないでください。`;
    case "repair": {
      const t = target
        ? `対象機器: ${t2(target)}。宛先は、この機器を担当する業者（事実の「業者」から選ぶ）。`
        : "対象機器は事実の中から故障が疑われるものを1台選んでください。";
      return `業者に送る修理・点検の依頼文を書いてください。${t}
構成：件名／宛先（業者名と窓口。個人名は書かない）／対象機器（種類・メーカー・機種・設置教室・導入年・保守契約の期限）／症状の経過（日付順に）／これまでに試したこと（記録の原因から分かる範囲で）／現在の状況（予備機で授業を続けているか）／お願い（点検・修理の訪問。日程は「ご都合をお知らせください」）／差出人（県立あさひ台工業高等学校 ICT担当。連絡は学校代表電話へ、番号は書かない）
事務的で短く、A4一枚に収めてください。`;
    }
  }
}

const t2 = (d: DeviceFact) => `${d.room} ${d.kind} ${d.maker} ${d.model}（${d.installed_year}年導入）`;

/* ---------- 雛形（AIなし） ---------- */

export function renderTemplate(kind: DocKind, facts: FactPack, target: DeviceFact | null): string {
  switch (kind) {
    case "handover":
      return handoverTemplate(facts);
    case "purchase":
      return purchaseTemplate(facts);
    case "repair":
      return repairTemplate(facts, target);
  }
}

function handoverTemplate(f: FactPack): string {
  const t = f.totals;
  const L: string[] = [];
  L.push(`# ICT担当 引継ぎ文書（${f.school.fiscal_year}年度）`);
  L.push("");
  L.push(`作成日 ${f.today}　${f.school.name} ICT担当　※記録から自動生成（手順集モード）`);
  L.push("");
  L.push("## 1. まず知っておくこと");
  L.push(`- 今年度のトラブル記録は ${t.incidents}件。先生が自分で直したのが ${t.self_by_teacher}件、ICT担当が動いたのが ${t.by_ict}件`);
  L.push(`- 原因は ${pairs(f.by_cause.slice(0, 3))} の順。多くは教室で直せます`);
  L.push(`- 多い時間帯は ${f.by_period[0]?.[0] ?? "-"}、多い月は ${pairs(f.by_month.slice(0, 3))}`);
  L.push(`- 守られた授業時間（推定）${t.protected_minutes}分。先生が静的カードと手順で自分で直した分です`);
  L.push("");
  L.push("## 2. 教室と機器の確認ポイント");
  L.push("### 件数の多い教室");
  for (const r of f.by_room.slice(0, 6)) L.push(`- ${r.room}：${r.n}件（最多原因 ${r.top_cause}）`);
  L.push("### 承認済みの確認ポイント（教室の静的カードに出ています）");
  for (const q of f.quirks_by_room) L.push(`- ${q.room} ${q.kind}：${q.quirk}`);
  const sug = f.devices.filter((d) => d.suggested.length > 0);
  if (sug.length) {
    L.push("### 未承認の提案（確認して承認か却下を）");
    for (const d of sug) for (const q of d.suggested) L.push(`- ${d.room} ${d.kind}：${q}`);
  }
  L.push("");
  L.push("## 3. 年間の山場（前日までにやること）");
  for (const e of f.events) L.push(`- ${e.date} ${e.name}（${e.rooms.join("・")}）${e.ict_notes ? `：${e.ict_notes}` : ""}`);
  L.push("");
  L.push("## 4. 業者と保守契約");
  for (const v of f.vendors) {
    L.push(`- ${v.name}（${v.role}）：${v.covers.join("・")}。契約期限 ${v.until ?? "不明"}、応答目安 ${v.response_days ?? "?"}日`);
  }
  L.push("連絡先は校内の業者ファイルを参照してください。");
  L.push("");
  L.push("## 5. 予備機・消耗品の場所");
  for (const s of f.spares) L.push(`- ${s.name}：${s.location}（${s.qty}）`);
  L.push("");
  L.push("## 6. 来年度に判断すること");
  for (const w of f.lamp_warnings) L.push(`- ランプ交換：${w.room} ${w.kind} ${w.model}（${w.hours}/${w.life}時間）`);
  for (const w of f.warranty_warnings) L.push(`- 保守期限 ${w.until}：${w.room} ${w.kind} ${w.model}（${w.vendor}）`);
  for (const d of f.devices.filter((d) => d.fault_count >= 2 || d.n >= 8).slice(0, 5)) {
    L.push(`- 更新候補：${t2(d)}。今年度${d.n}件、うち機器故障${d.fault_count}件`);
  }
  L.push("");
  L.push("## 7. 未対応のチケット");
  if (f.open_tickets.length === 0) L.push("- なし");
  for (const o of f.open_tickets) L.push(`- ${o.date} ${o.room} ${o.symptom}（${o.cause}）${o.spare ? " 予備機で継続中" : ""}${o.note ? `：${o.note}` : ""}`);
  L.push("");
  L.push("## 8. 前任者から一言");
  const top = f.by_cause[0];
  if (top) L.push(`- 原因の${Math.round((top[1] / Math.max(1, t.incidents)) * 100)}%は「${top[0]}」。教室の静的カードを見てもらうだけで呼ばれる回数が減ります`);
  L.push("- 直したら原因を1タップ。文章はいりません。それがこの文書の来年版になります");
  L.push("- 直らないときは予備機で授業を続けてもらい、チケットを見てから動けば十分です");
  return L.join("\n");
}

function purchaseTemplate(f: FactPack): string {
  const fy = f.school.fiscal_year;
  const age = (d: DeviceFact) => fy - d.installed_year;
  const score = (d: DeviceFact) =>
    d.n + d.fault_count * 3 + (age(d) >= 7 ? 3 : age(d) >= 5 ? 1 : 0) + (d.lamp && d.lamp.ratio >= 0.85 ? 3 : 0);
  const ranked = f.devices
    .filter((d) => d.status === "active" && d.n > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, 6);
  const cableHeavy = f.devices.filter((d) => d.by_cause[0]?.[0] === "ケーブル・アダプタ" && d.by_cause[0][1] >= 3);
  const L: string[] = [];
  L.push(`# ${fy + 1}年度 教室ICT機器 備品購入計画（案）`);
  L.push("");
  L.push(`作成日 ${f.today}　${f.school.name} ICT担当　※記録から自動生成（手順集モード）`);
  L.push("");
  L.push("## 1. 要約");
  L.push(`- ${fy}年度（${f.range.from}〜${f.range.to}）の教室ICTトラブル記録は ${f.totals.incidents}件、失った授業時間は推定 ${f.totals.minutes_lost}分`);
  L.push(`- 件数・導入年・寿命・故障から、更新候補は ${ranked.length}台。消耗品の交換で減らせるものは別掲`);
  L.push("");
  L.push("## 2. 優先順位");
  L.push("| 優先 | 機器 | 教室 | 導入年 | 今年度件数 | 主な原因 | 理由 |");
  L.push("|---|---|---|---|---|---|---|");
  ranked.forEach((d, i) => {
    const why = [
      d.fault_count >= 2 ? `機器故障${d.fault_count}件` : "",
      age(d) >= 7 ? `導入${age(d)}年` : "",
      d.lamp && d.lamp.ratio >= 0.85 ? `ランプ${Math.round(d.lamp.ratio * 100)}%` : "",
      d.n >= 8 ? "件数が多い" : "",
    ]
      .filter(Boolean)
      .join("、");
    L.push(`| ${i + 1} | ${d.kind} ${d.model} | ${d.room} | ${d.installed_year} | ${d.n} | ${d.by_cause[0]?.[0] ?? "-"} | ${why || "-"} |`);
  });
  L.push("");
  L.push("## 3. 更新ではなく消耗品で済むもの");
  if (cableHeavy.length === 0) L.push("- なし");
  for (const d of cableHeavy) L.push(`- ${d.room} ${d.kind}：ケーブル起因が${d.by_cause[0][1]}件。HDMIケーブル交換で減らせる見込み`);
  for (const w of f.lamp_warnings) L.push(`- ${w.room} ${w.kind} ${w.model}：ランプ交換（${w.hours}/${w.life}時間）`);
  L.push("");
  L.push("## 4. 見積の依頼先");
  for (const v of f.vendors) L.push(`- ${v.name}：${v.covers.join("・")}`);
  L.push("");
  L.push("## 5. 備考");
  L.push("- 金額は見積後に記入");
  L.push(`- 授業への影響：今年度の記録で失った授業時間は推定 ${f.totals.minutes_lost}分。先生の自己解決で守られた時間は推定 ${f.totals.protected_minutes}分`);
  return L.join("\n");
}

function repairTemplate(f: FactPack, d: DeviceFact | null): string {
  if (!d) return "# 修理依頼\n\n対象となる機器の記録がありません。";
  const vendor = f.vendors.find((v) => v.name === d.vendor) ?? f.vendors.find((v) => v.covers.includes(d.model));
  const tried = d.by_cause
    .map(([c]) => c)
    .filter((c) => c !== "機器故障" && c !== "わからない")
    .map((c) => ({ 入力切替: "入力切替の確認", "ケーブル・アダプタ": "ケーブルの挿し直し・交換", "電池・リモコン": "リモコンの電池交換", 端末の設定: "教卓PCの出力先設定の確認", 電源: "主電源の確認" })[c] ?? c);
  const spareNow = f.open_tickets.some((o) => o.room === d.room && o.spare);
  const L: string[] = [];
  L.push(`# 修理・点検のお願い（${d.kind} ${d.model}）`);
  L.push("");
  L.push(`${vendor ? `${vendor.name}　${vendor.role} 御中` : "保守窓口 御中"}`);
  L.push("");
  L.push(`${f.today}　${f.school.name} ICT担当`);
  L.push("");
  L.push("## 対象機器");
  L.push(`- ${d.kind}　${d.maker} ${d.model}（${d.installed_year}年導入）`);
  L.push(`- 設置場所：${d.room}`);
  if (d.warranty_until) {
    L.push(
      `- 保守契約の期限：${d.warranty_until}${d.warranty_until < f.today ? "（期限切れ。有償点検になる見込み）" : ""}`,
    );
  }
  L.push("");
  L.push("## 症状の経過");
  for (const r of d.records.slice(-8)) L.push(`- ${r}`);
  L.push("");
  L.push("## これまでに試したこと");
  if (tried.length === 0) L.push("- 基本手順（入力切替・ケーブル・電源の確認）");
  for (const x of tried) L.push(`- ${x}`);
  L.push("");
  L.push("## 現在の状況");
  L.push(spareNow ? "- 予備機で授業を続けています" : "- 授業は続けていますが、再発しています");
  L.push("");
  L.push("## お願い");
  L.push("- 点検・修理の訪問をお願いします。ご都合のよい日程をお知らせください");
  L.push("- 連絡は学校代表電話のICT担当までお願いします");
  return L.join("\n");
}
