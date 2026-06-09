import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Package, Filter } from 'lucide-react';
import { PageMeta } from '@/components/seo/PageMeta';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { BrandGrid } from '@/components/browse/BrandGrid';
import { ModelCards } from '@/components/browse/ModelCards';
import { YearTimeline } from '@/components/browse/YearTimeline';

// Importer alle browse-komponenter
import BrowseHeader from '@/components/browse/BrowseHeader';
import { FilterPanel } from '@/components/browse/FilterPanel';
import { ProductCard } from '@/components/browse/ProductCard';
import { ProductGrid } from '@/components/browse/ProductGrid';
import { QuickViewModal } from '@/components/browse/QuickViewModal';
import { CompareBar } from '@/components/browse/CompareBar';
import { CompareModal } from '@/components/browse/CompareModal';
import { useProductComparison } from '@/hooks/useProductComparison';

interface BrowseProduct {
  title: string;
  sku: string | null;
  typeCode: string | null;
  typeCodeRel: string | null;
  price: number | null;
}

interface BrowseYearEntry {
  url: string;
  products: BrowseProduct[];
}

interface BrowseModelData {
  [yearKey: string]: BrowseYearEntry;
}

interface BrowseBrandData {
  name: string;
  models: {
    [model: string]: BrowseModelData;
  };
}

interface BrandInfo {
  name: string;
  productCount: number;
}

// Type for browse step
type BrowseStep = {
  id: 'brand' | 'model' | 'year' | 'products';
  label: string;
  description: string;
};

// Mapping from ?category= query param to typeCode matcher
const CATEGORY_FILTERS: Record<string, (typeCode: string) => boolean> = {
  'frontrute': (tc) => tc === 'Frontrute',
  'bakrute': (tc) => tc === 'Bakrute',
  'dørglass-frem': (tc) => tc.startsWith('Dørrute fremre'),
  'dørglass-bak': (tc) => tc.startsWith('Dørrute bakre'),
  'sideglass': (tc) => tc.includes('Siderute') || tc.includes('Ventil'),
};

