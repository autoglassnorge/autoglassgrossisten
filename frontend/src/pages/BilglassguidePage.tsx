import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  CarFront, Shield, Eye, Wrench,
  Layers, Factory, Search, ArrowRight, ChevronRight,
  Info, CircleCheck, AlertTriangle
} from 'lucide-react';
import {
  CATEGORY_CARDS,
  POPULAR_TOPICS,
  MANUFACTURERS,
  FAQS,
} from '@/data/bilglassguide/content';

/* ========================================================================
   Bilglassguide — Landing Page V2
   SEO-sterk content-hub med JSON-LD, canonical, link-routing
   og foundation for 50+ artikler.
   ======================================================================== */

const PAGE_TITLE = 'Bilglassguide — teknisk kunnskap om bilglass';
const PAGE_DESC = 'Teknisk kunnskap om frontrute, ADAS, sensorer, kalibrering og produsenter. Finn riktig glass til riktig bil med Autoglass AS.';
const CANONICAL = '/bilglassguide';

const ICON_MAP: Record<string, React.ReactNode> = {
  CarFront: <CarFront className="h-6 w-6 text-autoglass-blue" />,
  Shield: <Shield className="h-6 w-6 text-autoglass-blue" />,
  Eye: <Eye className="h-6 w-6 text-autoglass-blue" />,
  Wrench: <Wrench className="h-6 w-6 text-autoglass-blue" />,
  Layers: <Layers className="h-6 w-6 text-autoglass-blue" />,
  Factory: <Factory className="h-6 w-6 text-autoglass-blue" />,
  Search: <Search className="h-6 w-6 text-autoglass-blue" />,
};

export default function BilglassguidePage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Forsiden', item: 'https://autoglass-frontend.pages.dev/' },
      { '@type': 'ListItem', position: 2, name: 'Bilglassguide', item: 'https://autoglass-frontend.pages.dev/bilglassguide' },
    ],
  };

  return (
    <>
      <PageMeta title={PAGE_TITLE} description={PAGE_DESC} canonicalPath={CANONICAL} />
      <JsonLd data={faqJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />

      <div className="min-h-screen bg-white">
        {/* ========== HERO ========== */}
        <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-autoglass-blue text-white">
          <div className="absolute inset-0 opacity-10 bg-[url('/logo.png')] bg-no-repeat bg-right bg-contain" />
          <div className="relative mx-auto max-w-5xl px-4 py-16 sm:py-24 sm:px-6 lg:px-8">
            <nav className="text-sm text-slate-300 mb-6" aria-label="Breadcrumb">
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
                <Link key={cat.slug} to={`/bilglassguide/${cat.slug}`} className="block group">
                  <Card className="group cursor-pointer hover:shadow-md transition-shadow border border-gray-200 h-full">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 p-2 rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors">
                          {ICON_MAP[cat.iconKey]}
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
                </Link>
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
                <Link
                  key={topic.slug}
                  to={`/bilglassguide/${topic.slug}`}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 hover:border-autoglass-blue hover:bg-blue-50/50 cursor-pointer transition-colors"
                >
                  <CircleCheck className="h-5 w-5 text-autoglass-blue flex-shrink-0" />
                  <span className="text-sm sm:text-base font-medium text-gray-800">
                    {topic.title}
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-400 ml-auto flex-shrink-0" />
                </Link>
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
        <section className="py-12 sm:py-20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                Våre produsenter og partnere
              </h2>
              <p className="text-slate-400 max-w-xl mx-auto">
                Vi forholder oss utelukkende til anerkjente produsenter med dokumentert kvalitet.
                OEM for originalkvalitet. OEE for verdi. PUR for monteringssystemer.
              </p>
            </div>

            {/* Badges legend */}
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              {[
                { label: 'OEM', desc: 'Original Equipment Manufacturer', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
                { label: 'OEE', desc: 'Original Equipment Equivalent', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
                { label: 'PUR', desc: 'Polyurethane / Lim', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
              ].map((b) => (
                <div key={b.label} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${b.color}`}>
                  <span className="font-bold">{b.label}</span>
                  <span className="opacity-70">{b.desc}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {MANUFACTURERS.map((m) => (
                <div
                  key={m.name}
                  className="group relative rounded-xl border border-slate-700 bg-slate-800/50 backdrop-blur-sm p-5 hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    {/* Brand logo */}
                    <div className="flex h-14 w-28 flex-shrink-0 items-center justify-center rounded-lg bg-white p-2 shadow-lg">
                      <img
                        src={m.logoPath}
                        alt={`${m.name} logo`}
                        className="max-h-full max-w-full object-contain"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-white text-sm">{m.name}</h3>
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          m.badge === 'OEM' ? 'bg-emerald-500/20 text-emerald-300' :
                          m.badge === 'OEE' ? 'bg-blue-500/20 text-blue-300' :
                          'bg-amber-500/20 text-amber-300'
                        }`}>
                          {m.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mb-1">{m.origin}</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{m.desc}</p>
                    </div>
                  </div>
                </div>
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
    </>
  );
}
