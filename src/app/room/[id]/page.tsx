import Link from "next/link";
import { notFound } from "next/navigation";
import { Triage } from "@/components/Triage";
import { CAUSE_LABEL, DEVICE_KIND_LABEL, SYMPTOM_LABEL } from "@/lib/schema";
import { getRoomContext } from "@/lib/store";
import { getToday } from "@/lib/today";
import { hasApiKey } from "@/lib/llm/client";

/**
 * 教室ページ。教卓のQRコードからここに来る。
 * 上：静的カード（AIなしで常に出る）／下：一次対応フロー
 */
export default async function RoomPage(props: PageProps<"/room/[id]">) {
  const { id } = await props.params;
  const today = await getToday();
  const ctx = await getRoomContext(id, today);
  if (!ctx) notFound();

  const main = ctx.devices.find((d) => d.kind === "projector" || d.kind === "display") ?? null;
  const quirks = ctx.devices.flatMap((d) => d.quirks.map((q) => ({ device: DEVICE_KIND_LABEL[d.kind], q })));

  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-4 py-5">
      <header className="space-y-1">
        <p className="text-sm text-zinc-500">
          {ctx.room.building} {ctx.room.floor}階
        </p>
        <h1 className="text-3xl font-bold">{ctx.room.name}</h1>
      </header>

      <Triage roomId={ctx.room.id} mainDeviceId={main?.id ?? null} photoEnabled={hasApiKey()} />

      <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <h2 className="mb-2 text-sm font-semibold text-zinc-500">この教室のメモ</h2>
        <ul className="space-y-1.5 text-[15px] leading-relaxed">
          {ctx.room.notes_static.map((n, i) => (
            <li key={i}>・{n}</li>
          ))}
          {quirks.map((x, i) => (
            <li key={`q${i}`}>
              ・<span className="text-zinc-500">{x.device}：</span>
              {x.q}
            </li>
          ))}
          {main?.cable_location && <li>・ケーブル：{main.cable_location}</li>}
          {main?.remote_location && <li>・リモコン：{main.remote_location}</li>}
        </ul>
        <details className="mt-3 text-sm text-zinc-600">
          <summary className="cursor-pointer">機器一覧</summary>
          <ul className="mt-2 space-y-1">
            {ctx.devices.map((d) => (
              <li key={d.id}>
                {DEVICE_KIND_LABEL[d.kind]}：{d.maker} {d.model}（{d.installed_year}年）
                {d.inputs.length > 0 && <span className="text-zinc-400"> / {d.inputs.join("・")}</span>}
              </li>
            ))}
          </ul>
        </details>
      </section>

      {ctx.recentIncidents.length > 0 && (
        <section className="text-sm text-zinc-500">
          <h2 className="mb-1 font-semibold">最近この教室で</h2>
          <ul className="space-y-0.5">
            {ctx.recentIncidents.slice(0, 3).map((i) => (
              <li key={i.id}>
                {i.datetime.slice(5, 10).replace("-", "/")}　{SYMPTOM_LABEL[i.symptom]} → {CAUSE_LABEL[i.cause_tag]}
                {i.note && <span className="text-zinc-400">　{i.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs text-zinc-400">
        <Link href="/" className="underline">
          教室一覧
        </Link>
      </p>
    </main>
  );
}
