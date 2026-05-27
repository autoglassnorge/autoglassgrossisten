import { Link } from 'react-router-dom';
import { ArrowUpRight, LayoutGrid } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

interface Category {
  id: string;
  titleKey: string;
  descKey: string;
  href: string;
  badge?: string;
}

const CATEGORIES: Category[] = [
  { id: 'ws', titleKey: 'categories.windshield', descKey: 'categories.windshield.desc', href: '/katalog?type=windshield', badge: 'OEM · OEE' },
  { id: 'adas', titleKey: 'categories.adas', descKey: 'categories.adas.desc', href: '/katalog?type=adas', badge: 'ADAS' },
  { id: 'side', titleKey: 'categories.side', descKey: 'categories.side.desc', href: '/katalog?type=side' },
  { id: 'rear', titleKey: 'categories.rear', descKey: 'categories.rear.desc', href: '/katalog?type=rear' },
  { id: 'adh', titleKey: 'categories.adhesive', descKey: 'categories.adhesive.desc', href: '/katalog?type=adhesive', badge: 'AGRSS' },
  { id: 'tools', titleKey: 'categories.tools', descKey: 'categories.tools.desc', href: '/verktoy' },
];

export function ProductCategories() {
  const { t } = useI18n();

  return (
    <section className="relative bg-carbon-950 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-10 gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-3 text-[11px] font-mono uppercase tracking-[0.2em] text-glass-cyan">
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>{t('categories.title')}</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight max-w-2xl">
              {t('categories.subtitle')}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-carbon-800 border border-carbon-800 rounded-xl overflow-hidden">
          {CATEGORIES.map((c) => (
            <Link
              key={c.id}
              to={c.href}
              className="group relative bg-carbon-900 hover:bg-carbon-850 transition-colors p-6 sm:p-8 flex flex-col min-h-[200px]"
            >
              {/* Corner index */}
              <div className="absolute top-4 right-4 font-mono text-[10px] text-carbon-600 tracking-wider">
                {String(CATEGORIES.indexOf(c) + 1).padStart(2, '0')} / {String(CATEGORIES.length).padStart(2, '0')}
              </div>

              {c.badge && (
                <span className="inline-flex items-center self-start px-2 py-0.5 rounded-sm text-[10px] font-mono uppercase tracking-wider text-glass-cyan border border-glass-cyan/30 bg-glass-cyan/5 mb-4">
                  {c.badge}
                </span>
              )}

              <h3 className="text-xl sm:text-2xl font-semibold text-white group-hover:text-glass-cyan transition-colors">
                {t(c.titleKey)}
              </h3>
              <p className="mt-2 text-sm text-carbon-400 leading-relaxed flex-1">
                {t(c.descKey)}
              </p>

              <div className="mt-6 flex items-center justify-between">
                <div className="h-px flex-1 bg-carbon-800 group-hover:bg-glass-cyan/40 transition-colors" />
                <ArrowUpRight className="ml-4 h-5 w-5 text-carbon-500 group-hover:text-glass-cyan group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
