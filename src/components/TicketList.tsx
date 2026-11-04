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
    return <p className="text-sm text-zinc-500">未対応のチケットはありません。</p>;
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
      {tickets.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">
              {roomNames[t.room_id] ?? t.room_id}　{SYMPTOM_LABEL[t.symptom]}
            </p>
            <p className="text-sm text-zinc-500">
              {t.datetime.slice(0, 16).replace("T", " ")}　{CAUSE_LABEL[t.cause_tag]}
              {t.resolved === "spare" && "　予備機で継続中"}
              {t.note && `　${t.note}`}
            </p>
          </div>
          <button
            type="button"
            disabled={busy === t.id}
            onClick={() => close(t.id)}
            className="shrink-0 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            対応した
          </button>
        </li>
      ))}
    </ul>
  );
}
