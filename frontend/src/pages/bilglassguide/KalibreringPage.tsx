import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import { Search, ArrowRight, ChevronRight, AlertTriangle, CheckCircle2, Wrench } from 'lucide-react';

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

const CALIBRATION_TOOLS = [
  {
    name: 'Hella Gutmann Mega Macs PC / CSC',
    type: 'Diagnose + ADAS-kalibrering',
    origin: 'Tyskland',
    coverage: '45+ bilmerker, 1 000+ modeller',
    targetPlates: 'CSC 1-01 til CSC 1-32 (modellspesifikke)',
    pros: [
      'Største ADAS-database på markedet (CSC v7.8+)',
      'Target-plater for nesten alle europeiske og asiatiske merker',
      'Integrert diagnoseverktøy — ikke separat PC nødvendig',
      'Oppdateres månedlig med nye modeller',
      'Godkjent av VW-gruppen, BMW, Mercedes, Stellantis',
    ],
    cons: [
      'Høy innkjøpspris (€15 000–25 000 for komplett pakke)',
      'Target-plater må kjøpes separat per modellserie',
      'Krever opplæring for korrekt plassering',
    ],
    recommended: true,
    note: 'Bransjeleder i Europa. Autoglass AS anbefaler Mega Macs PC med CSC-pakke for verksteder som skal dekke bredt modellutvalg.',
  },
  {
    name: 'Bosch DAS 3000 / ADAS Kalibrering',
    type: 'ADAS-kalibrering (statisk + dynamisk)',
    origin: 'Tyskland',
    coverage: '30+ bilmerker, 600+ modeller',
    targetPlates: 'Bosch-modulært system med justerbare rammer',
    pros: [
      'Modulært ramme-system — færre fysiske plater nødvendig',
      'Meget presis laserbasert justering',
      'Integreres med Bosch ESi[tronic] diagnose',
      'Godkjent av tyske bilprodusenter som "first choice"',
    ],
    cons: [
      'Dyrere enn Hella Gutmann (€20 000–35 000)',
      'Smalere modelldekning enn CSC',
      'Krever Bosch-diagnose for full funksjonalitet',
    ],
    recommended: false,
    note: 'Beste presisjon, men høyere kostnad. Ideelt for spesialiserte verksteder med fokus på tysk premium.',
  },
  {
    name: 'Texa RCCS 3 (Radar + Camera Calibration System)',
    type: 'ADAS-kalibrering',
    origin: 'Italia',
    coverage: '25+ bilmerker, 400+ modeller',
    targetPlates: 'Texa-modulære target-boards',
    pros: [
      'Komplett pakke til konkurransedyktig pris (€12 000–18 000)',
      'God dekning av italienske og franske merker',
      'Integrert med Texa IDC5 diagnose',
      'Bærbart system — raskt å sette opp',
    ],
    cons: [
      'Mindre dekning av asiatiske merker',
      'Færre target-plater tilgjengelig enn CSC',
      'Oppdateringsfrekvens lavere enn Hella Gutmann',
    ],
    recommended: false,
    note: 'Godt valg for verksteder med fokus på Stellantis-gruppen (Peugeot, Citroën, Fiat, Alfa Romeo).',
  },
  {
    name: 'Launch X-431 ADAS',
    type: 'ADAS-kalibrering',
    origin: 'Kina',
    coverage: '40+ bilmerker, 800+ modeller',
    targetPlates: 'Launch-modulære foldbare plater',
    pros: [
      'Lavest pris i segmentet (€6 000–10 000)',
      'Stor modelldekning inkludert kinesiske merker',
      'Foldbare target-plater — sparer lagerplass',
      'Integrert med Launch X-431 diagnose',
    ],
    cons: [
      'Lavere presisjon enn europeiske konkurrenter',
      'Dokumentasjon og support kan variere',
      'Mindre anerkjent av europeiske bilprodusenter',
    ],
    recommended: false,
    note: 'Budsjettvalg for mindre verksteder. Tilstrekkelig for eldre modeller, men ikke anbefalt for nyeste ADAS-generasjon.',
  },
  {
    name: 'Autel MaxiSYS ADAS',
    type: 'ADAS-kalibrering',
    origin: 'USA / Kina',
    coverage: '35+ bilmerker, 700+ modeller',
    targetPlates: 'Autel-modulære plater og rammer',
    pros: [
      'God balanse mellom pris og dekning (€8 000–14 000)',
      'Oppdateres regelmessig',
      'Integrert med Autel MaxiSYS diagnose',
      'God support på engelsk',
    ],
    cons: [
      'Presisjon litt under Bosch og Hella Gutmann',
      'Mindre utbredt i Skandinavia',
    ],
    recommended: false,
    note: 'Solid midt-i-segmentet valg. God for verksteder som allerede bruker Autel-diagnose.',
  },
];

