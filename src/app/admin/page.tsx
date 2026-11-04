import Link from "next/link";
import { QuirkProposals } from "@/components/QuirkProposals";
import { TicketList } from "@/components/TicketList";
import { WAIT_MIN } from "@/lib/agent/facts";
import { hasApiKey } from "@/lib/llm/client";
import { CAUSE_LABEL, DEVICE_KIND_LABEL, type CauseTag } from "@/lib/schema";
import { loadAll } from "@/lib/store";
import { getToday } from "@/lib/today";

/** ICT担当ダッシュボード（v0：チケット、数字、寿命、繰り返す教室） */
export default async function AdminPage() {
  const today = await getToday();
  const { school, rooms, devices, incidents } = await loadAll();
  const roomNames = Object.fromEntries(rooms.map((r) => [r.id, r.name]));

  const fyStart = `${school.fiscal_year}-04-01`;
  const upToToday = incidents.filter((i) => i.datetime.slice(0, 10) >= fyStart && i.datetime.slice(0, 10) <= today);
  const tickets = upToToday
    .filter((i) => i.ticket_status === "open")
    .sort((a, b) => (a.datetime < b.datetime ? 1 : -1));

  // 守られた授業分数（推定）：先生が自分で直した件数 × ICT担当を待つと余計にかかる分数
  const selfByTeacher = upToToday.filter((i) => i.resolved === "self" && i.resolved_by === "teacher");
  const protectedMinutes = selfByTeacher.length * WAIT_MIN;

  // 原因の内訳
  const causeCount = new Map<CauseTag, number>();
  for (const i of upToToday) causeCount.set(i.cause_tag, (causeCount.get(i.cause_tag) ?? 0) + 1);
  const causes = [...causeCount.entries()].sort((a, b) => b[1] - a[1]);

  // 直近60日で繰り返している教室
  const since = new Date(today);
  since.setDate(since.getDate() - 60);
  const sinceStr = since.toISOString().slice(0, 10);
  const byRoom = new Map<string, number>();
  for (const i of upToToday) {
    if (i.datetime.slice(0, 10) >= sinceStr) byRoom.set(i.room_id, (byRoom.get(i.room_id) ?? 0) + 1);
  }
  const repeating = [...byRoom.entries()]
    .filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // 確認ポイントの提案（未承認）
  const proposals = devices.flatMap((d) =>
    d.suggested_quirks.map((text) => ({
      device_id: d.id,
      room: d.room_id ? (roomNames[d.room_id] ?? d.room_id) : "予備",
      kind: DEVICE_KIND_LABEL[d.kind],
      text,
    })),
  );

  // 寿命・保守期限
  const lampWarn = devices.filter(
    (d) => d.lamp_hours && d.lamp_life_hours && d.lamp_hours / d.lamp_life_hours >= 0.85,
  );
  const in90 = new Date(today);
  in90.setDate(in90.getDate() + 90);
  const warrantyWarn = devices.filter(
    (d) => d.warranty_until && d.warranty_until <= in90.toISOString().slice(0, 10) && d.warranty_until >= today,
  );

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
      <header>
        <p className="text-sm text-zinc-500">{school.name}</p>
        <h1 className="text-2xl font-bold">ICT担当ダッシュボード</h1>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="今年度の件数" value={upToToday.length} unit="件" />
        <Stat label="先生が自分で解決" value={selfByTeacher.length} unit="件" />
        <Stat label="守られた授業（推定）" value={protectedMinutes} unit="分" />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">未対応チケット（{tickets.length}）</h2>
        <TicketList tickets={tickets} roomNames={roomNames} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">確認ポイントの提案（{proposals.length}）</h2>
        <p className="text-sm text-zinc-500">履歴から見つけた「教室のメモに載せる1行」。承認したものだけが先生に見えます。</p>
        <QuirkProposals items={proposals} hasKey={hasApiKey()} />
      </section>

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Link
          href="/admin/docs"
          className="block rounded-2xl border border-zinc-900 bg-white p-4 hover:bg-zinc-50"
        >
          <p className="font-semibold">書類の下書きを作る →</p>
          <p className="mt-1 text-sm text-zinc-500">引継ぎ文書・備品購入計画・修理依頼文。今年度の記録だけを材料に書きます。</p>
        </Link>
        <Link href="/admin/qr" className="block rounded-2xl border border-zinc-300 bg-white p-4 hover:bg-zinc-50">
          <p className="font-semibold">教卓QRを印刷 →</p>
          <p className="mt-1 text-sm text-zinc-500">全教室ぶんをA4に。</p>
        </Link>
      </div>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">原因の内訳</h2>
          <ul className="space-y-1 text-sm">
            {causes.map(([c, n]) => (
              <li key={c} className="flex items-center gap-2">
                <span className="w-28 shrink-0">{CAUSE_LABEL[c]}</span>
                <span className="h-2 rounded bg-zinc-800" style={{ width: `${(n / upToToday.length) * 100}%` }} />
                <span className="text-zinc-500">{n}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">直近60日で繰り返す教室</h2>
          {repeating.length === 0 ? (
            <p className="text-sm text-zinc-500">なし</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {repeating.map(([r, n]) => (
                <li key={r}>
                  <Link href={`/room/${r}`} className="underline">
                    {roomNames[r] ?? r}
                  </Link>
                  　{n}件
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">ランプ寿命が近い</h2>
          {lampWarn.length === 0 ? (
            <p className="text-sm text-zinc-500">なし</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {lampWarn.map((d) => (
                <li key={d.id}>
                  {d.room_id ? roomNames[d.room_id] : "予備"}　{DEVICE_KIND_LABEL[d.kind]} {d.model}
                  <span className="text-zinc-500">
                    　{d.lamp_hours} / {d.lamp_life_hours} 時間
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">保守期限が90日以内</h2>
          {warrantyWarn.length === 0 ? (
            <p className="text-sm text-zinc-500">なし</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {warrantyWarn.map((d) => (
                <li key={d.id}>
                  {d.room_id ? roomNames[d.room_id] : "予備"}　{DEVICE_KIND_LABEL[d.kind]} {d.model}　〜{d.warranty_until}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <p className="text-xs text-zinc-400">
        「守られた授業」は、先生が自分で直した件数 × {WAIT_MIN}分（ICT担当を待つ推定時間）で計算しています。
      </p>
    </main>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-2xl font-bold">
        {value}
        <span className="ml-1 text-sm font-normal text-zinc-500">{unit}</span>
      </p>
    </div>
  );
}
