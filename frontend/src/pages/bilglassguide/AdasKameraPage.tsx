import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  Search,
  ArrowRight,
  ChevronRight,
  Camera,
  AlertTriangle,
  Crosshair,
  Car,
  Eye,
  Shield,
  Gauge,
  Wrench,
} from 'lucide-react';

/* ========================================================================
   /bilglassguide/frontrute-adas-kamera
   Faktabasert teknisk innhold om ADAS-kamera i frontruten.
   Basert på ECE R43, ECE R79, IEC 61508 og Hella Gutmann CSC-data.
   ======================================================================== */

const PAGE_TITLE = 'Frontrute med ADAS-kamera — optisk sone og kalibrering';
const PAGE_DESC = 'Alt du trenger å vite om frontruter med ADAS-kamera: optisk sone, monteringsvinkel, ECE R43, kalibrering og konsekvensen av feil glassvalg.';
const CANONICAL = '/bilglassguide/frontrute-adas-kamera';

const SPECS = [
  { label: 'Optisk avvikstoleranse', value: '±0,5°', desc: 'Kamerasonens synsfelt. Overstiges = feilkoding.', icon: Crosshair },
  { label: 'Lamineringstykkelse', value: '2,1–3,5 mm', desc: 'Standard PVB-laminering. ADAS krever jevn optisk tetthet.', icon: Shield },
  { label: 'Monteringshøyde', value: '1,2–1,6 m', desc: 'Over bakkenivå. Varierer etter bilklasse.', icon: Car },
  { label: 'Kameravinkel', value: '25–35°', desc: 'Nedovervinkel mot veibanen. Kritisk for objektgjenkjenning.', icon: Eye },
];

