/**
 * ManufacturerLogos — Logo grid of glass manufacturers.
 * Supports both image files (SVG/PNG/JPG) and styled text fallback.
 * Place logo files in /public/images/logos/ and update MANUFACTURERS below.
 */

import { useRef, useState } from 'react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

interface Manufacturer {
  name: string;
  abbr: string;
  logo: string; // path in /public/images/logos/
  color: string; // brand color for fallback text
  dimensions?: { width: number; height: number }; // intrinsic size for CLS reduction
}

const MANUFACTURERS: Manufacturer[] = [
  { name: 'Pilkington', abbr: 'PLK', logo: '/images/logos/pilkington.png', color: '#003B7A', dimensions: { width: 265, height: 50 } },
  { name: 'Saint-Gobain Sekurit', abbr: 'SGS', logo: '/images/logos/saint-gobain.svg', color: '#009639', dimensions: { width: 173, height: 73 } },
  { name: 'AGC Automotive', abbr: 'AGC', logo: '/images/logos/agc.svg', color: '#0055A4', dimensions: { width: 2656, height: 986 } },
  { name: 'PGW Auto Glass', abbr: 'PGW', logo: '/images/logos/pgw.svg', color: '#E31837', dimensions: { width: 200, height: 50 } },
  { name: 'Glavista', abbr: 'GLA', logo: '/images/logos/glavista.svg', color: '#0047AB', dimensions: { width: 740, height: 291 } },
  { name: 'Fuyao', abbr: 'FUY', logo: '/images/logos/fuyao.png', color: '#0066CC', dimensions: { width: 418, height: 239 } },
  { name: 'XYG', abbr: 'XYG', logo: '/images/logos/xyg.png', color: '#0066CC', dimensions: { width: 200, height: 200 } },
  { name: 'NordGlass', abbr: 'NGL', logo: '/images/logos/nordglass.svg', color: '#003366', dimensions: { width: 200, height: 40 } },
  { name: 'Euroglass', abbr: 'EUG', logo: '/images/logos/euroglass.svg', color: '#FF8C00', dimensions: { width: 200, height: 40 } },
];

function ManufacturerLogo({ m }: { m: Manufacturer }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded text-white"
          style={{ backgroundColor: m.color }}
        >
          {m.abbr}
        </span>
        <span className="text-base font-semibold text-carbon-500 group-hover:text-white transition-colors tracking-wide">
          {m.name}
        </span>
      </div>
    );
  }

  return (
    <img
      src={m.logo}
      alt={m.name}
      className="h-9 w-auto object-contain transition motion-safe:group-hover:scale-105 motion-safe:group-hover:brightness-110"
      loading="lazy"
      decoding="async"
      fetchPriority="low"
      {...(m.dimensions
        ? { width: m.dimensions.width, height: m.dimensions.height }
        : {})}
      onError={() => setFailed(true)}
    />
  );
}

export function ManufacturerLogos() {
  const sectionRef = useRef<HTMLElement>(null);
  const isVisible = useScrollReveal(sectionRef);

  return (
    <section
      ref={sectionRef}
      aria-label="Produsenter"
      className={`bg-carbon-950 border-y border-carbon-800 py-8 overflow-hidden scroll-reveal ${isVisible ? 'is-visible' : ''}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-[11px] text-carbon-500 uppercase tracking-[0.15em] mb-5">
          Offisiell distributør av verdens ledende produsenter
        </p>

        <div className="hidden sm:flex items-center justify-center flex-wrap gap-x-8 gap-y-4">
          {MANUFACTURERS.map((m) => (
            <div
              key={m.name}
              className="group flex items-center justify-center px-4 py-2 rounded-lg bg-carbon-900/60 hover:bg-carbon-800/80 transition cursor-default"
              title={m.name}
            >
              <ManufacturerLogo m={m} />
            </div>
          ))}
        </div>

        <div className="sm:hidden flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 -mx-4 px-4 scrollbar-hide">
          {MANUFACTURERS.map((m) => (
            <div
              key={m.name}
              className="group flex-shrink-0 snap-start flex items-center justify-center px-4 py-2 rounded-lg bg-carbon-900/60"
              title={m.name}
            >
              <ManufacturerLogo m={m} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
