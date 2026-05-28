import { Truck, Shield, Clock, Factory } from 'lucide-react';

/* ========================================================================
   TrustStrip — operative trust-signaler rett under hero
   Konkrete tall og løfter. Ingen fluff.
   ======================================================================== */

const TRUST_ITEMS = [
  { icon: Truck, label: 'Neste dag', sub: 'levering i Norge' },
  { icon: Shield, label: 'OEM · OEE', sub: 'originalkvalitet' },
  { icon: Clock, label: '30+ år', sub: 'bransjeerfaring' },
  { icon: Factory, label: 'B2B', sub: 'kun grossist' },
];

export function TrustStrip() {
  return (
    <section className="border-y border-carbon-800 bg-carbon-900/80 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 overflow-x-auto py-4 scrollbar-hide">
          {TRUST_ITEMS.map((item) => (
            <div
              key={item.sub}
              className="flex items-center gap-3 flex-shrink-0 px-3"
            >
              <item.icon className="h-4 w-4 text-glass-cyan flex-shrink-0" />
              <div className="leading-tight">
                <span className="text-xs sm:text-sm font-semibold text-white">{item.label}</span>
                <span className="hidden sm:inline text-carbon-500 mx-1.5">·</span>
                <span className="text-[11px] sm:text-xs text-carbon-400">{item.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
