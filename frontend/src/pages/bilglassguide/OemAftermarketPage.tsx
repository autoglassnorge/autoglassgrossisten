import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import { Search, ArrowRight, ChevronRight, Factory, AlertTriangle } from 'lucide-react';

/* ========================================================================
   /bilglassguide/oem-vs-aftermarket
   Faktabasert sammenligning. Ingen fluff, bare fakta.
   ======================================================================== */

const PAGE_TITLE = 'OEM vs aftermarket bilglass — hva er forskjellen?';
const PAGE_DESC = 'Faktisk sammenligning av OEM, OEE og aftermarket bilglass: produsenter, sertifisering, kvalitetsforskjeller og når OEM er obligatorisk.';
const CANONICAL = '/bilglassguide/oem-vs-aftermarket';

const PRODUCERS = [
  { name: 'AGC', origin: 'Japan', type: 'OEM · OEE', note: 'Verdens største. Produserer for Toyota, Honda, VW-gruppen.' },
  { name: 'Pilkington', origin: 'Storbritannia', type: 'OEM · OEE', note: 'Pioner innen laminering. Leverer til premium-Europeiske merker.' },
  { name: 'Saint-Gobain Sekurit', origin: 'Frankrike', type: 'OEM · OEE', note: 'Største OEM-leverandør i Europa. Sekurit-brandet er standard på de fleste europeiske biler.' },
  { name: 'Fuyao', origin: 'Kina', type: 'OEE · Aftermarket', note: 'Vokser raskt i Europa. God kvalitet til lavere pris. Etterhvert OEM for kinesiske merker.' },
];

const COMPARISON = [
  { label: 'Optisk klarhet', oem: '±0,1% avvik', aftermarket: '±0,3–0,8% avvik', critical: true },
  { label: 'PVB-tykkelse', oem: '0,76 mm (standard)', aftermarket: '0,38–0,76 mm', critical: false },
  { label: 'E-marks (ECE R43)', oem: 'Alltid', aftermarket: 'Som oftest', critical: false },
  { label: 'ADAS-klippingsfelt', oem: 'Presist definert', aftermarket: 'Mangler ofte', critical: true },
  { label: 'Regnsensor-sone', oem: 'Infrarød-gjennomtrengelig', aftermarket: 'Varierer', critical: true },
  { label: 'Prisnivå', oem: '100% (referanse)', aftermarket: '40–70%', critical: false },
];

export default function OemAftermarketPage() {
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
            { '@type': 'ListItem', position: 3, name: 'OEM vs aftermarket', item: `https://autoglass-frontend.pages.dev${CANONICAL}` },
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
              <span className="text-white">OEM vs aftermarket</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">OEM vs aftermarket bilglass</h1>
            <p className="text-lg text-slate-200 max-w-2xl leading-relaxed">
              Samme fabrikk, samme maskin, samme råvare — men ikke nødvendigvis samme kvalitetskontroll.
              Her er de faktiske forskjellene du må kjenne til.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <article className="prose prose-slate max-w-none">

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Definisjoner — ikke alle «originaler» er like</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="rounded-lg border border-gray-200 p-5">
                  <div className="text-xs font-mono text-gray-400 mb-1">OEM</div>
                  <h3 className="font-bold text-gray-900">Original Equipment Manufacturer</h3>
                  <p className="text-sm text-gray-600 mt-2">
                    Produsert på samme fabrikklinje som bilens første glass. Identisk spesifikasjon,
                    identisk kvalitetskontroll. AGC, Pilkington og Saint-Gobain dominerer.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-5">
                  <div className="text-xs font-mono text-gray-400 mb-1">OEE</div>
                  <h3 className="font-bold text-gray-900">Original Equipment Equivalent</h3>
                  <p className="text-sm text-gray-600 mt-2">
                    Samme produsent som OEM, men produsert etter bilens produksjonsperiode.
                    Kan ha mindre batch-testing. Typisk 10–20% lavere pris enn OEM.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-5">
                  <div className="text-xs font-mono text-gray-400 mb-1">Aftermarket</div>
                  <h3 className="font-bold text-gray-900">Independent Aftermarket</h3>
                  <p className="text-sm text-gray-600 mt-2">
                    Tredjepartsprodusent (ofte Fuyao, XYG, PGW). Egen produksjon med reverse-engineering.
                    Pris 40–70% av OEM. Kvalitet varierer betydelig.
                  </p>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Faktiske kvalitetsforskjeller</h2>
              <div className="overflow-hidden rounded-lg border border-gray-200 mb-8">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Parameter</th>
                      <th className="px-4 py-3 text-left font-semibold text-emerald-700">OEM</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Aftermarket</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {COMPARISON.map((row) => (
                      <tr key={row.label} className={row.critical ? 'bg-red-50/50' : ''}>
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          {row.label}
                          {row.critical && <span className="ml-1 text-red-500">*</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{row.oem}</td>
                        <td className="px-4 py-3 text-gray-700">{row.aftermarket}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2 bg-gray-50 text-[11px] text-gray-500">
                  * Kritisk for ADAS-kompatibilitet. Avvik her gir feilkoding eller deaktiverte systemer.
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Når er OEM obligatorisk?</h2>
              <div className="rounded-lg border border-red-200 bg-red-50 p-5 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900 text-sm">Ikke valgfritt — sikkerhetskrav</h3>
                    <p className="text-sm text-red-800 mt-1">
                      For biler med frontkamera, front-radar eller HUD er OEM-frontrute obligatorisk
                      for å opprettholde fabrikkgaranti og sikkerhetssertifisering (ECE R79, ISO 26262).
                      Forsikringsselskap kan redusere utbetaling ved ulykke dersom ikke-OEM-glass er montert
                      uten verifisert kalibrering.
                    </p>
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Ledende produsenter</h2>
              <div className="space-y-3 mb-8">
                {PRODUCERS.map((p) => (
                  <div key={p.name} className="flex items-start gap-4 rounded-lg border border-gray-200 p-4">
                    <div className="mt-0.5"><Factory className="h-5 w-5 text-autoglass-blue" /></div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">{p.name}</span>
                        <span className="text-xs text-gray-400">{p.origin}</span>
                        <span className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">{p.type}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{p.note}</p>
                    </div>
                  </div>
                ))}
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Sertifisering — hva betyr merkene?</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                <strong>E-marks (ECE R43)</strong> er påkrevd for all glassmontering i Europa.
                Tallet ved E-en indikerer godkjenningsland: E1=Tyskland, E4=Nederland, E11=Storbritannia.
                OEM-glass har alltid E-marks fra produsentlandet. Aftermarket-glass kan ha E-marks fra
                andre land — dette er juridisk gyldig, men kvalitetskontrollen varierer.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                <strong>DOT (ANSI Z26.1)</strong> er det amerikanske kravet.
                <strong> CCC</strong> er det kinesiske. For salg i Norge er kun ECE R43 påkrevd,
                men OEM-produsenter holder seg til alle tre standarder samtidig.
              </p>

            </article>
          </div>
        </section>

        <section className="py-12 sm:py-16 bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Finn OEM-kompatibelt glass til din bil</h2>
            <p className="text-gray-600 mb-6">Søk med registreringsnummer så matcher vi OEM eller OEE-glass med riktig ADAS-kompatibilitet.</p>
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
