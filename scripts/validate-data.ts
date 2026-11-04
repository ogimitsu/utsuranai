// data/*.json をスキーマで検証し、参照整合性（room_id, device_id など）も確認する。
// 実行: node scripts/validate-data.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { DataFiles, type DataFileName } from "../src/lib/schema.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const names = Object.keys(DataFiles) as DataFileName[];
const loaded: Record<string, unknown> = {};
let ok = true;

for (const name of names) {
  const file = path.join(DATA_DIR, `${name}.json`);
  try {
    const json = JSON.parse(readFileSync(file, "utf8"));
    const result = DataFiles[name].safeParse(json);
    if (!result.success) {
      ok = false;
      console.error(`✗ ${name}.json`);
      for (const issue of result.error.issues.slice(0, 20)) {
        console.error(`   ${issue.path.join(".")}: ${issue.message}`);
      }
      continue;
    }
    loaded[name] = result.data;
    const count = Array.isArray(result.data) ? result.data.length : 1;
    console.log(`✓ ${name}.json (${count})`);
  } catch (e) {
    ok = false;
    console.error(`✗ ${name}.json: ${(e as Error).message}`);
  }
}

// 参照整合性
type Ref = { id: string };
const ids = (arr: unknown) => new Set(((arr as Ref[]) ?? []).map((x) => x.id));
const roomIds = ids(loaded.rooms);
const deviceIds = ids(loaded.devices);
const vendorIds = ids(loaded.vendors);
const err = (msg: string) => {
  ok = false;
  console.error(`   ${msg}`);
};

if (loaded.rooms && loaded.devices) {
  console.log("参照チェック");
  for (const r of loaded.rooms as { id: string; devices: string[] }[]) {
    for (const d of r.devices) if (!deviceIds.has(d)) err(`rooms ${r.id}: device ${d} がない`);
  }
  for (const d of loaded.devices as { id: string; room_id: string | null; vendor_id?: string }[]) {
    if (d.room_id && !roomIds.has(d.room_id)) err(`devices ${d.id}: room ${d.room_id} がない`);
    if (d.vendor_id && !vendorIds.has(d.vendor_id)) err(`devices ${d.id}: vendor ${d.vendor_id} がない`);
  }
  for (const i of (loaded.incidents ?? []) as { id: string; room_id: string; device_id: string | null }[]) {
    if (!roomIds.has(i.room_id)) err(`incidents ${i.id}: room ${i.room_id} がない`);
    if (i.device_id && !deviceIds.has(i.device_id)) err(`incidents ${i.id}: device ${i.device_id} がない`);
  }
  for (const s of (loaded.spares ?? []) as { id: string; device_id?: string }[]) {
    if (s.device_id && !deviceIds.has(s.device_id)) err(`spares ${s.id}: device ${s.device_id} がない`);
  }
  for (const e of ((loaded.school as { events?: { id: string; rooms: string[] }[] })?.events ?? [])) {
    for (const r of e.rooms) if (!roomIds.has(r)) err(`events ${e.id}: room ${r} がない`);
  }
}

// 禁止語（実在校名・連絡先らしきもの）
const banned = [/視聴覚/, /\d{2,4}-\d{2,4}-\d{3,4}/, /@[a-z0-9.-]+\.[a-z]{2,}/i];
for (const name of names) {
  const text = JSON.stringify(loaded[name] ?? "");
  for (const re of banned) if (re.test(text)) err(`${name}.json: 禁止パターン ${re} に一致`);
}

console.log(ok ? "OK" : "NG");
process.exit(ok ? 0 : 1);
