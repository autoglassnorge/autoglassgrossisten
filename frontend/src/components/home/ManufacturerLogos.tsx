/**
 * ManufacturerLogos — Grayscale logos of glass manufacturers.
 * Supports both image files (SVG/PNG) and styled text fallback.
 * To add official logos: place SVG/PNG files in /public/images/logos/
 * and update the MANUFACTURERS array below.
 */

import { useRef } from 'react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

interface Manufacturer {
  name: string;
  abbr: string;
  logo?: string; // path in /public/images/logos/
  color: string; // brand color for fallback text
}

const MANUFACTURERS: Manufacturer[] = [
  { name: 'Pilkington', abbr: 'PLK', color: '#003B7A' },
  { name: 'Saint-Gobain Sekurit', abbr: 'SGS', color: '#009639' },
  { name: 'AGC Automotive', abbr: 'AGC', color: '#0055A4' },
  { name: 'PGW Auto Glass', abbr: 'PGW', color: '#E31837' },
  { name: 'Glavista', abbr: 'GLA', color: '#0047AB' },
  { name: 'Fuyao', abbr: 'FUY', color: '#CC0000' },
  { name: 'XYG', abbr: 'XYG', color: '#0066CC' },
  { name: 'NordGlass', abbr: 'NGL', color: '#003366' },
  { name: 'Euroglass', abbr: 'EUG', color: '#FF8C00' },
];

function ManufacturerLogo({ m }: { m: Manufacturer }) {
  // If a logo file exists, use it
  if (m.logo) {
    return (
      <img
        src={m.logo}
        alt={m.name}
        className="h-6 w-auto object-contain opacity-60 group-hover:opacity-100 transition-opacity"
        loading="lazy"
      />
    );
  }

  // Fallback: styled text badge with brand color
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

export function ManufacturerLogos() {
  const sectionRef = useRef<HTMLElement>(null);
  const isVisible = useScrollReveal(sectionRef);

  return (
    <section
      ref={sectionRef}
      className={`bg-carbon-950 border-y border-carbon-800 py-8 overflow-hidden transition-all duration-500 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-[11px] text-carbon-500 uppercase tracking-[0.15em] mb-5">
          Offisiell distributør av verdens ledende produsenter
        </p>

        {/* Desktop: wrap grid */}
        <div className="hidden sm:flex items-center justify-center flex-wrap gap-x-8 gap-y-4">
          {MANUFACTURERS.map((m) => (
            <div
              key={m.name}
              className="group flex items-center gap-2 cursor-default"
              title={m.name}
            >
              <ManufacturerLogo m={m} />
            </div>
          ))}
        </div>

        {/* Mobile: horizontal scroll */}
        <div className="sm:hidden flex overflow-x-auto snap-x snap-mandatory gap-6 pb-2 -mx-4 px-4 scrollbar-hide">
          {MANUFACTURERS.map((m) => (
            <div
              key={m.name}
              className="flex-shrink-0 snap-start flex items-center gap-2"
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
