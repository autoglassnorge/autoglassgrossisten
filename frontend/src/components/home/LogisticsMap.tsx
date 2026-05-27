import { MapPin, Truck } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

interface Hub {
  id: string;
  labelKey: string;
  cx: number;
  cy: number;
  primary?: boolean;
}

// Stylized Nordic positions in viewBox 0 0 400 500
const HUBS: Hub[] = [
  { id: 'oslo', labelKey: 'logistics.hub.oslo', cx: 165, cy: 245, primary: true },
  { id: 'gothenburg', labelKey: 'logistics.hub.gothenburg', cx: 215, cy: 280 },
  { id: 'stockholm', labelKey: 'logistics.hub.stockholm', cx: 255, cy: 220 },
  { id: 'copenhagen', labelKey: 'logistics.hub.copenhagen', cx: 195, cy: 330 },
];

export function LogisticsMap() {
  const { t } = useI18n();

  return (
    <section className="relative bg-carbon-900 py-20 sm:py-24 border-t border-carbon-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Copy */}
          <div>
            <div className="flex items-center gap-2 mb-3 text-[11px] font-mono uppercase tracking-[0.2em] text-glass-cyan">
              <Truck className="h-3.5 w-3.5" />
              <span>{t('logistics.title')}</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              {t('logistics.subtitle')}
            </h2>

            <ul className="mt-8 space-y-4">
              {[
                t('logistics.delivery.no'),
                t('logistics.delivery.se'),
                t('logistics.delivery.eu'),
              ].map((line, i) => (
                <li key={i} className="flex items-center gap-4 border border-carbon-800 bg-carbon-850 rounded-md px-4 py-3">
                  <span className="font-mono text-[10px] text-glass-cyan w-12">
                    T+{i + 1}
                  </span>
                  <span className="h-px flex-1 bg-carbon-700" />
                  <span className="text-sm text-carbon-200">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* SVG Map */}
          <div className="relative">
            <div className="relative bg-carbon-950 border border-carbon-800 rounded-xl p-6 overflow-hidden">
              <div className="absolute inset-0 bg-grid-carbon bg-grid-sm opacity-30 pointer-events-none" />

              <svg
                viewBox="0 0 400 500"
                className="relative w-full h-auto"
                role="img"
                aria-label="Nordic distribution map"
              >
                {/* Stylized Nordic outline (simplified) */}
                <path
                  d="M 120 80 Q 100 130 110 180 L 140 240 L 150 280 L 175 330 L 195 360 L 210 380 L 220 400 L 230 410
                     M 220 400 L 260 420 L 290 400 L 310 360 L 290 300 L 270 260 L 280 220 L 290 180 L 280 140 L 260 110 L 230 90 L 200 80 L 160 75 Z"
                  fill="none"
                  stroke="#252B34"
                  strokeWidth="1.5"
                />
                <path
                  d="M 175 330 L 205 350 L 225 355 L 215 380 Z"
                  fill="#13171E"
                  stroke="#252B34"
                  strokeWidth="1"
                />

                {/* Connection lines from Oslo (primary hub) */}
                {HUBS.filter((h) => !h.primary).map((h) => {
                  const oslo = HUBS.find((x) => x.primary)!;
                  return (
                    <line
                      key={`line-${h.id}`}
                      x1={oslo.cx}
                      y1={oslo.cy}
                      x2={h.cx}
                      y2={h.cy}
                      stroke="#00B4D8"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                      opacity="0.5"
                    />
                  );
                })}

                {/* Hubs */}
                {HUBS.map((h) => (
                  <g key={h.id}>
                    {h.primary && (
                      <circle
                        cx={h.cx}
                        cy={h.cy}
                        r="18"
                        fill="#00B4D8"
                        opacity="0.15"
                      >
                        <animate attributeName="r" values="14;22;14" dur="3s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.25;0.05;0.25" dur="3s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle
                      cx={h.cx}
                      cy={h.cy}
                      r={h.primary ? 6 : 4}
                      fill={h.primary ? '#00B4D8' : '#48CAE4'}
                      stroke="#07090C"
                      strokeWidth="2"
                    />
                    <text
                      x={h.cx + 12}
                      y={h.cy + 4}
                      fill={h.primary ? '#FFFFFF' : '#D1D5DB'}
                      fontSize="11"
                      fontFamily="JetBrains Mono, monospace"
                      className="uppercase tracking-wider"
                    >
                      {t(h.labelKey)}
                    </text>
                  </g>
                ))}
              </svg>

              {/* Legend */}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-[10px] font-mono uppercase tracking-wider text-carbon-500">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3 w-3 text-glass-cyan" />
                  <span>Hovedlager</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="block h-1.5 w-1.5 rounded-full bg-glass-cyanLight" />
                  <span>Distribusjon</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