const CALIBRATION_METHODS = [
  {
    title: 'Statisk kalibrering',
    desc: 'Bil stilles opp foran target-plate (f.eks. CSC 1-16, CSC 1-01). Kameraet leser referansepunkter og justeres til fabrikkverdier. Krever nivå gulv, presis avstand og riktig dekktrykk.',
    time: '15–45 min',
    tools: 'Target-plate, OBD-verktøy, nivå',
    icon: Wrench,
  },
  {
    title: 'Dynamisk kalibrering',
    desc: 'Kjøring på offentlig vei med tydelige kjørefeltmarkeringer. Systemet selvregulerer basert på gjenkjente linjer. Krever minst 10–20 km på godt merket vei.',
    time: '20–40 min kjøring',
    tools: 'OBD-verktøy, tilstrekkelig veistrekning',
    icon: Gauge,
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
          <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16 sm:px-6 lg:px-8">
            <nav className="text-sm text-slate-300 mb-6" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white">Forsiden</Link>
              <ChevronRight className="inline h-3 w-3 mx-1" />
              <Link to="/bilglassguide" className="hover:text-white">Bilglassguide</Link>
              <ChevronRight className="inline h-3 w-3 mx-1" />
              <span className="text-white">Frontrute med ADAS-kamera</span>
            </nav>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
                  Frontrute med ADAS-kamera
                </h1>
                <p className="text-lg text-slate-200 max-w-xl leading-relaxed">
                  Kamerasonen i frontruten er det mest kritiske optiske elementet i moderne sikkerhetssystemer.
                  Feil glass gir feilkoding, deaktivert filskifteassistent og svekket nødbrems.
                </p>
              </div>
              {/* Windshield Camera Diagram */}
              <div className="flex justify-center">
                <div className="relative w-72 h-48 bg-slate-700/40 rounded-2xl border border-slate-600/50 p-4">
                  {/* Windshield outline */}
                  <svg viewBox="0 0 280 180" className="w-full h-full">
                    {/* Car silhouette */}
                    <path d="M40 160 L60 100 Q70 70 140 65 Q210 70 220 100 L240 160 Z" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
                    {/* Windshield */}
                    <path d="M65 100 Q75 75 140 70 Q205 75 215 100 L200 140 Q140 135 80 140 Z" fill="#0ea5e9" fillOpacity="0.15" stroke="#38bdf8" strokeWidth="1.5" />
                    {/* Camera zone — optical clipping area */}
                    <ellipse cx="140" cy="95" rx="28" ry="18" fill="#22c55e" fillOpacity="0.25" stroke="#4ade80" strokeWidth="1.5" strokeDasharray="4 2" />
                    {/* Camera */}
                    <rect x="132" y="82" width="16" height="10" rx="2" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
                    <circle cx="140" cy="87" r="3" fill="#38bdf8" />
                    {/* Viewing angle lines */}
                    <line x1="140" y1="87" x2="95" y2="140" stroke="#fbbf24" strokeWidth="1" strokeDasharray="3 3" />
                    <line x1="140" y1="87" x2="185" y2="140" stroke="#fbbf24" strokeWidth="1" strokeDasharray="3 3" />
                    <text x="140" y="125" textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold">25–35°</text>
                    {/* Labels */}
                    <text x="140" y="55" textAnchor="middle" fill="#94a3b8" fontSize="9">Kamerasonen</text>
                    <text x="140" y="62" textAnchor="middle" fill="#4ade80" fontSize="8">Optisk klippingsfelt</text>
                    <text x="140" y="170" textAnchor="middle" fill="#64748b" fontSize="8">Frontrute med PVB-laminering</text>
                  </svg>
                </div>
              </div>
            </div>
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

              {/* SPECS GRID */}
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Tekniske spesifikasjoner</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {SPECS.map((s) => (
                  <div key={s.label} className="rounded-xl border border-gray-200 bg-gray-50/50 p-5 hover:shadow-sm transition-shadow">
                    <div className="flex items-center gap-2 mb-2">
                      <s.icon className="h-5 w-5 text-autoglass-blue" />
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{s.label}</span>
                    </div>
                    <div className="text-xl font-bold text-gray-900">{s.value}</div>
                    <p className="text-sm text-gray-600 mt-1">{s.desc}</p>
                  </div>
                ))}
              </div>

              {/* ERROR DEVIATION DIAGRAM */}
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hva skjer med feil glass?</h2>
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 mb-6">
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <h3 className="font-semibold text-red-900">Konsekvenser av ikke-OEM-glass</h3>
                </div>

                {/* Visual deviation diagram */}
                <div className="flex flex-col sm:flex-row items-center gap-6 mb-5 bg-white rounded-lg p-4 border border-red-100">
                  <div className="flex-1 w-full">
                    <div className="relative h-32 bg-slate-100 rounded-lg overflow-hidden">
                      {/* Road */}
                      <div className="absolute bottom-0 left-0 right-0 h-16 bg-slate-300" />
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-1 h-12 bg-yellow-400" />
                      <div className="absolute bottom-6 left-1/4 w-1 h-8 bg-yellow-400/50" />
                      <div className="absolute bottom-6 right-1/4 w-1 h-8 bg-yellow-400/50" />
                      {/* Car */}
                      <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
                        <Car className="h-8 w-8 text-slate-700" />
                      </div>
                      {/* Correct view cone */}
                      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
                        <path d="M140 85 L80 140" stroke="#22c55e" strokeWidth="2" strokeDasharray="4 2" fill="none" opacity="0.7" />
                        <path d="M140 85 L200 140" stroke="#22c55e" strokeWidth="2" strokeDasharray="4 2" fill="none" opacity="0.7" />
                        <text x="140" y="78" textAnchor="middle" fill="#22c55e" fontSize="9" fontWeight="bold">Korrekt ±0°</text>
                      </svg>
                    </div>
                    <p className="text-center text-xs text-green-700 mt-2 font-medium">OEM-glass: Kameraet ser rett</p>
                  </div>

                  <ArrowRight className="h-6 w-6 text-red-400 rotate-90 sm:rotate-0 flex-shrink-0" />

                  <div className="flex-1 w-full">
                    <div className="relative h-32 bg-slate-100 rounded-lg overflow-hidden">
                      {/* Road */}
                      <div className="absolute bottom-0 left-0 right-0 h-16 bg-slate-300" />
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-1 h-12 bg-yellow-400" />
                      {/* Car shifted */}
                      <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
                        <Car className="h-8 w-8 text-slate-700" />
                      </div>
                      {/* Incorrect view cone — shifted */}
                      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
                        <path d="M140 85 L70 140" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2" fill="none" opacity="0.7" />
                        <path d="M140 85 L190 140" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2" fill="none" opacity="0.7" />
                        <text x="140" y="78" textAnchor="middle" fill="#ef4444" fontSize="9" fontWeight="bold">Avvik ±0,5°</text>
                        <text x="140" y="102" textAnchor="middle" fill="#ef4444" fontSize="8">50 cm feil på 50 m</text>
                      </svg>
                    </div>
                    <p className="text-center text-xs text-red-700 mt-2 font-medium">Feil glass: Kameraet ser skjevt</p>
                  </div>
                </div>

                <ul className="text-sm text-red-800 space-y-2 list-disc list-inside">
                  <li>Avvik på ±0,5° gir 50 cm feilposisjonering på 50 meters avstand</li>
                  <li>Filskifteassistent kan deaktivere seg selv med feilkode</li>
                  <li>Adaptiv cruisekontroll mistolker avstand til forankjørende</li>
                  <li>Nødbrems kan utløses for sent — eller for tidlig</li>
                  <li>Aftermarket-glass kan mangle klippingsfelt eller ha ujevn laminering</li>
                </ul>
              </div>

              {/* CALIBRATION METHODS */}
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Kalibreringsmetoder etter ruteskift</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {CALIBRATION_METHODS.map((m) => (
                  <div key={m.title} className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-10 w-10 rounded-full bg-autoglass-blue/10 flex items-center justify-center">
                        <m.icon className="h-5 w-5 text-autoglass-blue" />
                      </div>
                      <h3 className="font-semibold text-gray-900">{m.title}</h3>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed mb-4">{m.desc}</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                        ⏱ {m.time}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                        🛠 {m.tools}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Standarder og regelverk</h2>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">ECE R43</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      Regulerer sikkerhetsglass for motorvogner — herunder krav til optisk klarhet,
                      lysbøyning og styrke. For ADAS-kompatibelt glass stilles det supplerende krav til
                      jevnhet i lamineringen i kamerasonen.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">ECE R79</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      Filskifteassistent krever at systemet opprettholder nøyaktighet
                      innenfor ±0,5° horisontalt og ±0,3° vertikalt. Dette er umulig å oppnå uten riktig
                      frontrute — og uten kalibrering etter montering.
                    </p>
                  </div>
                </div>
              </div>

            </article>
          </div>
        </section>

        {/* CTA */}
        <section className="py-12 sm:py-16 bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-autoglass-blue/10 flex items-center justify-center">
                <Camera className="h-7 w-7 text-autoglass-blue" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Finn ADAS-kompatibel frontrute til din bil</h2>
            <p className="text-gray-600 mb-6">
              Søk med registreringsnummer så finner vi eksakt frontrute med riktig optisk sone og kalibreringsinformasjon.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/bla?category=frontrute">
                <Button size="lg" className="gap-2 bg-autoglass-blue text-white hover:bg-autoglass-blue/90">
                  <ArrowRight className="h-4 w-4" /> Bla i frontruter
                </Button>
              </Link>
              <Link to="/sok">
                <Button size="lg" variant="outline" className="gap-2">
                  <Search className="h-4 w-4" /> Søk med reg.nr.
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
