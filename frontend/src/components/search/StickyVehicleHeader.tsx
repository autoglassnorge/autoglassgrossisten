/**
 * Sticky vehicle header — stays visible when user scrolls through results.
 * Shows resolved vehicle info + quick "change vehicle" action.
 */

import { Car, X } from 'lucide-react';
import type { VehicleInfo } from '@/types/api';

interface StickyVehicleHeaderProps {
  vehicle: VehicleInfo;
  regnr?: string;
  onChange: () => void;
}

export function StickyVehicleHeader({ vehicle, regnr, onChange }: StickyVehicleHeaderProps) {
  const display = [
    vehicle.make,
    vehicle.model,
    vehicle.year,
    vehicle.submodel,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm -mx-3 px-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-2.5">
      <div className="flex items-center justify-between gap-3 max-w-5xl mx-auto">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-autoglass-blue/10 flex items-center justify-center">
            <Car className="h-4 w-4 text-autoglass-blue" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {display || 'Ukjent kjøretøy'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {regnr && <span className="font-mono">{regnr}</span>}
              {vehicle.fuelType && <span> · {vehicle.fuelType}</span>}
              {vehicle.vehicleClass && <span> · {vehicle.vehicleClass}</span>}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onChange}
          className="flex-shrink-0 inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          <X className="h-3 w-3" />
          <span className="hidden sm:inline">Endre</span>
        </button>
      </div>
    </div>
  );
}
