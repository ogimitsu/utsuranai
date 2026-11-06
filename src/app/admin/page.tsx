import Link from "next/link";
import { QuirkProposals } from "@/components/QuirkProposals";
import { TicketList } from "@/components/TicketList";
import { WAIT_MIN } from "@/lib/agent/facts";
import { hasApiKey } from "@/lib/llm/client";
import { CAUSE_LABEL, DEVICE_KIND_LABEL, type CauseTag } from "@/lib/schema";
import { loadAll } from "@/lib/store";
import { getToday } from "@/lib/today";

/** ICT担当ダッシュボード（チケット、数字、寿命、繰り返す教室） */
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
  const causeMax = causes[0]?.[1] ?? 1;

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
    <main className="mx-auto w-full max-w-3xl space-y-9 px-4 pb-14 pt-7">
      <header>
        <p className="eyebrow">{school.name}</p>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">ICT担当ダッシュボード</h1>
      </header>

      <section className="grid grid-cols-3 gap-3" aria-label="今年度の数字">
        <Stat label="今年度の件数" value={upToToday.length} unit="件" />
        <Stat label="先生が自分で解決" value={selfByTeacher.length} unit="件" />
        <Stat label="守られた授業（推定）" value={protectedMinutes} unit="分" />
      </section>

      <section className="space-y-3" aria-labelledby="h-tickets">
        <h2 id="h-tickets" className="h-section">
          未対応チケット <span className="count">{tickets.length}</span>
        </h2>
        <TicketList tickets={tickets} roomNames={roomNames} />
      </section>

      <section className="space-y-3" aria-labelledby="h-proposals">
        <h2 id="h-proposals" className="h-section">
          確認ポイントの提案 <span className="count">{proposals.length}</span>
        </h2>
        <p className="text-sm text-ink-2">履歴から見つけた「教室のメモに載せる1行」。承認したものだけが先生に見えます。</p>
        <QuirkProposals items={proposals} hasKey={hasApiKey()} />
      </section>

      <div className="grid gap-3 sm:grid-cols-[3fr_2fr]">
        <Link href="/admin/docs" className="card flex items-center justify-between gap-3 p-5 hover:border-ink">
          <span>
            <span className="block text-lg font-bold">書類の下書きを作る</span>
            <span className="mt-1 block text-sm text-ink-2">引継ぎ文書・備品購入計画・修理依頼文。今年度の記録だけを材料に。</span>
          </span>
          <span aria-hidden="true" className="text-2xl">
            →
          </span>
        </Link>
        <Link href="/admin/qr" className="card flex items-center justify-between gap-3 p-5 hover:border-ink">
          <span>
            <span className="block text-lg font-bold">教卓QRを印刷</span>
            <span className="mt-1 block text-sm text-ink-2">全教室ぶんをA4に。</span>
          </span>
          <span aria-hidden="true" className="text-2xl">
            →
          </span>
        </Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card space-y-3 p-5">
          <h2 className="h-section">原因の内訳</h2>
          <ul className="space-y-2 text-sm">
            {causes.map(([c, n]) => (
              <li key={c} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2">
                <span className="truncate">{CAUSE_LABEL[c]}</span>
                <span className="h-3 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(n / causeMax) * 100}%` }} />
                </span>
                <span className="text-right font-bold tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card space-y-3 p-5">
          <h2 className="h-section">直近60日で繰り返す教室</h2>
          {repeating.length === 0 ? (
            <p className="text-sm text-muted">なし</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {repeating.map(([r, n]) => (
                <li key={r} className="flex items-center justify-between gap-2">
                  <Link href={`/room/${r}`} className="link">
                    {roomNames[r] ?? r}
                  </Link>
                  <span className="count">{n}件</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card space-y-3 p-5">
          <h2 className="h-section">ランプ寿命が近い</h2>
          {lampWarn.length === 0 ? (
            <p className="text-sm text-muted">なし</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {lampWarn.map((d) => (
                <li key={d.id}>
                  <p className="font-semibold">
                    {d.room_id ? roomNames[d.room_id] : "予備"}　{DEVICE_KIND_LABEL[d.kind]} {d.model}
                  </p>
                  <p className="tabular-nums text-muted">
                    {d.lamp_hours} / {d.lamp_life_hours} 時間
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card space-y-3 p-5">
          <h2 className="h-section">保守期限が90日以内</h2>
          {warrantyWarn.length === 0 ? (
            <p className="text-sm text-muted">なし</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {warrantyWarn.map((d) => (
                <li key={d.id}>
                  <p className="font-semibold">
                    {d.room_id ? roomNames[d.room_id] : "予備"}　{DEVICE_KIND_LABEL[d.kind]} {d.model}
                  </p>
                  <p className="tabular-nums text-muted">〜{d.warranty_until} まで</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <p className="text-xs text-muted">
        「守られた授業」は、先生が自分で直した件数 × {WAIT_MIN}分（ICT担当を待つ推定時間）で計算しています。
      </p>
    </main>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 text-[30px] font-bold leading-none tabular-nums tracking-tight">
        {value}
        <span className="ml-1 text-sm font-semibold text-muted">{unit}</span>
      </p>
    </div>
  );
}
