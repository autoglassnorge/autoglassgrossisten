import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  CarFront, Shield, Eye, Wrench,
  Layers, Factory, Search, ArrowRight, ChevronRight,
  Info, CircleCheck, AlertTriangle
} from 'lucide-react';

/* ========================================================================
   Bilglassguide — Landing Page
   Teknisk kunnskapsflate for bilglass i Europa.
   Foundation for 50+ fremtidige artikler.
   ======================================================================== */

const CATEGORY_CARDS = [
  {
    slug: 'frontrute',
    title: 'Frontrute',
    desc: 'Konstruksjon, laminering, smartglass og kompatibilitet.',
    icon: <CarFront className="h-6 w-6 text-autoglass-blue" />,
  },
  {
    slug: 'adas-sensorer',
    title: 'ADAS og sensorer',
    desc: 'Kamera, radar, filskifteassistent og regnsensorer.',
    icon: <Shield className="h-6 w-6 text-autoglass-blue" />,
  },
  {
    slug: 'hud-oppvarming',
    title: 'HUD og oppvarming',
    desc: 'Head-up display, varmekabler og akustiske ruter.',
    icon: <Eye className="h-6 w-6 text-autoglass-blue" />,
  },
  {
    slug: 'kalibrering',
    title: 'Kalibrering',
    desc: 'Hvorfor og hvordan ADAS kalibreres etter ruteskift.',
    icon: <Wrench className="h-6 w-6 text-autoglass-blue" />,
  },
  {
    slug: 'oem-vs-aftermarket',
    title: 'OEM vs aftermarket',
    desc: 'Forskjellen på original, OEM og kvalitetsaftermarket.',
    icon: <Layers className="h-6 w-6 text-autoglass-blue" />,
  },
  {
    slug: 'produsenter',
    title: 'Bilglassprodusenter',
    desc: 'AGC, Pilkington, Saint-Gobain, Fuyao og andre.',
    icon: <Factory className="h-6 w-6 text-autoglass-blue" />,
  },
  {
    slug: 'variantmatching',
    title: 'Variantmatching',
    desc: 'Hvorfor samme modell kan ha flere frontruter.',
    icon: <Search className="h-6 w-6 text-autoglass-blue" />,
  },
];

const POPULAR_TOPICS = [
  { slug: 'frontrute-adas-kamera', title: 'Frontrute med ADAS-kamera' },
  { slug: 'frontrute-hud', title: 'Frontrute med HUD' },
  { slug: 'oppvarmet-frontrute', title: 'Oppvarmet frontrute' },
  { slug: 'kalibrering-etter-ruteskift', title: 'Kalibrering etter ruteskift' },
  { slug: 'oem-vs-aftermarket', title: 'OEM vs aftermarket bilglass' },
  { slug: 'identifisere-riktig-bilglass', title: 'Hvordan identifisere riktig bilglass' },
  { slug: 'flere-frontruter-samme-modell', title: 'Hvorfor samme modell kan ha flere frontruter' },
  { slug: 'akustisk-bilglass', title: 'Akustisk bilglass' },
];

const MANUFACTURERS = [
  {
    name: 'AGC',
    desc: 'Verdens største bilglassprodusent. Japansk teknologileder med fabrikker i Europa.',
    origin: 'Japan / Europa',
  },
  {
    name: 'Pilkington',
    desc: 'Britiske Pilkington er pioner innen laminert bilglass og leverer OEM til premium-merker.',
    origin: 'Storbritannia',
  },
  {
    name: 'Saint-Gobain Sekurit',
    desc: 'Fransk konsern som produserer Sekurit-glass for de fleste europeiske bilmerker.',
    origin: 'Frankrike',
  },
  {
    name: 'Fuyao',
    desc: 'Kinesisk produsent som vokser raskt i Europa med konkurransedyktig kvalitet og pris.',
    origin: 'Kina / Europa',
  },
];

const FAQS = [
  {
    q: 'Hvorfor er ikke alle frontruter like?',
    a: 'Samme bilmodell kan ha flere frontruter med ulikt utstyr — ADAS-kamera, HUD-projektor, regnsensor, oppvarming eller akustisk laminering. Feil rute gir feil kalibrering og svekket sikkerhet.',
  },
  {
    q: 'Må ADAS kalibreres etter ruteskift?',
    a: 'Ja. Kamera og radar som sitter i frontruten må kalibreres på nytt for å sikre at filskiftevarsel, nødbrems og adaptiv cruisekontroll fungerer korrekt.',
  },
  {
    q: 'Hva er forskjellen på OEM og aftermarket?',
    a: 'OEM er identisk med originalen — samme produsent, samme kvalitet, samme sertifisering. Aftermarket kan variere i optisk kvalitet, lamineringstykkelse og sensor-kompatibilitet.',
  },
];

