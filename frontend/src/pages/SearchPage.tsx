import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, AlertTriangle, Car, Wrench } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageMeta } from '@/components/seo/PageMeta';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { searchByRegnr, SearchError } from '@/api/glass';
import { formatLayerLabel, formatConfidence } from '@/utils/formatters';

import { VehicleCard } from '@/components/search/VehicleCard';
import { StickyVehicleHeader } from '@/components/search/StickyVehicleHeader';
import { KtypeInfoBadge } from '@/components/search/KtypeInfoBadge';
import { CalibrationInfoPanel } from '@/components/search/CalibrationInfoPanel';
import { ConfidenceBadge } from '@/components/search/ConfidenceBadge';
// Lazy-load heavy components only when needed
const EquipmentVerifier = lazy(() =>
  import('@/components/search/EquipmentVerifier').then((m) => ({ default: m.EquipmentVerifier }))
);
const AccessorySuggestions = lazy(() =>
  import('@/components/search/AccessorySuggestions').then((m) => ({ default: m.AccessorySuggestions }))
);
import { EUKontrollReminder } from '@/components/search/EUKontrollReminder';
import { GlassCategoryFilter } from '@/components/search/GlassCategoryFilter';
import { TypeCodeTabs } from '@/components/catalog/TypeCodeTabs';
import { ProductCard } from '@/components/catalog/ProductCard';
import type { Product } from '@/types/api';

