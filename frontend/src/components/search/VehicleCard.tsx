import { useState } from 'react';
import { Car, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VehicleInfo, EquipmentFlags } from '@/types/api';
import { maskVin } from '@/utils/formatters';

interface VehicleCardProps {
  vehicle: VehicleInfo;
  equipment?: EquipmentFlags;
  regnr?: string;
}

const equipmentIcons: Record<string, string> = {
  adas: '🛡️',
  rainSensor: '🌧️',
  heated: '🔥',
  acoustic: '🔇',
  antenna: '📡',
  hud: '🎯',
  camera: '📷',
  laneAssist: '🛣️',
};

const equipmentLabels: Record<string, string> = {
  adas: 'ADAS',
  rainSensor: 'Regnsensor',
  heated: 'Oppvarmet',
  acoustic: 'Akustisk',
  antenna: 'Antenne',
  hud: 'HUD',
  camera: 'Kamera',
  laneAssist: 'Filskifteass.',
};

export function VehicleCard({ vehicle, equipment, regnr }: VehicleCardProps) {
  const [expanded, setExpanded] = useState(false);

  const activeEquipment = equipment
    ? Object.entries(equipment).filter(([_, val]) => val).map(([key]) => key)
    : [];

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-autoglass-light">
          <Car className="h-5 w-5 text-autoglass-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 truncate">
            {vehicle.make} {vehicle.model} {vehicle.year}
          </h2>
          {vehicle.submodel && (
            <p className="text-sm text-gray-500 truncate">{vehicle.submodel}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
            {regnr && <span className="uppercase font-medium text-gray-700">{regnr}</span>}
            <span>VIN: {maskVin(vehicle.vin)}</span>
            {vehicle.k_type > 0 && <span>kType: {vehicle.k_type}</span>}
          </div>
        </div>
        {activeEquipment.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 p-1.5 rounded-md hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={expanded ? 'Skjul utstyr' : 'Vis utstyr'}
          >
            {expanded ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
          </button>
        )}
      </div>

      {/* Equipment badges — always visible top row on desktop, expandable on mobile */}
      <div
        className={cn(
          'px-4 pb-4 sm:px-5 sm:pb-5',
          !expanded && 'hidden sm:block'
        )}
      >
        {activeEquipment.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {activeEquipment.map((key) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-sm text-gray-700"
              >
                <span>{equipmentIcons[key]}</span>
                <span className="hidden sm:inline">{equipmentLabels[key]}</span>
                <span className="sm:hidden">{equipmentLabels[key].split(' ')[0]}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Ingen kjente utstyrsdetaljer</p>
        )}
      </div>
    </div>
  );
}
