import { MapPin, Truck, Clock, Package } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

interface Hub {
  id: string;
  labelKey: string;
  cx: number;
  cy: number;
  primary?: boolean;
  deliveryTime?: string;
}

interface DeliveryZone {
  id: string;
  labelKey: string;
  color: string;
  path: string;
}

// Norway map coordinates (stylized SVG viewBox 0 0 300 400)
const HUBS: Hub[] = [
  { id: 'oslo', labelKey: 'logistics.hub.oslo', cx: 180, cy: 280, primary: true, deliveryTime: 'Samme dag*' },
  { id: 'trondheim', labelKey: 'logistics.hub.trondheim', cx: 140, cy: 140, deliveryTime: '1-2 dager' },
  { id: 'bergen', labelKey: 'logistics.hub.bergen', cx: 75, cy: 245, deliveryTime: '1-2 dager' },
  { id: 'stavanger', labelKey: 'logistics.hub.stavanger', cx: 85, cy: 275, deliveryTime: '1-2 dager' },
];

// Delivery zones with stylized paths
const DELIVERY_ZONES: DeliveryZone[] = [
  {
    id: 'same-day',
    labelKey: 'logistics.zone.sameDay',
    color: 'rgba(0, 180, 216, 0.25)',
    path: 'M 170 270 Q 180 265 190 270 Q 195 280 190 290 Q 180 295 170 290 Q 165 280 170 270 Z',
  },
  {
    id: 'next-day',
    labelKey: 'logistics.zone.nextDay',
    color: 'rgba(72, 202, 228, 0.15)',
    path: 'M 120 220 Q 150 200 200 220 Q 220 250 210 300 Q 180 320 140 310 Q 110 280 120 220 Z',
  },
  {
    id: 'regional',
    labelKey: 'logistics.zone.regional',
    color: 'rgba(0, 180, 216, 0.08)',
    path: 'M 50 180 Q 100 120 150 130 Q 200 140 240 180 Q 250 250 220 320 Q 150 350 80 320 Q 40 260 50 180 Z',
  },
];

// Delivery times info
const DELIVERY_TIMES = [
  { region: 'Oslo-området', time: 'Samme dag', note: 'Ved bestilling før 12:00', icon: Clock },
  { region: 'Østlandet', time: 'Neste dag', note: 'Rask levering', icon: Truck },
  { region: 'Vestlandet', time: '1-2 dager', note: 'Fra Bergen/Stavanger', icon: Package },
  { region: 'Nord-Norge', time: '2-3 dager', note: 'Fra Trondheim', icon: Truck },
];

