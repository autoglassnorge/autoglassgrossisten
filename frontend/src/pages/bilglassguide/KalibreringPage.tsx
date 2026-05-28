import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import { Search, ArrowRight, ChevronRight, AlertTriangle } from 'lucide-react';

/* ========================================================================
   /bilglassguide/kalibrering-etter-ruteskift
   Faktabasert om ADAS-kalibrering. Basert på CSC-data fra Hella Gutmann.
   ======================================================================== */

const PAGE_TITLE = 'Kalibrering etter ruteskift — hvorfor og hvordan';
const PAGE_DESC = 'Alt du trenger å vite om ADAS-kalibrering etter ruteskift: statisk vs dynamisk, CSC-verktøy, target-plate og konsekvenser av å utelate kalibrering.';
const CANONICAL = '/bilglassguide/kalibrering-etter-ruteskift';

const SENSOR_STATS = [
  { type: 'Frontkamera', count: '498', desc: 'modeller krever kalibrering', color: 'bg-blue-500' },
  { type: 'Front-radar', count: '270', desc: 'modeller krever kalibrering', color: 'bg-indigo-500' },
  { type: 'Rear-radar', count: '155', desc: 'modeller krever kalibrering', color: 'bg-violet-500' },
  { type: 'Områdekamera', count: '101', desc: 'modeller krever kalibrering', color: 'bg-purple-500' },
];

const STEPS = [
  { n: '01', title: 'Ruteskift', desc: 'Ny frontrute monteres med OEM-kvalitet og riktig klippingsfelt.' },
  { n: '02', title: 'Kontroll', desc: 'Sjekk at speilfeste, kamerabrakett og regnsensor er korrekt plassert.' },
  { n: '03', title: 'Statisk kalibrering', desc: 'Target-plate plasseres foran bilen. Kameraet kalibreres via diagnoseverktøy.' },
  { n: '04', title: 'Dynamisk kalibrering', desc: 'Kjøring på offentlig vei med tydelige feltmarkeringer. Systemet selvregulerer.' },
  { n: '05', title: 'Verifisering', desc: 'Test av ACC, filskifteassistent og nødbrems. Feilkoder slettes.' },
];

