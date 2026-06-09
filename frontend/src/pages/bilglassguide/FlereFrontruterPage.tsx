import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import { Search, ArrowRight, ChevronRight, AlertTriangle } from 'lucide-react';

const PAGE_TITLE = 'Hvorfor samme modell kan ha flere frontruter — variantlogikk';
const PAGE_DESC = 'Forstå hvorfor samme bilmodell kan ha opptil 15 ulike frontruter. Utstyrsnivåer, produksjonsår, markedsregion og fabrikkvariasjoner forklart med data.';
const CANONICAL = '/bilglassguide/flere-frontruter-samme-modell';

const VARIANTS = [
  { name: 'Basis', adas: false, rain: false, heated: false, hud: false, acoustic: false, desc: 'Ingen sensorer. Kun basislaminering. Laveste pris.' },
  { name: 'Regnsensor', adas: false, rain: true, heated: false, hud: false, acoustic: false, desc: 'Klippingsfelt bak speilfoten for infrarød sensor.' },
  { name: 'ADAS-kamera', adas: true, rain: true, heated: false, hud: false, acoustic: false, desc: 'Optisk sone for frontkamera. Krever kalibrering.' },
  { name: 'ADAS + varme', adas: true, rain: true, heated: true, hud: false, acoustic: false, desc: 'Kombinasjon av kamera og oppvarming. Kabelrouting krever presisjon.' },
  { name: 'HUD', adas: true, rain: true, heated: false, hud: true, acoustic: false, desc: 'Wedge-laminering for projeksjon. Kan kombineres med ADAS.' },
  { name: 'Premium', adas: true, rain: true, heated: true, hud: true, acoustic: true, desc: 'Full utstyrspakke. Alle funksjoner aktivert. Høyeste pris.' },
];

