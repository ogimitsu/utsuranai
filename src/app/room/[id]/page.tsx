import Link from "next/link";
import { notFound } from "next/navigation";
import { Triage } from "@/components/Triage";
import { CAUSE_LABEL, DEVICE_KIND_LABEL, SYMPTOM_LABEL } from "@/lib/schema";
import { getRoomContext } from "@/lib/store";
import { getToday } from "@/lib/today";
import { hasApiKey } from "@/lib/llm/client";

/**
 * 教室ページ。教卓のQRコードからここに来る。
 * 上：一次対応フロー／下：教室のメモ（AIなしで常に出る）
 */
export default async function RoomPage(props: PageProps<"/room/[id]">) {
  const { id } = await props.params;
  const today = await getToday();
  const ctx = await getRoomContext(id, today);
  if (!ctx) notFound();

  const main = ctx.devices.find((d) => d.kind === "projector" || d.kind === "display") ?? null;
  const quirks = ctx.devices.flatMap((d) => d.quirks.map((q) => ({ device: DEVICE_KIND_LABEL[d.kind], q })));

  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-4 pb-12 pt-5">
      <header>
        <p className="eyebrow">
          {ctx.room.building}　{ctx.room.floor}階
        </p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight">{ctx.room.name}</h1>
      </header>

      <Triage roomId={ctx.room.id} mainDeviceId={main?.id ?? null} photoEnabled={hasApiKey()} />

      <section className="card p-4" aria-labelledby="memo">
        <h2 id="memo" className="eyebrow">
          この教室のメモ
        </h2>
        <ul className="dot-list mt-3 space-y-2 text-[16px] leading-relaxed">
          {ctx.room.notes_static.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
          {quirks.map((x, i) => (
            <li key={`q${i}`}>
              <span className="text-muted">{x.device}：</span>
              {x.q}
            </li>
          ))}
        </ul>
        {(main?.cable_location || main?.remote_location) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {main?.cable_location && (
              <span className="chip">
                <span className="text-muted">ケーブル：</span>
                {main.cable_location}
              </span>
            )}
            {main?.remote_location && (
              <span className="chip">
                <span className="text-muted">リモコン：</span>
                {main.remote_location}
              </span>
            )}
          </div>
        )}
        <details className="mt-3 text-sm text-ink-2">
          <summary className="cursor-pointer rounded-md py-1 font-semibold">機器一覧</summary>
          <ul className="mt-2 space-y-1">
            {ctx.devices.map((d) => (
              <li key={d.id}>
                {DEVICE_KIND_LABEL[d.kind]}：{d.maker} {d.model}（{d.installed_year}年）
                {d.inputs.length > 0 && <span className="text-muted"> / {d.inputs.join("・")}</span>}
              </li>
            ))}
          </ul>
        </details>
      </section>

      {ctx.recentIncidents.length > 0 && (
        <section aria-labelledby="recent">
          <h2 id="recent" className="eyebrow">
            最近この教室で
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
            {ctx.recentIncidents.slice(0, 3).map((i) => (
              <li key={i.id} className="flex gap-3">
                <span className="w-12 shrink-0 tabular-nums text-muted">{i.datetime.slice(5, 10).replace("-", "/")}</span>
                <span>
                  {SYMPTOM_LABEL[i.symptom]} → {CAUSE_LABEL[i.cause_tag]}
                  {i.note && <span className="block text-muted">{i.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-sm">
        <Link href="/" className="link">
          教室一覧
        </Link>
      </p>
    </main>
  );
}