export default function BrowsePage() {
  const [searchParams] = useSearchParams();
  const categoryParam = searchParams.get('category');

  const [brands, setBrands] = useState<BrandInfo[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [brandData, setBrandData] = useState<BrowseBrandData | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // === NY STATE FOR FILTER OG PRODUKTVISNING ===
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [quickViewProduct, setQuickViewProduct] = useState<BrowseProduct | null>(null);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false); // Mobil filter drawer
  
  // Produkt-sammenligning hook
  const { selectedProducts, toggleProduct, isSelected, clearAll, removeProduct } = useProductComparison();
  // =============================================

  // Load brands list from KV via Worker API
  useEffect(() => {
    setApiError(null);
    fetch('/browse/brands.json')
      .then(r => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        return r.json();
      })
      .then(data => {
        if (data && data.brands) {
          setBrands(data.brands);
        } else {
          setApiError('Ingen merker funnet i katalogen.');
        }
        setLoadingBrands(false);
      })
      .catch(err => {
        console.error('Browse brands error:', err);
        setApiError('Kunne ikke laste merker. Prøv igjen senere.');
        setLoadingBrands(false);
      });
  }, []);

  // Load brand data when brand selected
  useEffect(() => {
    if (!selectedBrand) {
      setBrandData(null);
      setSelectedModel('');
      setSelectedYear('');
      return;
    }
    setLoading(true);
    setApiError(null);

    const safeName = selectedBrand.replace(/\//g, '-').replace(/ /g, '_');
    fetch(`/browse/${safeName}.json`)
      .then(r => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        return r.json();
      })
      .then(data => {
        if (data) {
          setBrandData(data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Browse brand error:', err);
        setApiError(`Kunne ikke laste data for ${selectedBrand}.`);
        setLoading(false);
      });
  }, [selectedBrand]);

  // Reset model/year when brand changes
  useEffect(() => {
    setSelectedModel('');
    setSelectedYear('');
    // Reset filter state også
    setSearchQuery('');
    setSelectedCategories([]);
    clearAll();
  }, [selectedBrand, clearAll]);

  useEffect(() => {
    setSelectedYear('');
  }, [selectedModel]);

  // Build model info with product counts and year ranges
  const modelInfos = useMemo(() => {
    if (!brandData) return [];
    return Object.entries(brandData.models).map(([name, yearData]) => {
      const years = Object.keys(yearData);
      const allProducts = years.flatMap(y => yearData[y]?.products || []);
      const yearNums = years.map(y => parseInt(y, 10)).filter(n => !isNaN(n));
      const yearRange = yearNums.length > 0
        ? `${Math.min(...yearNums)}–${Math.max(...yearNums)}`
        : '';
      return {
        name,
        productCount: allProducts.length,
        yearRange,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [brandData]);

  const years = useMemo(() => {
    if (!brandData || !selectedModel) return [];
    return Object.keys(brandData.models[selectedModel] || {}).sort();
  }, [brandData, selectedModel]);

  const currentProducts = useMemo(() => {
    if (!brandData || !selectedModel || !selectedYear) return [];
    return brandData.models[selectedModel]?.[selectedYear]?.products || [];
  }, [brandData, selectedModel, selectedYear]);

  // Auto-select category filter from ?category= URL param when products load
  useEffect(() => {
    if (!categoryParam) return;
    if (!currentProducts.length) return;
    if (selectedCategories.length > 0) return; // Don't override manual selection

    const matcher = CATEGORY_FILTERS[categoryParam];
    if (!matcher) return;

    const matchedTypeCodes = [...new Set(
      currentProducts
        .map(p => p.typeCode)
        .filter((tc): tc is string => Boolean(tc))
        .filter(tc => matcher(tc))
    )];

    if (matchedTypeCodes.length > 0) {
      setSelectedCategories(matchedTypeCodes);
    }
  }, [currentProducts, categoryParam, selectedCategories.length]);

  // === FILTER LOGIKK FOR PRODUKTER ===
  const filteredProducts = useMemo(() => {
    let result = currentProducts;
    
    // Filtrer på søk
    if (searchQuery) {
      result = result.filter(p => 
        p.title?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Filtrer på kategori (typeCode)
    if (selectedCategories.length > 0) {
      result = result.filter(p => 
        selectedCategories.includes(p.typeCode || '')
      );
    }
    
    return result;
  }, [currentProducts, searchQuery, selectedCategories]);

  // Tilgjengelige kategorier basert på nåværende produkter
  const availableCategories = useMemo(() => {
    const categories = new Set<string>();
    currentProducts.forEach(p => {
      if (p.typeCode) categories.add(p.typeCode);
    });
    return Array.from(categories).sort();
  }, [currentProducts]);
  // ====================================

  // Nåværende step for BrowseHeader
  const currentStep: BrowseStep = useMemo(() => {
    if (!selectedBrand) return { id: 'brand', label: 'Velg merke', description: 'Velg bilmerke for å se tilgjengelige modeller' };
    if (!selectedModel) return { id: 'model', label: 'Velg modell', description: 'Velg modell for å se årsmodeller' };
    if (!selectedYear) return { id: 'year', label: 'Velg årsmodell', description: 'Velg årsmodell for å se produkter' };
    return { id: 'products', label: 'Produkter', description: 'Se tilgjengelige glass for ditt kjøretøy' };
  }, [selectedBrand, selectedModel, selectedYear]);

  // Håndter kategori-toggle
  const handleCategoryToggle = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Fjern alle filter
  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedCategories([]);
  };

  if (loadingBrands) {
    return (
      <>
        <PageMeta
          title="Bla i katalogen — merke og modell"
          description="Finn bilglass etter merke, modell og årsmodell. 37 500+ produkter på lager."
          canonicalPath="/bla"
        />
      <div className="mx-auto max-w-7xl px-3 py-20 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-autoglass-blue" />
      </div>
    </>);
  }

  return (
    <>
      <PageMeta
        title="Bla i katalogen — merke og modell"
        description="Finn bilglass etter merke, modell og årsmodell. 37 500+ produkter på lager."
        canonicalPath="/bla"
      />
      
      {/* BrowseHeader med sticky navigasjon */}
      <BrowseHeader 
        currentStep={currentStep.id}
        selectedBrand={selectedBrand}
        selectedModel={selectedModel}
        selectedYear={selectedYear}
        resultCount={filteredProducts.length}
        onClearAll={handleClearFilters}
        onStepClick={(step) => {
          if (step === 'brand') {
            setSelectedBrand('');
            setSelectedModel('');
            setSelectedYear('');
          } else if (step === 'model') {
            setSelectedModel('');
            setSelectedYear('');
          } else if (step === 'year') {
            setSelectedYear('');
          }
        }}
      />

      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 pb-8">
        {/* API Error Banner */}
        {apiError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-red-800">
              <strong>Feil:</strong> {apiError}
            </p>
          </div>
        )}

        {/* STEP 1: Brand Grid */}
        {!selectedBrand && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Velg merke
            </h2>
            <BrandGrid
              brands={brands}
              selectedBrand={selectedBrand}
              onSelect={setSelectedBrand}
            />
          </div>
        )}

        {/* STEP 2: Model Cards */}
        {selectedBrand && !selectedModel && (
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laster modeller...
              </div>
            ) : (
              <ModelCards
                brand={selectedBrand}
                models={modelInfos}
                selectedModel={selectedModel}
                onSelect={setSelectedModel}
                onBack={() => setSelectedBrand('')}
              />
            )}
          </div>
        )}

        {/* STEP 3: Year Timeline */}
        {selectedBrand && selectedModel && !selectedYear && (
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laster årsmodeller...
              </div>
            ) : (
              <YearTimeline
                brand={selectedBrand}
                model={selectedModel}
                years={years}
                selectedYear={selectedYear}
                onSelect={setSelectedYear}
                onBack={() => setSelectedModel('')}
              />
            )}
          </div>
        )}

        {/* STEP 4: Products med ny layout og filtre */}
        {selectedYear && currentProducts.length > 0 && (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar Filter - Desktop */}
            <aside className="hidden lg:block w-64 shrink-0 sticky top-20 self-start">
              <FilterPanel 
                categories={availableCategories}
                selectedCategories={selectedCategories}
                onCategoryToggle={handleCategoryToggle}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onClearFilters={handleClearFilters}
                resultCount={filteredProducts.length}
                isOpen={false}
                onClose={() => {}}
                products={currentProducts}
              />
            </aside>

            {/* Hovedinnhold */}
            <main className="flex-1 min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setSelectedBrand('')}
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                  {selectedBrand}
                </button>
                <span className="text-gray-300">/</span>
                <button
                  type="button"
                  onClick={() => setSelectedModel('')}
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                  {selectedModel}
                </button>
                <span className="text-gray-300">/</span>
                <span className="text-sm font-medium text-gray-900">{selectedYear}</span>
                <Badge variant="outline" className="ml-2">
                  {filteredProducts.length} produkt{filteredProducts.length > 1 ? 'er' : ''}
                </Badge>
              </div>

              {/* Mobil filter knapp */}
              <div className="lg:hidden mb-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsFilterOpen(true)}
                  className="w-full flex items-center justify-center gap-2"
                >
                  <Filter className="h-4 w-4" />
                  Filter
                  {(selectedCategories.length > 0 || searchQuery) && (
                    <Badge variant="secondary" className="ml-1">
                      {selectedCategories.length + (searchQuery ? 1 : 0)}
                    </Badge>
                  )}
                </Button>
              </div>

              {/* Produktgrid */}
              <ProductGrid 
                products={filteredProducts}
                renderItem={(product) => (
                  <ProductCard 
                    product={product}
                    onQuickView={() => setQuickViewProduct(product)}
                    onAddToCart={() => {}}
                    isInComparison={isSelected(product)}
                    onToggleComparison={() => toggleProduct(product)}
                  />
                )}
              />

              {filteredProducts.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>Ingen produkter matcher filteret.</p>
                  <Button 
                    variant="outline" 
                    onClick={handleClearFilters}
                    className="mt-4"
                  >
                    Fjern alle filter
                  </Button>
                </div>
              )}
            </main>
          </div>
        )}

        {selectedYear && currentProducts.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>Ingen produkter funnet for dette valget.</p>
          </div>
        )}
      </div>

      {/* Mobildrawer FilterPanel */}
      <FilterPanel 
        isOpen={isFilterOpen} 
        onClose={() => setIsFilterOpen(false)}
        categories={availableCategories}
        selectedCategories={selectedCategories}
        onCategoryToggle={handleCategoryToggle}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClearFilters={handleClearFilters}
        resultCount={filteredProducts.length}
        products={currentProducts}
        title="Filter"
      />

      {/* QuickViewModal */}
      <QuickViewModal 
        product={quickViewProduct} 
        isOpen={!!quickViewProduct} 
        onClose={() => setQuickViewProduct(null)} 
        onAddToCart={() => {}}
        isInComparison={quickViewProduct ? isSelected(quickViewProduct) : false}
        onToggleComparison={() => quickViewProduct && toggleProduct(quickViewProduct)}
      />

      {/* CompareModal */}
      <CompareModal 
        isOpen={isCompareModalOpen}
        products={selectedProducts}
        onClose={() => setIsCompareModalOpen(false)}
        onRemove={removeProduct}
        onSelectProduct={() => {}}
      />

      {/* CompareBar */}
      {selectedProducts.length > 0 && (
        <CompareBar 
          selectedProducts={selectedProducts}
          onOpenCompare={() => setIsCompareModalOpen(true)}
          onRemove={removeProduct}
          onClear={clearAll}
        />
      )}
    </>
  );
}