export default function LogisticsMap() {
  const { t } = useI18n();

  return (
    <section className="relative bg-carbon-900 py-20 sm:py-24 border-t border-carbon-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-carbon-800 border border-carbon-700">
            <Truck className="h-4 w-4 text-glass-cyan" />
            <span className="text-xs font-mono uppercase tracking-[0.15em] text-glass-cyan">
              {t('logistics.badge') || 'Logistikk'}
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
            {t('logistics.title') || 'Dekning i hele Norge'}
          </h2>
          <p className="text-carbon-400 max-w-2xl mx-auto">
            {t('logistics.subtitle') || 'Rask og pålitelig levering fra våre lager i Oslo, Bergen, Stavanger og Trondheim'}
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8 lg:gap-12 items-start">
          {/* Map Section */}
          <div className="lg:col-span-3">
            <div className="relative bg-carbon-950 border border-carbon-800 rounded-2xl p-6 sm:p-8 overflow-hidden">
              {/* Grid background */}
              <div className="absolute inset-0 bg-grid-carbon bg-grid-sm opacity-20 pointer-events-none" />
              
              {/* Glow effect */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-glass-cyan/5 rounded-full blur-3xl pointer-events-none" />

              {/* SVG Map of Norway */}
              <svg
                viewBox="0 0 300 400"
                className="relative w-full h-auto max-h-[500px]"
                role="img"
                aria-label="Norgeskart med logistikkhubber"
              >
                {/* Norway outline - stylized */}
                <path
                  d="M 140 20 
                     Q 120 40 115 70 
                     L 110 100 
                     Q 105 130 120 150 
                     L 135 165 
                     Q 145 175 140 190 
                     L 130 210 
                     Q 125 230 135 245 
                     L 150 255 
                     Q 160 265 155 280 
                     L 145 300 
                     Q 135 320 145 340 
                     L 160 360 
                     Q 170 375 165 390 
                     L 160 398
                     M 165 390 
                     Q 180 385 190 370 
                     L 200 350 
                     Q 210 330 205 310 
                     L 195 285 
                     Q 190 270 200 260 
                     L 220 245 
                     Q 235 235 245 215 
                     L 250 190 
                     Q 255 170 250 150 
                     L 240 120 
                     Q 235 100 220 85 
                     L 200 65 
                     Q 185 50 170 40 
                     L 155 30 
                     Q 148 25 140 20 Z"
                  fill="#0D1117"
                  stroke="#252B34"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Coast detail lines */}
                <path
                  d="M 110 100 Q 95 120 90 150 M 250 190 Q 265 210 260 240 M 200 350 Q 215 360 225 350"
                  fill="none"
                  stroke="#1C2128"
                  strokeWidth="1"
                  strokeLinecap="round"
                />

                {/* Delivery zones */}
                {DELIVERY_ZONES.map((zone) => (
                  <path
                    key={zone.id}
                    d={zone.path}
                    fill={zone.color}
                    stroke="none"
                  />
                ))}

                {/* Connection lines from Oslo (primary hub) to regional hubs */}
                {HUBS.filter((h) => !h.primary).map((h) => {
                  const oslo = HUBS.find((x) => x.primary)!;
                  return (
                    <g key={`line-${h.id}`}>
                      {/* Main route line */}
                      <line
                        x1={oslo.cx}
                        y1={oslo.cy}
                        x2={h.cx}
                        y2={h.cy}
                        stroke="url(#routeGradient)"
                        strokeWidth="2"
                        strokeDasharray="6 4"
                        opacity="0.6"
                      />
                      {/* Animated dash overlay */}
                      <line
                        x1={oslo.cx}
                        y1={oslo.cy}
                        x2={h.cx}
                        y2={h.cy}
                        stroke="#00B4D8"
                        strokeWidth="2"
                        strokeDasharray="4 8"
                        opacity="0.4"
                      >
                        <animate
                          attributeName="stroke-dashoffset"
                          values="0;-12"
                          dur="2s"
                          repeatCount="indefinite"
                        />
                      </line>
                    </g>
                  );
                })}

                {/* Gradient definitions */}
                <defs>
                  <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00B4D8" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#48CAE4" stopOpacity="0.4" />
                  </linearGradient>
                  <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#00B4D8" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#00B4D8" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Hub markers */}
                {HUBS.map((h) => (
                  <g key={h.id}>
                    {/* Glow for primary hub */}
                    {h.primary && (
                      <>
                        <circle
                          cx={h.cx}
                          cy={h.cy}
                          r="24"
                          fill="url(#hubGlow)"
                        >
                          <animate
                            attributeName="r"
                            values="18;28;18"
                            dur="2.5s"
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values="0.6;0.2;0.6"
                            dur="2.5s"
                            repeatCount="indefinite"
                          />
                        </circle>
                        <circle
                          cx={h.cx}
                          cy={h.cy}
                          r="35"
                          fill="none"
                          stroke="#00B4D8"
                          strokeWidth="1"
                          opacity="0.15"
                        >
                          <animate
                            attributeName="r"
                            values="25;40;25"
                            dur="3s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      </>
                    )}
                    
                    {/* Hub dot */}
                    <circle
                      cx={h.cx}
                      cy={h.cy}
                      r={h.primary ? 8 : 5}
                      fill={h.primary ? '#00B4D8' : '#48CAE4'}
                      stroke="#07090C"
                      strokeWidth="2"
                    />
                    
                    {/* Hub label background */}
                    <rect
                      x={h.cx + (h.cx > 150 ? -95 : 12)}
                      y={h.cy - 20}
                      width={h.primary ? 80 : 85}
                      height="28"
                      rx="6"
                      fill="#13171E"
                      stroke="#252B34"
                      strokeWidth="1"
                    />
                    
                    {/* Hub city name */}
                    <text
                      x={h.cx + (h.cx > 150 ? -55 : 52)}
                      y={h.cy - 8}
                      fill="#FFFFFF"
                      fontSize="10"
                      fontWeight="600"
                      fontFamily="system-ui, -apple-system, sans-serif"
                      textAnchor="middle"
                    >
                      {t(h.labelKey) || h.id.charAt(0).toUpperCase() + h.id.slice(1)}
                    </text>
                    
                    {/* Hub delivery time */}
                    <text
                      x={h.cx + (h.cx > 150 ? -55 : 52)}
                      y={h.cy + 4}
                      fill={h.primary ? '#00B4D8' : '#9CA3AF'}
                      fontSize="8"
                      fontFamily="JetBrains Mono, monospace"
                      textAnchor="middle"
                    >
                      {h.deliveryTime}
                    </text>
                  </g>
                ))}

                {/* Oslo star marker for primary hub */}
                <g transform={`translate(${HUBS.find(h => h.primary)?.cx}, ${HUBS.find(h => h.primary)?.cy})`}>
                  <circle r="3" fill="#FFFFFF" />
                </g>
              </svg>

              {/* Map Legend */}
              <div className="mt-6 pt-6 border-t border-carbon-800">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-glass-cyan/20 border border-glass-cyan/40">
                      <MapPin className="h-3 w-3 text-glass-cyan" />
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-carbon-400">
                      {t('logistics.legend.hub') || 'Hovedlager'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-glass-cyanLight/20 border border-glass-cyanLight/40">
                      <span className="h-2 w-2 rounded-full bg-glass-cyanLight" />
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-carbon-400">
                      {t('logistics.legend.regional') || 'Regionlager'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-0.5 bg-glass-cyan/60" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #00B4D8 0, #00B4D8 4px, transparent 4px, transparent 8px)' }} />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-carbon-400">
                      {t('logistics.legend.route') || 'Leveringsrute'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-glass-cyan/20 border border-glass-cyan/30" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-carbon-400">
                      {t('logistics.legend.zone') || 'Dekningsområde'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Info Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Main info card */}
            <div className="bg-carbon-850 border border-carbon-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-glass-cyan/10 border border-glass-cyan/30">
                  <Truck className="h-5 w-5 text-glass-cyan" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">
                    {t('logistics.delivery.title') || 'Leveringstider'}
                  </h3>
                  <p className="text-xs text-carbon-500">
                    {t('logistics.delivery.subtitle') || 'Fra hovedlager Oslo'}
                  </p>
                </div>
              </div>

              {/* Delivery times list */}
              <div className="space-y-3">
                {DELIVERY_TIMES.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 p-3 rounded-lg bg-carbon-900 border border-carbon-800 hover:border-carbon-700 transition-colors"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-carbon-800">
                      <item.icon className="h-4 w-4 text-glass-cyan" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-carbon-300 truncate">{item.region}</span>
                        <span className="text-sm font-semibold text-glass-cyan whitespace-nowrap">{item.time}</span>
                      </div>
                      <p className="text-xs text-carbon-500">{item.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Coverage info */}
            <div className="bg-carbon-850 border border-carbon-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-glass-cyan/10 border border-glass-cyan/30">
                  <Package className="h-5 w-5 text-glass-cyan" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">
                    {t('logistics.coverage.title') || 'Neste-dag-levering'}
                  </h3>
                  <p className="text-xs text-carbon-500">
                    {t('logistics.coverage.subtitle') || 'Til hele landet'}
                  </p>
                </div>
              </div>
              
              <p className="text-sm text-carbon-400 leading-relaxed">
                {t('logistics.coverage.description') || 
                  'Med vårt nettverk av lager i Oslo, Bergen, Stavanger og Trondheim kan vi tilby rask levering til hele Norge. Bestillinger før kl. 12:00 sendes samme dag.'}
              </p>

              {/* Quick stats */}
              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-carbon-800">
                <div className="text-center p-3 rounded-lg bg-carbon-900">
                  <div className="text-2xl font-bold text-glass-cyan">4</div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-carbon-500 mt-1">
                    {t('logistics.stats.hubs') || 'Lager'}
                  </div>
                </div>
                <div className="text-center p-3 rounded-lg bg-carbon-900">
                  <div className="text-2xl font-bold text-glass-cyan">99%</div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-carbon-500 mt-1">
                    {t('logistics.stats.coverage') || 'Dekning'}
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-glass-cyan/10 to-transparent border border-glass-cyan/20">
              <p className="text-sm text-carbon-300 mb-3">
                {t('logistics.cta.text') || 'Trenger du hjelp med logistikk eller har spørsmål om levering?'}
              </p>
              <a
                href="#contact"
                className="inline-flex items-center gap-2 text-sm font-medium text-glass-cyan hover:text-glass-cyanLight transition-colors"
              >
                {t('logistics.cta.button') || 'Kontakt oss'}
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
