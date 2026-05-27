import { Check, Crosshair, Radar, Camera, Cpu } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

export function AdasSection() {
  const { t } = useI18n();

  const points = [
    t('adas.point.1'),
    t('adas.point.2'),
    t('adas.point.3'),
    t('adas.point.4'),
  ];

  return (
    <section className="relative bg-carbon-900 py-20 sm:py-28 overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-grid-carbon bg-grid opacity-40 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-carbon-900 pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Copy */}
          <div>
            <div className="flex items-center gap-2 mb-4 text-[11px] font-mono uppercase tracking-[0.2em] text-glass-cyan">
              <Crosshair className="h-3.5 w-3.5" />
              <span>{t('adas.eyebrow')}</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
              {t('adas.title')}
            </h2>
            <p className="mt-5 text-base sm:text-lg text-carbon-300 leading-relaxed max-w-xl">
              {t('adas.body')}
            </p>

            <ul className="mt-8 space-y-3">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <span className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm border border-glass-cyan/40 bg-glass-cyan/10">
                    <Check className="h-3 w-3 text-glass-cyan" strokeWidth={3} />
                  </span>
                  <span className="text-sm sm:text-base text-carbon-200">{p}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Diagram */}
          <div className="relative">
            <div className="relative aspect-square max-w-md mx-auto">
              {/* Outer ring */}
              <div className="absolute inset-0 rounded-full border border-carbon-700" />
              <div className="absolute inset-6 rounded-full border border-carbon-700/60" />
              <div className="absolute inset-12 rounded-full border border-carbon-700/40" />

              {/* Crosshair */}
              <div className="absolute top-1/2 left-0 right-0 h-px bg-carbon-700/60" />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-carbon-700/60" />

              {/* Scan line */}
              <div className="absolute inset-0 overflow-hidden rounded-full pointer-events-none">
                <div className="absolute left-0 right-0 h-24 bg-gradient-to-b from-transparent via-glass-cyan/20 to-transparent animate-scan" />
              </div>

              {/* Center windshield icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-40 h-28 sm:w-48 sm:h-32 border-2 border-glass-cyan/60 rounded-t-[40%] rounded-b bg-glass-cyan/5 shadow-glow-cyan">
                  <div className="absolute inset-3 border border-glass-cyan/30 rounded-t-[35%] rounded-b" />
                  <Camera className="absolute top-2 left-1/2 -translate-x-1/2 h-4 w-4 text-glass-cyan" />
                </div>
              </div>

              {/* Sensor nodes */}
              <SensorNode position="top-2 left-1/2 -translate-x-1/2" icon={Camera} label="CAM" />
              <SensorNode position="bottom-2 left-1/2 -translate-x-1/2" icon={Cpu} label="ECU" />
              <SensorNode position="top-1/2 -translate-y-1/2 left-2" icon={Radar} label="LiDAR" />
              <SensorNode position="top-1/2 -translate-y-1/2 right-2" icon={Radar} label="RADAR" />
            </div>

            {/* Coordinate label */}
            <div className="mt-6 text-center font-mono text-[10px] text-carbon-500 tracking-wider">
              ADAS · CAM-RANGE · 0.00°–±0.5° · OEM SPEC
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SensorNode({
  position,
  icon: Icon,
  label,
}: {
  position: string;
  icon: typeof Camera;
  label: string;
}) {
  return (
    <div className={`absolute ${position} flex flex-col items-center gap-1`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-carbon-800 border border-glass-cyan/40 shadow-glow-cyan">
        <Icon className="h-4 w-4 text-glass-cyan" />
      </div>
      <span className="font-mono text-[9px] text-carbon-400 tracking-wider">{label}</span>
    </div>
  );
}
