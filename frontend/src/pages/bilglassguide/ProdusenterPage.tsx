import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import { Search, ArrowRight, ChevronRight, Factory, Globe, Award } from 'lucide-react';

/* ========================================================================
   /bilglassguide/produsenter
   Komplett oversikt over bilglassprodusenter — OEM, OEE, aftermarket,
   PVB-folie og klebemiddelleverandører.
   ======================================================================== */

const PAGE_TITLE = 'Bilglassprodusenter — komplett guide fra AGC til XYG';
const PAGE_DESC = 'Oversikt over verdens ledende bilglassprodusenter: AGC, Saint-Gobain Sekurit, Pilkington, Fuyao, Guardian, NordGlass, Sika og flere. OEM, OEE og aftermarket forklart.';
const CANONICAL = '/bilglassguide/produsenter';

const OEM_GIANTS = [
  {
    name: 'AGC Automotive',
    origin: 'Japan / Europa',
    plants: '130+ fabrikker worldwide',
    share: '~28% globalt OEM-marked',
    brands: 'AGC, Wide, Wide Acoustic, Wide HUD',
    oemFor: 'Toyota, Honda, VW-gruppen, BMW, Mercedes, Renault, Nissan',
    note: 'Verdens største bilglassprodusent etter omsetning. Eier flere europeiske fabrikker inkludert tidligere Glaverbel-anlegg.',
  },
  {
    name: 'Saint-Gobain Sekurit',
    origin: 'Frankrike / Globalt',
    plants: '100+ produksjonsanlegg',
    share: '~25% globalt OEM-marked',
    brands: 'Sekurit, Sekurit Acoustic, Sekurit HUD, Sekurit Solar',
    oemFor: 'Mercedes, Renault, Peugeot, Citroën, Volvo, VW, Ford Europa',
    note: 'Europas største OEM-leverandør. Sekurit-brandet er de-facto standard på europeiske premium-biler. Eier også Pilkington (UK).',
  },
  {
    name: 'Pilkington (NSG Group)',
    origin: 'Storbritannia / Japan',
    plants: '35+ fabrikker',
    share: '~12% globalt OEM-marked',
    brands: 'Pilkington, OptiView, OptiView Acoustic, OptiView HUD',
    oemFor: 'Jaguar, Land Rover, Range Rover, Honda, Nissan, Bentley',
    note: 'Pioner innen laminert bilglass (oppfunnet 1905). Eid av Nippon Sheet Glass (NSG) siden 2006. Sterk på premium britisk segment.',
  },
  {
    name: 'Guardian Glass',
    origin: 'USA / Globalt',
    plants: '25+ produksjonsanlegg',
    share: '~8% globalt OEM-marked',
    brands: 'Guardian, Guardian SunGuard, Guardian SoundGuard',
    oemFor: 'Ford USA, GM, Chrysler/Stellantis, Tesla',
    note: 'Sterkest i Nord-Amerika. Voksende europeisk tilstedeværelse med fabrikk i Luxembourg. Fokus på solkontroll-glass.',
  },
];

const CHALLENGER_BRANDS = [
  {
    name: 'Fuyao Glass',
    origin: 'Kina / Europa',
    plants: '20+ fabrikker (inkl. Tyskland, Russland, USA)',
    share: '~15% globalt (voksende)',
    brands: 'Fuyao, Silent Shield, Fuyao OEM',
    oemFor: 'VW Kina, Geely, BYD, NIO, XPeng, Mercedes (noen modeller), BMW (noen modeller)',
    note: 'Verdens raskest voksende bilglassprodusent. Investerer tungt i europeisk produksjon. Konkurransedyktig OEM-kvalitet til 15–25% lavere pris.',
  },
  {
    name: 'Xinyi Glass (XYG)',
    origin: 'Kina',
    plants: '15+ fabrikker',
    share: '~6% globalt (voksende)',
    brands: 'Xinyi, XYG OEM',
    oemFor: 'Hyundai/Kia Kina, Geely, Great Wall, lokale kinesiske merker',
    note: 'Fokus på volumsegmentet i Asia. Økende OEM-kontrakter med vestlige merker for Kina-produksjon. OEE-kvalitet godkjent for flere europeiske merker.',
  },
  {
    name: 'PGW (PPG Glass)',
    origin: 'USA / Mexico',
    plants: '10+ fabrikker',
    share: '~5% Nord-Amerika',
    brands: 'PGW, PGW OEE',
    oemFor: 'Ford, GM, Stellantis (historisk), aftermarket-nettverk',
    note: 'Tradisjonell amerikansk OEM-leverandør. Satser nå tungt på aftermarket med OEE-kvalitet. Godkjent for mange europeiske modeller i USA.',
  },
];

