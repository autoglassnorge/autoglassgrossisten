import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { Product } from '@/types/api';
import { parseGlassColor } from '@/components/catalog/GlassVisualizer';
import { Maximize2, Minimize2, Info, ChevronRight } from 'lucide-react';

/* ------------------------------------------------------------------
   GLASS POSITION DEFINITIONS
   ------------------------------------------------------------------ */

export interface GlassPosition {
  id: string;
  label: string;
  shortLabel: string;
  typeCodes: string[];
  descriptionPatterns: string[];
  /** SVG path (relative to the car body) */
  path: string;
  side: 'left' | 'right' | 'center';
  /** z-index layer: front/rear on top, sides behind */
  zLayer: number;
}

export const GLASS_POSITIONS: GlassPosition[] = [
  {
    id: 'front',
    label: 'Frontrute',
    shortLabel: 'Front',
    typeCodes: ['F'],
    descriptionPatterns: ['FRONTRUTE', 'WS'],
    path: 'M48,42 Q48,28 58,26 L142,26 Q152,28 152,42 Q152,56 142,58 L58,58 Q48,56 48,42 Z',
    side: 'center',
    zLayer: 3,
  },
  {
    id: 'rear',
    label: 'Bakrute',
    shortLabel: 'Bak',
    typeCodes: ['B'],
    descriptionPatterns: ['BAKRUTE', 'BACKLITE', 'BL'],
    path: 'M52,162 Q52,148 62,146 L138,146 Q148,148 148,162 Q148,176 138,178 L62,178 Q52,176 52,162 Z',
    side: 'center',
    zLayer: 3,
  },
  {
    id: 'door-front-left',
    label: 'Fremre dørrute venstre',
    shortLabel: 'Dør fv VS',
    typeCodes: ['DFF', 'DFFV'],
    descriptionPatterns: ['DØRRUTE FREMME', 'LFD'],
    path: 'M12,66 Q12,58 20,56 L46,56 Q54,58 54,66 L54,98 Q54,106 46,106 L20,106 Q12,106 12,98 Z',
    side: 'left',
    zLayer: 2,
  },
  {
    id: 'door-front-right',
    label: 'Fremre dørrute høyre',
    shortLabel: 'Dør fv HS',
    typeCodes: ['DPF', 'DPFV'],
    descriptionPatterns: ['DØRRUTE FREMME', 'RFD'],
    path: 'M146,66 Q146,58 154,56 L180,56 Q188,58 188,66 L188,98 Q188,106 180,106 L154,106 Q146,106 146,98 Z',
    side: 'right',
    zLayer: 2,
  },
  {
    id: 'door-rear-left',
    label: 'Bakre dørrute venstre',
    shortLabel: 'Dør bv VS',
    typeCodes: ['DFB', 'DFBV'],
    descriptionPatterns: ['DØRRUTE BAK', 'DFB'],
    path: 'M12,112 Q12,104 20,102 L46,102 Q54,104 54,112 L54,144 Q54,152 46,152 L20,152 Q12,152 12,144 Z',
    side: 'left',
    zLayer: 2,
  },
  {
    id: 'door-rear-right',
    label: 'Bakre dørrute høyre',
    shortLabel: 'Dør bh HS',
    typeCodes: ['DPB', 'DPBV'],
    descriptionPatterns: ['DØRRUTE BAK', 'DPB'],
    path: 'M146,112 Q146,104 154,102 L180,102 Q188,104 188,112 L188,144 Q188,152 180,152 L154,152 Q146,152 146,144 Z',
    side: 'right',
    zLayer: 2,
  },
  {
    id: 'side-rear-left',
    label: 'Siderute bak venstre',
    shortLabel: 'Side bv VS',
    typeCodes: ['SFB1', 'SFB2', 'SFB3'],
    descriptionPatterns: ['SIDERUTE', 'SIDEGLASS', 'SFB', 'LRQ', 'L RQ'],
    path: 'M8,70 Q8,66 12,66 L18,66 Q22,66 22,70 L22,140 Q22,144 18,144 L12,144 Q8,144 8,140 Z',
    side: 'left',
    zLayer: 1,
  },
  {
    id: 'side-rear-right',
    label: 'Siderute bak høyre',
    shortLabel: 'Side bh HS',
    typeCodes: ['SPB1', 'SPB2', 'SPB3'],
    descriptionPatterns: ['SIDERUTE', 'SIDEGLASS', 'SPB', 'RRQ', 'R RQ'],
    path: 'M178,70 Q178,66 182,66 L188,66 Q192,66 192,70 L192,140 Q192,144 188,144 L182,144 Q178,144 178,140 Z',
    side: 'right',
    zLayer: 1,
  },
  {
    id: 'vent-left',
    label: 'Ventilrute venstre',
    shortLabel: 'Ventil VS',
    typeCodes: ['DFFV', 'DFBV', 'DPFV'],
    descriptionPatterns: ['VENTILRUTE', 'VENTIL'],
    path: 'M56,60 Q56,56 60,56 L76,56 Q80,56 80,60 L80,72 Q80,76 76,76 L60,76 Q56,76 56,72 Z',
    side: 'left',
    zLayer: 2,
  },
  {
    id: 'vent-right',
    label: 'Ventilrute høyre',
    shortLabel: 'Ventil HS',
    typeCodes: ['DPFV', 'DPBV', 'DFFV'],
    descriptionPatterns: ['VENTILRUTE', 'VENTIL'],
    path: 'M120,60 Q120,56 124,56 L140,56 Q144,56 144,60 L144,72 Q144,76 140,76 L124,76 Q120,76 120,72 Z',
    side: 'right',
    zLayer: 2,
  },
];

