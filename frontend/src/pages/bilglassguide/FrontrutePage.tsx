import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import { Search, ArrowRight, ChevronRight, Shield, Thermometer, Eye, Volume2 } from 'lucide-react';

/* ========================================================================
   /bilglassguide/frontrute — Article Page V2
   Dyp teknisk informasjon om frontruter.
   ======================================================================== */

const PAGE_TITLE = 'Frontrute — konstruksjon, laminering og smartglass';
const PAGE_DESC = 'Alt du trenger å vite om frontruter: laminering, PVB, smartglass, akustikk, oppvarming og kompatibilitet med ADAS og HUD.';
const CANONICAL = '/bilglassguide/frontrute';

const FEATURES = [
  {
    icon: <Shield className="h-5 w-5 text-autoglass-blue" />,
    title: 'Laminering',
    text: 'To glasslag med PVB-folie (polyvinylbutyral) imellom. Folien holder glasset sammen ved knusing og reduserer skaderisiko.',
  },
  {
    icon: <Eye className="h-5 w-5 text-autoglass-blue" />,
    title: 'Smartglass',
    text: 'Elektrokromt glass som mørkner automatisk etter lysforhold. Reduserer blending og varmeinnslipp uten solskjerming.',
  },
  {
    icon: <Thermometer className="h-5 w-5 text-autoglass-blue" />,
    title: 'Oppvarming',
    text: 'Varmekabler i glasset for rask avising. Forskjellig effekt og tetthet avhengig av modell og klimasone.',
  },
  {
    icon: <Volume2 className="h-5 w-5 text-autoglass-blue" />,
    title: 'Akustisk laminering',
    text: 'Tykkere PVB eller spesialfolie demper vind- og veistøy med opptil 3–5 dB. Standard på premium-modeller.',
  },
];

export default function FrontrutePage() {
  return (
    <>
      <PageMeta title={PAGE_TITLE} description={PAGE_DESC} canonicalPath={CANONICAL} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: PAGE_TITLE,
          description: PAGE_DESC,
          image: 'https://autoglass-frontend.pages.dev/logo.png',
          datePublished: '2025-05-28',
          dateModified: '2025-05-28',
          author: { '@type': 'Organization', name: 'Autoglass AS' },
          publisher: {
            '@type': 'Organization',
            name: 'Autoglass AS',
            logo: { '@type': 'ImageObject', url: 'https://autoglass-frontend.pages.dev/logo.png' },
          },
          mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': `https://autoglass-frontend.pages.dev${CANONICAL}`,
          },
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Forsiden', item: 'https://autoglass-frontend.pages.dev/' },
            { '@type': 'ListItem', position: 2, name: 'Bilglassguide', item: 'https://autoglass-frontend.pages.dev/bilglassguide' },
            { '@type': 'ListItem', position: 3, name: 'Frontrute', item: `https://autoglass-frontend.pages.dev${CANONICAL}` },
          ],
        }}
      />

      <div className="min-h-screen bg-white">
        {/* ========== HERO / HEADER ========== */}
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-autoglass-blue text-white">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16 sm:px-6 lg:px-8">
            <nav className="text-sm text-slate-300 mb-6" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white">Forsiden</Link>
              <ChevronRight className="inline h-3 w-3 mx-1" />
              <Link to="/bilglassguide" className="hover:text-white">Bilglassguide</Link>
              <ChevronRight className="inline h-3 w-3 mx-1" />
              <span className="text-white">Frontrute</span>
            </nav>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Frontrute
            </h1>
            <p className="text-lg text-slate-200 max-w-2xl leading-relaxed">
              Konstruksjon, laminering, smartglass og kompatibilitet. Forstå hva som skiller
              en standard frontrute fra en ADAS-klar, HUD-kompatibel premium-rute.
            </p>
          </div>
        </section>

        {/* ========== INNHOLD ========== */}
        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <article className="prose prose-slate max-w-none">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hva er en frontrute?</h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                En moderne frontrute er et komplekst laminert glass bestående av to lag herdet glass
                med en PVB-folie (polyvinylbutyral) imellom. Folien fungerer som en limaktig film som
                holder glasset sammen ved knusing, reduserer risikoen for gjennomtrenging og demper støy.
                Tykkelsen på glasslagene varierer fra 2,1 mm til 3,5 mm avhengig av bilens vektklasse
                og sikkerhetskrav.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Tekniske egenskaper</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {FEATURES.map((f) => (
                  <div key={f.title} className="rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      {f.icon}
                      <h3 className="font-semibold text-gray-900">{f.title}</h3>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{f.text}</p>
                  </div>
                ))}
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hvorfor samme modell kan ha flere frontruter</h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                En bilmodell kan ha opptil 15 ulike frontruter. Forskjellene ligger i utstyrsnivå:
                basisrute uten sensorer, regnsensor-rute med klippingsfelt bak speilfoten,
                ADAS-rute med optisk sone for kamera/radar, HUD-rute med spesialbehandlet laminering
                for projeksjon, og kombinasjoner av disse. Feil rute gir feil kalibrering og
                kan deaktivere sikkerhetssystemer.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">OEM vs aftermarket frontrute</h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                OEM-frontruter er produsert på samme fabrikk som originalen, med identisk
                optisk klarhet, lamineringstykkelse og sensor-kompatibilitet. Aftermarket-alternativer
                kan ha variasjoner i optisk kvalitet som påvirker ADAS-kameranøyaktighet, eller
                manglende klippingsfelt for regnsensor. For biler med adaptiv cruisekontroll og
                filskifteassistent anbefales alltid OEM.
              </p>
            </article>
          </div>
        </section>

        {/* ========== CTA ========== */}
        <section className="py-12 sm:py-16 bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Finn riktig frontrute til din bil
            </h2>
            <p className="text-gray-600 mb-6">
              Søk med registreringsnummer så matcher vi eksakt frontrute med riktig utstyr
              og ADAS-kompatibilitet.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/sok">
                <Button size="lg" className="gap-2 bg-autoglass-blue text-white hover:bg-autoglass-blue/90">
                  <Search className="h-4 w-4" />
                  Søk med reg.nr.
                </Button>
              </Link>
              <Link to="/bilglassguide">
                <Button size="lg" variant="outline" className="gap-2">
                  <ArrowRight className="h-4 w-4" />
                  Tilbake til guiden
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
