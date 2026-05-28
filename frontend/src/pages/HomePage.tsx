import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import { HeroSearch } from '@/components/home/HeroSearch';
import { HeroVideo } from '@/components/home/HeroVideo';
import { LiveStats } from '@/components/home/LiveStats';
import { ProductCategories } from '@/components/home/ProductCategories';
import { AdasSection } from '@/components/home/AdasSection';
import { LogisticsMap } from '@/components/home/LogisticsMap';
import { CtaBanner } from '@/components/home/CtaBanner';
import { ArrowRight } from 'lucide-react';
import { MANUFACTURERS } from '@/data/bilglassguide/content';

export default function HomePage() {
  const { t } = useI18n();

  return (
    <>
      <PageMeta
        title="Autoglass AS — B2B grossist av bilglass i Norge"
        description="Norges største grossist av bilglass. 37 500+ produkter, neste-dag-levering, ADAS-kompatibilitet og OEM-kvalitet. Søk med registreringsnummer."
        canonicalPath="/"
        ogImage="https://autoglass-frontend.pages.dev/logo.png"
        ogType="website"
        twitterCard="summary_large_image"
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              '@id': 'https://autoglass-frontend.pages.dev/#organization',
              name: 'Autoglass AS',
              url: 'https://autoglass-frontend.pages.dev/',
              logo: {
                '@type': 'ImageObject',
                url: 'https://autoglass-frontend.pages.dev/logo.png',
              },
              description: 'Norges største B2B-grossist av bilglass.',
              sameAs: [],
            },
            {
              '@type': 'WebSite',
              '@id': 'https://autoglass-frontend.pages.dev/#website',
              url: 'https://autoglass-frontend.pages.dev/',
              name: 'Autoglass AS',
              publisher: { '@id': 'https://autoglass-frontend.pages.dev/#organization' },
              potentialAction: {
                '@type': 'SearchAction',
                target: {
                  '@type': 'EntryPoint',
                  urlTemplate: 'https://autoglass-frontend.pages.dev/sok?regnr={search_term_string}',
                },
                'query-input': 'required name=search_term_string',
              },
            },
          ],
        }}
      />

    <div className="bg-carbon-950 text-white">
      {/* ============================ HERO ============================ */}
      <section className="relative overflow-hidden bg-carbon-950">
        {/* Animated video background with CSS fallback */}
        <HeroVideo />

        {/* Top accent line */}
        <div
          className="absolute inset-x-0 top-0 h-px z-10"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(0,180,216,0.5), transparent)' }}
        />

        {/* Top meta-bar */}
        <div className="relative z-10 border-b border-carbon-800/60 bg-carbon-950/40 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-9 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-carbon-500">
            <div className="flex items-center gap-4">
              <span className="hidden sm:inline">SYS · AUTOGLASS-WHOLESALE-v3</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-signal-green animate-pulse" />
                <span className="text-signal-green">ONLINE</span>
              </span>
            </div>
            <div className="hidden md:flex items-center gap-4">
              <span className="text-carbon-400">B2B · GROSSIST · NESTE-DAG-LEVERING</span>
            </div>
          </div>
        </div>

        {/* Hero content */}
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-24 sm:pt-24 sm:pb-32">
          <div className="max-w-4xl">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-glass-cyan/30 bg-glass-cyan/5 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-glass-cyan animate-pulse-slow" />
              <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-glass-cyan">
                {t('hero.eyebrow')}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-[4.5rem] xl:text-7xl font-bold tracking-tight text-white leading-[1.08] drop-shadow-[0_2px_24px_rgba(0,0,0,0.5)]">
              <span className="block">{t('hero.title.line1')}</span>
              <span className="block text-glass-cyan">{t('hero.title.line2')}</span>
            </h1>

            {/* Subtitle */}
            <p className="mt-6 max-w-2xl text-base sm:text-lg text-carbon-200 leading-relaxed drop-shadow-[0_1px_12px_rgba(0,0,0,0.4)]">
              {t('hero.subtitle')}
            </p>

            {/* Search */}
            <div className="mt-10">
              <HeroSearch />
            </div>

            {/* Secondary actions */}
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                to="/bla"
                className="group inline-flex items-center gap-2 text-sm text-carbon-300 hover:text-glass-cyan transition-colors"
              >
                <span>{t('hero.cta.catalog')}</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                to="/bli-kunde"
                className="group inline-flex items-center gap-2 text-sm text-carbon-300 hover:text-glass-cyan transition-colors"
              >
                <span>{t('hero.cta.quote')}</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Decorative corner brackets — blueprint feel */}
          <CornerBracket className="absolute top-12 right-6 sm:right-10 hidden sm:block z-10" />
          <CornerBracket className="absolute bottom-12 left-6 sm:left-10 rotate-180 hidden sm:block z-10" />
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-b from-transparent to-carbon-900 pointer-events-none z-10" />
      </section>

      {/* ============================ LIVE STATS ============================ */}
      <LiveStats />

      {/* ============================ CATEGORIES ============================ */}
      <ProductCategories />

      {/* ============================ ADAS ============================ */}
      <AdasSection />

      {/* ============================ LOGISTICS ============================ */}
      <LogisticsMap />

      {/* ============================ MANUFACTURERS ============================ */}
      <section className="relative bg-carbon-950 py-20 sm:py-24 border-t border-carbon-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-glass-cyan mb-3">
              ↓ Leverandører vi fører
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              OEM og kvalitets-OEE fra etablerte produsenter
            </h2>
          </div>

          {/* Badge legend */}
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {[
              { label: 'OEM', desc: 'Original Equipment Manufacturer', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
              { label: 'OEE', desc: 'Original Equipment Equivalent', color: 'bg-blue-500/15 text-blue-300 border-blue-500/25' },
              { label: 'PUR', desc: 'Polyurethane / Lim', color: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
            ].map((b) => (
              <div key={b.label} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${b.color}`}>
                <span className="font-bold font-mono">{b.label}</span>
                <span className="opacity-70 hidden sm:inline">{b.desc}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MANUFACTURERS.map((m) => (
              <div
                key={m.name}
                className="group relative rounded-xl border border-carbon-700 bg-carbon-900/60 p-5 hover:bg-carbon-850 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-28 flex-shrink-0 items-center justify-center rounded-lg bg-white p-2 shadow-lg">
                    <img
                      src={m.logoPath}
                      alt={`${m.name} logo`}
                      className="max-h-full max-w-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-bold text-white text-sm">{m.name}</h3>
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold font-mono ${
                        m.badge === 'OEM' ? 'bg-emerald-500/20 text-emerald-300' :
                        m.badge === 'OEE' ? 'bg-blue-500/20 text-blue-300' :
                        'bg-amber-500/20 text-amber-300'
                      }`}>
                        {m.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-carbon-400 mb-1">{m.origin}</p>
                    <p className="text-sm text-carbon-300 leading-relaxed">{m.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ CTA ============================ */}
      <CtaBanner />
    </div>
    </>
  );
}

function CornerBracket({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none ${className}`} aria-hidden>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        <path
          d="M 2 18 L 2 2 L 18 2"
          stroke="#00B4D8"
          strokeWidth="1"
          opacity="0.6"
        />
        <circle cx="2" cy="2" r="1.5" fill="#00B4D8" />
      </svg>
    </div>
  );
}
