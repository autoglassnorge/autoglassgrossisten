import { useI18n } from '@/i18n/I18nProvider';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';

// Redesign seksjoner
import { HeroB2B } from '@/components/home/HeroB2B';
import { VehicleTypeGrid } from '@/components/home/VehicleTypeGrid';
import { ManufacturerLogos } from '@/components/home/ManufacturerLogos';
import { WhyChooseUs } from '@/components/home/WhyChooseUs';
import { HowItWorksSection } from '@/components/home/HowItWorksSection';
import { SupportSection } from '@/components/home/SupportSection';
import { AdasSection } from '@/components/home/AdasSection';
import { CtaBanner } from '@/components/home/CtaBanner';
import { StickySearchBar } from '@/components/search/StickySearchBar';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ARTICLES } from '@/data/bilglassguide/content';

export default function HomePage() {
  const { t: _t } = useI18n();

  const faqData = {
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Hva er forskjellen på OEM og OEE bilglass?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'OEM (Original Equipment Manufacturer) er glass fra originalprodusenten som leverte til bilfabrikken. OEE (Original Equipment Equivalent) er glass fra samme fabrikk men solgt under annet navn, med identisk kvalitet til lavere pris.',
        },
      },
      {
        '@type': 'Question',
        name: 'Hvilke bilglass-kategorier finnes?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Vi fører frontruter, bakruter, sidedørruter, sidevinduer, og takvinduer (moonroof/sunroof) for alle vanlige bilmerker på det norske markedet.',
        },
      },
      {
        '@type': 'Question',
        name: 'Hvor fort kan jeg få levert bilglass?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Vi tilbyr neste-dag-levering til de fleste steder i Norge for varer på lager. Bestill før kl. 14:00 for levering dagen etter.',
        },
      },
      {
        '@type': 'Question',
        name: 'Hva er ADAS-kalibrering?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'ADAS (Advanced Driver Assistance Systems) er sikkerhetssystemer i moderne biler som krever kalibrering etter bytte av frontrute. Dette gjelder systemer som filskiftevarsel, adaptiv cruise control og autobrems.',
        },
      },
      {
        '@type': 'Question',
        name: 'Hvilke produsenter fører dere?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Vi er grossist for ledende produsenter som Pilkington, Glavista, Euroglass, PGW, Saint-Gobain (Sekurit), AGC Automotive, Fuyao og XYG.',
        },
      },
    ],
  };

  return (
    <>
      <PageMeta
        title="Autoglass AS — B2B grossist av bilglass i Norge"
        description="Norges største grossist av bilglass. 133 000+ glass på lager, 27 000+ forskjellige varianter: frontruter, bakruter, sidedørruter, takvinduer. Neste-dag-levering, ADAS-kompatibilitet og OEM-kvalitet. Søk med registreringsnummer."
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
            faqData,
          ],
        }}
      />

      <main>
        {/* 1. HERO — Regnr search as primary CTA */}
        <HeroB2B />

        {/* 2. STICKY SEARCH — Follows on scroll */}
        <StickySearchBar />

        {/* 3. MANUFACTURER LOGOS — Trust bar */}
        <ManufacturerLogos />

        {/* 4. VEHICLE TYPES — Vehicle type showcase */}
        <VehicleTypeGrid />

        {/* 5. ARTICLES — Technical content hub */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
                  Fagartikler om bilglass
                </h2>
                <p className="mt-3 max-w-2xl text-base text-gray-600">
                  Teknisk kunnskap om frontruter, ADAS, HUD, produsenter og variantmatching.
                </p>
              </div>
              <Link
                to="/bilglassguide"
                className="inline-flex items-center gap-2 text-sm font-semibold text-autoglass-blue hover:underline"
              >
                Se alle artikler
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {ARTICLES.slice(0, 6).map((article) => (
                <Link
                  key={article.slug}
                  to={`/bilglassguide/${article.slug}`}
                  className="group rounded-lg border border-gray-200 bg-white p-5 transition-colors hover:border-autoglass-blue hover:bg-blue-50/40"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-autoglass-blue">
                    {article.category}
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-gray-900 group-hover:text-autoglass-blue">
                    {article.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {article.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* 6. HOW IT WORKS — B2B workflow for all visitors */}
        <HowItWorksSection />

        {/* 7. WHY CHOOSE US — Trust points + stats */}
        <WhyChooseUs />

        {/* 8. SUPPORT — "Snakk med glassteamet" */}
        <SupportSection />

        {/* 8. ADAS — Calibration competence */}
        <AdasSection />

        {/* 9. CTA — Closing call-to-action */}
        <CtaBanner />
      </main>
    </>
  );
}
