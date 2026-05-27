import { useI18n } from '@/i18n/I18nProvider';

const BRANDS = [
  { name: 'Pilkington', tier: 'OEM' },
  { name: 'Saint-Gobain Sekurit', tier: 'OEM' },
  { name: 'AGC', tier: 'OEM' },
  { name: 'Fuyao', tier: 'OEM' },
  { name: 'Xinyi', tier: 'OEM' },
  { name: 'NordGlass', tier: 'OEE' },
  { name: 'Splintex', tier: 'OEE' },
  { name: 'Guardian', tier: 'OEM' },
  { name: 'Sika', tier: 'PUR' },
  { name: 'Henkel Teroson', tier: 'PUR' },
  { name: 'Dow Betaseal', tier: 'PUR' },
  { name: '3M', tier: 'TOOL' },
];

export function BrandWall() {
  const { t } = useI18n();

  return (
    <section className="relative bg-carbon-950 py-20 sm:py-24 border-t border-carbon-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-glass-cyan mb-3">
            ↓ {t('brands.title')}
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {t('brands.subtitle')}
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-carbon-800 border border-carbon-800 rounded-lg overflow-hidden">
          {BRANDS.map((b) => (
            <div
              key={b.name}
              className="bg-carbon-900 hover:bg-carbon-850 transition-colors p-6 flex items-center justify-between min-h-[80px]"
            >
              <span className="text-white font-semibold text-sm sm:text-base">{b.name}</span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-carbon-500 border border-carbon-700 px-1.5 py-0.5 rounded-sm">
                {b.tier}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
