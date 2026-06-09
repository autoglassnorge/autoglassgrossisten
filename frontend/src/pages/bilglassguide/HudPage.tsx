import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import { Search, ArrowRight, ChevronRight, AlertTriangle } from 'lucide-react';

const PAGE_TITLE = 'Frontrute med HUD — Head-Up Display og spesiallaminering';
const PAGE_DESC = 'Teknisk innhold om frontruter med HUD: refleksjonsgrad, PVB-spesifikasjon, wedge-laminering og kompatibilitet med projeksjonssystemer.';
const CANONICAL = '/bilglassguide/frontrute-hud';

const SPECS = [
  { label: 'Refleksjonsgrad', value: '32–38%', desc: 'Andel av projektert lys som reflekteres tilbake til føreren.' },
  { label: 'Wedge-vinkel', value: '4,5–6,5°', desc: 'Vinklet PVB-lag som eliminerer dobbeltbilde (ghosting).' },
  { label: 'PVB-tykkelse', value: '0,76–1,14 mm', desc: 'Tykkere laminering for å stabilisere wedge-formen.' },
  { label: 'Projeksjonsavstand', value: '2,0–2,5 m', desc: 'Virtuell avstand til den projiserte informasjonen.' },
];

export default function HudPage() {
  return (
    <>
      <PageMeta title={PAGE_TITLE} description={PAGE_DESC} canonicalPath={CANONICAL} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Article', headline: PAGE_TITLE, description: PAGE_DESC, datePublished: '2025-05-28', dateModified: '2025-05-28', author: { '@type': 'Organization', name: 'Autoglass AS' }, publisher: { '@type': 'Organization', name: 'Autoglass AS', logo: { '@type': 'ImageObject', url: 'https://autoglass.finnbilglass.no/logo.png' } }, mainEntityOfPage: { '@type': 'WebPage', '@id': `https://autoglass.finnbilglass.no${CANONICAL}` } }} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Forsiden', item: 'https://autoglass.finnbilglass.no/' }, { '@type': 'ListItem', position: 2, name: 'Bilglassguide', item: 'https://autoglass.finnbilglass.no/bilglassguide' }, { '@type': 'ListItem', position: 3, name: 'Frontrute med HUD', item: `https://autoglass.finnbilglass.no${CANONICAL}` }] }} />

      <div className="min-h-screen bg-white">
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-autoglass-blue text-white">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16 sm:px-6 lg:px-8">
            <nav className="text-sm text-slate-300 mb-6" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white">Forsiden</Link><ChevronRight className="inline h-3 w-3 mx-1" />
              <Link to="/bilglassguide" className="hover:text-white">Bilglassguide</Link><ChevronRight className="inline h-3 w-3 mx-1" />
              <span className="text-white">Frontrute med HUD</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Frontrute med HUD</h1>
            <p className="text-lg text-slate-200 max-w-2xl leading-relaxed">
              Head-Up Display krever en spesiallaminert frontrute med wedge-formet PVB.
              Standardfrontrute gir dobbeltbilde og uleselig projeksjon.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <article className="prose prose-slate max-w-none">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hva er wedge-laminering?</h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                En vanlig frontrute består av to parallelle glasslag med flat PVB-folie imellom.
                Ved HUD-projeksjon reflekteres en del av lyset fra innerste glassflate, mens resten
                går gjennom og reflekteres fra ytterste flatetilbake. Dette gir et dobbeltbilde
                (ghosting) der informasjonen vises to ganger med noen millimeters forskyvning.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                HUD-frontruten løser dette med <strong>wedge-laminering</strong>: PVB-folien er formet
                som en avlang kile, tykkere nederst og tynnere øverst. Vinkelen (typisk 4,5–6,5°)
                er kalkulert slik at den interne refleksjonen og den eksterne refleksjonen samles
                til ett enkelt, skarpt bilde.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Tekniske spesifikasjoner</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {SPECS.map((s) => (
                  <div key={s.label} className="rounded-lg border border-gray-200 p-5">
                    <span className="text-xs text-gray-500">{s.label}</span>
                    <div className="text-lg font-bold text-gray-900">{s.value}</div>
                    <p className="text-sm text-gray-600 mt-1">{s.desc}</p>
                  </div>
                ))}
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Konsekvens av standardfrontrute med HUD</h2>
              <div className="rounded-lg border border-red-200 bg-red-50 p-5 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900 text-sm">Feil glass = ubrukelig HUD</h3>
                    <ul className="text-sm text-red-800 mt-2 space-y-1 list-disc list-inside">
                      <li>Dobbeltbilde (ghosting) — informasjon vises to ganger</li>
                      <li>Redusert kontrast — projeksjon blir uleselig i dagslys</li>
                      <li>Fargeforvrengning — spesielt ved solnedgang og mørke</li>
                      <li>HUD-systemet kan feilkode eller deaktivere seg selv</li>
                      <li>Øyetrekk — føreren fokuserer unødig for å lese displayet</li>
                    </ul>
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Produsenter og merkevarer</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                <strong>AGC</strong> kaller sin teknologi «Wide HUD», <strong>Pilkington</strong> bruker
                «OptiView HUD» og <strong>Saint-Gobain Sekurit</strong> leverer under «Sekurit HUD».
                Samtlige bruker wedge-PVB fra <strong>Eastman (Saflex)</strong> eller <strong>Kuraray (Trosifol)</strong>.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                Wedge-vinkelen er modellspesifikk — ikke universell. BMW bruker typisk 5,2°,
                Mercedes 4,8° og Audi 5,0°. Feil vinkel gir fortsatt ghosting, bare mindre synlig.
                Derfor er OEM eller OEE påkrevd for HUD-kompatible frontruter.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hvordan identifisere HUD-frontrute</h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                HUD-frontruter har ingen synlig merking fra utsiden. Indikasjoner finnes i
                <strong> VIN-dekoderen</strong>, <strong>eurokoden</strong> (utstyrsfelt) eller
                via registreringsnummer-oppslag. I Autoglass AS' database kryssrefereres
                VIN, typeCode og utstyrsnivå mot OEM-spesifikasjoner for å identifisere
                om bilen er utstyrt med HUD — og dermed riktig frontrute.
              </p>
            </article>
          </div>
        </section>

        <section className="py-12 sm:py-16 bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Finn HUD-kompatibel frontrute</h2>
            <p className="text-gray-600 mb-6">Søk med registreringsnummer så identifiserer vi om bilen har HUD — og matcher riktig wedge-laminert frontrute.</p>
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
