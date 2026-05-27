import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, AlertTriangle, Car, Wrench } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { searchByRegnr, searchByVin, searchByOem, SearchError } from '@/api/glass';
import { formatLayerLabel, formatConfidence } from '@/utils/formatters';
import { GLASS_TYPE_GROUPS } from '@/utils/glass-categories';
import type { Product } from '@/types/api';

import { VehicleCard } from '@/components/search/VehicleCard';
import { ConfidenceBadge } from '@/components/search/ConfidenceBadge';
import { GlassTypeSelector } from '@/components/catalog/GlassTypeSelector';
import { GlassPositionSelector, GLASS_POSITIONS, matchesPosition } from '@/components/search/GlassPositionSelector';
import { ProductCard } from '@/components/catalog/ProductCard';
import { BestMatchBanner, rankByEquipmentMatch } from '@/components/search/BestMatchBanner';
import { ImageUploadOcr } from '@/components/search/ImageUploadOcr';
import { AIWindshieldAnalyzer } from '@/components/search/AIWindshieldAnalyzer';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const initialRegnr = searchParams.get('regnr') ?? '';
  const initialVin = searchParams.get('vin') ?? '';
  const initialOem = searchParams.get('oem') ?? '';

  const searchMode = initialVin ? 'vin' : initialOem ? 'oem' : 'regnr';
  const initialQuery = initialVin || initialOem || initialRegnr;

  const [query, setQuery] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [selectedType, setSelectedType] = useState<string | null>('F');
  const [positionFilter, setPositionFilter] = useState<string | null>(null);
  const [colorFilter, setColorFilter] = useState<string | null>(null);
  const [, setWindshieldFilter] = useState<Product[] | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', searchMode, activeQuery],
    queryFn: () => {
      if (searchMode === 'vin') return searchByVin(activeQuery);
      if (searchMode === 'oem') return searchByOem(activeQuery);
      return searchByRegnr(activeQuery);
    },
    enabled: activeQuery.length >= 2,
    retry: 1,
  });

  useEffect(() => {
    if (initialQuery) setActiveQuery(initialQuery);
  }, [initialQuery]);

  // Reset type filter when search changes — default to front glass
  useEffect(() => {
    setSelectedType('F');
    setPositionFilter(null);
    setColorFilter(null);
  }, [activeQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      setActiveQuery(query.trim().toUpperCase());
    }
  };

  const vehicle = data?.vehicle;
  const candidates = data?.candidates ?? [];
  const conf = data?.confidence ? formatConfidence(data.confidence) : null;

  // Smart sort: if vehicle has equipment data, sort by equipment match
  const smartSortedCandidates = useMemo(() => {
    if (!vehicle?.effectiveEquipment || !selectedType) return candidates;
    // Only sort within the selected type (e.g. frontrute)
    const group = GLASS_TYPE_GROUPS.find((g) => g.key === selectedType);
    if (!group) return candidates;
    const typeProducts = candidates.filter((c) => group.codes.includes(c.typeCode));
    const others = candidates.filter((c) => !group.codes.includes(c.typeCode));
    const ranked = rankByEquipmentMatch(typeProducts, vehicle);
    return [...ranked.map((r) => r.product), ...others];
  }, [candidates, vehicle, selectedType]);

  // Determine error type for better messaging
  const errorStatus = error instanceof SearchError ? error.status : undefined;
  const isNotFound = errorStatus === 404;
  const isUpstreamError = errorStatus === 503;
  const isInternalError = errorStatus === 500;

  // Filtered products — support position, color, and type filters
  // Uses smartSortedCandidates when equipment data is available
  const filteredProducts = useMemo(() => {
    let result = smartSortedCandidates;
    
    // Apply position filter from GlassPositionSelector
    if (positionFilter) {
      const pos = GLASS_POSITIONS.find((p) => p.id === positionFilter);
      if (pos) {
        result = result.filter((c) => matchesPosition(c, pos));
      }
    }
    
    // Apply color filter
    if (colorFilter && colorFilter !== 'all') {
      result = result.filter((c) => {
        const desc = (c.description || '').toUpperCase();
        return desc.includes(colorFilter);
      });
    }
    
    // Apply type filter
    if (selectedType) {
      const group = GLASS_TYPE_GROUPS.find((g) => g.key === selectedType);
      if (group) {
        result = result.filter((c) => group.codes.includes(c.typeCode));
      } else if (selectedType === 'Annet') {
        const known = GLASS_TYPE_GROUPS.flatMap((g) => g.codes);
        result = result.filter((c) => !known.includes(c.typeCode));
      } else {
        result = result.filter((c) => c.typeCode === selectedType);
      }
    }
    
    return result;
  }, [selectedType, positionFilter, colorFilter, candidates]);

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
      <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Søk med registreringsnummer</h1>
      <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-8">Tast inn bilens registreringsnummer for å finne riktig glass.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 sm:mb-8">
        <form onSubmit={handleSearch} className="flex gap-2 lg:col-span-2">
          <Input
            placeholder={searchMode === 'vin' ? 'WVWZZZ...' : searchMode === 'oem' ? 'OEM-nummer' : 'AB12345'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-14 flex-1 text-lg uppercase"
            maxLength={searchMode === 'vin' ? 17 : 30}
          />
          <Button type="submit" size="lg" className="h-14 px-4 sm:px-6 gap-2 flex-shrink-0" disabled={isLoading}>
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            <span className="hidden sm:inline">Søk</span>
          </Button>
        </form>

        {/* OCR bilde-opplasting — kun for regnr-søk */}
        {searchMode === 'regnr' && (
          <div className="lg:col-span-1">
            <ImageUploadOcr
              onRegnrFound={(regnr) => {
                setQuery(regnr);
                setActiveQuery(regnr);
              }}
            />
          </div>
        )}
      </div>

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
                    <strong>{activeQuery}</strong> ble ikke funnet i Statens vegvesen sitt register.
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
                    Vi får ikke kontakt med Statens vegvesen sitt register akkurat nå. Prøv igjen om noen minutter.
                  </p>
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
            <a href="/katalog">
              <Button variant="outline" className="w-full sm:w-auto gap-2">
                <Car className="h-4 w-4" />
                Søk i katalogen
              </Button>
            </a>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActiveQuery('');
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <Wrench className="h-4 w-4" />
              Prøv på nytt
            </button>
          </div>
        </div>
      )}

      {data && vehicle && (
        <div className="space-y-4 sm:space-y-6 animate-slide-up">
          {/* Vehicle info */}
          <VehicleCard
            vehicle={vehicle}
            equipment={data.equipment}
            regnr={data.regnr}
          />

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

          {/* Interactive glass position selector */}
          {candidates.length > 0 && (
            <GlassPositionSelector
              products={candidates}
              onFilter={(pos, color) => {
                setPositionFilter(pos);
                setColorFilter(color);
              }}
            />
          )}

          {/* Glass type category selector (secondary filter) */}
          {candidates.length > 0 && (
            <GlassTypeSelector
              products={candidates}
              activeType={selectedType}
              onSelect={setSelectedType}
            />
          )}

          {/* AI Windshield Analyzer — show when multiple front windshields */}
          {selectedType === 'Frontrute' && candidates.filter(c => c.typeCode === 'F').length > 1 && (
            <AIWindshieldAnalyzer
              products={candidates.filter(c => c.typeCode === 'F')}
              onFilter={(filtered) => setWindshieldFilter(filtered.length < candidates.filter(c => c.typeCode === 'F').length ? filtered : null)}
            />
          )}

          {/* Smart best match banner */}
          {vehicle?.effectiveEquipment && filteredProducts.length > 1 && (
            <BestMatchBanner
              products={filteredProducts}
              vehicle={vehicle}
            />
          )}

          {/* Results */}
          {filteredProducts.length > 0 && (
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
                {filteredProducts.length} resultat{filteredProducts.length !== 1 ? 'er' : ''}
                {selectedType ? ` · ${selectedType}` : ''}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.map((product) => (
                  <ProductCard key={product.eurocode} product={product} />
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
                setQuery('');
                setActiveQuery('');
              }}
              className="text-sm text-autoglass-blue hover:underline"
            >
              Ikke riktig kjøretøy? Søk på nytt
            </button>
          </div>
        </div>
      )}

      {data && candidates.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
          <p className="font-medium text-amber-800">Ingen glass funnet</p>
          <p className="text-sm text-amber-700 mt-1">
            Vi fant kjøretøyet, men har ingen registrerte glass som passer. Prøv å søke i katalogen manuelt.
          </p>
          <a href="/katalog">
            <Button variant="outline" className="mt-4">
              Åpne katalog
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}
