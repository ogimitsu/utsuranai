import { promises as fs } from "fs";
import path from "path";
import type { z } from "zod";
import {
  DataFiles,
  type DataFileName,
  type Device,
  type Incident,
  type Playbook,
  type Room,
  type Spare,
} from "./schema";

/**
 * data/*.json の読み書き。DBは使わない。
 * 書き込みできない環境（Vercel など読み取り専用FS）では、プロセス内メモリに差分を保持して動かす。
 */

const DATA_DIR = path.join(process.cwd(), "data");

type DataOf<K extends DataFileName> = z.infer<(typeof DataFiles)[K]>;

const memoryOverride = new Map<DataFileName, unknown>();

export async function loadData<K extends DataFileName>(name: K): Promise<DataOf<K>> {
  if (memoryOverride.has(name)) return memoryOverride.get(name) as DataOf<K>;
  const raw = await fs.readFile(path.join(DATA_DIR, `${name}.json`), "utf8");
  return DataFiles[name].parse(JSON.parse(raw)) as DataOf<K>;
}

export async function saveData<K extends DataFileName>(name: K, value: DataOf<K>): Promise<void> {
  const parsed = DataFiles[name].parse(value) as DataOf<K>;
  try {
    await fs.writeFile(
      path.join(DATA_DIR, `${name}.json`),
      JSON.stringify(parsed, null, 2) + "\n",
      "utf8",
    );
    memoryOverride.delete(name);
  } catch {
    // 読み取り専用FS。デモが止まらないようメモリに保持する
    memoryOverride.set(name, parsed);
  }
}

export async function loadAll() {
  const [school, rooms, devices, playbooks, incidents, vendors, spares] = await Promise.all([
    loadData("school"),
    loadData("rooms"),
    loadData("devices"),
    loadData("playbooks"),
    loadData("incidents"),
    loadData("vendors"),
    loadData("spares"),
  ]);
  return { school, rooms, devices, playbooks, incidents, vendors, spares };
}

export type RoomContext = {
  room: Room;
  devices: Device[];
  playbooks: Playbook[];
  recentIncidents: Incident[];
  spares: Spare[];
};

/** 教室ページと一次対応エージェントが使う、その教室の文脈ひとまとめ */
export async function getRoomContext(roomId: string, today?: string): Promise<RoomContext | null> {
  const { rooms, devices, playbooks, incidents, spares } = await loadAll();
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return null;

  const roomDevices = devices.filter((d) => d.room_id === roomId && d.status !== "retired");
  const kinds = new Set(roomDevices.map((d) => d.kind));
  const models = new Set(roomDevices.map((d) => d.model));
  const roomPlaybooks = playbooks.filter(
    (p) => kinds.has(p.device_kind) && (p.model === null || models.has(p.model)),
  );

  const cutoff = today ?? new Date().toISOString();
  const recentIncidents = incidents
    .filter((i) => i.room_id === roomId && i.datetime <= cutoff)
    .sort((a, b) => (a.datetime < b.datetime ? 1 : -1))
    .slice(0, 10);

  return { room, devices: roomDevices, playbooks: roomPlaybooks, recentIncidents, spares };
}

export async function appendIncident(incident: Incident): Promise<Incident> {
  const incidents = await loadData("incidents");
  incidents.push(incident);
  await saveData("incidents", incidents);
  return incident;
}

export async function updateIncident(id: string, patch: Partial<Incident>): Promise<Incident | null> {
  const incidents = await loadData("incidents");
  const idx = incidents.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  incidents[idx] = { ...incidents[idx], ...patch };
  await saveData("incidents", incidents);
  return incidents[idx];
}

export function newIncidentId(datetime: string): string {
  const d = datetime.slice(0, 10).replaceAll("-", "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `inc-${d}-${rand}`;
}

export async function updateDevice(id: string, patch: Partial<Device>): Promise<Device | null> {
  const devices = await loadData("devices");
  const idx = devices.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  devices[idx] = { ...devices[idx], ...patch };
  await saveData("devices", devices);
  return devices[idx];
}
