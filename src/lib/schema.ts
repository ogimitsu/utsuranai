import { z } from "zod";

/**
 * データスキーマの正。data/*.json はすべてここを通す。
 * 人が読める JSON を保つため、ID は意味のある短い文字列にする（例: "r-2-3", "d-pj-2-3"）。
 */

export const DeviceKind = z.enum([
  "projector", // プロジェクター
  "display", // 電子黒板・大型ディスプレイ
  "speaker", // スピーカー・アンプ
  "mic", // ワイヤレスマイク
  "doc_camera", // 書画カメラ
  "pc", // 教卓PC・教員用端末
  "other",
]);
export type DeviceKind = z.infer<typeof DeviceKind>;

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  projector: "プロジェクター",
  display: "電子黒板",
  speaker: "スピーカー",
  mic: "ワイヤレスマイク",
  doc_camera: "書画カメラ",
  pc: "教卓PC",
  other: "その他",
};

export const Symptom = z.enum([
  "no_image", // 映らない
  "no_sound", // 音が出ない
  "no_response", // 反応しない（電源・タッチ・リモコン）
  "flicker", // ちらつく・色がおかしい
  "noise", // ハウリング・雑音
  "other",
]);
export type Symptom = z.infer<typeof Symptom>;

export const SYMPTOM_LABEL: Record<Symptom, string> = {
  no_image: "映らない",
  no_sound: "音が出ない",
  no_response: "反応しない",
  flicker: "ちらつく・色が変",
  noise: "ハウリング・雑音",
  other: "その他",
};

export const CauseTag = z.enum([
  "input_select", // 入力切替
  "cable", // ケーブル・アダプタ
  "battery_remote", // 電池・リモコン
  "settings", // 端末側の設定（出力先・ミラーリング・音量）
  "power", // 電源・主電源・ブレーカー
  "network", // Wi-Fi・無線接続（電子黒板の無線投影、校内無線LANの切断）
  "device_fault", // 機器故障
  "unknown",
]);
export type CauseTag = z.infer<typeof CauseTag>;

export const CAUSE_LABEL: Record<CauseTag, string> = {
  input_select: "入力切替",
  cable: "ケーブル・アダプタ",
  battery_remote: "電池・リモコン",
  settings: "端末の設定",
  power: "電源",
  network: "Wi-Fi・無線",
  device_fault: "機器故障",
  unknown: "わからない",
};

export const School = z.object({
  name: z.string(), // 架空校名
  fiscal_year: z.number(), // 年度（西暦）
  events: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      date: z.string(), // YYYY-MM-DD
      rooms: z.array(z.string()).default([]), // 使う部屋
      ict_notes: z.string().optional(), // ICT担当が事前にやること
    }),
  ),
});
export type School = z.infer<typeof School>;

export const Room = z.object({
  id: z.string(),
  name: z.string(), // 2年3組、第1実習室 など
  building: z.string(),
  floor: z.number(),
  devices: z.array(z.string()), // device ids
  notes_static: z.array(z.string()).default([]), // 教室のメモ（AIなしで常に出す）
});
export type Room = z.infer<typeof Room>;

export const Device = z.object({
  id: z.string(),
  room_id: z.string().nullable(), // 予備機は null
  kind: DeviceKind,
  maker: z.string(), // 架空メーカー名で可
  model: z.string(),
  installed_year: z.number(),
  inputs: z.array(z.string()).default([]), // HDMI1, HDMI2, VGA, USB-C ...
  default_input: z.string().optional(),
  cable_location: z.string().optional(), // 「教卓右の引き出し」
  remote_location: z.string().optional(),
  power_location: z.string().optional(), // 「教卓裏の電源タップ」（スピーカー・アンプなど主電源がある機器）
  quirks: z.array(z.string()).default([]), // ICT担当が承認した確認ポイント
  suggested_quirks: z.array(z.string()).default([]), // AIの提案（未承認）
  rejected_quirks: z.array(z.string()).default([]), // ICT担当が却下した提案（再提案しない）
  lamp_hours: z.number().optional(),
  lamp_life_hours: z.number().optional(),
  warranty_until: z.string().optional(), // YYYY-MM-DD
  vendor_id: z.string().optional(),
  status: z.enum(["active", "repair", "spare", "retired"]).default("active"),
});
export type Device = z.infer<typeof Device>;

export const Playbook = z.object({
  id: z.string(),
  device_kind: DeviceKind,
  model: z.string().nullable(), // null なら機種共通
  symptom: Symptom,
  questions: z.array(z.string()).max(2), // 聞いてよいのは最大2問
  steps: z.array(z.string()), // 1行ずつ。3つ以内を目安
  escalate_when: z.string(), // ここまでやって駄目ならチケット
  spare_hint: z.string().optional(),
});
export type Playbook = z.infer<typeof Playbook>;

export const Incident = z.object({
  id: z.string(),
  datetime: z.string(), // ISO 8601（ローカル時刻でよい）
  room_id: z.string(),
  device_id: z.string().nullable(),
  symptom: Symptom,
  cause_tag: CauseTag,
  resolved: z.enum(["self", "spare", "ticket"]), // 自己解決／予備機で継続／ICT担当へ
  resolved_by: z.enum(["teacher", "ict", "student"]),
  minutes_lost: z.number(), // 授業で失った分数（推定）
  note: z.string().optional(),
  ticket_status: z.enum(["none", "open", "done"]).default("none"),
});
export type Incident = z.infer<typeof Incident>;

export const Vendor = z.object({
  id: z.string(),
  name: z.string(), // 架空
  contact_role: z.string(), // 「保守窓口」など。個人名は入れない
  covers: z.array(z.string()), // device kinds または model
  contract_until: z.string().optional(),
  response_days: z.number().optional(),
});
export type Vendor = z.infer<typeof Vendor>;

export const Spare = z.object({
  id: z.string(),
  kind: DeviceKind.or(z.enum(["cable", "adapter", "battery", "lamp", "other"])),
  name: z.string(),
  location: z.string(), // 「ICT準備室 棚B-2」
  qty: z.number(),
  consumable: z.boolean(),
  device_id: z.string().optional(), // 予備機本体なら devices の id
});
export type Spare = z.infer<typeof Spare>;

export const DataFiles = {
  school: School,
  rooms: z.array(Room),
  devices: z.array(Device),
  playbooks: z.array(Playbook),
  incidents: z.array(Incident),
  vendors: z.array(Vendor),
  spares: z.array(Spare),
} as const;
export type DataFileName = keyof typeof DataFiles;