export default function FlereFrontruterPage() {
  return (
    <>
      <PageMeta title={PAGE_TITLE} description={PAGE_DESC} canonicalPath={CANONICAL} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Article', headline: PAGE_TITLE, description: PAGE_DESC, datePublished: '2025-05-28', dateModified: '2025-05-28', author: { '@type': 'Organization', name: 'Autoglass AS' }, publisher: { '@type': 'Organization', name: 'Autoglass AS', logo: { '@type': 'ImageObject', url: 'https://autoglass.finnbilglass.no/logo.png' } }, mainEntityOfPage: { '@type': 'WebPage', '@id': `https://autoglass.finnbilglass.no${CANONICAL}` } }} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Forsiden', item: 'https://autoglass.finnbilglass.no/' }, { '@type': 'ListItem', position: 2, name: 'Bilglassguide', item: 'https://autoglass.finnbilglass.no/bilglassguide' }, { '@type': 'ListItem', position: 3, name: 'Hvorfor samme modell kan ha flere frontruter', item: `https://autoglass.finnbilglass.no${CANONICAL}` }] }} />

      <div className="min-h-screen bg-white">
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-autoglass-blue text-white">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16 sm:px-6 lg:px-8">
            <nav className="text-sm text-slate-300 mb-6" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white">Forsiden</Link><ChevronRight className="inline h-3 w-3 mx-1" />
              <Link to="/bilglassguide" className="hover:text-white">Bilglassguide</Link><ChevronRight className="inline h-3 w-3 mx-1" />
              <span className="text-white">Flere frontruter samme modell</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Hvorfor samme modell kan ha flere frontruter</h1>
            <p className="text-lg text-slate-200 max-w-2xl leading-relaxed">
              Det er ikke en feil — det er design. Samme bilmodell kan ha opptil 15 ulike frontruter.
              Her er de faktiske årsakene, forklart med data fra vår katalog på 27 000+ varianter.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <article className="prose prose-slate max-w-none">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">6 utstyrsnivåer — fra basis til premium</h2>
              <div className="space-y-3 mb-8">
                {VARIANTS.map((v) => (
                  <div key={v.name} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <h3 className="font-bold text-gray-900">{v.name}</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {v.adas && <span className="inline-flex rounded bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">ADAS</span>}
                        {v.rain && <span className="inline-flex rounded bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">Regnsensor</span>}
                        {v.heated && <span className="inline-flex rounded bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">Varme</span>}
                        {v.hud && <span className="inline-flex rounded bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">HUD</span>}
                        {v.acoustic && <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">Akustisk</span>}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">{v.desc}</p>
                  </div>
                ))}
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Ytterligere variasjonskilder</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <div className="rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 text-sm mb-2">Produksjonsår og facelift</h3>
                  <p className="text-sm text-gray-600">
                    Ved facelift endres ofte frontrutens kurvature, monteringspunkter og utstyrsintegrasjon.
                    En BMW 3-serie F30 (2012–2019) har 3 ulike frontruter avhengig av produksjonsår og
                    utstyrsnivå. Vår typeCode-mapping tar høyde for dette.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 text-sm mb-2">Markedsregion</h3>
                  <p className="text-sm text-gray-600">
                    Nordamerikanske modeller har ofte annen laminering (DOT-godkjenning) og kan
                    mangle ADAS som er standard i Europa. Asiatiske markeder har ofte annen
                    fargetone (grønnere glass) pga. solintensitet.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 text-sm mb-2">Fabrikk og monteringssted</h3>
                  <p className="text-sm text-gray-600">
                    Biler produsert på ulike fabrikker (f.eks. BMW Spartanburg vs. München)
                    kan ha ulik frontrute-leverandør selv for samme modell. Dette vises
                    i VIN-posisjon 11 (fabrikkkode).
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 text-sm mb-2">Retrofit og ettermontering</h3>
                  <p className="text-sm text-gray-600">
                    Enkelte utstyrspakker kan ettermonteres (f.eks. regnsensor) — men da kreves
                    riktig frontrute med klippingsfelt. Å ettermontere ADAS-kamera uten riktig
                    frontrute gir permanent feilkode.
                  </p>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hvordan Autoglass AS håndterer variantmatching</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                Vår matchingmotor bruker en <strong>4-lags hierarki</strong>:
              </p>
              <ol className="text-gray-600 mb-6 list-decimal list-inside space-y-1">
                <li><strong>Layer 0 (kType):</strong> Direkte mapping fra kType til eurokode via TecDoc. Høyest treffsikkerhet.</li>
                <li><strong>Layer 1 (Brand + Model + Year):</strong> D1 ground_truth-tabell med verifiserte mappings.</li>
                <li><strong>Layer 2 (Brand + Year):</strong> Videre søk dersom modell er ukjent.</li>
                <li><strong>Layer 3 (Brand only):</strong> Fallback med scoring basert på utstyr og typeCode.</li>
              </ol>
              <p className="text-gray-600 leading-relaxed mb-6">
                Hvert lag gir en match-score (0–100%). Kunder ser scoren på hvert produkt,
                og kan filtrere etter utstyr (ADAS, varme, regnsensor) for å finne eksakt match.
              </p>

              <div className="rounded-lg border border-red-200 bg-red-50 p-5 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900 text-sm">Advarsel: Feil frontrute = feilkalibrering</h3>
                    <p className="text-sm text-red-800 mt-1">
                      Å montere en basisfrontrute på en bil med ADAS-kamera gir ikke bare
                      feilkode — det kan deaktivere filskifteassistent, nødbrems og adaptiv cruisekontroll.
                      Dette er en sikkerhetsrisiko, ikke bare en teknisk ulempe.
                    </p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="py-12 sm:py-16 bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Finn riktig variant for din bil</h2>
            <p className="text-gray-600 mb-6">Søk med registreringsnummer så matcher vi eksakt frontrutevariant basert på utstyrsnivå og produksjonsår.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/sok"><Button size="lg" className="gap-2 bg-autoglass-blue text-white hover:bg-autoglass-blue/90"><Search className="h-4 w-4" /> Søk med reg.nr.</Button></Link>
              <Link to="/bilglassguide"><Button size="lg" variant="outline" className="gap-2"><ArrowRight className="h-4 w-4" /> Tilbake til guiden</Button></Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
