/"
 * useRecentVehicles — Persist recently searched vehicles in localStorage.
 * Enriched with make/model/year from search results.
 */

import { useState, useCallback } from 'react';

const RECENT_VEHICLES_KEY = 'ag_recent_vehicles';
const MAX_RECENT_VEHICLES = 10;

export interface RecentVehicle {
  regnr: string;
  make?: string;
  model?: string;
  year?: number;
  timestamp: number;
}

function getStoredVehicles(): RecentVehicle[] {
  try {
    const raw = localStorage.getItem(RECENT_VEHICLES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStoredVehicles(vehicles: RecentVehicle[]) {
  localStorage.setItem(RECENT_VEHICLES_KEY, JSON.stringify(vehicles));
}

export function useRecentVehicles() {
  const [vehicles, setVehicles] = useState<RecentVehicle[]>(getStoredVehicles);

  const addVehicle = useCallback((vehicle: Omit<RecentVehicle, 'timestamp'>) => {
    const entry: RecentVehicle = { ...vehicle, timestamp: Date.now() };
    const existing = getStoredVehicles().filter(
      (v) => v.regnr.toLowerCase() !== vehicle.regnr.toLowerCase()
    );
    const next = [entry, ...existing].slice(0, MAX_RECENT_VEHICLES);
    setStoredVehicles(next);
    setVehicles(next);
  }, []);

  const clearVehicles = useCallback(() => {
    localStorage.removeItem(RECENT_VEHICLES_KEY);
    setVehicles([]);
  }, []);

  return { vehicles, addVehicle, clearVehicles };
}
