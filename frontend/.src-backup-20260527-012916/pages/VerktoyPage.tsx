import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Battery,
  Wrench,
  Paperclip,
  Droplets,
  Megaphone,
  Sparkles,
  Truck,
  ArrowUpFromLine,
  CircuitBoard,
  Shield,
  Scissors,
  Wind,
  Gauge,
  ChevronRight,
  Package,
} from 'lucide-react';

interface ToolCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const toolCategories: ToolCategory[] = [
  {
    id: 'batterier',
    name: 'BATTERIER',
    description: 'Batterier til kjøretøy og verktøy',
    icon: <Battery className="h-8 w-8" />,
  },
  {
    id: 'diverse-verktoy',
    name: 'DIVERSE VERKTØY',
    description: 'Håndverktøy og tilbehør til bilglassarbeid',
    icon: <Wrench className="h-8 w-8" />,
  },
  {
    id: 'klips',
    name: 'KLIPS',
    description: 'Klips, fester og monteringstilbehør',
    icon: <Paperclip className="h-8 w-8" />,
  },
  {
    id: 'lim',
    name: 'LIM OG LIMPÅFØRING',
    description: 'Karosserilim, primer og påføringsutstyr',
    icon: <Droplets className="h-8 w-8" />,
  },
  {
    id: 'reklame',
    name: 'REKLAMEARTIKLER',
    description: 'Profilerte produkter og markedsføringsmateriell',
    icon: <Megaphone className="h-8 w-8" />,
  },
  {
    id: 'renseverktoy',
    name: 'RENSEVERKTØY',
    description: 'Rengjøringsmidler og verktøy for glass og karosseri',
    icon: <Sparkles className="h-8 w-8" />,
  },
  {
    id: 'roll-out',
    name: 'ROLL OUT 2000 & LILL BUDDY',
    description: 'Spesialutstyr for rullebrett og montering',
    icon: <Truck className="h-8 w-8" />,
  },
  {
    id: 'rutebord',
    name: 'RUTEBORD OG LØFTEVERKTØY',
    description: 'Rutemonteringsbord, sugekopper og løfteutstyr',
    icon: <ArrowUpFromLine className="h-8 w-8" />,
  },
  {
    id: 'sensor',
    name: 'SENSOR OG SENSORVERKTØY',
    description: 'ADAS-sensorer, kalibreringsutstyr og tilbehør',
    icon: <CircuitBoard className="h-8 w-8" />,
  },
  {
    id: 'steinsprut',
    name: 'STEINSPRUTREPARASJON',
    description: 'Utstyr og materialer for reparasjon av steinsprutskader',
    icon: <Shield className="h-8 w-8" />,
  },
  {
    id: 'utskjaering',
    name: 'UTSKJÆRINGSVERKTØY',
    description: 'Verktøy for utskjæring og tilpasning av bilglass',
    icon: <Scissors className="h-8 w-8" />,
  },
  {
    id: 'vindusviskere',
    name: 'VINDUSVISKERE',
    description: 'Vindusviskere til alle kjøretøytyper',
    icon: <Wind className="h-8 w-8" />,
  },
  {
    id: 'vindusviskerverktoy',
    name: 'VINDUSVISKERVERKTØY',
    description: 'Verktøy for montering og vedlikehold av vindusviskere',
    icon: <Gauge className="h-8 w-8" />,
  },
];

export default function VerktoyPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = toolCategories.filter((cat) =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-autoglass-blue text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-3">
            <Package className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Verktøy / Tilbehør</h1>
          </div>
          <p className="text-blue-100 max-w-2xl">
            Profesjonelt verktøy, utstyr og tilbehør for bilglassmontering.
            Alt du trenger for effektivt og presist arbeid.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Search */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <input
              type="text"
              placeholder="Søk i kategorier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-4 pr-10 text-sm outline-none focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Categories Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((cat) => (
              <Link
                key={cat.id}
                to={`/verktoy/${cat.id}`}
                className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-autoglass-blue/30 hover:-translate-y-0.5"
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-autoglass-blue/10 text-autoglass-blue transition-colors group-hover:bg-autoglass-blue group-hover:text-white">
                  {cat.icon}
                </div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">
                  {cat.name}
                </h3>
                <p className="text-sm text-gray-500 mb-3 flex-1">
                  {cat.description}
                </p>
                <div className="flex items-center text-sm font-medium text-autoglass-blue opacity-0 group-hover:opacity-100 transition-opacity">
                  Se produkter
                  <ChevronRight className="ml-1 h-4 w-4" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Package className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500">Ingen kategorier funnet.</p>
          </div>
        )}

        {/* Info banner */}
        <div className="mt-10 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            <strong>Trenger du hjelp?</strong> Kontakt oss for tilbud på større volum eller spesialbestillinger.
            Vi har tilgang til et bredt utvalg av verktøy og tilbehør fra ledende leverandører.
          </p>
        </div>
      </div>
    </div>
  );
}
