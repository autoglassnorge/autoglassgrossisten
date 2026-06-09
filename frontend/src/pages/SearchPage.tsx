import { useState, useEffect, useMemo, lazy, Suspense, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertTriangle, Car, Wrench, X, Sparkles, MessageCircle } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';

import { Skeleton } from '@/components/ui/Skeleton';
import { PageMeta } from '@/components/seo/PageMeta';
import { Button } from '@/components/ui/Button';
import { searchByRegnr, searchByEurocode, searchBySku, searchByOem, searchCatalogText, SearchError } from '@/api/glass';
import { formatLayerLabel, formatConfidence } from '@/utils/formatters';

import { VehicleCard } from '@/components/search/VehicleCard';
import { StickyVehicleHeader } from '@/components/search/StickyVehicleHeader';
import { KtypeInfoBadge } from '@/components/search/KtypeInfoBadge';
import { CalibrationInfoPanel } from '@/components/search/CalibrationInfoPanel';
import { ConfidenceBadge } from '@/components/search/ConfidenceBadge';
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
import type { Product, CatalogResponse } from '@/types/api';

import { detectInputType, getPlaceholderForType, type InputType } from '@/components/search/UnifiedSearch/InputTypeDetector';
import {
  RegnrSearchIcon,
  EurocodeSearchIcon,
  OeNumberSearchIcon,
  VehicleWizardIcon,
  ProfessorSearchIcon,
  SearchLensIcon,
  BarcodeIcon,
} from '@/components/icons/SearchIcons';

const VehicleWizard = lazy(() =>
  import('@/components/search/VehicleWizard').then((m) => ({ default: m.VehicleWizard }))
);

const ProductDetail = lazy(() =>
  import('@/components/catalog/ProductDetail').then((m) => ({ default: m.ProductDetail }))
);

const RECENT_SEARCHES_KEY = 'ag_recent_searches';
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(query: string) {
  const normalized = query.trim();
  if (normalized.length < 2) return;
  const existing = getRecentSearches().filter((r) => r.toLowerCase() !== normalized.toLowerCase());
  const next = [normalized, ...existing].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
}

/* ------------------------------------------------------------------ */
//  Identifier-search result shape (eurocode / SKU / OE)
/* ------------------------------------------------------------------ */
interface IdentifierResult {
  queryType: InputType;
  queryValue: string;
  count: number;
  results: Product[];
}