const TARGET_PLATE_INFO = [
  { code: 'CSC 1-01', size: '500 × 400 mm', use: 'Kompakt, Audi/BMW/Mini', brands: 'Audi, BMW, Mini' },
  { code: 'CSC 1-04', size: '1 000 × 300 mm', use: 'Langsmal, Mercedes/VW', brands: 'Mercedes, VW, Skoda' },
  { code: 'CSC 1-08', size: '600 × 600 mm', use: 'Standard, Toyota/Honda', brands: 'Toyota, Honda, Lexus' },
  { code: 'CSC 1-12', size: '800 × 600 mm', use: 'Stor SUV/pickup', brands: 'Ford, Volvo, Land Rover' },
  { code: 'CSC 1-16', size: '1 200 × 800 mm', use: 'Stellantis-gruppen', brands: 'Peugeot, Citroën, Alfa Romeo, Jeep' },
  { code: 'CSC 1-20', size: '1 000 × 500 mm', use: 'Nye Hyundai/Kia', brands: 'Hyundai, Kia, Genesis' },
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

              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Wrench className="h-5 w-5 text-autoglass-blue" />
                Kalibreringsverktøy — komplett oversikt
              </h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                Markedet for ADAS-kalibreringsverktøy er dominert av fem aktører.
                Autoglass AS anbefaler <strong>Hella Gutmann Mega Macs PC med CSC-pakke</strong> som
                primært verktøy for europeiske verksteder — det har størst modelldekning,
                hyppigste oppdateringer og er godkjent av flest bilprodusenter.
              </p>

              <div className="space-y-6 mb-10">
                {CALIBRATION_TOOLS.map((tool) => (
                  <div key={tool.name} className={`rounded-lg border p-5 ${tool.recommended ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{tool.name}</span>
                          {tool.recommended && (
                            <span className="inline-flex items-center rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                              ANBEFALT
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{tool.type} · {tool.origin}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 mb-3">
                      <div><span className="text-gray-400">Dekning:</span> {tool.coverage}</div>
                      <div><span className="text-gray-400">Target-plater:</span> {tool.targetPlates}</div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                      <div>
                        <div className="text-xs font-medium text-emerald-700 mb-1 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Fordeler
                        </div>
                        <ul className="text-xs text-gray-600 space-y-0.5 list-disc list-inside">
                          {tool.pros.map((p) => <li key={p}>{p}</li>)}
                        </ul>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-red-600 mb-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Ulemper
                        </div>
                        <ul className="text-xs text-gray-600 space-y-0.5 list-disc list-inside">
                          {tool.cons.map((c) => <li key={c}>{c}</li>)}
                        </ul>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 italic">{tool.note}</p>
                  </div>
                ))}
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hella Gutmann target-plater — CSC-serien</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                Hella Gutmanns CSC (Camera & Sensor Calibration) system bruker modellspesifikke
                target-plater med reflektorer, QR-koder og svart-hvitt mønstre som kameraet gjenkjenner.
                Platene varierer i størrelse, avstand fra bil og monteringsvinkel. Feil plate gir feil kalibrering.
              </p>
              <div className="overflow-hidden rounded-lg border border-gray-200 mb-8">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700">Plate</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700">Størrelse</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700">Bruksområde</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700">Merker</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {TARGET_PLATE_INFO.map((t) => (
                      <tr key={t.code}>
                        <td className="px-3 py-3 font-mono font-bold text-gray-900">{t.code}</td>
                        <td className="px-3 py-3 text-gray-600">{t.size}</td>
                        <td className="px-3 py-3 text-gray-600">{t.use}</td>
                        <td className="px-3 py-3 text-gray-500 text-xs">{t.brands}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Autoglass AS' anbefaling</h2>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 mb-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-blue-900 text-sm">For verksteder i Skandinavia</h3>
                    <p className="text-sm text-blue-800 mt-2">
                      <strong>Hella Gutmann Mega Macs PC med CSC-pakke</strong> er det tryggeste valget.
                      Det gir størst modelldekning for europeiske biler (som utgjør 85%+ av det norske markedet),
                      hyppige oppdateringer og godkjennelse fra VW-gruppen, BMW, Mercedes og Stellantis.
                    </p>
                    <p className="text-sm text-blue-800 mt-2">
                      For verksteder med spesialisering på tysk premium: vurder <strong>Bosch DAS 3000</strong>{' '}
                      som supplement for maksimal presisjon på Mercedes og BMW.
                    </p>
                    <p className="text-sm text-blue-800 mt-2">
                      For mindre verksteder med begrenset budsjett: <strong>Texa RCCS 3</strong> gir tilstrekkelig
                      dekning for Stellantis og eldre modeller til en lavere innkjøpspris.
                    </p>
                  </div>
                </div>
              </div>

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
