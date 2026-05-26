import { useState, useEffect, useMemo } from 'react';
import { Loader2, Car, ChevronRight, Package } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

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

  const models = useMemo(() => {
    if (!brandData) return [];
    return Object.keys(brandData.models).sort();
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
      <div className="mx-auto max-w-7xl px-3 py-20 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-autoglass-blue" />
      </div>
    );
  }

  return (
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

      {/* Breadcrumb / Selection Flow */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Brand Select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Merke</label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full h-12 rounded-lg border border-gray-300 bg-white px-3 text-base focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue"
            >
              <option value="">Velg merke...</option>
              {brands.map(b => (
                <option key={b.name} value={b.name}>
                  {b.name} ({b.productCount})
                </option>
              ))}
            </select>
          </div>

          {/* Model Select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Modell</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={!selectedBrand || loading}
              className="w-full h-12 rounded-lg border border-gray-300 bg-white px-3 text-base focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">{selectedBrand ? 'Velg modell...' : 'Velg merke først'}</option>
              {models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Year Select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Årsmodell</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              disabled={!selectedModel}
              className="w-full h-12 rounded-lg border border-gray-300 bg-white px-3 text-base focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">{selectedModel ? 'Velg år...' : 'Velg modell først'}</option>
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {loading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laster modeller...
          </div>
        )}
      </div>

      {/* Products */}
      {selectedYear && currentProducts.length > 0 && (
        <div>
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
            <ChevronRight className="h-4 w-4" />
            {selectedBrand} &gt; {selectedModel} &gt; {selectedYear}
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
  );
}
