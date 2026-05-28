import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import { Search, ArrowRight, ChevronRight, Camera, AlertTriangle, Crosshair } from 'lucide-react';

/* ========================================================================
   /bilglassguide/frontrute-adas-kamera
   Faktabasert teknisk innhold om ADAS-kamera i frontruten.
   Basert på ECE R43, ECE R79, IEC 61508 og Hella Gutmann CSC-data.
   ======================================================================== */

const PAGE_TITLE = 'Frontrute med ADAS-kamera — optisk sone og kalibrering';
const PAGE_DESC = 'Alt du trenger å vite om frontruter med ADAS-kamera: optisk sone, monteringsvinkel, ECE R43, kalibrering og konsekvensen av feil glassvalg.';
const CANONICAL = '/bilglassguide/frontrute-adas-kamera';

const SPECS = [
  { label: 'Optisk avvikstoleranse', value: '±0,5°', desc: 'Kamerasonens synsfelt. Overstiges = feilkoding.' },
  { label: 'Lamineringstykkelse', value: '2,1–3,5 mm', desc: 'Standard PVB-laminering. ADAS krever jevn optisk tetthet.' },
  { label: 'Monteringshøyde', value: '1,2–1,6 m', desc: 'Over bakkenivå. Varierer etter bilklasse.' },
  { label: 'Kameravinkel', value: '25–35°', desc: 'Nedovervinkel mot veibanen. Kritisk for objektgjenkjenning.' },
];

const CALIBRATION_METHODS = [
  {
    title: 'Statisk kalibrering',
    desc: 'Bil stilles opp foran target-plate (f.eks. CSC 1-16, CSC 1-01). Kameraet leser referansepunkter og justeres til fabrikkverdier. Krever nivå gulv, presis avstand og riktig dekktrykk.',
    time: '15–45 min',
    tools: 'Target-plate, OBD-verktøy, nivå',
  },
  {
    title: 'Dynamisk kalibrering',
    desc: 'Kjøring på offentlig vei med tydelige kjørefeltmarkeringer. Systemet selvregulerer basert på gjenkjente linjer. Krever minst 10–20 km på godt merket vei.',
    time: '20–40 min kjøring',
    tools: 'OBD-verktøy, tilstrekkelig veistrekning',
  },
];

export default function AdasKameraPage() {
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
            { '@type': 'ListItem', position: 3, name: 'Frontrute med ADAS-kamera', item: `https://autoglass-frontend.pages.dev${CANONICAL}` },
          ],
        }}
      />

      <div className="min-h-screen bg-white">
        {/* HERO */}
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-autoglass-blue text-white">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16 sm:px-6 lg:px-8">
            <nav className="text-sm text-slate-300 mb-6" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white">Forsiden</Link>
              <ChevronRight className="inline h-3 w-3 mx-1" />
              <Link to="/bilglassguide" className="hover:text-white">Bilglassguide</Link>
              <ChevronRight className="inline h-3 w-3 mx-1" />
              <span className="text-white">Frontrute med ADAS-kamera</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Frontrute med ADAS-kamera</h1>
            <p className="text-lg text-slate-200 max-w-2xl leading-relaxed">
              Kamerasonen i frontruten er det mest kritiske optiske elementet i moderne sikkerhetssystemer.
              Feil glass gir feilkoding, deaktivert filskifteassistent og svekket nødbrems.
            </p>
          </div>
        </section>

        {/* INNHOLD */}
        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <article className="prose prose-slate max-w-none">

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hvordan ADAS-kameraet sitter i frontruten</h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                Frontkameraet (ofte kalt «mono-kamera» eller «stereo-kamera») er montert bak frontruten,
                typisk ved bak-speilet. Kameraet ser gjennom et klippingsfelt i PVB-folien — en optisk
                sone med redusert distorsjon og høyere klarhet enn resten av glasset.
                Sammenhengen mellom kameraets monteringsvinkel og frontrutens optiske egenskaper
                er regulert i <strong>ECE R43</strong> (sikkerhetsglass) og <strong>ECE R79</strong> (filskifteassistent).
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                I vår database finnes over <strong>498 kjøretøytyper</strong> med frontkamera som krever
                kalibrering etter ruteskift. Systemene dekker filskifteassistent, adaptiv cruisekontroll,
                nødbrems og trafikkskiltgjenkjenning — alt avhengig av at kameraet ser korrekt gjennom glasset.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Tekniske spesifikasjoner</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {SPECS.map((s) => (
                  <div key={s.label} className="rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Crosshair className="h-4 w-4 text-autoglass-blue" />
                      <span className="text-xs text-gray-500">{s.label}</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900">{s.value}</div>
                    <p className="text-sm text-gray-600 mt-1">{s.desc}</p>
                  </div>
                ))}
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hva skjer med feil glass?</h2>
              <div className="rounded-lg border border-red-200 bg-red-50 p-5 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900 text-sm">Konsekvenser av ikke-OEM-glass</h3>
                    <ul className="text-sm text-red-800 mt-2 space-y-1 list-disc list-inside">
                      <li>Avvik på ±0,5° gir 50 cm feilposisjonering på 50 meters avstand</li>
                      <li>Filskifteassistent kan deaktivere seg selv med feilkode</li>
                      <li>Adaptiv cruisekontroll mistolker avstand til forankjørende</li>
                      <li>Nødbrems kan utløses for sent — eller for tidlig</li>
                      <li>Aftermarket-glass kan mangle klippingsfelt eller ha ujevn laminering</li>
                    </ul>
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Kalibreringsmetoder etter ruteskift</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {CALIBRATION_METHODS.map((m) => (
                  <div key={m.title} className="rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Camera className="h-4 w-4 text-autoglass-blue" />
                      <h3 className="font-semibold text-gray-900 text-sm">{m.title}</h3>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed mb-3">{m.desc}</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[11px] font-mono text-gray-600">⏱ {m.time}</span>
                      <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[11px] font-mono text-gray-600">🛠 {m.tools}</span>
                    </div>
                  </div>
                ))}
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Standarder og regelverk</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                <strong>ECE R43</strong> regulerer sikkerhetsglass for motorvogner — herunder krav til optisk klarhet,
                lysbøyning og styrke. For ADAS-kompatibelt glass stilles det supplerende krav til
                jevnhet i lamineringen i kamerasonen.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                <strong>ECE R79</strong> (filskifteassistent) krever at systemet opprettholder nøyaktighet
                innenfor ±0,5° horisontalt og ±0,3° vertikalt. Dette er umulig å oppnå uten riktig
                frontrute — og uten kalibrering etter montering.
              </p>

            </article>
          </div>
        </section>

        {/* CTA */}
        <section className="py-12 sm:py-16 bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Finn ADAS-kompatibel frontrute til din bil</h2>
            <p className="text-gray-600 mb-6">
              Søk med registreringsnummer så finner vi eksakt frontrute med riktig optisk sone og kalibreringsinformasjon.
            </p>
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
