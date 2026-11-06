import Link from "next/link";
import { loadAll } from "@/lib/store";

/** 教室一覧。本番では教卓のQRコードから各教室ページへ直接入る */
export default async function Home() {
  const { school, rooms } = await loadAll();
  const buildings = [...new Set(rooms.map((r) => r.building))];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-12 pt-7">
      <header className="space-y-2">
        <p className="eyebrow">{school.name}</p>
        <h1 className="text-3xl font-bold tracking-tight">教室を選ぶ</h1>
        <p className="max-w-xl text-ink-2">
          機器が映らない・鳴らないとき、教卓のQRコードを読むか、ここから教室を選んでください。
        </p>
      </header>

      {buildings.map((b) => (
        <section key={b} className="space-y-3" aria-labelledby={`b-${b}`}>
          <h2 id={`b-${b}`} className="h-section">
            {b}
            <span className="count">{rooms.filter((r) => r.building === b).length}</span>
          </h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {rooms
              .filter((r) => r.building === b)
              .map((r) => (
                <Link
                  key={r.id}
                  href={`/room/${r.id}`}
                  className="card flex min-h-14 items-center justify-center px-3 py-3 text-center font-bold hover:border-ink"
                >
                  {r.name}
                </Link>
              ))}
          </div>
        </section>
      ))}

      <Link href="/admin" className="card flex items-center justify-between gap-3 p-4 hover:border-ink">
        <span>
          <span className="block font-bold">ICT担当の方はこちら</span>
          <span className="block text-sm text-muted">未対応チケット・確認ポイント・書類の下書き</span>
        </span>
        <span aria-hidden="true" className="text-2xl">
          →
        </span>
      </Link>
    </main>
  );
}
