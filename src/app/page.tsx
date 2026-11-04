import Link from "next/link";
import { loadAll } from "@/lib/store";

/** 教室一覧。本番では教卓のQRコードから各教室ページへ直接入る */
export default async function Home() {
  const { school, rooms } = await loadAll();
  const buildings = [...new Set(rooms.map((r) => r.building))];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
      <header className="space-y-2">
        <p className="text-sm text-zinc-500">{school.name}</p>
        <h1 className="text-3xl font-bold">映らないノート</h1>
        <p className="text-zinc-600">
          教室の機器が映らない・鳴らないとき、教卓のQRコードを読むか、下から教室を選んでください。
        </p>
      </header>

      {buildings.map((b) => (
        <section key={b} className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-500">{b}</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {rooms
              .filter((r) => r.building === b)
              .map((r) => (
                <Link
                  key={r.id}
                  href={`/room/${r.id}`}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-3 text-center font-semibold hover:bg-zinc-50"
                >
                  {r.name}
                </Link>
              ))}
          </div>
        </section>
      ))}

      <p className="text-sm text-zinc-500">
        ICT担当の方は{" "}
        <Link href="/admin" className="underline">
          ダッシュボード
        </Link>{" "}
        へ。
      </p>
    </main>
  );
}
