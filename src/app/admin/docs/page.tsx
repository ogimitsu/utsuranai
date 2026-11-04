import Link from "next/link";
import { DocStudio } from "@/components/DocStudio";
import { buildFactPack } from "@/lib/agent/facts";
import { DOC_DESC, DOC_KINDS, DOC_LABEL } from "@/lib/agent/documents";
import { hasApiKey } from "@/lib/llm/client";
import { getToday } from "@/lib/today";

/** 書類（/admin/docs）：引継ぎ文書・備品購入計画・修理依頼文の下書き */
export default async function DocsPage() {
  const today = await getToday();
  const facts = await buildFactPack(today);

  // 修理依頼の対象候補：機器故障の記録がある機器を先頭に、記録のある機器
  const repairTargets = [...facts.devices]
    .filter((d) => d.n > 0)
    .sort((a, b) => b.fault_count - a.fault_count || b.n - a.n)
    .slice(0, 12)
    .map((d) => ({
      id: d.id,
      label: `${d.room} ${d.kind} ${d.model}（今年度${d.n}件${d.fault_count ? `・故障${d.fault_count}件` : ""}）`,
    }));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <p className="text-sm text-zinc-500">
          <Link href="/admin" className="underline">
            ICT担当ダッシュボード
          </Link>
          　›　書類
        </p>
        <h1 className="text-2xl font-bold">書類の下書き</h1>
        <p className="text-sm text-zinc-600">
          {facts.school.name}　{facts.school.fiscal_year}年度　{facts.range.from}〜{facts.range.to} の記録{" "}
          {facts.totals.incidents}件が材料です。ヘッダーの「今日」を年度末に動かすと、1年分の引継ぎになります。
        </p>
      </header>

      <DocStudio
        kinds={DOC_KINDS.map((k) => ({ kind: k, label: DOC_LABEL[k], desc: DOC_DESC[k] }))}
        repairTargets={repairTargets}
        hasKey={hasApiKey()}
        today={today}
      />
    </main>
  );
}
