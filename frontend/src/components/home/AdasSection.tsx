import { Check, Crosshair, ArrowRight, BookOpen } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { Link } from 'react-router-dom';

export function AdasSection() {
  const { t } = useI18n();

  const points = [
    t('adas.point.1'),
    t('adas.point.2'),
    t('adas.point.3'),
    t('adas.point.4'),
  ];

  return (
    <section className="relative bg-carbon-900 py-20 sm:py-28 overflow-hidden">
      {/* Subtle background grid */}
      <div className="absolute inset-0 bg-grid-carbon bg-grid opacity-30 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-carbon-900 pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-5 gap-12 lg:gap-16 items-start">
          {/* Copy — wider */}
          <div className="lg:col-span-3">
            <div className="flex items-center gap-2 mb-4 text-[11px] font-mono uppercase tracking-[0.2em] text-glass-cyan">
              <Crosshair className="h-3.5 w-3.5" />
              <span>{t('adas.eyebrow')}</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
              {t('adas.title')}
            </h2>
            <p className="mt-5 text-base sm:text-lg text-carbon-300 leading-relaxed max-w-xl">
              {t('adas.body')}
            </p>

            <ul className="mt-8 space-y-3">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <span className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm border border-glass-cyan/40 bg-glass-cyan/10">
                    <Check className="h-3 w-3 text-glass-cyan" strokeWidth={3} />
                  </span>
                  <span className="text-sm sm:text-base text-carbon-200">{p}</span>
                </li>
              ))}
            </ul>

            <Link
              to="/bilglassguide/kalibrering"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-glass-cyan hover:text-glass-cyanLight transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              Les kalibreringsguiden for verksteder
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Technical spec card — replaces generic diagram */}
          <div className="lg:col-span-2">
            <div className="border border-carbon-700 bg-carbon-950 rounded-lg p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-carbon-500 mb-4">
                ADAS · Kalibreringsspesifikasjon
              </div>

              <div className="space-y-4">
                {[
                  { label: 'Kamerasonens synsfelt', value: '±0,5°', desc: 'Krever optisk klar glassflate' },
                  { label: 'Kalibreringsavvik', value: '< 0,1°', desc: 'Statisk + dynamisk kontroll' },
                  { label: 'OEM-godkjente verktøy', value: 'CSC / target-plate', desc: 'Model-spesifikk oppsett' },
                  { label: 'Påkrevd etter ruteskift', value: 'Ja', desc: 'Filskifte · ACC · nødbrems' },
                ].map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs text-carbon-400">{row.label}</div>
                      <div className="text-[11px] text-carbon-600 mt-0.5">{row.desc}</div>
                    </div>
                    <div className="text-sm font-mono font-semibold text-glass-cyan whitespace-nowrap">
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-carbon-800">
                <div className="font-mono text-[9px] text-carbon-600 tracking-wider">
                  IEC 61508 · ISO 26262 · OEM SPEC COMPLIANT
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