const OEE_ALTERNATIVES = [
  {
    name: 'NordGlass',
    origin: 'Polen / Norden',
    badge: 'OEE',
    desc: 'Solid posisjon i Skandinavia og Øst-Europa. OEE-kvalitet til konkurransedyktig pris. Godkjent av flere europeiske merker for eldre modeller.',
  },
  {
    name: 'Carlex Glass',
    origin: 'USA',
    badge: 'OEE / Aftermarket',
    desc: 'Spesialist på replacement-glass i Nord-Amerika. OEE-godkjent for mange asiatiske og amerikanske modeller. Voksende europeisk distribusjon.',
  },
  {
    name: 'Precision',
    origin: 'Europa',
    badge: 'OEM / OEE',
    desc: 'Nisjeprodusent for premium-segmentet. Høypresisjonslaminering for små serier og spesialkjøretøy. Godkjent av flere luksusmerker.',
  },
];

const PVB_SUPPLIERS = [
  {
    name: 'Eastman Chemical — Saflex',
    origin: 'USA',
    desc: 'Verdens største PVB-leverandør. Saflex Acoustic, Saflex HUD (wedge), Saflex Solar. Brukes av AGC, Guardian og mange aftermarket-produsenter.',
  },
  {
    name: 'Kuraray — Trosifol',
    origin: 'Japan / Tyskland',
    desc: 'Trosifol Acoustic og Trosifol HUD er bransjestandard for premium-laminering. Produseres i Tyskland (Troisdorf) med ekstremt streng kvalitetskontroll.',
  },
];

const ADHESIVE_SUPPLIERS = [
  {
    name: 'Sika',
    origin: 'Sveits',
    desc: 'Verdensleder på strukturelle bilglasslim (Sikaflex, SikaTack). PUR-basert, direkte-glasende teknologi. OEM-godkjent av alle store bilprodusenter.',
  },
  {
    name: 'Henkel — Betamate',
    origin: 'Tyskland',
    desc: 'Betamate er OEM-standard for strukturell liming. Brukes i fabrikkmontering av frontruter hos BMW, Mercedes, VW og Volvo.',
  },
];

const COMPARISON = [
  { brand: 'AGC', oem: '★★★★★', oee: '★★★★☆', aftermarket: '★★☆☆☆', adas: '★★★★★', hud: '★★★★★', acoustic: '★★★★★' },
  { brand: 'Saint-Gobain', oem: '★★★★★', oee: '★★★★☆', aftermarket: '★★☆☆☆', adas: '★★★★★', hud: '★★★★★', acoustic: '★★★★★' },
  { brand: 'Pilkington', oem: '★★★★★', oee: '★★★★☆', aftermarket: '★★★☆☆', adas: '★★★★☆', hud: '★★★★★', acoustic: '★★★★★' },
  { brand: 'Guardian', oem: '★★★★☆', oee: '★★★☆☆', aftermarket: '★★★★☆', adas: '★★★★☆', hud: '★★★☆☆', acoustic: '★★★★☆' },
  { brand: 'Fuyao', oem: '★★★★☆', oee: '★★★★★', aftermarket: '★★★★★', adas: '★★★★☆', hud: '★★★☆☆', acoustic: '★★★☆☆' },
  { brand: 'XYG', oem: '★★★☆☆', oee: '★★★★☆', aftermarket: '★★★★★', adas: '★★★☆☆', hud: '★★☆☆☆', acoustic: '★★☆☆☆' },
  { brand: 'NordGlass', oem: '★★☆☆☆', oee: '★★★★★', aftermarket: '★★★★☆', adas: '★★★☆☆', hud: '★★☆☆☆', acoustic: '★★★☆☆' },
];

