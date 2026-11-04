import {
  CAUSE_LABEL,
  DEVICE_KIND_LABEL,
  SYMPTOM_LABEL,
  type Device,
  type Incident,
} from "@/lib/schema";
import { loadAll } from "@/lib/store";

/**
 * 事実パック。
 * 履歴・台帳から「今日」時点の数字と一覧を決定的に集計する。
 * 確認ポイントの抽出（patterns.ts）と文書生成（documents.ts）はこれだけを材料にする。
 * AIに数字を数えさせない＝数字を作らせない、ための層。
 */

/** ICT担当を待つと余計にかかる推定分数（「守られた授業」の係数） */
export const WAIT_MIN = 8;

export type Period = "朝（1〜2限）" | "昼前後（3〜4限）" | "午後（5〜6限）" | "放課後・その他";

export function periodOf(datetime: string): Period {
  const h = Number(datetime.slice(11, 13));
  if (h < 11) return "朝（1〜2限）";
  if (h < 13) return "昼前後（3〜4限）";
  if (h < 16) return "午後（5〜6限）";
  return "放課後・その他";
}

export function monthLabel(datetime: string): string {
  return `${Number(datetime.slice(5, 7))}月`;
}

/** 件数の多い順に [ラベル, 件数] を返す */
export function tally<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export type DeviceFact = {
  id: string;
  room_id: string | null;
  room: string;
  kind: string;
  maker: string;
  model: string;
  installed_year: number;
  status: string;
  n: number;
  by_cause: [string, number][];
  by_symptom: [string, number][];
  by_period: [string, number][];
  by_month: [string, number][];
  /** 「04/12 朝（1〜2限） 映らない→ケーブル: メモ」の形。時系列 */
  records: string[];
  notes: string[];
  quirks: string[];
  suggested: string[];
  rejected: string[];
  lamp?: { hours: number; life: number; ratio: number };
  warranty_until?: string;
  vendor?: string;
  fault_count: number;
};

export type FactPack = {
  today: string;
  school: { name: string; fiscal_year: number };
  range: { from: string; to: string };
  totals: {
    incidents: number;
    self_by_teacher: number;
    self_by_student: number;
    by_ict: number;
    spare: number;
    ticket: number;
    minutes_lost: number;
    protected_minutes: number;
    open_tickets: number;
  };
  by_cause: [string, number][];
  by_symptom: [string, number][];
  by_month: [string, number][];
  by_period: [string, number][];
  by_room: { room_id: string; room: string; n: number; top_cause: string }[];
  /** 記録のある機器（件数順）＋確認ポイントや提案のある機器 */
  devices: DeviceFact[];
  quirks_by_room: { room: string; kind: string; quirk: string }[];
  lamp_warnings: { room: string; kind: string; model: string; hours: number; life: number }[];
  warranty_warnings: { room: string; kind: string; model: string; until: string; vendor: string }[];
  vendors: { id: string; name: string; role: string; covers: string[]; until?: string; response_days?: number }[];
  spares: { name: string; location: string; qty: number; consumable: boolean }[];
  events: { date: string; name: string; rooms: string[]; ict_notes?: string }[];
  open_tickets: { date: string; room: string; symptom: string; cause: string; note?: string; spare: boolean }[];
};

