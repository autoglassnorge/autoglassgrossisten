import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
// import { useI18n } from '@/i18n/I18nProvider'; // For fremtidig i18n-støtte
import { 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Car,
  Settings,
  Calendar,
  Globe,
  ChevronRight,
  Lightbulb
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function VariantMatchingPage() {
  // const { t } = useI18n(); // For fremtidig i18n-støtte

  const checklistItems = [
    {
      title: 'Bilens VIN-nummer',
      description: 'Det 17-sifrede understellsnummeret gir 100% sikker identifikasjon av riktig glass.',
      icon: Car,
    },
    {
      title: 'Årsmodell og måned',
      description: 'Glass kan endres midt i modellåret. Sjekk registreringsdato, ikke bare årstall.',
      icon: Calendar,
    },
    {
      title: 'Utstyrskoder',
      description: 'ADAS, varmeovn, regnsensor, antenne og HUD har ulike glass med spesialfunksjoner.',
      icon: Settings,
    },
    {
      title: 'Markedsområde',
      description: 'Samme modell kan ha ulikt glass for Europa, USA eller Asia.',
      icon: Globe,
    },
  ];

  const commonMistakes = [
    {
      title: 'Å anta at alle "Golf" har samme glass',
      description: 'En Volkswagen Golf VIII kan ha over 20 ulike frontruter avhengig av utstyr og produksjonsdato.',
    },
    {
      title: 'Ignorere utstyrskoder',
      description: 'Bestilling av standardglass til en bil med ADAS-kamera kan føre til feilkoder og ugyldig forsikring.',
    },
    {
      title: 'Se kun på registreringsår',
      description: 'En 2019-modell kan være produsert i 2018 eller 2019, med ulike glass spesifikasjoner.',
    },
    {
      title: 'Glemme takvinduer og spesialutstyr',
      description: 'Panoramasoltag, Webasto og andre fabrikkmonterte tillegg påvirker glass-spesifikasjonen.',
    },
  ];

  const vinDecoderTips = [
    {
      position: '1-3',
      label: 'WMI',
      description: 'Verdensomspennende produsent-identifikator (f.eks. WVW = Volkswagen)',
    },
    {
      position: '4-8',
      label: 'VDS',
      description: 'Kjøretøybeskrivelse - modell, motor, karosseri',
    },
    {
      position: '9',
      label: 'Sjekksiffer',
      description: 'Sikkerhetskontroll for gyldig VIN',
    },
    {
      position: '10',
      label: 'Modellår',
      description: 'Produksjonsår (A=2010, B=2011... N=2022, P=2023, R=2024)',
    },
    {
      position: '11',
      label: 'Fabrikk',
      description: 'Produksjonssted (f.eks. E = Europa)',
    },
    {
      position: '12-17',
      label: 'Serienummer',
      description: 'Unik identifikator for dette kjøretøyet',
    },
  ];

  return (
    <>
      <PageMeta
        title="Hvorfor har samme bilmodell flere glass-varianter? | Autoglass AS"
        description="Lær hvordan du matcher riktig bilglass til riktig bil. VIN-dekoding, utstyrskoder, og unngå vanlige bestillingsfeil."
        canonicalPath="/bilglassguide/variantmatching"
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: 'Hvorfor har samme bilmodell flere glass-varianter?',
          description: 'Komplett guide til matching av bilglass basert på VIN, utstyrskoder og modellvarianter.',
          author: {
            '@type': 'Organization',
            name: 'Autoglass AS',
          },
        }}
      />

      <div className="min-h-screen bg-carbon-950 text-white">
        {/* Hero */}
        <section className="relative bg-carbon-900 border-b border-carbon-800">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-glass-cyan/30 bg-glass-cyan/5 mb-6">
                <Search className="h-3.5 w-3.5 text-glass-cyan" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-glass-cyan">
                  Bilglassguide
                </span>
              </div>
              
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight">
                Hvorfor har samme bilmodell{' '}
                <span className="text-glass-cyan">flere glass-varianter?</span>
              </h1>
              
              <p className="mt-6 text-lg text-carbon-300 max-w-2xl mx-auto leading-relaxed">
                Å bestille glass etter merke og modell alene er ofte ikke nok. 
                Lær hvordan du matcher riktig glass og unngår kostbare feilbestillinger.
              </p>
            </div>
          </div>
        </section>

        {/* Why Variants */}
        <section className="py-16 sm:py-20 border-b border-carbon-800">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-8">
              4 grunner til variasjon
            </h2>
            
            <div className="grid sm:grid-cols-2 gap-6">
              {[
                {
                  title: 'Utstyrsnivå',
                  description: 'En base-model har standard glass, mens en "Executive" eller "Sport" kan ha akustisk glass, varmeovn eller HUD (Head-Up Display).',
                },
                {
                  title: 'Sikkerhetssystemer',
                  description: 'ADAS-kamera, regnsensor, lys-sensor og lane-assist krever alle spesielle frontruter med monteringsbraketter og klare soner.',
                },
                {
                  title: 'Produksjonsperiode',
                  description: 'Glassprodusenten kan endre spesifikasjoner midt i modellåret. En "2023-modell" kan ha glass fra både 2022 og 2023.',
                },
                {
                  title: 'Geografisk marked',
                  description: 'Biler produsert for ulike markeder (Europa, USA, Asia) kan ha ulikt glass grunnet forskjellige regler for solbeskyttelse og tykkelse.',
                },
              ].map((item, index) => (
                <div 
                  key={item.title}
                  className="p-6 rounded-lg border border-carbon-700 bg-carbon-900/50 hover:bg-carbon-900 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-glass-cyan/10 border border-glass-cyan/30 flex items-center justify-center text-glass-cyan font-mono text-sm font-bold">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold text-white mb-2">{item.title}</h3>
                      <p className="text-sm text-carbon-400 leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Checklist */}
        <section className="py-16 sm:py-20 border-b border-carbon-800 bg-carbon-900/30">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-8">
              <CheckCircle2 className="h-6 w-6 text-signal-green" />
              <h2 className="text-2xl sm:text-3xl font-bold text-white">
                Sjekkliste før bestilling
              </h2>
            </div>
            
            <div className="space-y-4">
              {checklistItems.map((item) => (
                <div 
                  key={item.title}
                  className="flex items-start gap-4 p-5 rounded-lg border border-carbon-700 bg-carbon-950"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-glass-cyan/10 border border-glass-cyan/30 flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-glass-cyan" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-1">{item.title}</h3>
                    <p className="text-sm text-carbon-400">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10">
              <div className="flex items-start gap-3">
                <Lightbulb className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200">
                  <strong>Proff-tips:</strong> Vår søketjeneste dekoder automatisk VIN og matcher mot 
                  riktig glass i katalogen. Søk med registreringsnummer for å se nøyaktig hvilket glass 
                  som passer din bil.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* VIN Decoder */}
        <section className="py-16 sm:py-20 border-b border-carbon-800">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              VIN-dekoding for glass-matching
            </h2>
            <p className="text-carbon-300 mb-8 max-w-2xl">
              De 17 sifrene i VIN-et forteller historien om bilen din. Her er hva du bør se etter 
              når du skal matche glass:
            </p>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-carbon-700">
                    <th className="text-left py-3 px-4 font-mono text-glass-cyan">Posisjon</th>
                    <th className="text-left py-3 px-4 font-mono text-glass-cyan">Kode</th>
                    <th className="text-left py-3 px-4 text-carbon-400">Betydning</th>
                  </tr>
                </thead>
                <tbody>
                  {vinDecoderTips.map((tip) => (
                    <tr key={tip.position} className="border-b border-carbon-800 hover:bg-carbon-900/50">
                      <td className="py-4 px-4 font-mono text-white">{tip.position}</td>
                      <td className="py-4 px-4 font-mono text-glass-cyan">{tip.label}</td>
                      <td className="py-4 px-4 text-carbon-300">{tip.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 p-6 rounded-lg border border-carbon-700 bg-carbon-900/50">
              <h3 className="font-semibold text-white mb-3">Eksempel: Volkswagen Golf</h3>
              <div className="font-mono text-sm space-y-2">
                <div className="flex flex-wrap gap-1">
                  {'WVWZZZAUZJW123456'.split('').map((char, i) => (
                    <span 
                      key={i} 
                      className={`inline-flex w-6 h-8 items-center justify-center rounded ${
                        i < 3 ? 'bg-glass-cyan/20 text-glass-cyan' :
                        i < 9 ? 'bg-blue-500/20 text-blue-300' :
                        i === 9 ? 'bg-amber-500/20 text-amber-300' :
                        'bg-carbon-800 text-carbon-400'
                      }`}
                    >
                      {char}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 text-xs mt-3">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-glass-cyan/20" /> Produsent
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-blue-500/20" /> Spesifikasjon
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-amber-500/20" /> Årsmodell
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Common Mistakes */}
        <section className="py-16 sm:py-20 border-b border-carbon-800 bg-carbon-900/30">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-8">
              <AlertTriangle className="h-6 w-6 text-amber-400" />
              <h2 className="text-2xl sm:text-3xl font-bold text-white">
                Vanlige fallgruber
              </h2>
            </div>
            
            <div className="space-y-4">
              {commonMistakes.map((mistake, index) => (
                <div 
                  key={mistake.title}
                  className="p-5 rounded-lg border border-red-500/20 bg-red-500/5"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold text-xs">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold text-white mb-1">{mistake.title}</h3>
                      <p className="text-sm text-carbon-400">{mistake.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="p-8 sm:p-12 rounded-2xl border border-glass-cyan/30 bg-gradient-to-br from-glass-cyan/10 to-carbon-900 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                Usikker på hvilket glass du trenger?
              </h2>
              <p className="text-carbon-300 mb-8 max-w-xl mx-auto">
                Bruk vår VIN-baserte søketjeneste for å finne eksakt riktig glass til din bil. 
                Vi matcher mot 37 500+ produkter i katalogen.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  to="/sok"
                  className="group inline-flex items-center gap-2 px-6 py-3 bg-glass-cyan hover:bg-glass-cyanLight text-carbon-950 font-semibold rounded-lg transition-colors"
                >
                  <Search className="h-5 w-5" />
                  <span>Søk med registreringsnummer</span>
                  <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  to="/bilglassguide/identifisere-riktig-bilglass"
                  className="inline-flex items-center gap-2 px-6 py-3 border border-carbon-600 text-carbon-300 hover:text-white hover:border-carbon-500 rounded-lg transition-colors"
                >
                  <span>Les mer om identifisering</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