/* ------------------------------------------------------------------ */
//  Main component
/* ------------------------------------------------------------------ */
export default function SearchPage() {
  const { openChat } = useChatStore();
  const [searchParams, setSearchParams] = useSearchParams();

  /* ---- unified input state ---- */
  const initialQuery = searchParams.get('q') ?? '';
  const [inputValue, setInputValue] = useState(initialQuery);
  const [detectedType, setDetectedType] = useState<InputType>('empty');
  const [activeQuery, setActiveQuery] = useState('');
  const [activeQueryType, setActiveQueryType] = useState<InputType>('empty');
  const [showRecent, setShowRecent] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ---- regnr-specific state (kept for backward compat) ---- */
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [equipmentFiltered, setEquipmentFiltered] = useState<Product[] | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  /* ---- auto-detect input type ---- */
  useEffect(() => {
    const detected = detectInputType(inputValue);
    setDetectedType(detected.type);
  }, [inputValue]);

  /* ---- regnr search (existing tanstack-query) ---- */
  const regnrQuery = useQuery({
    queryKey: ['search', 'regnr', activeQuery],
    queryFn: () => searchByRegnr(activeQuery),
    enabled: activeQueryType === 'regnr' && activeQuery.length >= 2,
    retry: 1,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 5,
  });

  /* ---- eurocode search ---- */
  const eurocodeQuery = useQuery({
    queryKey: ['search', 'eurocode', activeQuery],
    queryFn: () => searchByEurocode(activeQuery),
    enabled: activeQueryType === 'eurocode' && activeQuery.length >= 4,
    retry: 1,
  });

  /* ---- SKU search ---- */
  const skuQuery = useQuery({
    queryKey: ['search', 'sku', activeQuery],
    queryFn: () => searchBySku(activeQuery),
    enabled: activeQueryType === 'sku' && activeQuery.length >= 4,
    retry: 1,
  });

  /* ---- OE search ---- */
  const oeQuery = useQuery({
    queryKey: ['search', 'oe', activeQuery],
    queryFn: () => searchByOem(activeQuery),
    enabled: activeQueryType === 'oe' && activeQuery.length >= 4,
    retry: 1,
  });

  /* ---- text/catalog search ---- */
  const textQuery = useQuery({
    queryKey: ['search', 'text', activeQuery],
    queryFn: () => searchCatalogText(activeQuery),
    enabled: activeQueryType === 'text' && activeQuery.length >= 3,
    retry: 1,
  });

  /* ---- derive unified loading / error / data ---- */
  const isLoading =
    (activeQueryType === 'regnr' && regnrQuery.isLoading) ||
    (activeQueryType === 'eurocode' && eurocodeQuery.isLoading) ||
    (activeQueryType === 'sku' && skuQuery.isLoading) ||
    (activeQueryType === 'oe' && oeQuery.isLoading) ||
    (activeQueryType === 'text' && textQuery.isLoading);

  const searchError =
    (activeQueryType === 'regnr' ? regnrQuery.error : null) ||
    (activeQueryType === 'eurocode' ? eurocodeQuery.error : null) ||
    (activeQueryType === 'sku' ? skuQuery.error : null) ||
    (activeQueryType === 'oe' ? oeQuery.error : null) ||
    (activeQueryType === 'text' ? textQuery.error : null);

  /* ---- identifier results (eurocode / sku / oe) ---- */
  const identifierResult: IdentifierResult | null = useMemo(() => {
    if (activeQueryType === 'eurocode' && eurocodeQuery.data) {
      return {
        queryType: 'eurocode',
        queryValue: activeQuery,
        count: eurocodeQuery.data.count,
        results: (eurocodeQuery.data.results as Product[]) || [],
      };
    }
    if (activeQueryType === 'sku' && skuQuery.data) {
      return {
        queryType: 'sku',
        queryValue: activeQuery,
        count: skuQuery.data.count,
        results: (skuQuery.data.results as Product[]) || [],
      };
    }
    if (activeQueryType === 'oe' && oeQuery.data) {
      return {
        queryType: 'oe',
        queryValue: activeQuery,
        count: oeQuery.data.count,
        results: (oeQuery.data.results as Product[]) || [],
      };
    }
    return null;
  }, [activeQueryType, activeQuery, eurocodeQuery.data, skuQuery.data, oeQuery.data]);

  /* ---- catalog text results ---- */
  const catalogResult: CatalogResponse | null = textQuery.data ?? null;

  /* ---- regnr result (existing shape) ---- */
  const regnrResult = regnrQuery.data;
  const vehicle = regnrResult?.vehicle;
  const candidates = regnrResult?.candidates ?? [];
  const conf = regnrResult?.confidence ? formatConfidence(regnrResult.confidence) : null;

  /* ---- submit handler ---- */
  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed.length < 2) return;

    const detected = detectInputType(trimmed);
    setActiveQuery(trimmed);
    setActiveQueryType(detected.type);
    setShowRecent(false);
    addRecentSearch(trimmed);

    // Update URL
    const params = new URLSearchParams();
    params.set('q', trimmed);
    setSearchParams(params);

    // Reset filters
    setSelectedType(null);
    setSelectedCategory(null);
    setEquipmentFiltered(null);
  }, [inputValue, setSearchParams]);

  /* ---- quick-action focus helpers ---- */
  const focusWithHint = useCallback((_hint: string, example: string) => {
    setInputValue(example);
    inputRef.current?.focus();
  }, []);

  /* ---- clear handler ---- */
  const handleClear = useCallback(() => {
    setInputValue('');
    setActiveQuery('');
    setActiveQueryType('empty');
    setSearchParams({});
    setShowRecent(false);
    setSelectedType(null);
    setSelectedCategory(null);
    setEquipmentFiltered(null);
  }, [setSearchParams]);

  /* ---- recent search select ---- */
  const handleSelectRecent = useCallback((r: string) => {
    setInputValue(r);
    const detected = detectInputType(r);
    setActiveQuery(r);
    setActiveQueryType(detected.type);
    setShowRecent(false);
    addRecentSearch(r);
    const params = new URLSearchParams();
    params.set('q', r);
    setSearchParams(params);
  }, [setSearchParams]);

  /* ---- sync from URL ---- */
  useEffect(() => {
    const urlQ = searchParams.get('q') ?? '';
    if (urlQ && urlQ !== activeQuery) {
      setInputValue(urlQ);
      const detected = detectInputType(urlQ);
      setActiveQuery(urlQ);
      setActiveQueryType(detected.type);
    }
  }, [searchParams, activeQuery]);

  /* ---- category ranking ---- */
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
      return (b._score || 0) - (a._score || 0);
    });
  }, [candidates]);

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

  /* ---- error helpers ---- */
  const errorStatus = searchError instanceof SearchError ? searchError.status : undefined;
  const isNotFound = errorStatus === 404;
  const isUpstreamError = errorStatus === 503;
  const isInternalError = errorStatus === 500;

  const recentSearches = getRecentSearches();

  /* ---- type badge colour ---- */
  const typeBadgeColor: Record<InputType, string> = {
    regnr: 'bg-amber-50 text-amber-700 border-amber-200',
    eurocode: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    sku: 'bg-blue-50 text-blue-700 border-blue-200',
    oe: 'bg-purple-50 text-purple-700 border-purple-200',
    vin: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    text: 'bg-gray-50 text-gray-600 border-gray-200',
    empty: '',
  };

  return (
    <>
      <PageMeta
        title="Søk — finn riktig bilglass"
        description="Søk med registreringsnummer, Eurocode, OE-nummer, VIN, eller merke/modell for å finne eksakt bilglass. Med ADAS-kompatibilitet, regnsensor og kalibrering."
        canonicalPath="/sok"
      />
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">

        {/* ─── Header ─── */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mb-2">
            Søk etter bilglass
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Skriv inn regnr, Eurocode, OE-nummer, VIN — eller beskriv glasset du trenger.
          </p>
        </div>

        {/* ─── Unified Search Bar ─── */}
        <div className="relative mb-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
              {/* Leading icon */}
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                {detectedType === 'regnr' ? <RegnrSearchIcon className="h-5 w-5" /> :
                 detectedType === 'eurocode' ? <EurocodeSearchIcon className="h-5 w-5" /> :
                 detectedType === 'sku' ? <BarcodeIcon className="h-5 w-5" /> :
                 detectedType === 'oe' ? <OeNumberSearchIcon className="h-5 w-5" /> :
                 detectedType === 'vin' ? <Car className="h-5 w-5" /> :
                 <SearchLensIcon className="h-5 w-5" />}
              </div>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onFocus={() => setShowRecent(true)}
                placeholder={getPlaceholderForType(detectedType)}
                className="w-full h-14 pl-11 pr-24 text-lg bg-white border border-gray-300 rounded-xl
                           focus:outline-none focus:ring-2 focus:ring-autoglass-blue/30 focus:border-autoglass-blue
                           transition shadow-sm"
                autoComplete="off"
              />
              {/* Type badge + clear */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {inputValue && (
                  <button
                    type="button"
                    onClick={() => { setInputValue(''); inputRef.current?.focus(); }}
                    className="p-1 text-gray-400 hover:text-gray-600 transition"
                    aria-label="Tøm søkefelt"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {detectedType !== 'empty' && (
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border hidden sm:inline-block ${typeBadgeColor[detectedType]}`}>
                    {detectedType === 'regnr' ? 'Regnr' :
                     detectedType === 'eurocode' ? 'Eurocode' :
                     detectedType === 'sku' ? 'SKU' :
                     detectedType === 'oe' ? 'OE' :
                     detectedType === 'vin' ? 'VIN' :
                     detectedType === 'text' ? 'Fritekst' : ''}
                  </span>
                )}
              </div>
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-14 px-5 sm:px-6 gap-2 flex-shrink-0 rounded-xl"
              disabled={isLoading || inputValue.trim().length < 2}
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <SearchLensIcon className="h-5 w-5" />}
              <span className="hidden sm:inline">Søk</span>
            </Button>
          </form>

          {/* Recent searches dropdown */}
          {showRecent && recentSearches.length > 0 && !activeQuery && (
            <div
              className="absolute z-50 w-full mt-2 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                Siste søk
              </div>
              {recentSearches.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleSelectRecent(r)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
                >
                  <SearchLensIcon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  <span className="font-mono">{r}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── Quick Action Buttons ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 mb-6 sm:mb-8">
          <button
            type="button"
            onClick={() => focusWithHint('regnr', '')}
            className="group flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3
                       hover:border-amber-300 hover:bg-amber-50/50 transition text-center"
          >
            <RegnrSearchIcon className="h-7 w-7 text-gray-600 group-hover:text-amber-600 transition" />
            <span className="text-xs font-medium text-gray-700 group-hover:text-amber-700">Regnr</span>
          </button>
          <button
            type="button"
            onClick={() => focusWithHint('eurocode', '')}
            className="group flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3
                       hover:border-emerald-300 hover:bg-emerald-50/50 transition text-center"
          >
            <EurocodeSearchIcon className="h-7 w-7 text-gray-600 group-hover:text-emerald-600 transition" />
            <span className="text-xs font-medium text-gray-700 group-hover:text-emerald-700">Eurocode</span>
          </button>
          <button
            type="button"
            onClick={() => focusWithHint('oe', '')}
            className="group flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3
                       hover:border-purple-300 hover:bg-purple-50/50 transition text-center"
          >
            <OeNumberSearchIcon className="h-7 w-7 text-gray-600 group-hover:text-purple-600 transition" />
            <span className="text-xs font-medium text-gray-700 group-hover:text-purple-700">OE-nummer</span>
          </button>
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="group flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3
                       hover:border-autoglass-blue/30 hover:bg-autoglass-blue/5 transition text-center"
          >
            <VehicleWizardIcon className="h-7 w-7 text-gray-600 group-hover:text-autoglass-blue transition" />
            <span className="text-xs font-medium text-gray-700 group-hover:text-autoglass-blue">Merke / modell</span>
          </button>
          <button
            type="button"
            onClick={() => openChat()}
            className="group flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3
                       hover:border-gray-400 hover:bg-gray-50 transition text-center"
          >
            <ProfessorSearchIcon className="h-7 w-7 text-gray-600 group-hover:text-gray-800 transition" />
            <span className="text-xs font-medium text-gray-700 group-hover:text-gray-900">Professor</span>
          </button>
        </div>

        {/* ─── Loading Skeleton ─── */}
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

        {/* ─── Error States ─── */}
        {searchError && !isLoading && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 sm:p-6 mb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                {isNotFound ? (
                  <>
                    <p className="font-medium text-red-800">Ingen treff</p>
                    <p className="text-sm text-red-700 mt-1">
                      <strong>{activeQuery}</strong> ble ikke funnet i vårt register.
                    </p>
                  </>
                ) : isUpstreamError ? (
                  <>
                    <p className="font-medium text-red-800">Tjeneste midlertidig utilgjengelig</p>
                    <p className="text-sm text-red-700 mt-1">
                      Vi får ikke kontakt med et nødvendig system akkurat nå. Prøv igjen om litt.
                    </p>
                  </>
                ) : isInternalError ? (
                  <>
                    <p className="font-medium text-red-800">En teknisk feil oppstod</p>
                    <p className="text-sm text-red-700 mt-1">
                      Det oppstod en feil under søket. Vi har logget feilen og jobber med å rette den.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-red-800">Søk feilet</p>
                    <p className="text-sm text-red-700 mt-1">{searchError instanceof Error ? searchError.message : 'Ukjent feil'}</p>
                  </>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={handleClear} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                <Wrench className="h-4 w-4" />
                Prøv på nytt
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            REGNR RESULTS (existing full experience)
            ═══════════════════════════════════════════════════════════ */}
        {activeQueryType === 'regnr' && regnrResult && vehicle && (
          <div className="space-y-4 sm:space-y-6 animate-slide-up">
            <StickyVehicleHeader vehicle={vehicle} regnr={regnrResult.regnr} onChange={handleClear} />
            <VehicleCard vehicle={vehicle} equipment={regnrResult.equipment} regnr={regnrResult.regnr} />
            <EUKontrollReminder nextEUDate={vehicle.nextEUDate} />
            {regnrResult.ktypeInfo && <KtypeInfoBadge ktypeInfo={regnrResult.ktypeInfo} />}
            {regnrResult.calibrationRequirements && regnrResult.calibrationRequirements.length > 0 && (
              <CalibrationInfoPanel requirements={regnrResult.calibrationRequirements} />
            )}
            {regnrResult.confidenceInfo && <ConfidenceBadge confidence={regnrResult.confidenceInfo} />}
            {!regnrResult.confidenceInfo && conf && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${conf.color}`}>
                  {conf.label}
                </span>
                <span className="text-sm text-gray-500">{formatLayerLabel(regnrResult.layer)}</span>
              </div>
            )}

            {/* Chat CTA */}
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

            {candidates.length > 5 && regnrResult.confidence !== 'exact' && (
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
                  <Link to={`/glass-guide?regnr=${encodeURIComponent(activeQuery)}${selectedCategory ? `&category=${encodeURIComponent(selectedCategory)}` : ''}`}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-autoglass-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-autoglass-blue/90 transition flex-shrink-0">
                    <Wrench className="w-4 h-4" />
                    Start AI Glassvelger
                  </Link>
                </div>
              </div>
            )}

            {regnrResult.confidenceInfo && regnrResult.confidenceInfo.score < 90 && candidates.length > 1 && (
              <Suspense fallback={null}>
                <EquipmentVerifier products={candidates} onFilter={setEquipmentFiltered} />
              </Suspense>
            )}

            {selectedType && candidates.some((p) => (p.typeCode || 'Ukjent') === selectedType) && (
              <Suspense fallback={null}>
                <AccessorySuggestions typeCode={selectedType} />
              </Suspense>
            )}

            {candidates.length > 0 && (
              <GlassCategoryFilter products={sortedCandidates} activeCategory={selectedCategory} onSelect={setSelectedCategory} />
            )}
            {candidates.length > 0 && (
              <TypeCodeTabs products={candidates} activeType={selectedType} onSelect={setSelectedType} />
            )}

            {(selectedCategory || selectedType || equipmentFiltered) && (
              <div className="flex flex-wrap gap-2">
                {selectedCategory && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-autoglass-blue/10 border border-autoglass-blue/20 px-3 py-1 text-xs font-medium text-autoglass-blue">
                    {selectedCategory}
                    <button type="button" onClick={() => setSelectedCategory(null)} className="hover:text-autoglass-blue/70"><X className="h-3 w-3" /></button>
                  </span>
                )}
                {selectedType && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700">
                    {selectedType}
                    <button type="button" onClick={() => setSelectedType(null)} className="hover:text-gray-500"><X className="h-3 w-3" /></button>
                  </span>
                )}
                {equipmentFiltered && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs font-medium text-green-700">
                    Utstyr: {equipmentFiltered.length} treff
                    <button type="button" onClick={() => setEquipmentFiltered(null)} className="hover:text-green-500"><X className="h-3 w-3" /></button>
                  </span>
                )}
                {(selectedCategory || selectedType || equipmentFiltered) && (
                  <button type="button" onClick={() => { setSelectedCategory(null); setSelectedType(null); setEquipmentFiltered(null); }} className="text-xs text-gray-500 hover:text-gray-700 underline">Nullstill alle</button>
                )}
              </div>
            )}

            {filteredProducts.length > 0 && (
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">{filteredProducts.length} resultat{filteredProducts.length !== 1 ? 'er' : ''}</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredProducts.map((product) => (
                    <ProductCard key={product.id} product={product} onDetail={setDetailProduct}
                      searchContext={regnrResult?.regnr ? { regnr: regnrResult.regnr, kType: vehicle?.k_type, layer: regnrResult?.layer, score: product._score } : undefined} />
                  ))}
                </div>
              </div>
            )}

            {filteredProducts.length === 0 && candidates.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
                <p className="font-medium text-amber-800">Ingen glass i denne kategorien</p>
                <p className="text-sm text-amber-700 mt-1">Prøv en annen fane eller fjern filteret.</p>
                <Button variant="outline" className="mt-4" onClick={() => setSelectedType(null)}>Vis alle</Button>
              </div>
            )}

            <div className="text-center pt-2">
              <button type="button" onClick={handleClear} className="text-sm text-autoglass-blue hover:underline">Ikke riktig kjøretøy? Søk på nytt</button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            IDENTIFIER RESULTS (eurocode / SKU / OE)
            ═══════════════════════════════════════════════════════════ */}
        {identifierResult && !isLoading && (
          <div className="space-y-4 animate-slide-up">
            <div className="flex items-center gap-3">
              {identifierResult.queryType === 'eurocode' && <EurocodeSearchIcon className="h-6 w-6 text-emerald-600" />}
              {identifierResult.queryType === 'sku' && <BarcodeIcon className="h-6 w-6 text-blue-600" />}
              {identifierResult.queryType === 'oe' && <OeNumberSearchIcon className="h-6 w-6 text-purple-600" />}
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {identifierResult.queryType === 'eurocode' ? 'Eurocode-søk' :
                   identifierResult.queryType === 'sku' ? 'Artikkelnummer-søk' :
                   'OE-nummer-søk'}
                </h2>
                <p className="text-sm text-gray-500 font-mono">{identifierResult.queryValue}</p>
              </div>
            </div>

            {identifierResult.count === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
                <p className="font-medium text-amber-800">Ingen treff</p>
                <p className="text-sm text-amber-700 mt-1">Vi fant ingen produkter som matcher {identifierResult.queryValue}.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">{identifierResult.count} produkt{identifierResult.count !== 1 ? 'er' : ''} funnet</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {identifierResult.results.map((product) => (
                    <ProductCard key={product.id} product={product} onDetail={setDetailProduct} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            CATALOG TEXT RESULTS
            ═══════════════════════════════════════════════════════════ */}
        {activeQueryType === 'text' && catalogResult && !isLoading && (
          <div className="space-y-4 animate-slide-up">
            <div className="flex items-center gap-3">
              <SearchLensIcon className="h-6 w-6 text-gray-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Katalogsøk</h2>
                <p className="text-sm text-gray-500">"{activeQuery}"</p>
              </div>
            </div>

            {catalogResult.total === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
                <p className="font-medium text-amber-800">Ingen treff</p>
                <p className="text-sm text-amber-700 mt-1">Prøv et annet søkeord, eller spør Professor Autoglass.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">{catalogResult.total} produkt{catalogResult.total !== 1 ? 'er' : ''} funnet</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {catalogResult.products.map((product) => (
                    <ProductCard key={product.id} product={product} onDetail={setDetailProduct} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            NO RESULTS (regnr found vehicle but no glass)
            ═══════════════════════════════════════════════════════════ */}
        {activeQueryType === 'regnr' && regnrResult && candidates.length === 0 && !isLoading && !searchError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
            <p className="font-medium text-amber-800">Ingen glass funnet</p>
            <p className="text-sm text-amber-700 mt-1">Vi fant kjøretøyet, men har ingen registrerte glass som passer. Prøv å søke i katalogen manuelt.</p>
            <a href="/bla">
              <Button variant="outline" className="mt-4">Bla i katalogen</Button>
            </a>
          </div>
        )}

        {/* ─── Product detail modal ─── */}
        <Suspense fallback={null}>
          <ProductDetail product={detailProduct} onClose={() => setDetailProduct(null)} />
        </Suspense>

        {/* ─── Vehicle Wizard Modal ─── */}
        {showWizard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowWizard(false)}>
            <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-2xl p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Finn glass via merke og modell</h2>
                <button type="button" onClick={() => setShowWizard(false)} className="p-2 text-gray-400 hover:text-gray-600 transition rounded-lg hover:bg-gray-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <Suspense fallback={
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-autoglass-blue" />
                </div>
              }>
                <VehicleWizard onComplete={() => setShowWizard(false)} />
              </Suspense>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
