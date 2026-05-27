import { useEffect, useState } from 'react';
import { Package, Award, Truck, Calendar } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

interface Stat {
  icon: typeof Package;
  value: string;
  label: string;
  pulse?: boolean;
}

function useCountUp(target: number, durationMs = 1200) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.floor(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return n;
}

export function LiveStats() {
  const { t } = useI18n();
  const skus = useCountUp(130000);
  const brands = useCountUp(12);
  const years = useCountUp(30);

  const stats: Stat[] = [
    {
      icon: Package,
      value: skus.toLocaleString('nb-NO'),
      label: t('stats.skus'),
      pulse: true,
    },
    { icon: Award, value: `${brands}+`, label: t('stats.brands') },
    { icon: Truck, value: t('stats.delivery.value'), label: t('stats.delivery') },
    { icon: Calendar, value: `${years}+`, label: t('stats.experience') },
  ];

  return (
    <section className="relative border-y border-carbon-800 bg-carbon-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-2 mb-6">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-signal-green opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-signal-green" />
          </span>
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-carbon-400">
            {t('stats.title')}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-carbon-800 rounded-lg overflow-hidden border border-carbon-800">
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-carbon-900 px-5 py-6 sm:py-7 group hover:bg-carbon-850 transition-colors"
            >
              <s.icon className="h-5 w-5 text-glass-cyan mb-3" />
              <div className="font-mono text-2xl sm:text-3xl font-bold text-white tabular-nums tracking-tight">
                {s.value}
              </div>
              <div className="mt-1 text-xs sm:text-sm text-carbon-400">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
