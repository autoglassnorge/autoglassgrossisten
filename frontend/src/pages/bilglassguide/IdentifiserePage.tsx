import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import { Search, ArrowRight, ChevronRight, Barcode, FileSearch, Car } from 'lucide-react';

const PAGE_TITLE = 'Hvordan identifisere riktig bilglass — eurokode, VIN og typeCode';
const PAGE_DESC = 'Lær hvordan du identifiserer riktig bilglass med eurokode, NAGS-kode, VIN-dekoding, typeCode og regnr-oppslag. Faktisk metode brukt av bransjen.';
const CANONICAL = '/bilglassguide/identifisere-riktig-bilglass';

const METHODS = [
  {
    icon: <Car className="h-5 w-5 text-autoglass-blue" />,
    title: 'Registreringsnummer-oppslag',
    desc: 'Den mest pålitelige metoden. SVV Enkeltoppslag gir kjøretøyets merke, modell, årsmodell, typegodkjenning og VIN. Kombinert med vår D1-database på 37 500+ produkter matcher vi eksakt glass med utstyrsnivå.',
    pros: ['Høyest treffsikkerhet', 'Automatisk utstyrsidentifisering', 'Ingen manuell tolking'],
    cons: ['Krever tilgang til SVV-registeret', 'Avregistrerte kjøretøy mangler'],
  },
  {
    icon: <Barcode className="h-5 w-5 text-autoglass-blue" />,
    title: 'Eurokode',
    desc: 'Eurokoden er en 10–15-sifret kode som identifiserer glassets konstruksjon, dimensjoner og utstyr. Første 4 sifre = prefix (type + dimensjon). Resten = utstyrsnivå (GN=grønn, GY=grå, EL=elektrisk, etc.).',
    pros: ['Internasjonal standard', 'Uavhengig av bilmodell', 'Rask identifisering'],
    cons: ['Krever at gammelt glass er intakt for avlesning', 'Kan være slitt uleselig'],
  },
  {
    icon: <FileSearch className="h-5 w-5 text-autoglass-blue" />,
    title: 'VIN-dekoding',
    desc: 'VIN (Vehicle Identification Number) inneholder fabrikkspesifikasjoner inkludert utstyrsnivå. VIN-posisjon 4–8 angir modell, motor og utstyrspakke. Kombinert med vår kType-mapping gir dette eksakt glassvalg.',
    pros: ['Fabrikkpresis', 'Identifiserer alle utstyrsvarianter', 'Fungerer på uregistrerte biler'],
    cons: ['Krever VIN (ikke alltid tilgjengelig)', 'Dekoding er kompleks'],
  },
];

