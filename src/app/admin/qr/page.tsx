import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { loadAll } from "@/lib/store";
import { Mark } from "@/components/Mark";
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
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-14 pt-7 print:max-w-none print:space-y-0 print:px-0 print:py-0">
      <header className="space-y-3 print:hidden">
        <p className="text-sm text-muted">
          <Link href="/admin" className="link">
            ICT担当ダッシュボード
          </Link>
          <span aria-hidden="true">　›　</span>教卓QR
        </p>
        <h1 className="text-[28px] font-bold tracking-tight">教卓に貼るQRカード</h1>
        <p className="text-sm text-ink-2">
          A4で印刷すると1枚に6教室分。切って教卓の見える所に貼ります。QRの先は {origin}/room/… です。
          公開後は本番のアドレスで開き直してから印刷してください。
        </p>
        <PrintButton />
      </header>

      {/* 印刷時：A4縦・余白10mmで 2列×3段＝6枚。カードの高さを mm で固定して段ずれを防ぐ */}
      <div className="grid grid-cols-2 gap-4 print:grid-cols-2 print:gap-0">
        {cards.map(({ room, url, svg }) => (
          <article
            key={room.id}
            className="card flex flex-col items-center justify-center p-5 text-center print:h-[92mm] print:break-inside-avoid print:rounded-none print:border-dashed print:p-3 print:shadow-none"
            style={{ printColorAdjust: "exact" }}
          >
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Mark size={16} />
              {school.name}
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">{room.name}</h2>
            <p className="mt-1 text-sm font-bold">映らない・鳴らないときは、ここを読む</p>
            <div className="my-3 w-40" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="text-[11px] text-muted">{url}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              症状を1つ押すだけ。直し方が出ます。直らなければ予備機の案内とICT担当への連絡まで。
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
