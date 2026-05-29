/**
 * Bovsoft REGNUM API — kType lookup + KV caching.
 */

import type { BovsoftVehicle } from "../types";
import { fetchWithTimeout } from "../providers/svv";

export async function fetchBovsoftVehicle(
  regno: string,
  clientId: string,
  secCode: string
): Promise<BovsoftVehicle | null> {
  if (!clientId || !secCode || clientId === "NOT_SET") return null;

  try {
    const url = `http://54.38.179.43:150/bovsoft.regnum.run?id=${encodeURIComponent(clientId)}&seccode=${encodeURIComponent(secCode)}&nameservice=getktypefornumplatenorway&regnum=${encodeURIComponent(regno)}&contenttype=JSON`;
    const res = await fetchWithTimeout(url, { method: "GET" }, 15000);

    if (!res.ok) {
      console.warn(`Bovsoft HTTP ${res.status} for regnr=${regno}`);
      return null;
    }

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      console.warn(`Bovsoft: non-JSON response for regnr=${regno}`);
      return null;
    }

    const bovStatus = typeof data.status === "number" ? data.status : parseInt(String(data.status), 10);
    const bovStatusText = typeof data.statusText === "string" ? data.statusText : "";

    if (bovStatus === 401) {
      console.error(`Bovsoft auth failed (401) — wrong client id or seccode.`);
      return null;
    }
    if (bovStatus === 402) {
      console.error(`Bovsoft zero balance (402) — top up account. countFREERequests=${data.countFREERequests}`);
      return null;
    }
    if (bovStatus === 403) {
      console.warn(`Bovsoft account pending (403): ${bovStatusText || "temp status"}`);
      return null;
    }
    if (bovStatus === 404) return null;
    if (bovStatus !== 200) {
      console.warn(`Bovsoft unexpected status=${bovStatus} statusText="${bovStatusText}" for regnr=${regno}`);
      return null;
    }

    const freeReq = typeof data.countFREERequests === "number" ? data.countFREERequests : null;
    if (freeReq !== null && freeReq < 50) {
      console.warn(`Bovsoft countFREERequests=${freeReq} — low quota`);
    }

    const datacar = (data.data as Record<string, unknown> | undefined)?.datacar as Array<Record<string, unknown>> | undefined;
    const car = datacar?.[0];
    if (!car) return null;

    const ktype = typeof car.ktype === "number" ? car.ktype : parseInt(String(car.ktype), 10);
    if (!ktype || isNaN(ktype)) return null;

    const parseYear = (val: unknown): number => {
      if (!val) return 0;
      const s = String(val);
      const y = parseInt(s.slice(0, 4), 10);
      return isNaN(y) ? 0 : y;
    };

    return {
      ktype,
      vin: String(car.vin || ""),
      brand: String(car.manufCar || "").toUpperCase(),
      model: String(car.modelCar || "").toUpperCase(),
      type: String(car.typeCar || ""),
      yearFrom: parseYear(car.typeFromYearCar),
      yearTo: parseYear(car.typeToYearCar),
      body: String(car.bodyCar || ""),
      source: "bovsoft",
    };
  } catch (e) {
    console.warn(`Bovsoft network error for regnr=${regno}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export async function cacheBovsoftVehicle(kv: KVNamespace, regnr: string, vehicle: BovsoftVehicle): Promise<void> {
  await kv.put(`bovsoft:${regnr.toUpperCase()}`, JSON.stringify(vehicle), { expirationTtl: 30 * 24 * 60 * 60 });
}

export async function getCachedBovsoftVehicle(kv: KVNamespace, regnr: string): Promise<BovsoftVehicle | null> {
  const cached = await kv.get(`bovsoft:${regnr.toUpperCase()}`);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as BovsoftVehicle;
  } catch {
    return null;
  }
}
