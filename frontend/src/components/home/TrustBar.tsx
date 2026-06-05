/**
 * TrustBar — Horizontal scrolling manufacturer bar.
 * Shows real brand names (not abbreviations like "PLK").
 */

const MANUFACTURERS = [
  'Pilkington',
  'Saint-Gobain Sekurit',
  'AGC Automotive',
  'PGW Auto Glass',
  'Glavista',
  'Fuyao',
  'XYG',
  'NordGlass',
  'Autoglass',
  'Euroglass',
];

export function TrustBar() {
  return (
    <section className="bg-carbon-950 border-y border-carbon-800 py-6 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs text-carbon-500 uppercase tracking-wider mb-4">
          Offisiell distributør av verdens ledende produsenter
        </p>
        <div className="flex items-center justify-center flex-wrap gap-x-6 gap-y-2 sm:gap-x-10">
          {MANUFACTURERS.map((name) => (
            <span
              key={name}
              className="text-sm sm:text-base font-semibold text-carbon-400 hover:text-carbon-200 transition-colors whitespace-nowrap"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