export default function KalibreringPage() {
  return (
    <>
      <PageMeta title={PAGE_TITLE} description={PAGE_DESC} canonicalPath={CANONICAL} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: PAGE_TITLE,
          description: PAGE_DESC,
          datePublished: '2025-05-28',
          dateModified: '2025-05-28',
          author: { '@type': 'Organization', name: 'Autoglass AS' },
          publisher: {
            '@type': 'Organization',
            name: 'Autoglass AS',
            logo: { '@type': 'ImageObject', url: 'https://autoglass-frontend.pages.dev/logo.png' },
          },
          mainEntityOfPage: { '@type': 'WebPage', '@id': `https://autoglass-frontend.pages.dev${CANONICAL}` },
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Forsiden', item: 'https://autoglass-frontend.pages.dev/' },
            { '@type': 'ListItem', position: 2, name: 'Bilglassguide', item: 'https://autoglass-frontend.pages.dev/bilglassguide' },
            { '@type': 'ListItem', position: 3, name: 'Kalibrering etter ruteskift', item: `https://autoglass-frontend.pages.dev${CANONICAL}` },
          ],
        }}
      />

      <div className="min-h-screen bg-white">
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-autoglass-blue text-white">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16 sm:px-6 lg:px-8">
            <nav className="text-sm text-slate-300 mb-6" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white">Forsiden</Link>
              <ChevronRight className="inline h-3 w-3 mx-1" />
              <Link to="/bilglassguide" className="hover:text-white">Bilglassguide</Link>
              <ChevronRight className="inline h-3 w-3 mx-1" />
              <span className="text-white">Kalibrering etter ruteskift</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Kalibrering etter ruteskift</h1>
            <p className="text-lg text-slate-200 max-w-2xl leading-relaxed">
              Et ruteskift uten kalibrering er som å bytte briller uten ny synsprøve.
              Vi har kartlagt over 1 000 kjøretøytyper og deres kalibreringskrav.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <article className="prose prose-slate max-w-none">

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hvorfor kalibrering er påkrevd</h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                Når frontruten byttes, endres kameravinkelen med så lite som 0,1° — tilsvarer
                10 cm feil på 50 meters avstand. Moderne ADAS-systemer (filskifteassistent,
                adaptiv cruisekontroll, nødbrems) er kalibrert til fabrikkverdier og tolererer
                ikke avvik uten feilkoding. I vår database finnes <strong>498 modeller med frontkamera</strong>,
                <strong> 270 med front-radar</strong> og <strong>155 med rear-radar</strong> — alle krever kalibrering
                etter ruteskift ifølge Hella Gutmann CSC v7.8.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Kalibreringskrav per sensortype</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                {SENSOR_STATS.map((s) => (
                  <div key={s.type} className="rounded-lg border border-gray-200 p-4 text-center">
                    <div className={`mx-auto h-2 w-8 rounded-full ${s.color} mb-3`} />
                    <div className="text-2xl font-bold text-gray-900">{s.count}</div>
                    <div className="text-xs font-medium text-gray-700 mt-1">{s.type}</div>
                    <div className="text-[11px] text-gray-500">{s.desc}</div>
                  </div>
                ))}
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">5-trinns kalibreringsprosess</h2>
              <div className="space-y-3 mb-8">
                {STEPS.map((step) => (
                  <div key={step.n} className="flex items-start gap-4 rounded-lg border border-gray-200 p-4">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-autoglass-blue text-white text-xs font-bold">{step.n}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">{step.title}</h3>
                      <p className="text-sm text-gray-600 mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Konsekvenser av å hoppe over kalibrering</h2>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-amber-900 text-sm">Sikkerhetsrisiko og juridisk ansvar</h3>
                    <ul className="text-sm text-amber-800 mt-2 space-y-1 list-disc list-inside">
                      <li>Feilkoder i instrumentpanel — kunden ringer tilbake</li>
                      <li>Deaktivert filskifteassistent — forsikring kan redusere utbetaling ved ulykke</li>
                      <li>Adaptiv cruisekontroll bremser for sent — eller ikke i det hele tatt</li>
                      <li>Verkstedet kan holdes ansvarlig for ulykke pga manglende kalibrering</li>
                      <li>EU-kontroll (PKK) kan avvise kjøretøyet med aktive ADAS-feil</li>
                    </ul>
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Verktøy og leverandører</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                De ledende kalibreringsverktøyene på markedet er <strong>Hella Gutmann CSC</strong>,
                <strong> Bosch ADAS</strong> og <strong>Texa RCCS</strong>. Systemene bruker modellspesifikke target-plater
                med reflektorer og QR-koder som kameraet gjenkjenner. Target-platene varierer i størrelse
                og avstand — fra CSC 1-01 (kompakt, Audi/BMW) til CSC 1-16 (større, Alfa Romeo/Stellantis).
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                Autoglass AS har tilgang til komplett kalibreringsdatabase med krav per merke, modell og årsmodell.
                Vi kan levere glasset — og rådgive om riktig kalibreringsprosedyre for verkstedet.
              </p>

            </article>
          </div>
        </section>

        <section className="py-12 sm:py-16 bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Sjekk kalibreringskrav for din bil</h2>
            <p className="text-gray-600 mb-6">Søk med registreringsnummer så viser vi om bilen din krever ADAS-kalibrering — og hvilken type.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/sok">
                <Button size="lg" className="gap-2 bg-autoglass-blue text-white hover:bg-autoglass-blue/90">
                  <Search className="h-4 w-4" /> Søk med reg.nr.
                </Button>
              </Link>
              <Link to="/bilglassguide">
                <Button size="lg" variant="outline" className="gap-2"><ArrowRight className="h-4 w-4" /> Tilbake til guiden</Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
