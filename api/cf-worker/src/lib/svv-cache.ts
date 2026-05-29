/**
 * SVV vehicle data KV cache.
 */

import type { TecdocVehicle } from "../providers/svv";

export async function cacheSvvVehicle(kv: KVNamespace, regnr: string, vehicle: TecdocVehicle): Promise<void> {
  try {
    await kv.put(`svv:regnr:${regnr.toUpperCase()}`, JSON.stringify(vehicle), { expirationTtl: 86400 });
  } catch (e) {
    console.warn(`SVV KV cache write failed for ${regnr}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function getCachedSvvVehicle(kv: KVNamespace, regnr: string): Promise<TecdocVehicle | null> {
  const cached = await kv.get(`svv:regnr:${regnr.toUpperCase()}`);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as TecdocVehicle;
  } catch {
    return null;
  }
}