export default function IdentifiserePage() {
  return (
    <>
      <PageMeta title={PAGE_TITLE} description={PAGE_DESC} canonicalPath={CANONICAL} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Article', headline: PAGE_TITLE, description: PAGE_DESC, datePublished: '2025-05-28', dateModified: '2025-05-28', author: { '@type': 'Organization', name: 'Autoglass AS' }, publisher: { '@type': 'Organization', name: 'Autoglass AS', logo: { '@type': 'ImageObject', url: 'https://autoglass-frontend.pages.dev/logo.png' } }, mainEntityOfPage: { '@type': 'WebPage', '@id': `https://autoglass-frontend.pages.dev${CANONICAL}` } }} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Forsiden', item: 'https://autoglass-frontend.pages.dev/' }, { '@type': 'ListItem', position: 2, name: 'Bilglassguide', item: 'https://autoglass-frontend.pages.dev/bilglassguide' }, { '@type': 'ListItem', position: 3, name: 'Hvordan identifisere riktig bilglass', item: `https://autoglass-frontend.pages.dev${CANONICAL}` }] }} />

      <div className="min-h-screen bg-white">
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-autoglass-blue text-white">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16 sm:px-6 lg:px-8">
            <nav className="text-sm text-slate-300 mb-6" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white">Forsiden</Link><ChevronRight className="inline h-3 w-3 mx-1" />
              <Link to="/bilglassguide" className="hover:text-white">Bilglassguide</Link><ChevronRight className="inline h-3 w-3 mx-1" />
              <span className="text-white">Hvordan identifisere riktig bilglass</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Hvordan identifisere riktig bilglass</h1>
            <p className="text-lg text-slate-200 max-w-2xl leading-relaxed">
              Å finne riktig glass er en datadrevet prosess — ikke gjetting.
              Her er de tre metodene bransjen faktisk bruker, rangert etter pålitelighet.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <article className="prose prose-slate max-w-none">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">3 metoder — rangert etter pålitelighet</h2>
              <div className="space-y-6 mb-10">
                {METHODS.map((m, i) => (
                  <div key={m.title} className="rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-autoglass-blue text-white text-xs font-bold">{i + 1}</span>
                      {m.icon}
                      <h3 className="font-bold text-gray-900">{m.title}</h3>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed mb-3">{m.desc}</p>
                    <div className="flex flex-wrap gap-4 text-xs">
                      <div><span className="text-emerald-600 font-medium">✓ Fordeler:</span> {m.pros.join(', ')}</div>
                      <div><span className="text-red-500 font-medium">✗ Begrensninger:</span> {m.cons.join(', ')}</div>
                    </div>
                  </div>
                ))}
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Eurokode — dekoding av kortform</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                Eurokoden er strukturert i prefiks + suffiks. Prefikset (typisk 4 sifre) angir glassets
                type og dimensjon. Suffikset angir utstyr:
              </p>
              <div className="overflow-hidden rounded-lg border border-gray-200 mb-6">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left font-semibold text-gray-700">Kode</th><th className="px-4 py-2 text-left font-semibold text-gray-700">Betydning</th></tr></thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr><td className="px-4 py-2 font-mono text-gray-900">GN</td><td className="px-4 py-2 text-gray-600">Grønn</td></tr>
                    <tr><td className="px-4 py-2 font-mono text-gray-900">GY</td><td className="px-4 py-2 text-gray-600">Grå</td></tr>
                    <tr><td className="px-4 py-2 font-mono text-gray-900">GB</td><td className="px-4 py-2 text-gray-600">Grå/blå</td></tr>
                    <tr><td className="px-4 py-2 font-mono text-gray-900">EL / ELM</td><td className="px-4 py-2 text-gray-600">Elektrisk / oppvarmet</td></tr>
                    <tr><td className="px-4 py-2 font-mono text-gray-900">AC</td><td className="px-4 py-2 text-gray-600">Akustisk</td></tr>
                    <tr><td className="px-4 py-2 font-mono text-gray-900">HU</td><td className="px-4 py-2 text-gray-600">HUD-kompatibel</td></tr>
                    <tr><td className="px-4 py-2 font-mono text-gray-900">AD</td><td className="px-4 py-2 text-gray-600">ADAS-klar (kamera/sonesone)</td></tr>
                    <tr><td className="px-4 py-2 font-mono text-gray-900">RS</td><td className="px-4 py-2 text-gray-600">Regnsensor-klar</td></tr>
                  </tbody>
                </table>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">typeCode — standardisert glassposisjon</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                typeCode er en intern bransjestandard for glassets posisjon og funksjon:
              </p>
              <div className="overflow-hidden rounded-lg border border-gray-200 mb-6">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left font-semibold text-gray-700">Kode</th><th className="px-4 py-2 text-left font-semibold text-gray-700">Betydning</th></tr></thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr><td className="px-4 py-2 font-mono text-gray-900">F</td><td className="px-4 py-2 text-gray-600">Frontrute</td></tr>
                    <tr><td className="px-4 py-2 font-mono text-gray-900">B</td><td className="px-4 py-2 text-gray-600">Bakrute</td></tr>
                    <tr><td className="px-4 py-2 font-mono text-gray-900">DFF</td><td className="px-4 py-2 text-gray-600">Dørrute fremre førerside</td></tr>
                    <tr><td className="px-4 py-2 font-mono text-gray-900">DPF</td><td className="px-4 py-2 text-gray-600">Dørrute fremre passasjerside</td></tr>
                    <tr><td className="px-4 py-2 font-mono text-gray-900">SFB1</td><td className="px-4 py-2 text-gray-600">Siderute bak førerside</td></tr>
                    <tr><td className="px-4 py-2 font-mono text-gray-900">SPB1</td><td className="px-4 py-2 text-gray-600">Siderute bak passasjerside</td></tr>
                    <tr><td className="px-4 py-2 font-mono text-gray-900">DFFV</td><td className="px-4 py-2 text-gray-600">Ventilrute fremre førerside</td></tr>
                  </tbody>
                </table>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hva Autoglass AS gjør annerledes</h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                Vi kombinerer <strong>alle tre metodene</strong> i ett søk: regnr → SVV-oppslag →
                normalisert merke/modell/år → D1 ground_truth (verifiserte mappings) →
                kType fallback → utstyrs-scoring → produktmatch. Resultatet er en prioritert
                liste der eksakt match vises først, fulgt av sannsynlige alternativer med
                match-score. Dette er ikke en katalogsøk — det er en datadrevet matchingmotor.
              </p>
            </article>
          </div>
        </section>

        <section className="py-12 sm:py-16 bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Prøv vår datadrevne matching</h2>
            <p className="text-gray-600 mb-6">Søk med registreringsnummer — vi kombinerer SVV-data, eurokode, typeCode og 37 500+ produkter for å finne eksakt glass.</p>
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
