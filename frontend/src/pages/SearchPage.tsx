import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { searchByRegnr } from '@/api/glass';
import { formatLayerLabel, formatConfidence } from '@/utils/formatters';

import { VehicleCard } from '@/components/search/VehicleCard';
import { ConfidenceBadge } from '@/components/search/ConfidenceBadge';
import { TypeCodeTabs } from '@/components/catalog/TypeCodeTabs';
import { ProductCard } from '@/components/catalog/ProductCard';
import type { Product } from '@/types/api';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const initialRegnr = searchParams.get('regnr') ?? '';
  const [regnr, setRegnr] = useState(initialRegnr);
  const [activeRegnr, setActiveRegnr] = useState(initialRegnr);
  const [selectedType, setSelectedType] = useState<string | null>(null);


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

  // Group by type code
  const grouped = useMemo(() => {
    const map: Record<string, Product[]> = {};
    candidates.forEach((c) => {
      const key = c.typeCode || 'Ukjent';
      if (!map[key]) map[key] = [];
      map[key].push(c);
    });
    return map;
  }, [candidates]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    if (selectedType) {
      return grouped[selectedType] ?? [];
    }
    return candidates;
  }, [selectedType, grouped, candidates]);

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
      <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Søk med registreringsnummer</h1>
      <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-8">Tast inn bilens registreringsnummer for å finne riktig glass.</p>

      <form onSubmit={handleSearch} className="flex gap-2 mb-4 sm:mb-8">
        <Input
          placeholder="AB12345"
          value={regnr}
          onChange={(e) => setRegnr(e.target.value)}
          className="h-14 flex-1 text-lg uppercase"
          maxLength={8}
        />
        <Button type="submit" size="lg" className="h-14 px-4 sm:px-6 gap-2 flex-shrink-0" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
          <span className="hidden sm:inline">Søk</span>
        </Button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-red-800">Kunne ikke finne kjøretøy</p>
            <p className="text-sm text-red-700">Sjekk at registreringsnummeret er riktig, eller prøv å søke i katalogen.</p>
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

      {data && candidates.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
          <p className="font-medium text-amber-800">Ingen glass funnet</p>
          <p className="text-sm text-amber-700 mt-1">
            Vi fant kjøretøyet, men har ingen registrerte glass som passer. Prøv å søke i katalogen manuelt.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.href = '/katalog'}>
            Åpne katalog
          </Button>
        </div>
      )}
    </div>
  );
}