export async function buildFactPack(today: string): Promise<FactPack> {
  const { school, rooms, devices, incidents, vendors, spares } = await loadAll();
  const from = `${school.fiscal_year}-04-01`;
  const roomName = (id: string | null) => (id ? (rooms.find((r) => r.id === id)?.name ?? id) : "予備（ICT準備室）");
  const vendorName = (id?: string) => (id ? (vendors.find((v) => v.id === id)?.name ?? id) : undefined);

  const inFY = incidents
    .filter((i) => {
      const d = i.datetime.slice(0, 10);
      return d >= from && d <= today;
    })
    .sort((a, b) => (a.datetime < b.datetime ? -1 : 1));

  const selfByTeacher = inFY.filter((i) => i.resolved === "self" && i.resolved_by === "teacher");
  const selfByStudent = inFY.filter((i) => i.resolved === "self" && i.resolved_by === "student");
  const byIct = inFY.filter((i) => i.resolved_by === "ict");
  const openTickets = inFY.filter((i) => i.ticket_status === "open");

  const byRoom = tally(inFY, (i) => i.room_id).map(([room_id, n]) => {
    const top = tally(
      inFY.filter((i) => i.room_id === room_id),
      (i) => CAUSE_LABEL[i.cause_tag],
    )[0];
    return { room_id, room: roomName(room_id), n, top_cause: top ? `${top[0]} ${top[1]}件` : "" };
  });

  const deviceFacts: DeviceFact[] = devices
    .filter((d) => d.status !== "retired")
    .map((d) =>
      toDeviceFact(
        d,
        inFY.filter((i) => i.device_id === d.id),
        roomName(d.room_id),
        vendorName(d.vendor_id),
      ),
    )
    .filter((f) => f.n > 0 || f.quirks.length > 0 || f.suggested.length > 0)
    .sort((a, b) => b.n - a.n);

  const quirksByRoom = devices
    .filter((d) => d.quirks.length > 0)
    .flatMap((d) => d.quirks.map((q) => ({ room: roomName(d.room_id), kind: DEVICE_KIND_LABEL[d.kind], quirk: q })));

  const in90 = addDays(today, 90);
  const lampWarnings = devices.flatMap((d) =>
    d.lamp_hours && d.lamp_life_hours && d.lamp_hours / d.lamp_life_hours >= 0.85
      ? [
          {
            room: roomName(d.room_id),
            kind: DEVICE_KIND_LABEL[d.kind],
            model: d.model,
            hours: d.lamp_hours,
            life: d.lamp_life_hours,
          },
        ]
      : [],
  );
  const warrantyWarnings = devices.flatMap((d) =>
    d.warranty_until && d.warranty_until >= today && d.warranty_until <= in90
      ? [
          {
            room: roomName(d.room_id),
            kind: DEVICE_KIND_LABEL[d.kind],
            model: d.model,
            until: d.warranty_until,
            vendor: vendorName(d.vendor_id) ?? "",
          },
        ]
      : [],
  );

  return {
    today,
    school: { name: school.name, fiscal_year: school.fiscal_year },
    range: { from, to: today },
    totals: {
      incidents: inFY.length,
      self_by_teacher: selfByTeacher.length,
      self_by_student: selfByStudent.length,
      by_ict: byIct.length,
      spare: inFY.filter((i) => i.resolved === "spare").length,
      ticket: inFY.filter((i) => i.resolved === "ticket").length,
      minutes_lost: inFY.reduce((s, i) => s + i.minutes_lost, 0),
      protected_minutes: selfByTeacher.length * WAIT_MIN,
      open_tickets: openTickets.length,
    },
    by_cause: tally(inFY, (i) => CAUSE_LABEL[i.cause_tag]),
    by_symptom: tally(inFY, (i) => SYMPTOM_LABEL[i.symptom]),
    by_month: tally(inFY, (i) => monthLabel(i.datetime)),
    by_period: tally(inFY, (i) => periodOf(i.datetime)),
    by_room: byRoom,
    devices: deviceFacts,
    quirks_by_room: quirksByRoom,
    lamp_warnings: lampWarnings,
    warranty_warnings: warrantyWarnings,
    vendors: vendors.map((v) => ({
      id: v.id,
      name: v.name,
      role: v.contact_role,
      covers: v.covers,
      until: v.contract_until,
      response_days: v.response_days,
    })),
    spares: spares.map((s) => ({ name: s.name, location: s.location, qty: s.qty, consumable: s.consumable })),
    events: school.events
      .filter((e) => e.date >= from && e.date <= `${school.fiscal_year + 1}-03-31`)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((e) => ({ date: e.date, name: e.name, rooms: e.rooms.map((r) => roomName(r)), ict_notes: e.ict_notes })),
    open_tickets: openTickets.map((i) => ({
      date: i.datetime.slice(0, 10),
      room: roomName(i.room_id),
      symptom: SYMPTOM_LABEL[i.symptom],
      cause: CAUSE_LABEL[i.cause_tag],
      note: i.note,
      spare: i.resolved === "spare",
    })),
  };
}