export default function ProdusenterPage() {
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
            { '@type': 'ListItem', position: 3, name: 'Bilglassprodusenter', item: `https://autoglass-frontend.pages.dev${CANONICAL}` },
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
              <span className="text-white">Bilglassprodusenter</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Bilglassprodusenter
            </h1>
            <p className="text-lg text-slate-200 max-w-2xl leading-relaxed">
              Verdens bilglassmarked domineres av fem OEM-giganter og tre voksende kinesiske utfordrere.
              Her er de faktiske aktørene — ikke markedsføring, men produksjonsdata og godkjenninger.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <article className="prose prose-slate max-w-none">

              {/* OEM GIANTS */}
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Factory className="h-5 w-5 text-autoglass-blue" />
                De fire OEM-gigantene
              </h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                Over 90% av all OEM-bilglass produseres av fire konsern: <strong>AGC</strong>,{' '}
                <strong>Saint-Gobain</strong>, <strong>Pilkington/NSG</strong> og <strong>Guardian</strong>.
                Disse produserer glass på samme fabrikker som bilprodusentene selv — med identisk
                kvalitetskontroll, identisk PVB-folie og identisk optisk spesifikasjon.
              </p>

              <div className="space-y-4 mb-10">
                {OEM_GIANTS.map((p) => (
                  <div key={p.name} className="rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-bold text-gray-900">{p.name}</span>
                      <span className="text-xs text-gray-400">{p.origin}</span>
                      <span className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">OEM</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 mb-2">
                      <div><span className="text-gray-400">Fabrikker:</span> {p.plants}</div>
                      <div><span className="text-gray-400">Markedsandel:</span> {p.share}</div>
                      <div><span className="text-gray-400">Brands:</span> {p.brands}</div>
                      <div><span className="text-gray-400">OEM for:</span> {p.oemFor}</div>
                    </div>
                    <p className="text-sm text-gray-500">{p.note}</p>
                  </div>
                ))}
              </div>

              {/* CHALLENGERS */}
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Globe className="h-5 w-5 text-autoglass-blue" />
                Kinesiske utfordrere og nye aktører
              </h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                Kinesiske produsenter har gått fra "billig aftermarket" til "OEM-godkjent kvalitet"
                på under ett tiår. Fuyao leverer nå direkte til Mercedes og BMW-fabrikker.
              </p>

              <div className="space-y-4 mb-10">
                {CHALLENGER_BRANDS.map((p) => (
                  <div key={p.name} className="rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-bold text-gray-900">{p.name}</span>
                      <span className="text-xs text-gray-400">{p.origin}</span>
                      <span className="inline-flex items-center rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">OEM / OEE</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 mb-2">
                      <div><span className="text-gray-400">Fabrikker:</span> {p.plants}</div>
                      <div><span className="text-gray-400">Markedsandel:</span> {p.share}</div>
                      <div><span className="text-gray-400">Brands:</span> {p.brands}</div>
                      <div><span className="text-gray-400">OEM for:</span> {p.oemFor}</div>
                    </div>
                    <p className="text-sm text-gray-500">{p.note}</p>
                  </div>
                ))}
              </div>

              {/* OEE ALTERNATIVES */}
              <h2 className="text-2xl font-bold text-gray-900 mb-4">OEE og alternative produsenter</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
                {OEE_ALTERNATIVES.map((p) => (
                  <div key={p.name} className="rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold text-gray-900 text-sm">{p.name}</span>
                      <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{p.badge}</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">{p.origin}</p>
                    <p className="text-sm text-gray-600">{p.desc}</p>
                  </div>
                ))}
              </div>

              {/* PVB SUPPLIERS */}
              <h2 className="text-2xl font-bold text-gray-900 mb-4">PVB-folie — lamineringens råvare</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                Bilglass er ikke bare glass — det er et laminat. PVB-folien (polyvinylbutyral) mellom
                glasslagene er det som holder glasset sammen ved knusing, demper støy og muliggjør
                wedge-forming for HUD. To selskaper dominerer 80% av markedet:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                {PVB_SUPPLIERS.map((p) => (
                  <div key={p.name} className="rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold text-gray-900 text-sm">{p.name}</span>
                      <span className="text-xs text-gray-400">{p.origin}</span>
                    </div>
                    <p className="text-sm text-gray-600">{p.desc}</p>
                  </div>
                ))}
              </div>

              {/* ADHESIVE SUPPLIERS */}
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Klebemidler — limet som holder livet</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                Strukturelle lim til bilglassmontering er like kritisk som glasset selv.
                Feil lim gir lekkasje, korrosjon og svekket karosseristivhet ved kollisjon.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                {ADHESIVE_SUPPLIERS.map((p) => (
                  <div key={p.name} className="rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold text-gray-900 text-sm">{p.name}</span>
                      <span className="text-xs text-gray-400">{p.origin}</span>
                    </div>
                    <p className="text-sm text-gray-600">{p.desc}</p>
                  </div>
                ))}
              </div>

              {/* COMPARISON TABLE */}
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Award className="h-5 w-5 text-autoglass-blue" />
                Sammenligning: hvem kan hva?
              </h2>
              <div className="overflow-hidden rounded-lg border border-gray-200 mb-10">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700">Produsent</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-700">OEM</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-700">OEE</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-700">Aftermarket</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-700">ADAS</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-700">HUD</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-700">Akustisk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {COMPARISON.map((row) => (
                      <tr key={row.brand}>
                        <td className="px-3 py-3 font-bold text-gray-900">{row.brand}</td>
                        <td className="px-3 py-3 text-center text-emerald-600">{row.oem}</td>
                        <td className="px-3 py-3 text-center text-emerald-600">{row.oee}</td>
                        <td className="px-3 py-3 text-center text-emerald-600">{row.aftermarket}</td>
                        <td className="px-3 py-3 text-center text-blue-600">{row.adas}</td>
                        <td className="px-3 py-3 text-center text-blue-600">{row.hud}</td>
                        <td className="px-3 py-3 text-center text-blue-600">{row.acoustic}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-2 bg-gray-50 text-[11px] text-gray-500">
                  Vurdering basert på fabrikkgodkjenninger, produktportefølje og markedsdata 2024–2025.
                  ★★★★★ = ledende, ★☆☆☆☆ = ikke tilbudt.
                </div>
              </div>

              {/* HOW WE CHOOSE */}
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Hvordan Autoglass AS velger produsenter</h2>
              <div className="rounded-lg border border-gray-200 p-5 mb-6 bg-gray-50/50">
                <ul className="text-sm text-gray-700 space-y-2 list-disc list-inside">
                  <li><strong>OEM først:</strong> For biler med ADAS, HUD eller active safety-systemer leverer vi utelukkende OEM eller OEE fra samme fabrikk.</li>
                  <li><strong>OEE for eldre modeller:</strong> For biler uten ADAS (typisk før 2015) kan OEE være et kostnadseffektivt alternativ med identisk passform.</li>
                  <li><strong>E-marks påkrevd:</strong> Alt glass vi selger har gyldig ECE R43-godkjenning (E-marks).</li>
                  <li><strong>Ingen ukjente brands:</strong> Vi forhandler ikke med produsenter uten dokumentert fabrikkgodkjenning eller uavhengig krasjtesting.</li>
                </ul>
              </div>

            </article>
          </div>
        </section>

        {/* CTA */}
        <section className="py-12 sm:py-16 bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Finn OEM-glass til din bil</h2>
            <p className="text-gray-600 mb-6">
              Søk med registreringsnummer så matcher vi OEM eller OEE-glass med riktig ADAS-kompatibilitet.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/sok">
                <Button size="lg" className="gap-2 bg-autoglass-blue text-white hover:bg-autoglass-blue/90">
                  <Search className="h-4 w-4" /> Søk med reg.nr.
                </Button>
              </Link>
              <Link to="/bilglassguide/oem-vs-aftermarket">
                <Button size="lg" variant="outline" className="gap-2">
                  <ArrowRight className="h-4 w-4" /> OEM vs aftermarket
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