export default function BilglassguidePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ========== HERO ========== */}
      <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-autoglass-blue text-white">
        <div className="absolute inset-0 opacity-10 bg-[url('/logo.png')] bg-no-repeat bg-right bg-contain" />
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:py-24 sm:px-6 lg:px-8">
          <nav className="text-sm text-slate-300 mb-6">
            <Link to="/" className="hover:text-white">Forsiden</Link>
            <ChevronRight className="inline h-3 w-3 mx-1" />
            <span className="text-white">Bilglassguide</span>
          </nav>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Bilglassguide
          </h1>
          <p className="text-lg sm:text-xl text-slate-200 max-w-2xl mb-8 leading-relaxed">
            Teknisk kunnskap om frontrute, ADAS, sensorer, kalibrering og
            produsenter — for deg som skal finne riktig glass til riktig bil.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/sok">
              <Button size="lg" className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
                <Search className="h-4 w-4" />
                Søk med reg.nr.
              </Button>
            </Link>
            <a href="#kategorier">
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 gap-2">
                Utforsk temaer
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ========== KATEGORIER ========== */}
      <section id="kategorier" className="py-12 sm:py-20 bg-gray-50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
            Velg tema
          </h2>
          <p className="text-gray-600 mb-8 max-w-xl">
            Bilglass er teknisk komplisert. Velg det du vil lære mer om, eller søk direkte med registreringsnummer.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CATEGORY_CARDS.map((cat) => (
              <Card
                key={cat.slug}
                className="group cursor-pointer hover:shadow-md transition-shadow border border-gray-200"
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-2 rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors">
                      {cat.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm sm:text-base group-hover:text-autoglass-blue transition-colors">
                        {cat.title}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                        {cat.desc}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ========== POPULÆRE TEMAER ========== */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
            Populære temaer
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {POPULAR_TOPICS.map((topic) => (
              <div
                key={topic.slug}
                className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 hover:border-autoglass-blue hover:bg-blue-50/50 cursor-pointer transition-colors"
              >
                <CircleCheck className="h-5 w-5 text-autoglass-blue flex-shrink-0" />
                <span className="text-sm sm:text-base font-medium text-gray-800">
                  {topic.title}
                </span>
                <ArrowRight className="h-4 w-4 text-gray-400 ml-auto flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== HVORFOR TEKNISK KOMPLISERT ========== */}
      <section className="py-12 sm:py-16 bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
              Hvorfor riktig bilglass er teknisk komplisert
            </h2>
            <p className="text-gray-600 mb-6 leading-relaxed">
              Moderne frontruter er ikke lenger bare en glassplate. De er integrerte
              komponenter i bilens sikkerhetssystemer. Samme modell kan ha opptil
              15 ulike frontruter avhengig av utstyrsnivå, produksjonsår og markedsregion.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
            {[
              { label: 'ADAS-kamera', desc: 'Montert i frontruten. Krevende optisk klarhet.' },
              { label: 'Regnsensor', desc: 'Infrarød sensor bak speilfoten. Krever riktig glass.' },
              { label: 'HUD-projektor', desc: 'Head-up display. Spesialbehandlet laminering.' },
              { label: 'Oppvarming', desc: 'Varmekabler i glasset. Forskjellig effekt og tetthet.' },
            ].map((item) => (
              <div key={item.label} className="bg-white rounded-lg border border-gray-200 p-4">
                <AlertTriangle className="h-5 w-5 text-amber-500 mb-2" />
                <h4 className="font-semibold text-gray-900 text-sm">{item.label}</h4>
                <p className="text-sm text-gray-500 mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== PRODUSENTER ========== */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
            Ledende bilglassprodusenter
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MANUFACTURERS.map((m) => (
              <Card key={m.name} className="border border-gray-200">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <Factory className="h-5 w-5 text-autoglass-blue" />
                    <h3 className="font-bold text-gray-900">{m.name}</h3>
                    <span className="text-xs text-gray-400 ml-auto">{m.origin}</span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{m.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FAQ ========== */}
      <section className="py-12 sm:py-16 bg-gray-50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
            Ofte stilte spørsmål
          </h2>
          <div className="space-y-4">
            {FAQS.map((faq, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 text-sm sm:text-base flex items-start gap-2">
                  <Info className="h-5 w-5 text-autoglass-blue flex-shrink-0 mt-0.5" />
                  {faq.q}
                </h3>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed pl-7">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== BOTTOM CTA ========== */}
      <section className="py-16 sm:py-24 bg-gradient-to-br from-autoglass-blue to-slate-900 text-white">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-2xl sm:text-4xl font-bold mb-4">
            Klar til å finne riktig bilglass?
          </h2>
          <p className="text-lg text-slate-200 mb-8 max-w-xl mx-auto leading-relaxed">
            Søk med registreringsnummer eller VIN, så finner vi eksakt glass som
            passer din bil — med riktig ADAS, sensorer og kalibrering.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/sok">
              <Button size="lg" className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
                <Search className="h-4 w-4" />
                Søk med reg.nr.
              </Button>
            </Link>
            <Link to="/katalog">
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10">
                Bla i katalogen
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