function toDeviceFact(d: Device, inc: Incident[], room: string, vendor?: string): DeviceFact {
  return {
    id: d.id,
    room_id: d.room_id,
    room,
    kind: DEVICE_KIND_LABEL[d.kind],
    maker: d.maker,
    model: d.model,
    installed_year: d.installed_year,
    status: d.status,
    n: inc.length,
    by_cause: tally(inc, (i) => CAUSE_LABEL[i.cause_tag]),
    by_symptom: tally(inc, (i) => SYMPTOM_LABEL[i.symptom]),
    by_period: tally(inc, (i) => periodOf(i.datetime)),
    by_month: tally(inc, (i) => monthLabel(i.datetime)),
    records: inc.map(
      (i) =>
        `${i.datetime.slice(5, 10).replace("-", "/")} ${periodOf(i.datetime)} ${SYMPTOM_LABEL[i.symptom]}→${CAUSE_LABEL[i.cause_tag]}${i.note ? `: ${i.note}` : ""}`,
    ),
    notes: inc.filter((i) => i.note).map((i) => `${i.datetime.slice(5, 10).replace("-", "/")} ${i.note}`),
    quirks: d.quirks,
    suggested: d.suggested_quirks,
    rejected: d.rejected_quirks,
    lamp:
      d.lamp_hours && d.lamp_life_hours
        ? { hours: d.lamp_hours, life: d.lamp_life_hours, ratio: d.lamp_hours / d.lamp_life_hours }
        : undefined,
    warranty_until: d.warranty_until,
    vendor,
    fault_count: inc.filter((i) => i.cause_tag === "device_fault").length,
  };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const pairs = (xs: [string, number][]) => xs.map(([k, n]) => `${k} ${n}件`).join("、");

/** プロンプトと雛形文書の両方が使う、日本語の事実一覧 */
export function factPackToText(f: FactPack): string {
  const t = f.totals;
  const L: string[] = [];
  L.push(`学校: ${f.school.name}（${f.school.fiscal_year}年度）`);
  L.push(`集計期間: ${f.range.from} 〜 ${f.range.to}`);
  L.push("");
  L.push("## 今年度の数字");
  L.push(`- トラブル記録: ${t.incidents}件（失った授業時間の合計: 推定${t.minutes_lost}分）`);
  L.push(`- 先生が自分で解決: ${t.self_by_teacher}件、生徒が解決: ${t.self_by_student}件、ICT担当が対応: ${t.by_ict}件`);
  L.push(`- 予備機で授業を継続: ${t.spare}件、チケット化: ${t.ticket}件、未対応チケット: ${t.open_tickets}件`);
  L.push(`- 守られた授業時間（推定）: ${t.protected_minutes}分（先生の自己解決 ${t.self_by_teacher}件 × ${WAIT_MIN}分）`);
  L.push(`- 原因の内訳: ${pairs(f.by_cause)}`);
  L.push(`- 症状の内訳: ${pairs(f.by_symptom)}`);
  L.push(`- 月別: ${pairs(f.by_month)}`);
  L.push(`- 時間帯: ${pairs(f.by_period)}`);
  L.push("");
  L.push("## 教室別（件数順）");
  for (const r of f.by_room) L.push(`- ${r.room}: ${r.n}件（最多原因: ${r.top_cause}）`);
  L.push("");
  L.push("## 機器ごとの記録（件数順）");
  for (const d of f.devices) {
    L.push(
      `- ${d.room} ${d.kind} ${d.maker} ${d.model}（${d.installed_year}年導入${d.status === "spare" ? "・予備機" : ""}）: ${d.n}件`,
    );
    if (d.n > 0) L.push(`  - 原因: ${pairs(d.by_cause)}／症状: ${pairs(d.by_symptom)}／時間帯: ${pairs(d.by_period)}`);
    if (d.notes.length) L.push(`  - メモ: ${d.notes.slice(-6).join("；")}`);
    for (const q of d.quirks) L.push(`  - 既知の確認ポイント: ${q}`);
    for (const q of d.suggested) L.push(`  - 未承認の提案: ${q}`);
    if (d.lamp) L.push(`  - ランプ: ${d.lamp.hours}/${d.lamp.life}時間（${Math.round(d.lamp.ratio * 100)}%）`);
    if (d.warranty_until) L.push(`  - 保守期限: ${d.warranty_until}${d.vendor ? `（${d.vendor}）` : ""}`);
  }
  L.push("");
  L.push("## 承認済みの確認ポイント（教室の静的カードに出ているもの）");
  for (const q of f.quirks_by_room) L.push(`- ${q.room} ${q.kind}: ${q.quirk}`);
  L.push("");
  L.push("## 寿命・期限");
  if (f.lamp_warnings.length === 0) L.push("- ランプ寿命が近い機器: なし");
  for (const w of f.lamp_warnings) L.push(`- ランプ寿命が近い: ${w.room} ${w.kind} ${w.model} ${w.hours}/${w.life}時間`);
  if (f.warranty_warnings.length === 0) L.push("- 90日以内に保守期限: なし");
  for (const w of f.warranty_warnings) L.push(`- 保守期限 ${w.until}: ${w.room} ${w.kind} ${w.model}（${w.vendor}）`);
  L.push("");
  L.push("## 業者（連絡先は校内の業者ファイル参照。個人名は書かない）");
  for (const v of f.vendors) {
    L.push(
      `- ${v.name}: ${v.role}。対象: ${v.covers.join("・")}。契約期限 ${v.until ?? "不明"}、応答目安 ${v.response_days ?? "?"}日`,
    );
  }
  L.push("");
  L.push("## 予備機・消耗品（ICT準備室）");
  for (const s of f.spares) L.push(`- ${s.name}: ${s.location}、${s.qty}${s.consumable ? "（消耗品）" : ""}`);
  L.push("");
  L.push("## 年間行事とICT担当の準備");
  for (const e of f.events) L.push(`- ${e.date} ${e.name}（${e.rooms.join("・")}）${e.ict_notes ? `: ${e.ict_notes}` : ""}`);
  L.push("");
  L.push("## 未対応チケット");
  if (f.open_tickets.length === 0) L.push("- なし");
  for (const o of f.open_tickets) {
    L.push(`- ${o.date} ${o.room} ${o.symptom}（${o.cause}）${o.spare ? " 予備機で継続中" : ""}${o.note ? `: ${o.note}` : ""}`);
  }
  return L.join("\n");
}
