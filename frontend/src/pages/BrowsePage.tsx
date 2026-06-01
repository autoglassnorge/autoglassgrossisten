import { useState, useEffect, useMemo } from 'react';
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

// TEST-DATA: Hardkodet til KV er fylt opp
const TEST_BRANDS: BrandInfo[] = [
  { name: "VOLKSWAGEN", productCount: 2453 },
  { name: "BMW", productCount: 1547 },
  { name: "MERCEDES", productCount: 1588 },
  { name: "AUDI", productCount: 1248 },
  { name: "FORD", productCount: 1386 },
  { name: "TOYOTA", productCount: 892 },
  { name: "VOLVO", productCount: 756 },
  { name: "OPEL", productCount: 634 },
  { name: "NISSAN", productCount: 523 },
  { name: "HYUNDAI", productCount: 783 },
];

// Test-data for Volkswagen
const TEST_VW_DATA: BrowseBrandData = {
  name: "VOLKSWAGEN",
  models: {
    "GOLF": {
      "2019": {
        url: "/browse/VOLKSWAGEN/GOLF/2019",
        products: [
          { title: "Frontrute VW Golf 2019 med regnsensor", sku: "VW-GOLF-F-19", typeCode: "F", typeCodeRel: "F", price: 2450 },
          { title: "Bakrute VW Golf 2019", sku: "VW-GOLF-B-19", typeCode: "B", typeCodeRel: "B", price: 1890 },
          { title: "Dørrute venstre foran VW Golf 2019", sku: "VW-GOLF-DFF-19", typeCode: "DFF", typeCodeRel: "DFF", price: 1250 },
          { title: "Dørrute høyre foran VW Golf 2019", sku: "VW-GOLF-DPF-19", typeCode: "DPF", typeCodeRel: "DPF", price: 1250 },
          { title: "Siderute venstre bak VW Golf 2019", sku: "VW-GOLF-SFB1-19", typeCode: "SFB1", typeCodeRel: "SFB1", price: 980 },
        ]
      },
      "2020": {
        url: "/browse/VOLKSWAGEN/GOLF/2020",
        products: [
          { title: "Frontrute VW Golf 2020 med ADAS", sku: "VW-GOLF-F-20", typeCode: "F", typeCodeRel: "F", price: 2890 },
          { title: "Bakrute VW Golf 2020", sku: "VW-GOLF-B-20", typeCode: "B", typeCodeRel: "B", price: 1950 },
          { title: "Dørrute venstre foran VW Golf 2020", sku: "VW-GOLF-DFF-20", typeCode: "DFF", typeCodeRel: "DFF", price: 1320 },
        ]
      }
    },
    "POLO": {
      "2019": {
        url: "/browse/VOLKSWAGEN/POLO/2019",
        products: [
          { title: "Frontrute VW Polo 2019", sku: "VW-POLO-F-19", typeCode: "F", typeCodeRel: "F", price: 2150 },
          { title: "Bakrute VW Polo 2019", sku: "VW-POLO-B-19", typeCode: "B", typeCodeRel: "B", price: 1650 },
        ]
      }
    },
    "PASSAT": {
      "2019": {
        url: "/browse/VOLKSWAGEN/PASSAT/2019",
        products: [
          { title: "Frontrute VW Passat 2019 med ADAS", sku: "VW-PASSAT-F-19", typeCode: "F", typeCodeRel: "F", price: 3250 },
          { title: "Bakrute VW Passat 2019", sku: "VW-PASSAT-B-19", typeCode: "B", typeCodeRel: "B", price: 2450 },
          { title: "Dørrute venstre foran VW Passat 2019", sku: "VW-PASSAT-DFF-19", typeCode: "DFF", typeCodeRel: "DFF", price: 1850 },
          { title: "Dørrute høyre foran VW Passat 2019", sku: "VW-PASSAT-DPF-19", typeCode: "DPF", typeCodeRel: "DPF", price: 1850 },
        ]
      }
    }
  }
};

// Type for browse step
type BrowseStep = {
  id: 'brand' | 'model' | 'year' | 'products';
  label: string;
  description: string;
};

export default function BrowsePage() {
  const [brands, setBrands] = useState<BrandInfo[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [brandData, setBrandData] = useState<BrowseBrandData | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [useTestData, setUseTestData] = useState(false);

  // === NY STATE FOR FILTER OG PRODUKTVISNING ===
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [quickViewProduct, setQuickViewProduct] = useState<BrowseProduct | null>(null);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false); // Mobil filter drawer
  
  // Produkt-sammenligning hook
  const { selectedProducts, toggleProduct, isSelected, clearAll, removeProduct } = useProductComparison();
  // =============================================

  // Load brands list
  useEffect(() => {
    // Bruk test-data eller hent fra API
    if (useTestData) {
      setBrands(TEST_BRANDS);
      setLoadingBrands(false);
      return;
    }

    fetch('/api/browse/brands')
      .then(r => {
        if (!r.ok) {
          // Fallback til test-data
          setUseTestData(true);
          setBrands(TEST_BRANDS);
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (data && data.brands) {
          setBrands(data.brands);
        } else {
          setBrands(TEST_BRANDS);
          setUseTestData(true);
        }
        setLoadingBrands(false);
      })
      .catch(() => {
        setBrands(TEST_BRANDS);
        setUseTestData(true);
        setLoadingBrands(false);
      });
  }, [useTestData]);

  // Load brand data when brand selected
  useEffect(() => {
    if (!selectedBrand) {
      setBrandData(null);
      setSelectedModel('');
      setSelectedYear('');
      return;
    }
    setLoading(true);

    // Bruk test-data for Volkswagen
    if (useTestData && selectedBrand === "VOLKSWAGEN") {
      setBrandData(TEST_VW_DATA);
      setLoading(false);
      return;
    }

    const safeName = selectedBrand.replace(/\//g, '-').replace(/ /g, '_');
    fetch(`/api/browse/${safeName}.json`)
      .then(r => {
        if (!r.ok) {
          // Fallback til test-data for Volkswagen
          if (selectedBrand === "VOLKSWAGEN") {
            return TEST_VW_DATA;
          }
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (data) {
          setBrandData(data);
        }
        setLoading(false);
      })
      .catch(() => {
        if (selectedBrand === "VOLKSWAGEN") {
          setBrandData(TEST_VW_DATA);
        }
        setLoading(false);
      });
  }, [selectedBrand, useTestData]);

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
        {/* STEP 1: Brand Grid */}
        {!selectedBrand && (
          <div className="space-y-4">
            {useTestData && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-amber-800">
                  <strong>Merk:</strong> Viser test-data mens systemet laster fullstendig katalog. 
                  Dataene er kun for demonstrasjon.
                </p>
              </div>
            )}
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
                    onAddToCart={() => console.log('Legg til handlekurv:', product)}
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
        onAddToCart={() => quickViewProduct && console.log('Legg til handlekurv:', quickViewProduct)}
        isInComparison={quickViewProduct ? isSelected(quickViewProduct) : false}
        onToggleComparison={() => quickViewProduct && toggleProduct(quickViewProduct)}
      />

      {/* CompareModal */}
      <CompareModal 
        isOpen={isCompareModalOpen}
        products={selectedProducts}
        onClose={() => setIsCompareModalOpen(false)}
        onRemove={removeProduct}
        onSelectProduct={(p) => console.log('Valgt:', p)}
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