// Lazy-load ProductDetail — only needed when user clicks a product
const ProductDetail = lazy(() =>
  import('@/components/catalog/ProductDetail').then((m) => ({ default: m.ProductDetail }))
);

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const initialRegnr = searchParams.get('regnr') ?? '';
  const [regnr, setRegnr] = useState(initialRegnr);
  const [activeRegnr, setActiveRegnr] = useState(initialRegnr);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [equipmentFiltered, setEquipmentFiltered] = useState<Product[] | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', activeRegnr],
    queryFn: () => searchByRegnr(activeRegnr),
    enabled: activeRegnr.length >= 2,
    retry: 1,
  });

  useEffect(() => {
    if (initialRegnr) setActiveRegnr(initialRegnr);
  }, [initialRegnr]);

  // Reset type filter when search changes
  useEffect(() => {
    setSelectedType(null);
    setSelectedCategory(null);
    setEquipmentFiltered(null);
  }, [activeRegnr]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (regnr.trim().length >= 2) {
      setActiveRegnr(regnr.trim().toUpperCase());
    }
  };

  const vehicle = data?.vehicle;
  const candidates = data?.candidates ?? [];
  const conf = data?.confidence ? formatConfidence(data.confidence) : null;

  // Determine error type for better messaging
  const errorStatus = error instanceof SearchError ? error.status : undefined;
  const isNotFound = errorStatus === 404;
  const isUpstreamError = errorStatus === 503;
  const isInternalError = errorStatus === 500;

  // Sort candidates: windshield first, then by score descending
  const CATEGORY_RANK: Record<string, number> = {
    frontrute: 1,
    bakrute: 2,
    'dørrute-frem': 3,
    'dørrute-bak': 4,
    siderute: 5,
    ventilrute: 6,
    annet: 99,
  };

  const sortedCandidates = useMemo(() => {
    return [...candidates].sort((a, b) => {
      const rankA = CATEGORY_RANK[a.category?.toLowerCase() || 'annet'] || 99;
      const rankB = CATEGORY_RANK[b.category?.toLowerCase() || 'annet'] || 99;
      if (rankA !== rankB) return rankA - rankB;
      // Within same category, sort by score descending
      return (b._score || 0) - (a._score || 0);
    });
  }, [candidates]);

  // Filtered products (type + equipment + category)
  const baseProducts = equipmentFiltered ?? sortedCandidates;
  const filteredProducts = useMemo(() => {
    let result = baseProducts;
    if (selectedType) {
      result = result.filter(p => (p.typeCode || 'Ukjent') === selectedType);
    }
    if (selectedCategory) {
      result = result.filter(p => (p.category?.toLowerCase() || 'annet') === selectedCategory);
    }
    return result;
  }, [selectedType, selectedCategory, baseProducts]);

  return (
    <>
      <PageMeta
        title="Søk med registreringsnummer — finn riktig bilglass"
        description="Søk med registreringsnummer eller VIN for å finne eksakt bilglass som passer din bil. Med ADAS-kompatibilitet, regnsensor og kalibrering."
        canonicalPath="/sok"
      />
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
      <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Søk med registreringsnummer</h1>
      <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-8">Tast inn bilens registreringsnummer for å finne riktig glass.</p>

      <form onSubmit={handleSearch} className="flex gap-2 mb-4 sm:mb-8">
        <label htmlFor="regnr-input" className="sr-only">
          Registreringsnummer
        </label>
        <Input
          id="regnr-input"
          placeholder="AB12345"
          value={regnr}
          onChange={(e) => setRegnr(e.target.value)}
          className="h-14 flex-1 text-lg uppercase"
          maxLength={8}
          aria-describedby="regnr-help"
        />
        <Button
          type="submit"
          size="lg"
          className="h-14 px-4 sm:px-6 gap-2 flex-shrink-0"
          disabled={isLoading}
          aria-label="Søk etter bilglass"
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
          <span className="hidden sm:inline">Søk</span>
        </Button>
        <span id="regnr-help" className="sr-only">
          Skriv inn bilens registreringsnummer for å finne riktig glass
        </span>
      </form>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <Skeleton className="h-32 w-full" />
              <div className="p-4 space-y-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex justify-between items-center pt-2">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-10 w-28" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error states */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 sm:p-6 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              {isNotFound ? (
                <>
                  <p className="font-medium text-red-800">Kunne ikke finne kjøretøy</p>
                  <p className="text-sm text-red-700 mt-1">
                    Registreringsnummeret <strong>{activeRegnr}</strong> ble ikke funnet i Statens vegvesen sitt register.
                    Dette kan skyldes:
                  </p>
                  <ul className="text-sm text-red-700 mt-2 list-disc list-inside space-y-0.5">
                    <li>Feil tastet registreringsnummer</li>
                    <li>Kjøretøyet er avregistrert</li>
                    <li>Utlandsk kjøretøy som ikke er i det norske registeret</li>
                  </ul>
                </>
              ) : isUpstreamError ? (
                <>
                  <p className="font-medium text-red-800">Kjøretøyoppslag midlertidig utilgjengelig</p>
                  <p className="text-sm text-red-700 mt-1">
                    Vi får ikke kontakt med Statens vegvesen sitt register akkurat nå på grunn av sikkerhetstiltak. 
                    Du kan sjekke kjøretøyopplysninger direkte på vegvesen.no eller bla i katalogen vår.
                  </p>
                  {error instanceof SearchError && error.backupUrl && (
                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                      <a 
                        href={error.backupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                      >
                        Sjekk på vegvesen.no
                      </a>
                    </div>
                  )}
                </>
              ) : isInternalError ? (
                <>
                  <p className="font-medium text-red-800">En teknisk feil oppstod</p>
                  <p className="text-sm text-red-700 mt-1">
                    Det oppstod en feil under søket. Vi har logget feilen og jobber med å rette den. Prøv igjen senere.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-red-800">Søk feilet</p>
                  <p className="text-sm text-red-700 mt-1">{error.message}</p>
                </>
              )}
            </div>
          </div>

          {/* Fallback options */}
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <a href="/bla">
              <Button variant="outline" className="w-full sm:w-auto gap-2">
                <Car className="h-4 w-4" />
                Bla i katalogen
              </Button>
            </a>
            <button
              type="button"
              onClick={() => {
                setRegnr('');
                setActiveRegnr('');
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <Wrench className="h-4 w-4" />
              Prøv et annet regnr
            </button>
          </div>
        </div>
      )}

      {data && vehicle && (
        <div className="space-y-4 sm:space-y-6 animate-slide-up">
          {/* Sticky vehicle header — follows user while scrolling */}
          <StickyVehicleHeader
            vehicle={vehicle}
            regnr={data.regnr}
            onChange={() => {
              setRegnr('');
              setActiveRegnr('');
            }}
          />

          {/* Vehicle info */}
          <VehicleCard
            vehicle={vehicle}
            equipment={data.equipment}
            regnr={data.regnr}
          />

          {/* EU-kontroll påminnelse */}
          <EUKontrollReminder nextEUDate={vehicle.nextEUDate} />

          {/* kType enrichment (subtle — internal reference) */}
          {data.ktypeInfo && (
            <KtypeInfoBadge ktypeInfo={data.ktypeInfo} />
          )}

          {/* ADAS calibration requirements */}
          {data.calibrationRequirements && data.calibrationRequirements.length > 0 && (
            <CalibrationInfoPanel requirements={data.calibrationRequirements} />
          )}

          {/* Confidence + Layer */}
          {data.confidenceInfo && (
            <ConfidenceBadge confidence={data.confidenceInfo} />
          )}
          {!data.confidenceInfo && conf && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${conf.color}`}>
                {conf.label}
              </span>
              <span className="text-sm text-gray-500">
                {formatLayerLabel(data.layer)}
              </span>
            </div>
          )}

          {/* Equipment verifier — lazy-loaded, show when confidence is medium/low */}
          {data.confidenceInfo && data.confidenceInfo.score < 90 && candidates.length > 1 && (
            <Suspense fallback={null}>
              <EquipmentVerifier
                products={candidates}
                onFilter={setEquipmentFiltered}
              />
            </Suspense>
          )}

          {/* Accessory suggestions — lazy-loaded */}
          {selectedType && candidates.some((p) => (p.typeCode || 'Ukjent') === selectedType) && (
            <Suspense fallback={null}>
              <AccessorySuggestions typeCode={selectedType} />
            </Suspense>
          )}

          {/* Glass category filter — primary navigation */}
          {candidates.length > 0 && (
            <GlassCategoryFilter
              products={sortedCandidates}
              activeCategory={selectedCategory}
              onSelect={setSelectedCategory}
            />
          )}

          {/* Type code tabs */}
          {candidates.length > 0 && (
            <TypeCodeTabs
              products={candidates}
              activeType={selectedType}
              onSelect={setSelectedType}
            />
          )}

          {/* Results */}
          {filteredProducts.length > 0 && (
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
                {filteredProducts.length} resultat{filteredProducts.length !== 1 ? 'er' : ''}
                {selectedCategory ? ` · ${selectedCategory}` : ''}
                {selectedType ? ` · ${selectedType}` : ''}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onDetail={setDetailProduct}
                    searchContext={data?.regnr ? {
                      regnr: data.regnr,
                      kType: vehicle?.k_type,
                      layer: data?.layer,
                      score: product._score,
                    } : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* No results after filtering */}
          {filteredProducts.length === 0 && candidates.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
              <p className="font-medium text-amber-800">Ingen glass i denne kategorien</p>
              <p className="text-sm text-amber-700 mt-1">Prøv en annen fane eller fjern filteret.</p>
              <Button variant="outline" className="mt-4" onClick={() => setSelectedType(null)}>
                Vis alle
              </Button>
            </div>
          )}

          {/* Not right vehicle link */}
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setRegnr('');
                setActiveRegnr('');
              }}
              className="text-sm text-autoglass-blue hover:underline"
            >
              Ikke riktig kjøretøy? Søk på nytt
            </button>
          </div>
        </div>
      )}

      {/* Product detail modal — lazy-loaded */}
      <Suspense fallback={null}>
        <ProductDetail product={detailProduct} onClose={() => setDetailProduct(null)} />
      </Suspense>

      {data && candidates.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
          <p className="font-medium text-amber-800">Ingen glass funnet</p>
          <p className="text-sm text-amber-700 mt-1">
            Vi fant kjøretøyet, men har ingen registrerte glass som passer. Prøv å søke i katalogen manuelt.
          </p>
          <a href="/bla">
            <Button variant="outline" className="mt-4">
              Bla i katalogen
            </Button>
          </a>
        </div>
      )}
    </div>
    </>
  );
}
