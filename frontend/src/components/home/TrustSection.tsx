import { Shield, Award, Clock, Truck } from 'lucide-react';

/**
 * TrustSection - Produsent-partnerskap og garantier
 * Viser OEM produsenter og kvalitetsloveranser
 */

const TRUST_ITEMS = [
  {
    icon: Shield,
    title: 'OEM Kvalitet',
    description: 'Originale glass fra Pilkington, Sekurit, PGW og Glavista',
  },
  {
    icon: Award,
    title: 'Livstidsgaranti',
    description: 'Full garanti på alle produkter mot produksjonsfeil',
  },
  {
    icon: Clock,
    title: 'Rask Levering',
    description: 'Dag-til-dag levering til hele Norge',
  },
  {
    icon: Truck,
    title: 'Fri Frakt',
    description: 'Gratis frakt på ordre over 5 000 kr',
  },
];

const MANUFACTURERS = [
  { name: 'Pilkington', abbr: 'PLK' },
  { name: 'Sekurit', abbr: 'SKR' },
  { name: 'PGW', abbr: 'PGW' },
  { name: 'Glavista', abbr: 'GLV' },
  { name: 'Autoglass', abbr: 'AGL' },
  { name: 'Euroglass', abbr: 'EUG' },
];

export function TrustSection() {
  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Produsenter */}
        <div className="text-center mb-12">
          <p className="text-sm text-carbon-500 uppercase tracking-wider mb-4">
            Offisiell distributør av verdens ledende produsenter
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8">
            {MANUFACTURERS.map((mfr) => (
              <div
                key={mfr.name}
                className="flex items-center justify-center w-24 h-12 bg-carbon-50 rounded-lg border border-carbon-200"
              >
                <span className="text-carbon-700 font-bold text-sm">
                  {mfr.abbr}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-carbon-200 my-12" />

        {/* Trust items */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {TRUST_ITEMS.map((item) => (
            <div key={item.title} className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-glass-cyan/10 mb-4">
                <item.icon className="h-6 w-6 text-glass-cyan" />
              </div>
              <h3 className="text-lg font-semibold text-carbon-900 mb-2">
                {item.title}
              </h3>
              <p className="text-sm text-carbon-600 leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
