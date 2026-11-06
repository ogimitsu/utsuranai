"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CAUSE_LABEL, SYMPTOM_LABEL, type Incident } from "@/lib/schema";

/** ICT担当向け：未対応チケットの一覧と「対応した」ボタン */
export function TicketList({ tickets, roomNames }: { tickets: Incident[]; roomNames: Record<string, string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function close(id: string) {
    setBusy(id);
    await fetch("/api/incidents", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ticket_status: "done" }),
    });
    setBusy(null);
    router.refresh();
  }

  if (tickets.length === 0) {
    return <p className="card p-4 text-sm text-muted">未対応のチケットはありません。</p>;
  }

  return (
    <ul className="card divide-y divide-line">
      {tickets.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0 space-y-1.5">
            <p className="font-bold">
              {roomNames[t.room_id] ?? t.room_id}
              <span className="ml-2 font-semibold text-ink-2">{SYMPTOM_LABEL[t.symptom]}</span>
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
              <span className="tabular-nums text-muted">{t.datetime.slice(0, 16).replace("T", " ")}</span>
              <span className="chip py-0.5 text-xs">{CAUSE_LABEL[t.cause_tag]}</span>
              {t.resolved === "spare" && <span className="chip chip-warn py-0.5 text-xs">予備機で継続中</span>}
            </p>
            {t.note && <p className="text-sm text-ink-2">{t.note}</p>}
          </div>
          <button
            type="button"
            disabled={busy === t.id}
            onClick={() => close(t.id)}
            className="btn btn-primary btn-sm shrink-0"
          >
            対応した
          </button>
        </li>
      ))}
    </ul>
  );
}
