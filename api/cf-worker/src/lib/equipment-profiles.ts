/**
 * Equipment profile loader.
 *
 * Profiles are stored in KV as a gzipped JSON blob under the key
 * "equipment:profiles:v1". A local in-memory cache avoids repeated KV reads.
 *
 * To populate KV locally or in production:
 *   node scripts/upload-equipment-profiles-to-kv.mjs
 */

import type { Env } from "../types";
import type { VehicleEquipmentProfiles, CompactEquipmentProfile } from "./equipment";
import { selectVehicleProfile } from "./equipment";

let cachedProfiles: VehicleEquipmentProfiles | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const KV_KEY = "equipment:profiles:v1";

async function decompressGzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream("gzip");
  const source = new Response(new Blob([data]));
  if (!source.body) throw new Error("Decompression source missing");
  const decompressed = await new Response(source.body.pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(decompressed);
}

export async function loadEquipmentProfiles(env?: Env): Promise<VehicleEquipmentProfiles | null> {
  const now = Date.now();
  if (cachedProfiles && now - cachedAt < CACHE_TTL_MS) {
    return cachedProfiles;
  }

  if (!env) {
    return cachedProfiles;
  }

  try {
    const blob = await env.GLASS_CATALOG.get(KV_KEY, "arrayBuffer");
    if (!blob) {
      console.warn("[EquipmentProfiles] No profile data found in KV under", KV_KEY);
      return cachedProfiles;
    }

    const decompressed = await decompressGzip(new Uint8Array(blob));
    const text = new TextDecoder().decode(decompressed);
    const profiles = JSON.parse(text) as VehicleEquipmentProfiles;
    cachedProfiles = profiles;
    cachedAt = now;
    return profiles;
  } catch (e) {
    console.error("[EquipmentProfiles] Failed to load from KV:", e);
    return cachedProfiles;
  }
}

export function setEquipmentProfiles(profiles: VehicleEquipmentProfiles | null): void {
  cachedProfiles = profiles;
  cachedAt = Date.now();
}

export function clearEquipmentProfileCache(): void {
  cachedProfiles = null;
  cachedAt = 0;
}

export interface SelectedProfile {
  key: string;
  level: "exact" | "brandModel" | "brand";
  totalProducts: number;
  cat: Record<string, CompactEquipmentProfile>;
}

export async function getEquipmentProfileForVehicle(
  env: Env | undefined,
  brand: string,
  model: string,
  year?: number | string | null
): Promise<SelectedProfile | null> {
  const profiles = await loadEquipmentProfiles(env);
  if (!profiles) return null;

  const selected = selectVehicleProfile(profiles, brand, model, year);
  if (!selected) return null;

  return {
    key: selected.key,
    level: selected.level,
    totalProducts: selected.profile.n,
    cat: selected.profile.cat,
  };
}
