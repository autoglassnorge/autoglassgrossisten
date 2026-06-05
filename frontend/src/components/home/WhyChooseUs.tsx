/**
 * WhyChooseUs — 4 trust points with icons + real stats.
 * Replaces both LiveStats and TrustSection trust-items.
 */

import { ShieldCheck, Truck, Clock, Headphones } from 'lucide-react';

const POINTS = [
  {
    icon: ShieldCheck,
    title: 'OEM Kvalitet',
    description: 'Originale glass fra Pilkington, Sekurit, PGW og Glavista. Livstidsgaranti mot produksjonsfeil.',
    stat: '27 000+',
    statLabel: 'produkter',
  },
  {
    icon: Truck,
    title: 'Rask Levering',
    description: 'Dag-til-dag levering til hele Norge. Gratis frakt på ordre over 5 000 kr eks. mva.',
    stat: '24t',
    statLabel: 'levering',
  },
  {
    icon: Clock,
    title: 'ADAS-Kompetanse',
    description: 'Fullstendig kalibrering etter ruteskift. CSC-verktøy og target-plate for alle merker.',
    stat: '100%',
    statLabel: 'OEM-compliant',
  },
  {
    icon: Headphones,
    title: 'B2B Support',
    description: 'Dedikert kundeservice for verksteder og grossister. Teknisk veiledning og tilbud.',
    stat: '82',
    statLabel: 'bilmerker',
  },
];

export function WhyChooseUs() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-carbon-900 tracking-tight">
            Hvorfor velge Autoglass AS?
          </h2>
          <p className="mt-3 text-base sm:text-lg text-carbon-500">
            Norges ledende B2B-grossist av bilglass siden 1994
          </p>
        </div>

        {/* Points grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {POINTS.map((point) => (
            <div
              key={point.title}
              className="group relative rounded-xl border border-carbon-200 bg-carbon-50 p-6 hover:border-glass-cyan/40 hover:bg-white hover:shadow-lg transition-all duration-300"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-glass-cyan/10 mb-4 group-hover:bg-glass-cyan/20 transition-colors">
                <point.icon className="h-6 w-6 text-glass-cyan" />
              </div>

              <div className="font-mono text-2xl font-bold text-autoglass-blue tabular-nums mb-1">
                {point.stat}
              </div>
              <div className="text-xs text-carbon-400 uppercase tracking-wider mb-3">
                {point.statLabel}
              </div>

              <h3 className="text-base font-semibold text-carbon-900 mb-2">
                {point.title}
              </h3>
              <p className="text-sm text-carbon-500 leading-relaxed">
                {point.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
