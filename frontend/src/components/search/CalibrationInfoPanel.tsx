import { AlertTriangle, Crosshair, Car, Wrench, Info } from 'lucide-react';
import type { CalibrationRequirement } from '@/types/api';

interface Props {
  requirements: CalibrationRequirement[];
}

const SENSOR_ICONS: Record<string, string> = {
  front_camera: '📷',
  rear_camera: '📹',
  area_camera: '📹',
  front_radar: '📡',
  rear_radar: '📡',
  laser_sensor: '🔴',
  front_corner_radar: '📡',
};

const CALIBRATION_LABELS: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  static: {
    label: 'Statisk kalibrering',
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    icon: <Crosshair className="h-4 w-4" />,
  },
  dynamic: {
    label: 'Dynamisk kalibrering',
    color: 'text-blue-700',
    bg: 'bg-blue-50 border-blue-200',
    icon: <Car className="h-4 w-4" />,
  },
  both: {
    label: 'Statisk + dynamisk',
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
    icon: <Wrench className="h-4 w-4" />,
  },
};

function getCalibrationInfo(type: string) {
  const t = type.toLowerCase();
  if (t.includes('static') && t.includes('dynamic')) return CALIBRATION_LABELS.both;
  if (t.includes('static')) return CALIBRATION_LABELS.static;
  if (t.includes('dynamic')) return CALIBRATION_LABELS.dynamic;
  return {
    label: type || 'Ukjent',
    color: 'text-gray-700',
    bg: 'bg-gray-50 border-gray-200',
    icon: <Info className="h-4 w-4" />,
  };
}

export function CalibrationInfoPanel({ requirements }: Props) {
  if (!requirements || requirements.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-amber-900 text-sm">
            ADAS-kalibrering kreves
          </h4>
          <p className="text-xs text-amber-700 mt-1">
            Dette kjøretøyet har sensorer bak frontruten som må kalibreres etter bytte.
          </p>

          <div className="mt-3 space-y-2">
            {requirements.map((req, i) => {
              const cal = getCalibrationInfo(req.calibrationType);
              const icon = SENSOR_ICONS[req.sensorType] || '🔧';

              return (
                <div
                  key={`${req.sensorType}-${i}`}
                  className={`rounded-lg border p-2.5 ${cal.bg}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">{icon}</span>
                      <span className={`text-xs font-medium ${cal.color} truncate`}>
                        {req.sensorLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {cal.icon}
                      <span className={`text-[10px] font-medium ${cal.color}`}>
                        {cal.label}
                      </span>
                    </div>
                  </div>

                  {req.calibrationTriggers.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {req.calibrationTriggers.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center rounded bg-white/60 px-1.5 py-0.5 text-[10px] text-gray-600"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {req.targetPlate && req.targetPlate !== 'No' && (
                    <div className="mt-1.5 text-[10px] text-gray-500">
                      Target plate: <span className="font-mono font-medium">{req.targetPlate}</span>
                    </div>
                  )}

                  {req.notes && (
                    <div className="mt-1 text-[10px] text-gray-500 italic">
                      {req.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-2 text-[10px] text-amber-600">
            Kilde: Hella Gutmann CSC Coverage List V78
          </div>
        </div>
      </div>
    </div>
  );
}