/* ------------------------------------------------------------------
   COLOR FILTER DEFINITIONS
   ------------------------------------------------------------------ */

interface ColorFilterDef {
  id: string;
  label: string;
  tailwindClass: string;
  /** Keywords to match in description */
  keywords: string[];
}

const COLOR_FILTERS: ColorFilterDef[] = [
  { id: 'all', label: 'Alle farger', tailwindClass: 'bg-gradient-to-br from-gray-200 to-gray-300', keywords: [] },
  { id: 'GN', label: 'Grønn', tailwindClass: 'bg-gradient-to-br from-green-400 to-green-600', keywords: ['GN'] },
  { id: 'BL', label: 'Blå', tailwindClass: 'bg-gradient-to-br from-blue-400 to-blue-600', keywords: ['BL'] },
  { id: 'GY', label: 'Grå', tailwindClass: 'bg-gradient-to-br from-slate-400 to-slate-600', keywords: ['GY'] },
  { id: 'YP', label: 'Sotet', tailwindClass: 'bg-gradient-to-br from-slate-700 to-slate-900', keywords: ['YP', 'SOTE'] },
  { id: 'GD', label: 'Mørk grønn', tailwindClass: 'bg-gradient-to-br from-green-700 to-green-900', keywords: ['GD'] },
  { id: 'CL', label: 'Klar', tailwindClass: 'bg-gradient-to-br from-sky-100 to-sky-200', keywords: ['CL', 'KLAR'] },
  { id: 'BZ', label: 'Bronze', tailwindClass: 'bg-gradient-to-br from-amber-600 to-amber-800', keywords: ['BZ', 'BRONZE'] },
  { id: 'GB', label: 'Grå/blå', tailwindClass: 'bg-gradient-to-br from-slate-500 to-blue-500', keywords: ['GB'] },
];

/* ------------------------------------------------------------------
   COMPONENT
   ------------------------------------------------------------------ */

interface GlassPositionSelectorProps {
  products: Product[];
  onFilter: (positionId: string | null, colorId: string | null) => void;
}

