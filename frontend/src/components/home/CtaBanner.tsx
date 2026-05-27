import { Link } from 'react-router-dom';
import { ArrowRight, PhoneCall } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

export function CtaBanner() {
  const { t } = useI18n();

  return (
    <section className="relative bg-carbon-950 py-20 sm:py-28 border-t border-carbon-800 overflow-hidden">
      {/* Subtle radial glow */}
      <div className="absolute inset-0 bg-radial-spot pointer-events-none" />
      <div className="absolute inset-0 bg-grid-carbon bg-grid opacity-20 pointer-events-none" />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
          {t('cta.title')}
        </h2>
        <p className="mt-4 text-base sm:text-lg text-carbon-300 max-w-2xl mx-auto">
          {t('cta.subtitle')}
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/bli-kunde"
            className="group inline-flex items-center justify-center gap-2 bg-glass-cyan hover:bg-glass-cyanLight text-carbon-950 font-semibold px-7 py-3.5 rounded-md transition-colors"
          >
            {t('cta.primary')}
            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link
            to="/kontakt"
            className="inline-flex items-center justify-center gap-2 border border-carbon-700 hover:border-glass-cyan hover:text-glass-cyan text-white px-7 py-3.5 rounded-md transition-colors"
          >
            <PhoneCall className="h-4 w-4" />
            {t('cta.secondary')}
          </Link>
        </div>
      </div>
    </section>
  );
}
