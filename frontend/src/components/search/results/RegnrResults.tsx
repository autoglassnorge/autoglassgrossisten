/**
 * RegnrResults — All regnr-search logic and rendering.
 * Lazy-loaded by SearchShell. Self-contained: own query, filters, state.
 */

import { useState, useMemo, Suspense, lazy, useCallback, memo, useDeferredValue } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Sparkles, Wrench, X, AlertTriangle } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';

import { Button } from '@/components/ui/Button';
import { searchByRegnr } from '@/api/glass';
import { formatLayerLabel, formatConfidence } from '@/utils/formatters';
import {
  productMatchesGlassSelection,
  type DoorPlacement,
  type GlassCategory,
  type GlassPosition,
} from '@/utils/glass-selection';
import {
  productMatchesEquipmentFilters,
} from '@/utils/equipment-filters';
import type { Product, UserEquipmentAnswers } from '@/types/api';
import { EquipmentFilterPanel } from '@/components/search/EquipmentFilterPanel';

import { VehicleCard } from '@/components/search/VehicleCard';
import { StickyVehicleHeader } from '@/components/search/StickyVehicleHeader';
import { KtypeInfoBadge } from '@/components/search/KtypeInfoBadge';
import { CalibrationInfoPanel } from '@/components/search/CalibrationInfoPanel';
import { ConfidenceBadge } from '@/components/search/ConfidenceBadge';
import { EUKontrollReminder } from '@/components/search/EUKontrollReminder';
import { GlassNeedSelector } from '@/components/search/GlassNeedSelector';
import { TypeCodeTabs } from '@/components/catalog/TypeCodeTabs';
import { ProductCard } from '@/components/catalog/ProductCard';
import { VirtualProductGrid } from '@/components/search/results/VirtualProductGrid';

const EquipmentVerifier = lazy(() =>
  import('@/components/search/EquipmentVerifier').then((m) => ({ default: m.EquipmentVerifier }))
);
const AccessorySuggestions = lazy(() =>
  import('@/components/search/AccessorySuggestions').then((m) => ({ default: m.AccessorySuggestions }))
);

interface RegnrResultsProps {
  activeQuery: string;
  onClear: () => void;
  onDetail: (product: Product) => void;
}

const CATEGORY_RANK: Record<string, number> = {
  frontrute: 1,
  bakrute: 2,
  dørglass: 3,
  'dørrute-frem': 3,
  'dørrute-bak': 4,
  sideglass: 5,
  siderute: 5,
  ventilrute: 6,
  annet: 99,
};

