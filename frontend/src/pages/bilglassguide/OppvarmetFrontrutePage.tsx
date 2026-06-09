import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import { Search, ArrowRight, ChevronRight } from 'lucide-react';

const PAGE_TITLE = 'Oppvarmet frontrute — varmekabler og effekt';
const PAGE_DESC = 'Teknisk innhold om oppvarmede frontruter: varmekabler, effekt, tetthet, koblingsskjema og forskjeller mellom soner og soneløse systemer.';
const CANONICAL = '/bilglassguide/oppvarmet-frontrute';

const SPECS = [
  { label: 'Effekt', value: '350–600 W', desc: 'Total effekt ved 12V. Varierer etter glassflate.' },
  { label: 'Kabelføring', value: '0,02–0,05 mm', desc: 'Tynn kobbertråd lamellert inn i PVB eller trykt på indre glass.' },
  { label: 'Tetthet', value: '2–5 / cm', desc: 'Antall kabler per centimeter. Høyere tetthet = raskere avising.' },
  { label: 'Oppvarmingstid', value: '3–7 min', desc: 'Fra -10°C til full sikt ved maks effekt.' },
];

export default function OppvarmetFrontrutePage() {
  return (
    <>
      <PageMeta title={PAGE_TITLE} description={PAGE_DESC} canonicalPath={CANONICAL} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Article', headline: PAGE_TITLE, description: PAGE_DESC, datePublished: '2025-05-28', dateModified: '2025-05-28', author: { '@type': 'Organization', name: 'Autoglass AS' }, publisher: { '@type': 'Organization', name: 'Autoglass AS', logo: { '@type': 'ImageObject', url: 'https://autoglass.finnbilglass.no/logo.png' } }, mainEntityOfPage: { '@type': 'WebPage', '@id': `https://autoglass.finnbilglass.no${CANONICAL}` } }} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Forsiden', item: 'https://autoglass.finnbilglass.no/' }, { '@type': 'ListItem', position: 2, name: 'Bilglassguide', item: 'https://autoglass.finnbilglass.no/bilglassguide' }, { '@type': 'ListItem', position: 3, name: 'Oppvarmet frontrute', item: `https://autoglass.finnbilglass.no${CANONICAL}` }] }} />

      <div className="min-h-screen bg-white">
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-autoglass-blue text-white">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16 sm:px-6 lg:px-8">
            <nav className="text-sm text-slate-300 mb-6" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white">Forsiden</Link><ChevronRight className="inline h-3 w-3 mx-1" />
              <Link to="/bilglassguide" className="hover:text-white">Bilglassguide</Link><ChevronRight className="inline h-3 w-3 mx-1" />
              <span className="text-white">Oppvarmet frontrute</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Oppvarmet frontrute</h1>
            <p className="text-lg text-slate-200 max-w-2xl leading-relaxed">
              Varmekabler i frontruten er ikke bare en bekvemmelighet — det er sikkerhetsutstyr
              som er påkrevd i flere klimasoner og bilklasser.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <article className="prose prose-slate max-w-none">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">To teknologier: trådkabler vs. bussledere</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <div className="rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 text-sm mb-2">Trådkabel-system</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Tynne kobbertråder (typisk 0,02–0,05 mm) lamineres inn i PVB-folien mellom glasslagene.
                    Synlig som fine striper når solen står lavt. Eldre og rimeligere løsning.
                    Ulempe: optisk forstyrrelse, begrenset levetid ved fuktintrrengning.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 text-sm mb-2">Buss-leder (conductive coating)</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Transparent indium-tin-oksid (ITO) eller sølv-nanotråd-dekk påføres indre glassflate.
                    Usynlig for øyet. Jevn varmefordeling. Brukes på premium-modeller og i kombinasjon
                    med HUD (krever optisk klarhet).
                  </p>
                </div>
              </div>

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

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Soneinndeling og regulering</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                Moderne oppvarmede frontruter er delt inn i <strong>soner</strong> (typisk 3–5 soner)
                som kan reguleres uavhengig. Førerens side prioriteres høyest, da det er den kritiske
                synsvinkelen. Sentrale soner (der kamera og sensorer sitter) unngår overheting.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                <strong>Regnsensor-sonen</strong> (bak speilfoten) krever spesiell oppmerksomhet:
                varmekabler må ikke krysse infrarød-sensorens synsfelt, da dette gir falske
                signaler. OEM-frontruter har forhåndsberegnet kabelrouting som unngår dette.
                Aftermarket-alternativer har ofte generisk routing som interfererer med sensorer.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Når er oppvarmet frontrute påkrevd?</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                I Norge er oppvarmet frontrute ikke lovpålagt, men de fleste bilprodusenter
                spesifiserer det som standard på modeller solgt i Norden. EU-direktiv
                <strong> ECE R46</strong> (indirekte syn) krever at føreren har tilstrekkelig sikt
                — og oppvarmet frontrute anses som et bidrag til dette i kalde klimaer.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                Enkelte premium-modeller (BMW, Mercedes, Volvo) har oppvarmet frontrute
                koblet til fjernstyrt motorvarmer. Ved oppstart er frontruten allerede aviset
                — en funksjon som krever modellspesifikk kabling og kan ikke retrofittes
                med standardfrontrute.
              </p>
            </article>
          </div>
        </section>

        <section className="py-12 sm:py-16 bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Finn oppvarmet frontrute til din bil</h2>
            <p className="text-gray-600 mb-6">Søk med registreringsnummer så matcher vi riktig oppvarmet frontrute med korrekt effekt og soneinndeling.</p>
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
