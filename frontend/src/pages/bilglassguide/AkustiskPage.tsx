import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import { Search, ArrowRight, ChevronRight } from 'lucide-react';

const PAGE_TITLE = 'Akustisk bilglass — dB-dempering og frekvensrespons';
const PAGE_DESC = 'Teknisk innhold om akustisk bilglass: PVB-tykkelse, dB-dempering, frekvensrespons og forskjellene mellom standard og premium laminering.';
const CANONICAL = '/bilglassguide/akustisk-bilglass';

const FREQ_DATA = [
  { freq: '100 Hz', standard: '0 dB', acoustic: '-1,5 dB', note: 'Motordur. Liten forskjell.' },
  { freq: '500 Hz', standard: '0 dB', acoustic: '-3,0 dB', note: 'Dekkstøy. Merkbar reduksjon.' },
  { freq: '1 000 Hz', standard: '0 dB', acoustic: '-4,5 dB', note: 'Vindstøy. Tydelig forbedring.' },
  { freq: '2 000 Hz', standard: '0 dB', acoustic: '-5,5 dB', note: 'Vindturbiner. Sterk reduksjon.' },
  { freq: '4 000 Hz', standard: '0 dB', acoustic: '-4,0 dB', note: 'Høyfrekvent støy. God dempering.' },
];

export default function AkustiskPage() {
  return (
    <>
      <PageMeta title={PAGE_TITLE} description={PAGE_DESC} canonicalPath={CANONICAL} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Article', headline: PAGE_TITLE, description: PAGE_DESC, datePublished: '2025-05-28', dateModified: '2025-05-28', author: { '@type': 'Organization', name: 'Autoglass AS' }, publisher: { '@type': 'Organization', name: 'Autoglass AS', logo: { '@type': 'ImageObject', url: 'https://autoglass-frontend.pages.dev/logo.png' } }, mainEntityOfPage: { '@type': 'WebPage', '@id': `https://autoglass-frontend.pages.dev${CANONICAL}` } }} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Forsiden', item: 'https://autoglass-frontend.pages.dev/' }, { '@type': 'ListItem', position: 2, name: 'Bilglassguide', item: 'https://autoglass-frontend.pages.dev/bilglassguide' }, { '@type': 'ListItem', position: 3, name: 'Akustisk bilglass', item: `https://autoglass-frontend.pages.dev${CANONICAL}` }] }} />

      <div className="min-h-screen bg-white">
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-autoglass-blue text-white">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16 sm:px-6 lg:px-8">
            <nav className="text-sm text-slate-300 mb-6" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white">Forsiden</Link><ChevronRight className="inline h-3 w-3 mx-1" />
              <Link to="/bilglassguide" className="hover:text-white">Bilglassguide</Link><ChevronRight className="inline h-3 w-3 mx-1" />
              <span className="text-white">Akustisk bilglass</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Akustisk bilglass</h1>
            <p className="text-lg text-slate-200 max-w-2xl leading-relaxed">
              Tykkere PVB, spesialfolie og optimalisert laminering demper støy med 3–5 dB.
              For premium-segmentet er akustisk glass standard — ikke valgfritt.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <article className="prose prose-slate max-w-none">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hvordan akustisk laminering fungerer</h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                Standard bilglasslaminerering bruker PVB-folie (polyvinylbutyral) med tykkelse
                0,76 mm. Akustisk glass bruker enten <strong>tykkere PVB (1,14–1,52 mm)</strong> eller
                <strong> spesialfolie med dempende partikler</strong>. Prinsippet er at tykkere,
                mykere mellomlag absorberer vibrasjonsenergi fra luftbåren støy før den
                overføres til kupeen.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                <strong>Kuraray Trosifol Acoustic</strong> og <strong>Eastman Saflex Acoustic</strong> er
                de to dominerende folie-leverandørene. Foliene inneholder mikropartikler som
                øker intern friksjon i PVB-materialet — dette konverterer lydenergi til varme
                (i umerkbar grad) og reduserer transmisjonen gjennom glasset.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Frekvensrespons: standard vs. akustisk</h2>
              <div className="overflow-hidden rounded-lg border border-gray-200 mb-8">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Frekvens</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Standard</th>
                      <th className="px-4 py-3 text-left font-semibold text-emerald-700">Akustisk</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Kilde</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {FREQ_DATA.map((f) => (
                      <tr key={f.freq}>
                        <td className="px-4 py-3 font-mono text-gray-900">{f.freq}</td>
                        <td className="px-4 py-3 text-gray-600">{f.standard}</td>
                        <td className="px-4 py-3 text-emerald-700 font-medium">{f.acoustic}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{f.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">dB-skalaen — hva betyr det i praksis?</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                dB-skalaen er logaritmisk. En reduksjon på <strong>3 dB</strong> tilsvarer halvparten
                av lydeffekten. En reduksjon på <strong>6 dB</strong> tilsvarer en fjerdedel.
                Akustisk glass gir typisk 3–5 dB reduksjon i frekvensområdet 500–4000 Hz —
                det området der vind- og veistøy er mest plagsom.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                I praksis betyr det at en bil med akustisk frontrute oppleves merkbart stillere
                på motorvei. For premium-segmentet (Mercedes S-klasse, BMW 7-serie, Audi A8)
                er akustisk glass standard på alle ruter — ikke bare frontruten.
                Dette kombineres ofte med laminerte sideruter for total kupe-støydemping.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Produsentvariasjoner</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <div className="rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 text-sm mb-2">AGC — «Wide Acoustic»</h3>
                  <p className="text-sm text-gray-600">Bruker Saflex Acoustic PVB. Standard på Toyota Camry, Lexus RX og Honda Accord.</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 text-sm mb-2">Pilkington — «OptiView Acoustic»</h3>
                  <p className="text-sm text-gray-600">Bruker Trosifol Acoustic. Standard på Jaguar, Land Rover og Range Rover.</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 text-sm mb-2">Saint-Gobain — «Sekurit Acoustic»</h3>
                  <p className="text-sm text-gray-600">Egenutviklet PVB-formulering. Standard på Mercedes, Renault og Peugeot.</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 text-sm mb-2">Fuyao — «Silent Shield»</h3>
                  <p className="text-sm text-gray-600">Konkurransedyktig pris, 2–4 dB reduksjon. Ofte OEE-alternativ for eldre premium-modeller.</p>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hvordan identifisere akustisk glass</h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                Akustisk glass er ikke visuelt identifiserbart. Det finnes ingen merking på glasset
                som indikerer akustisk laminering (til forskjell fra E-marks). Identifisering
                krever eurokode-avlesning (suffiks «AC») eller VIN-dekoding.
                I Autoglass AS' database er akustisk flagg satt på 33% av produktene i
                premium-segmentet og 8% i volumsegmentet.
              </p>
            </article>
          </div>
        </section>

        <section className="py-12 sm:py-16 bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Finn akustisk glass til din bil</h2>
            <p className="text-gray-600 mb-6">Søk med registreringsnummer så identifiserer vi om bilen har akustisk laminering — og matcher riktig erstatningsglass.</p>
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