export function GlassPositionSelector({ products, onFilter }: GlassPositionSelectorProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeColor, setActiveColor] = useState<string>('all');
  const [exploded, setExploded] = useState(false);

  /* ---------- derived data ---------- */
  const posCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const pos of GLASS_POSITIONS) {
      m.set(pos.id, products.filter((p) => matchesPosition(p, pos)).length);
    }
    return m;
  }, [products]);

  const colorCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const cf of COLOR_FILTERS) {
      if (cf.id === 'all') {
        m.set(cf.id, products.length);
        continue;
      }
      m.set(
        cf.id,
        products.filter((p) => cf.keywords.some((k) => p.description?.toUpperCase().includes(k))).length
      );
    }
    return m;
  }, [products]);

  /* ---------- hover tooltip data ---------- */
  const hoveredProducts = useMemo(() => {
    if (!hoveredId) return [];
    const pos = GLASS_POSITIONS.find((p) => p.id === hoveredId);
    if (!pos) return [];
    return products.filter((p) => matchesPosition(p, pos)).slice(0, 4);
  }, [hoveredId, products]);

  /* ---------- handlers ---------- */
  const handlePosClick = (id: string) => {
    const next = activeId === id ? null : id;
    setActiveId(next);
    onFilter(next, activeColor === 'all' ? null : activeColor);
  };

  const handleColorClick = (id: string) => {
    setActiveColor(id);
    onFilter(activeId, id === 'all' ? null : id);
  };

  /* ---------- render helpers ---------- */
  const glassFill = (_pos: GlassPosition, count: number, isHovered: boolean, isActive: boolean) => {
    if (!count) return 'url(#glassDisabled)';
    if (isActive) return 'url(#glassActive)';
    if (isHovered) return 'url(#glassHover)';
    return 'url(#glassNormal)';
  };

  return (
    <div className="w-full select-none">
      {/* ---- Color filter pills ---- */}
      <div className="flex flex-wrap gap-2 mb-4 justify-center">
        {COLOR_FILTERS.map((cf) => {
          const count = colorCounts.get(cf.id) ?? 0;
          if (cf.id !== 'all' && count === 0) return null;
          const isActive = activeColor === cf.id;
          return (
            <button
              key={cf.id}
              type="button"
              onClick={() => handleColorClick(cf.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                isActive
                  ? 'bg-gray-900 text-white border-gray-900 shadow-md scale-105'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-sm'
              )}
            >
              {cf.id !== 'all' && (
                <span className={cn('inline-block w-3 h-3 rounded-full shadow-sm', cf.tailwindClass)} />
              )}
              <span>{cf.label}</span>
              <span
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                  isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ---- Main car diagram ---- */}
      <div className="relative bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
        {/* Toolbar */}
        <div className="absolute top-3 right-3 z-20 flex gap-2">
          <button
            type="button"
            onClick={() => setExploded((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all border bg-white shadow-sm hover:shadow-md',
              exploded ? 'border-autoglass-blue text-autoglass-blue' : 'border-gray-200 text-gray-600'
            )}
          >
            {exploded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {exploded ? 'Samlet' : 'Eksplodert'}
          </button>
        </div>

        <div className="p-6 flex flex-col items-center">
          <p className="text-sm text-gray-500 mb-1 uppercase tracking-wider font-medium">
            Klikk på glasset du trenger
          </p>

          <svg
            viewBox="0 0 200 200"
            className="w-full max-w-[360px] h-auto"
            style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.08))' }}
          >
            <defs>
              {/* Gradients */}
              <linearGradient id="glassNormal" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.6" />
                <stop offset="50%" stopColor="#cbd5e1" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="glassHover" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.7" />
                <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.5" />
              </linearGradient>
              <linearGradient id="glassActive" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.85" />
                <stop offset="50%" stopColor="#2563eb" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.65" />
              </linearGradient>
              <linearGradient id="glassDisabled" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f1f5f9" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.2" />
              </linearGradient>
              {/* Glow filter */}
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Car body outline (top-down stylised) */}
            <path
              d="M30,100 Q30,40 60,30 L80,20 L120,20 L140,30 Q170,40 170,100 Q170,160 140,170 L120,180 L80,180 L60,170 Q30,160 30,100 Z"
              fill="#f8fafc"
              stroke="#94a3b8"
              strokeWidth="2"
            />

            {/* Side pillars */}
            <rect x="48" y="20" width="4" height="160" rx="1" fill="#cbd5e1" />
            <rect x="148" y="20" width="4" height="160" rx="1" fill="#cbd5e1" />
            <rect x="98" y="20" width="4" height="160" rx="1" fill="#cbd5e1" />

            {/* Wheels */}
            <circle cx="55" cy="100" r="12" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
            <circle cx="145" cy="100" r="12" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />

            {/* Glass positions (sorted by zLayer) */}
            {[1, 2, 3].map((layer) =>
              GLASS_POSITIONS.filter((p) => p.zLayer === layer).map((pos) => {
                const count = posCounts.get(pos.id) ?? 0;
                const isHovered = hoveredId === pos.id;
                const isActive = activeId === pos.id;
                const hasProducts = count > 0;

                const explodeOffset = exploded
                  ? pos.side === 'left'
                    ? -12
                    : pos.side === 'right'
                      ? 12
                      : pos.id === 'rear'
                        ? 16
                        : -16
                  : 0;

                // Calculate touch target center point from path bounds
                const pathBounds = getPathBounds(pos.path);
                const touchTargetCx = pathBounds.cx;
                const touchTargetCy = pathBounds.cy;

                return (
                  <g
                    key={pos.id}
                    className={cn(hasProducts && 'cursor-pointer')}
                    style={{
                      transform: `translateX(${explodeOffset}px)`,
                      transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }}
                    onMouseEnter={() => hasProducts && setHoveredId(pos.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => hasProducts && handlePosClick(pos.id)}
                    role="button"
                    tabIndex={hasProducts ? 0 : -1}
                    aria-label={pos.label}
                    onKeyDown={(e) => {
                      if (hasProducts && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        handlePosClick(pos.id);
                      }
                    }}
                  >
                    {/* Invisible touch target for 44x44px minimum */}
                    {hasProducts && (
                      <circle
                        cx={touchTargetCx}
                        cy={touchTargetCy}
                        r={22}
                        fill="transparent"
                        style={{ pointerEvents: 'all' }}
                      />
                    )}
                    <path
                      d={pos.path}
                      fill={glassFill(pos, count, isHovered, isActive)}
                      stroke={isActive ? '#2563eb' : isHovered ? '#60a5fa' : hasProducts ? '#94a3b8' : '#e2e8f0'}
                      strokeWidth={isActive ? 2.5 : isHovered ? 2 : 1}
                      strokeLinejoin="round"
                      style={{
                        filter: isHovered || isActive ? 'url(#glow)' : 'none',
                        transition: 'all 0.25s ease',
                        pointerEvents: hasProducts ? 'none' : 'auto',
                      }}
                    />
                    {/* Product count badge */}
                    {hasProducts && count > 0 && (
                      <text
                        x={pos.side === 'left' ? 28 : pos.side === 'right' ? 172 : 100}
                        y={pos.id === 'front' ? 46 : pos.id === 'rear' ? 166 : 84}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="11"
                        fontWeight="700"
                        fill={isActive ? '#1d4ed8' : '#64748b'}
                        style={{ pointerEvents: 'none', transition: 'fill 0.2s' }}
                      >
                        {count}
                      </text>
                    )}
                  </g>
                );
              })
            )}

            {/* Direction arrow (front = top) */}
            <g transform="translate(100, 8)">
              <polygon points="-6,0 0,-8 6,0" fill="#94a3b8" />
              <text x="0" y="14" textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight="600">
                FRONT
              </text>
            </g>

            {/* Side labels */}
            <text x="6" y="100" textAnchor="middle" fontSize="10" fill="#3b82f6" fontWeight="700" transform="rotate(-90 6 100)">
              VS
            </text>
            <text x="194" y="100" textAnchor="middle" fontSize="10" fill="#ef4444" fontWeight="700" transform="rotate(90 194 100)">
              HS
            </text>
          </svg>
        </div>

        {/* ---- Hover tooltip ---- */}
        {hoveredId && hoveredProducts.length > 0 && (
          <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl p-3 shadow-lg z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-gray-900">
                {GLASS_POSITIONS.find((p) => p.id === hoveredId)?.label}
              </span>
              <ChevronRight className="h-3 w-3 text-gray-400" />
              <span className="text-xs text-gray-500">{hoveredProducts.length} alternativer</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {hoveredProducts.map((p) => {
                const color = parseGlassColor(p.description || '');
                return (
                  <div
                    key={p.id}
                    className="flex-shrink-0 flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100"
                  >
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${color.tailwindColor}`} />
                    <span className="text-[10px] font-mono font-bold text-gray-800">{p.eurocode || p.articleNumber}</span>
                    <span className="text-[10px] text-gray-500">{color.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ---- Legend ---- */}
      <div className="flex flex-wrap justify-center gap-4 mt-3 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded bg-gradient-to-br from-blue-200 to-blue-400 border border-blue-300" />
          Tilgjengelig
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded bg-gradient-to-br from-gray-200 to-gray-300 border border-gray-300" />
          Valgt
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" />
          Hold musepeker over for å se alternativer
        </span>
      </div>

      {/* ---- Active selection pill ---- */}
      {activeId && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => handlePosClick(activeId)}
            className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-200 px-4 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100 transition-colors"
          >
            {GLASS_POSITIONS.find((p) => p.id === activeId)?.label}
            <span className="bg-blue-200 text-blue-800 text-xs px-2 py-0.5 rounded-full">
              {posCounts.get(activeId)}
            </span>
            <span className="text-blue-400 hover:text-blue-600">✕</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   UTILS
   ------------------------------------------------------------------ */

/** Calculate approximate center and bounds from SVG path for touch targets */
function getPathBounds(path: string): { cx: number; cy: number } {
  // Extract all numbers from the path
  const numbers = path.match(/-?\d+\.?\d*/g)?.map(Number) || [];
  if (numbers.length < 2) return { cx: 100, cy: 100 };

  // Take every pair as x,y coordinates
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < numbers.length; i += 2) {
    xs.push(numbers[i]);
    if (i + 1 < numbers.length) {
      ys.push(numbers[i + 1]);
    }
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

export function matchesPosition(product: Product, position: GlassPosition): boolean {
  const tc = (product.typeCode || product.category || '').toUpperCase();
  const desc = (product.description || '').toUpperCase();

  if (position.typeCodes.some((c) => tc === c || tc.includes(c))) {
    return verifySide(desc, tc, position.side);
  }
  if (position.descriptionPatterns.some((pat) => desc.includes(pat))) {
    return verifySide(desc, tc, position.side);
  }
  return false;
}

function verifySide(desc: string, typeCode: string, side: string): boolean {
  if (side === 'center') return true;

  const isRight =
    desc.includes('HS') ||
    desc.includes('HØYRE') ||
    desc.includes('HÖGRE') ||
    desc.includes('RH') ||
    desc.includes('RIGHT') ||
    typeCode.startsWith('DP') ||
    typeCode.startsWith('SP');

  const isLeft =
    desc.includes('VS') ||
    desc.includes('VENSTRE') ||
    desc.includes('LH') ||
    desc.includes('LEFT') ||
    typeCode.startsWith('DF') ||
    typeCode.startsWith('SF');

  if (side === 'right') return isRight || (!isLeft && typeCode.startsWith('DP'));
  if (side === 'left') return isLeft || (!isRight && typeCode.startsWith('DF'));
  return true;
}
