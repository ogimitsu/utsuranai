import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { loadAll } from "@/lib/store";
import { PrintButton } from "@/components/PrintButton";

/**
 * 教卓に貼るQRカード。A4に6枚。印刷して切り、教卓の見える所に貼る。
 * URLはこのページを開いたホストから組み立てる（開発中は localhost、公開後は本番ドメイン）。
 */
export default async function QrPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const { school, rooms } = await loadAll();
  const cards = await Promise.all(
    rooms.map(async (r) => {
      const url = `${origin}/room/${r.id}`;
      const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
      return { room: r, url, svg };
    }),
  );

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 print:max-w-none print:space-y-0 print:px-0 print:py-0">
      <header className="space-y-2 print:hidden">
        <p className="text-sm text-zinc-500">
          <Link href="/admin" className="underline">
            ICT担当
          </Link>{" "}
          / 教卓QR
        </p>
        <h1 className="text-2xl font-bold">教卓に貼るQRカード</h1>
        <p className="text-sm text-zinc-600">
          A4で印刷すると1枚に6教室分。切って教卓の見える所に貼ります。QRの先は {origin}/room/… です。
          公開後は本番のアドレスで開き直してから印刷してください。
        </p>
        <PrintButton />
      </header>

      <div className="grid grid-cols-2 gap-4 print:grid-cols-2 print:gap-0">
        {cards.map(({ room, url, svg }) => (
          <article
            key={room.id}
            className="flex flex-col items-center rounded-2xl border border-zinc-300 bg-white p-4 text-center print:break-inside-avoid print:rounded-none print:border-dashed"
            style={{ printColorAdjust: "exact" }}
          >
            <p className="text-xs text-zinc-500">{school.name}</p>
            <h2 className="text-2xl font-bold">{room.name}</h2>
            <p className="mt-1 text-sm font-semibold">映らない・鳴らないときは、ここを読む</p>
            <div className="my-3 w-40" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="text-[11px] text-zinc-500">{url}</p>
            <p className="mt-1 text-[11px] text-zinc-500">症状を1つ押すだけ。直し方が出ます。直らなければ予備機の案内とICT担当への連絡まで。</p>
          </article>
        ))}
      </div>
    </main>
  );
}
