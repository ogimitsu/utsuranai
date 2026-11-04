"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 確認ポイントの提案（AI・ルールが履歴から見つけたもの）の承認・却下。
 * 承認すると教室のメモに出る。却下すると再提案されない。
 */
export type ProposalItem = { device_id: string; room: string; kind: string; text: string };

export function QuirkProposals({ items, hasKey }: { items: ProposalItem[]; hasKey: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function decide(item: ProposalItem, action: "approve" | "reject") {
    const key = `${item.device_id}:${item.text}`;
    setBusy(key);
    await fetch("/api/devices", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.device_id, [action]: item.text }),
    });
    setBusy(null);
    router.refresh();
  }

  async function run() {
    setRunning(true);
    setMsg(null);
    try {
      const res = await fetch("/api/patterns", { method: "POST" });
      const j = (await res.json()) as { source: string; added: number; proposals: unknown[] };
      setMsg(
        j.added > 0
          ? `${j.added}件の提案を追加しました（${j.source === "ai" ? "Sonnet" : "集計ルール"}）`
          : `新しい提案はありませんでした（${j.proposals.length}件はすでに登録済みか却下済み）`,
      );
      router.refresh();
    } catch {
      setMsg("提案の生成に失敗しました");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">未承認の提案はありません。</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
          {items.map((it) => {
            const key = `${it.device_id}:${it.text}`;
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-500">
                    {it.room}　{it.kind}
                  </p>
                  <p className="font-medium">{it.text}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busy === key}
                    onClick={() => decide(it, "approve")}
                    className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    承認して教室に出す
                  </button>
                  <button
                    type="button"
                    disabled={busy === key}
                    onClick={() => decide(it, "reject")}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    却下
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          disabled={running}
          onClick={run}
          className="rounded-xl border border-zinc-300 bg-white px-3 py-2 font-semibold disabled:opacity-50"
        >
          {running ? "履歴を読んでいます…" : "履歴から提案を作る"}
        </button>
        <span className="text-zinc-500">
          {msg ?? (hasKey ? "Sonnet が今年度の記録から、教室のメモに載せる1行を提案します" : "APIキーが無いため、集計ルールで提案します")}
        </span>
      </div>
    </div>
  );
}
