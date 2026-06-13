/**
 * HeroB2B — Regnr search as the primary CTA.
 * Dark gradient background, large search input, secondary chat CTA, stats.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, ArrowRight } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useChatStore } from '@/stores/chatStore';
import { BUSINESS_METRICS, formatCompact } from '@/constants/businessMetrics';
import { COMPANY } from '@/config/company.config';
import ProfessorAvatar from '@/components/ordremottaker/ProfessorAvatar';

export function HeroB2B() {
  const [regnr, setRegnr] = useState('');
  const navigate = useNavigate();
  const { openChat } = useChatStore();
  const { t } = useI18n();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (regnr.trim().length >= 2) {
      navigate(`/sok?regnr=${encodeURIComponent(regnr.trim())}`);
    }
  };

  return (
    <section className="relative bg-gradient-to-b from-carbon-950 via-carbon-900 to-carbon-950 pt-16 pb-12 md:pt-20 md:pb-16 overflow-hidden">
      {/* Subtle background grid */}
      <div className="absolute inset-0 bg-grid-carbon bg-grid opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-radial-spot pointer-events-none" />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2 rounded-full border border-carbon-700 bg-carbon-900/80 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.15em] text-glass-cyan mb-6">
          <span>{t('hero.b2b.eyebrow')}</span>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight">
          {t('hero.b2b.title.line1')}
          <br />
          <span className="text-glass-cyan">{t('hero.b2b.title.line2')}</span>
        </h1>

        <p className="mt-4 text-base sm:text-lg text-carbon-300 max-w-2xl mx-auto">
          {t('hero.b2b.subtitle')}
        </p>

        {/* Search form */}
        <form onSubmit={handleSearch} className="mt-8 md:mt-10 mx-auto max-w-xl">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-carbon-500" />
              <input
                type="text"
                value={regnr}
                onChange={(e) => setRegnr(e.target.value.toUpperCase())}
                placeholder={t('hero.b2b.input.placeholder')}
                className="w-full h-14 pl-12 pr-4 rounded-xl bg-white text-carbon-900 placeholder:text-carbon-400 text-lg font-medium border-2 border-transparent focus:border-glass-cyan focus:outline-none transition-colors shadow-lg"
                maxLength={8}
              />
            </div>
            <button
              type="submit"
              disabled={regnr.trim().length < 2}
              className="h-14 px-8 rounded-xl bg-glass-cyan hover:bg-glass-cyanLight text-carbon-950 font-semibold text-base transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glass-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-carbon-950"
            >
              {t('hero.b2b.button')}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-xs text-carbon-500">
            {t('hero.b2b.input.hint')}
          </p>
        </form>

        {/* Secondary CTA: Chat */}
        <button
          onClick={() => openChat()}
          className="mt-5 inline-flex items-center gap-2 text-sm text-carbon-400 hover:text-glass-cyan transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glass-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-carbon-950 rounded-md px-1"
        >
          <ProfessorAvatar size="sm" className="!h-5 !w-5" />
          <span>{t('hero.b2b.chatCta')}</span>
          <Sparkles className="h-3.5 w-3.5" />
        </button>

        {/* Stats */}
        <div className="mt-10 md:mt-12 grid grid-cols-3 gap-4 md:gap-8 max-w-lg mx-auto">
          <div>
            <div className="text-2xl md:text-3xl font-bold text-white">{BUSINESS_METRICS.YEARS_EXPERIENCE}+</div>
            <div className="text-xs md:text-sm text-carbon-400">{t('hero.b2b.stat.years.label')}</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-white">{formatCompact(BUSINESS_METRICS.VARIANTS)}+</div>
            <div className="text-xs md:text-sm text-carbon-400">{t('hero.b2b.stat.variants.label')}</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-white">{COMPANY.OPENING_HOURS.SHORT_VALUE}</div>
            <div className="text-xs md:text-sm text-carbon-400">{t('hero.b2b.stat.opening.label')}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