function RegnrResultsInner({ activeQuery, onClear, onDetail }: RegnrResultsProps) {
  const { openChat } = useChatStore();

  /* ---- query ---- */
  const [equipmentAnswers, setEquipmentAnswers] = useState<UserEquipmentAnswers>({});
  const [selectedPosition, setSelectedPosition] = useState<GlassPosition | null>(null);

  const query = useQuery({
    queryKey: ['search', 'regnr', activeQuery, equipmentAnswers, selectedPosition],
    queryFn: ({ signal }) => searchByRegnr(activeQuery, equipmentAnswers, selectedPosition || undefined, signal),
    enabled: activeQuery.length >= 2,
    retry: 1,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 5,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });

  const result = query.data;
  const vehicle = result?.vehicle;
  const candidates = result?.candidates ?? [];
  const conf = result?.confidence ? formatConfidence(result.confidence) : null;

  /* ---- filter state ---- */
  const [selectedCategory, setSelectedCategory] = useState<GlassCategory | null>(null);
  const [selectedDoorPlacement, setSelectedDoorPlacement] = useState<DoorPlacement | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [equipmentFiltered, setEquipmentFiltered] = useState<Product[] | null>(null);
  const [selectedEquipmentFilters, setSelectedEquipmentFilters] = useState<string[]>([]);

  /* ---- sorted + filtered products ---- */
  const sortedCandidates = useMemo(() => {
    return [...candidates].sort((a, b) => {
      const rankA = CATEGORY_RANK[a.category?.toLowerCase() || 'annet'] || 99;
      const rankB = CATEGORY_RANK[b.category?.toLowerCase() || 'annet'] || 99;
      if (rankA !== rankB) return rankA - rankB;
      return (b._score || 0) - (a._score || 0);
    });
  }, [candidates]);

  const baseProducts = useMemo(
    () => equipmentFiltered ?? sortedCandidates,
    [equipmentFiltered, sortedCandidates]
  );

  const selectionFilteredProducts = useMemo(() => {
    return baseProducts.filter((p) =>
      productMatchesGlassSelection(p, selectedCategory, selectedPosition, selectedDoorPlacement)
    );
  }, [baseProducts, selectedCategory, selectedPosition, selectedDoorPlacement]);

  const filteredProducts = useMemo(() => {
    let result = selectionFilteredProducts;
    if (selectedType) {
      result = result.filter((p) => (p.typeCode || 'Ukjent') === selectedType);
    }
    if (selectedEquipmentFilters.length > 0) {
      result = result.filter((p) => productMatchesEquipmentFilters(p, selectedEquipmentFilters));
    }
    return result;
  }, [selectedType, selectionFilteredProducts, selectedEquipmentFilters]);

  const deferredProducts = useDeferredValue(filteredProducts);

  /* ---- handlers ---- */
  const handleCategoryChange = useCallback((category: GlassCategory | null) => {
    setSelectedCategory(category);
    setSelectedPosition(null);
    setSelectedDoorPlacement(null);
    setSelectedType(null);
    setSelectedEquipmentFilters([]);
  }, []);

  const handlePositionChange = useCallback((position: GlassPosition | null) => {
    setSelectedPosition(position);
    setSelectedType(null);
  }, []);

  const handleDoorPlacementChange = useCallback((placement: DoorPlacement | null) => {
    setSelectedDoorPlacement(placement);
    setSelectedType(null);
  }, []);

  const handleEquipmentAnswersChange = useCallback((answers: UserEquipmentAnswers) => {
    setEquipmentAnswers(answers);
  }, []);

  /* ---- loading / no data guards ---- */
  if (query.isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="h-32 bg-gray-200 animate-pulse" />
            <div className="p-4 space-y-3">
              <div className="h-4 w-20 bg-gray-200 animate-pulse rounded" />
              <div className="h-5 w-full bg-gray-200 animate-pulse rounded" />
              <div className="h-4 w-3/4 bg-gray-200 animate-pulse rounded" />
              <div className="flex justify-between items-center pt-2">
                <div className="h-6 w-24 bg-gray-200 animate-pulse rounded" />
                <div className="h-10 w-28 bg-gray-200 animate-pulse rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!result || !vehicle) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
        <p className="font-medium text-amber-800">Ingen kjøretøy funnet</p>
        <p className="text-sm text-amber-700 mt-1">Kunne ikke finne kjøretøy for {activeQuery}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-slide-up">
      {/* Vehicle info */}
      <StickyVehicleHeader vehicle={vehicle} regnr={result.regnr} onChange={onClear} />
      <VehicleCard vehicle={vehicle} equipment={result.equipment} regnr={result.regnr} />
      <EUKontrollReminder nextEUDate={vehicle.nextEUDate} />
      {result.ktypeInfo && <KtypeInfoBadge ktypeInfo={result.ktypeInfo} />}
      {result.calibrationRequirements && result.calibrationRequirements.length > 0 && (
        <CalibrationInfoPanel requirements={result.calibrationRequirements} />
      )}
      {result.confidenceInfo && <ConfidenceBadge confidence={result.confidenceInfo} />}
      {!result.confidenceInfo && conf && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${conf.color}`}>
            {conf.label}
          </span>
          <span className="text-sm text-gray-500">{formatLayerLabel(result.layer)}</span>
        </div>
      )}

      {/* Chat CTA (mobile fixed, desktop static) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 sm:static sm:z-auto sm:mb-4">
        <button
          type="button"
          onClick={() => openChat({ regnr: activeQuery })}
          className="w-full flex items-center justify-center gap-2 bg-autoglass-blue px-4 py-4 text-base font-semibold text-white shadow-lg hover:bg-autoglass-dark transition-colors sm:rounded-xl sm:px-5 sm:py-3 min-h-[48px]"
        >
          <MessageCircle className="h-5 w-5" />
          Spør Professor Autoglass
        </button>
      </div>

      {/* AI Glassvelger CTA */}
      {candidates.length > 5 && result.confidence !== 'exact' && (
        <div className="rounded-xl border border-autoglass-blue/20 bg-autoglass-blue/5 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-autoglass-blue text-white flex-shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Usikker på hvilket glass du trenger?</h3>
                <p className="text-sm text-gray-600 mt-0.5">La AI Glassvelgeren stille deg 3–5 spørsmål og finne eksakt riktig glass.</p>
              </div>
            </div>
            <Link
              to={`/glass-guide?regnr=${encodeURIComponent(activeQuery)}${selectedCategory ? `&category=${encodeURIComponent(selectedCategory)}` : ''}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-autoglass-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-autoglass-blue/90 transition flex-shrink-0"
            >
              <Wrench className="w-4 h-4" />
              Start AI Glassvelger
            </Link>
          </div>
        </div>
      )}

      {/* Equipment verifier */}
      {result.confidenceInfo && result.confidenceInfo.score < 90 && candidates.length > 1 && (
        <Suspense fallback={null}>
          <EquipmentVerifier
            products={candidates}
            onFilter={setEquipmentFiltered}
            onAnswersChange={handleEquipmentAnswersChange}
          />
        </Suspense>
      )}

      {/* Equipment filter message */}
      {result.equipmentFilter?.applied && (
        <div className={`rounded-lg border p-3 text-sm ${
          result.equipmentFilter.showingUncertainFallback
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-green-200 bg-green-50 text-green-800'
        }`}>
          {result.equipmentFilter.showingUncertainFallback ? (
            <p className="font-medium">
              {result.equipmentFilter.message || 'Ingen eksakte treff med valgte utstyr. Viser usikre alternativer.'}
            </p>
          ) : (
            <p className="font-medium">
              {result.equipmentFilter.exactCount ?? candidates.length} glass matcher valgte utstyr.
            </p>
          )}
          {typeof result.equipmentFilter.uncertainCount === 'number' && result.equipmentFilter.uncertainCount > 0 && (
            <p className="mt-1 text-xs opacity-80">
              {result.equipmentFilter.uncertainCount} usikre alternativ er holdt utenfor trefflisten.
            </p>
          )}
        </div>
      )}

      {/* Accessory suggestions */}
      {selectedType && selectionFilteredProducts.some((p) => (p.typeCode || 'Ukjent') === selectedType) && (
        <Suspense fallback={null}>
          <AccessorySuggestions typeCode={selectedType} accessories={result?.accessories} />
        </Suspense>
      )}

      {/* Filters */}
      {candidates.length > 0 && (
        <GlassNeedSelector
          products={baseProducts}
          activeCategory={selectedCategory}
          activePosition={selectedPosition}
          activeDoorPlacement={selectedDoorPlacement}
          onCategoryChange={handleCategoryChange}
          onPositionChange={handlePositionChange}
          onDoorPlacementChange={handleDoorPlacementChange}
        />
      )}
      {candidates.length > 0 && (
        <TypeCodeTabs products={selectionFilteredProducts} activeType={selectedType} onSelect={setSelectedType} />
      )}
      {candidates.length > 0 && (
        <EquipmentFilterPanel
          products={selectionFilteredProducts}
          selectedKeys={selectedEquipmentFilters}
          onChange={setSelectedEquipmentFilters}
        />
      )}

      {/* Active filter badges */}
      {(selectedCategory || selectedPosition || selectedDoorPlacement || selectedType || equipmentFiltered || selectedEquipmentFilters.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {selectedCategory && (
            <span className="inline-flex items-center gap-1 rounded-full bg-autoglass-blue/10 border border-autoglass-blue/20 px-3 py-1 text-xs font-medium text-autoglass-blue">
              {selectedCategory === 'frontrute' ? 'Frontrute' : selectedCategory === 'bakrute' ? 'Bakrute' : selectedCategory === 'dørglass' ? 'Dørrute' : 'Siderute'}
              <button type="button" onClick={() => handleCategoryChange(null)} className="hover:text-autoglass-blue/70"><X className="h-3 w-3" /></button>
            </span>
          )}
          {selectedPosition && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700">
              {selectedPosition === 'driver' ? 'Venstre / fører' : 'Høyre / passasjer'}
              <button type="button" onClick={() => handlePositionChange(null)} className="hover:text-blue-500"><X className="h-3 w-3" /></button>
            </span>
          )}
          {selectedDoorPlacement && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
              {selectedDoorPlacement === 'front' ? 'Foran' : 'Bak'}
              <button type="button" onClick={() => handleDoorPlacementChange(null)} className="hover:text-slate-500"><X className="h-3 w-3" /></button>
            </span>
          )}
          {selectedType && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700">
              {selectedType}
              <button type="button" onClick={() => setSelectedType(null)} className="hover:text-gray-500"><X className="h-3 w-3" /></button>
            </span>
          )}
          {selectedEquipmentFilters.map((key) => {
            const label = key === 'solar' ? 'Coated / IR-glass / Solfilm' : key;
            return (
              <span key={key} className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700">
                {label}
                <button
                  type="button"
                  onClick={() => setSelectedEquipmentFilters((prev) => prev.filter((k) => k !== key))}
                  className="hover:text-amber-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          {equipmentFiltered && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs font-medium text-green-700">
              Utstyr: {equipmentFiltered.length} treff
              <button type="button" onClick={() => setEquipmentFiltered(null)} className="hover:text-green-500"><X className="h-3 w-3" /></button>
            </span>
          )}
          {(selectedCategory || selectedPosition || selectedDoorPlacement || selectedType || equipmentFiltered || selectedEquipmentFilters.length > 0) && (
            <button
              type="button"
              onClick={() => {
                handleCategoryChange(null);
                setSelectedType(null);
                setEquipmentFiltered(null);
                setSelectedEquipmentFilters([]);
              }}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Nullstill alle
            </button>
          )}
        </div>
      )}

      {/* Product grid */}
      {deferredProducts.length > 0 && (
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
            {deferredProducts.length} resultat{deferredProducts.length !== 1 ? 'er' : ''}
          </h3>
          <VirtualProductGrid
            products={deferredProducts}
            getKey={(product) => String(product.id)}
            renderItem={(product) => (
              <ProductCard
                key={product.id}
                product={product}
                onDetail={onDetail}
                searchRegnr={result?.regnr}
                searchKtype={vehicle?.k_type}
                searchLayer={result?.layer}
              />
            )}
          />
        </div>
      )}

      {/* No products after filtering */}
      {deferredProducts.length === 0 && candidates.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
          <p className="font-medium text-amber-800">Ingen glass i denne kategorien</p>
          <p className="text-sm text-amber-700 mt-1">Prøv en annen fane eller fjern filteret.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              handleCategoryChange(null);
              setSelectedType(null);
              setEquipmentFiltered(null);
              setSelectedEquipmentFilters([]);
            }}
          >
            Vis alle
          </Button>
        </div>
      )}

      {/* No candidates at all */}
      {candidates.length === 0 && !query.isLoading && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
          <p className="font-medium text-amber-800">Ingen glass funnet</p>
          <p className="text-sm text-amber-700 mt-1">Vi fant kjøretøyet, men har ingen registrerte glass som passer. Prøv å søke i katalogen manuelt.</p>
          <a href="/bla">
            <Button variant="outline" className="mt-4">Bla i katalogen</Button>
          </a>
        </div>
      )}

      <div className="text-center pt-2">
        <button type="button" onClick={onClear} className="text-sm text-autoglass-blue hover:underline">
          Ikke riktig kjøretøy? Søk på nytt
        </button>
      </div>
    </div>
  );
}

export const RegnrResults = memo(RegnrResultsInner);
