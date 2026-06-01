import { useState } from 'react';
import { Car, ChevronDown, ChevronUp, Fuel, Users, CheckCircle, XCircle } from 'lucide-react';
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

// Norwegian color name to Tailwind color class mapping
const colorMap: Record<string, string> = {
  'rød': 'bg-red-500',
  'rød metallic': 'bg-red-600',
  'sort': 'bg-gray-900',
  'svart': 'bg-gray-900',
  'svart metallic': 'bg-gray-800',
  'blå': 'bg-blue-500',
  'blå metallic': 'bg-blue-600',
  'grønn': 'bg-green-500',
  'grønn metallic': 'bg-green-600',
  'grå': 'bg-gray-500',
  'grå metallic': 'bg-gray-600',
  'sølv': 'bg-gray-400',
  'sølv metallic': 'bg-gray-400',
  'hvit': 'bg-gray-100',
  'hvit metallic': 'bg-gray-200',
  'gul': 'bg-yellow-400',
  'gull': 'bg-yellow-500',
  'oransje': 'bg-orange-500',
  'brun': 'bg-amber-700',
  'beige': 'bg-amber-200',
  'lilla': 'bg-purple-500',
  'rosa': 'bg-pink-400',
  'cyan': 'bg-cyan-500',
  'turkis': 'bg-teal-400',
};

function getColorClass(colorName?: string): string {
  if (!colorName) return 'bg-gray-300';
  const normalizedColor = colorName.toLowerCase().trim();
  return colorMap[normalizedColor] || 'bg-gray-300';
}

export function VehicleCard({ vehicle, equipment, regnr }: VehicleCardProps) {
  const [expanded, setExpanded] = useState(false);

  const activeEquipment = equipment
    ? Object.entries(equipment).filter(([_, val]) => val).map(([key]) => key)
    : [];

  // Determine if we have extended info to show
  const hasExtendedInfo = vehicle.color || vehicle.fuelType || vehicle.vehicleClass || 
                         vehicle.registrationStatus || (vehicle.seatCount && vehicle.seatCount > 0);

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
            {(regnr || vehicle.regno) && (
              <span className="uppercase font-medium text-gray-700">
                {regnr || vehicle.regno}
              </span>
            )}
            <span>VIN: {maskVin(vehicle.vin)}</span>
            {vehicle.k_type > 0 && <span>kType: {vehicle.k_type}</span>}
          </div>

          {/* Extended vehicle info - compact row */}
          {hasExtendedInfo && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* Vehicle Class Badge */}
              {vehicle.vehicleClass && (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  <Car className="h-3 w-3" />
                  {vehicle.vehicleClass}
                </span>
              )}

              {/* Registration Status */}
              {vehicle.registrationStatus && (
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
                  vehicle.registrationStatus.toLowerCase() === 'registrert'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                )}>
                  {vehicle.registrationStatus.toLowerCase() === 'registrert' ? (
                    <CheckCircle className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  {vehicle.registrationStatus}
                </span>
              )}

              {/* Color with dot */}
              {vehicle.color && (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                  <span className={cn(
                    "h-3 w-3 rounded-full border border-gray-200",
                    getColorClass(vehicle.color)
                  )} />
                  {vehicle.color}
                </span>
              )}

              {/* Fuel Type */}
              {vehicle.fuelType && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                  <Fuel className="h-3 w-3 text-gray-400" />
                  {vehicle.fuelType}
                </span>
              )}

              {/* Seat Count */}
              {vehicle.seatCount && vehicle.seatCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                  <Users className="h-3 w-3 text-gray-400" />
                  {vehicle.seatCount} seter
                </span>
              )}

              {/* Euro Class */}
              {vehicle.euroClass && (
                <span className="text-xs text-gray-500">
                  {vehicle.euroClass}
                </span>
              )}
            </div>
          )}
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
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
              >
                <span>{equipmentIcons[key]}</span>
                <span className="hidden sm:inline">{equipmentLabels[key]}</span>
                <span className="sm:hidden">{equipmentLabels[key].split(' ')[0]}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">Ingen kjente utstyrsdetaljer</p>
        )}
      </div>
    </div>
  );
}
