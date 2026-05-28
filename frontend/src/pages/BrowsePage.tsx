import { useState, useEffect, useMemo } from 'react';
import { Loader2, Car, Package } from 'lucide-react';
import { PageMeta } from '@/components/seo/PageMeta';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { BrandGrid } from '@/components/browse/BrandGrid';
import { ModelCards } from '@/components/browse/ModelCards';
import { YearTimeline } from '@/components/browse/YearTimeline';

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

export default function BrowsePage() {
  const [brands, setBrands] = useState<BrandInfo[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [brandData, setBrandData] = useState<BrowseBrandData | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingBrands, setLoadingBrands] = useState(true);

  // Load brands list
  useEffect(() => {
    fetch('/browse/brands.json')
      .then(r => r.json())
      .then(data => {
        setBrands(data.brands || []);
        setLoadingBrands(false);
      })
      .catch(() => setLoadingBrands(false));
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
    const safeName = selectedBrand.replace(/\//g, '-').replace(/ /g, '_');
    fetch(`/browse/${safeName}.json`)
      .then(r => r.json())
      .then(data => {
        setBrandData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedBrand]);

  // Reset model/year when brand changes
  useEffect(() => {
    setSelectedModel('');
    setSelectedYear('');
  }, [selectedBrand]);

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

  const formatPrice = (price: number | null) => {
    if (price === null || price === 0) return 'Pris på forespørsel';
    return new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(price);
  };

  const typeCodeLabel = (tc: string | null) => {
    if (!tc) return 'Ukjent';
    const map: Record<string, string> = {
      'F': 'Frontrute',
      'B': 'Bakrute',
      'DFF': 'Dørrute fremre førerside',
      'DPF': 'Dørrute fremre passasjerside',
      'DFB': 'Dørrute bakre førerside',
      'DPB': 'Dørrute bakre passasjerside',
      'SFB1': 'Siderute bakre 1 førerside',
      'SPB1': 'Siderute bakre 1 passasjerside',
      'SFB2': 'Siderute bakre 2 førerside',
      'SPB2': 'Siderute 2 bakre passasjerside',
      'DFFV': 'Ventil/siderute fremre førerside',
      'DPFV': 'Ventil/siderute fremre passasjerside',
      'DFBV': 'Ventil/siderute bakre førerside',
      'DPBV': 'Ventil/siderute bakre passasjerside',
    };
    return map[tc] || tc;
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
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Car className="h-6 w-6 sm:h-8 sm:w-8 text-autoglass-blue" />
          Bla i katalogen
        </h1>
        <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600">
          Velg merke, modell og årsmodell for å finne riktig glass
        </p>
      </div>

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

      {/* STEP 4: Products */}
      {selectedYear && currentProducts.length > 0 && (
        <div className="space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2">
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
              {currentProducts.length} produkt{currentProducts.length > 1 ? 'er' : ''}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {currentProducts.map((product, idx) => (
              <div
                key={idx}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <Badge className="text-[10px] bg-autoglass-blue/10 text-autoglass-blue border-0">
                    {typeCodeLabel(product.typeCodeRel) || product.typeCode || 'Ukjent'}
                  </Badge>
                  {product.sku && (
                    <span className="text-[10px] font-mono text-gray-400">{product.sku}</span>
                  )}
                </div>
                
                <h3 className="font-medium text-gray-900 text-sm mb-2 line-clamp-2">
                  {product.title || 'Uten tittel'}
                </h3>
                
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <div className="text-lg font-bold text-autoglass-blue">
                    {formatPrice(product.price)}
                  </div>
                  <Button size="sm" variant="outline" className="h-8 px-2 text-xs">
                    <Package className="h-3.5 w-3.5 mr-1" />
                    Info
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedYear && currentProducts.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>Ingen produkter funnet for dette valget.</p>
        </div>
      )}
    </div>
    </>
  );
}
