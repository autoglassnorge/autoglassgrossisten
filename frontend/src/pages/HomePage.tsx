import { useI18n } from '@/i18n/I18nProvider';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';

// Redesign seksjoner
import { HeroProfessor } from '@/components/home/HeroProfessor';
import { TrustBar } from '@/components/home/TrustBar';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { WhyChooseUs } from '@/components/home/WhyChooseUs';
import { AdasSection } from '@/components/home/AdasSection';
import { CtaBanner } from '@/components/home/CtaBanner';

/**
 * HomePage - Hybrid design: Sekurit layout + Autoglass identitet
 * 
 * Layout-sekvens:
 * 1. HeroSekurit - Mørk hero med stort søkefelt
 * 2. TrustSection - Produsenter og garantier
 * 3. CategoryGrid - Produktkategorier
 * 4. LiveStats - Statistikk
 * 5. Testimonials - Kundeuttalelser
 * 6. AdasSection - ADAS-kompetanse
 * 7. QuickActions - Hurtigvalg CTA
 * 8. CtaBanner - Avsluttende call-to-action
 */

export default function HomePage() {
  const { t: _t } = useI18n();

  // FAQ-strukturert data for SEO
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
        description="Norges største grossist av bilglass. 27 000+ produkter: frontruter, bakruter, sidedørruter, takvinduer. Neste-dag-levering, ADAS-kompatibilitet og OEM-kvalitet. Søk med registreringsnummer."
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
        {/* 1. HERO — Professor Autoglass primary entry */}
        <HeroProfessor />

        {/* 2. TRUST — Manufacturer bar */}
        <TrustBar />

        {/* 3. CATEGORIES — Product categories */}
        <CategoryGrid />

        {/* 4. WHY CHOOSE US — Trust points + stats */}
        <WhyChooseUs />

        {/* 6. ADAS — Calibration competence */}
        <AdasSection />

        {/* 7. CTA — Closing call-to-action */}
        <CtaBanner />
      </main>
    </>
  );
}
