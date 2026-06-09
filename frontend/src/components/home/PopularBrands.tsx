/**
 * PopularBrands — Shows top brands from KV browse data with product counts.
 * Clickable cards that navigate to the brand browse page.
 */

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Car } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BrandInfo {
  name: string;
  productCount: number;
}

async function fetchBrands(): Promise<BrandInfo[]> {
  const res = await fetch('/browse/brands.json');
  if (!res.ok) throw new Error('Failed to fetch brands');
  const data = await res.json() as { brands: BrandInfo[] };
  return data.brands.slice(0, 8); // Top 8 brands
}

export function PopularBrands() {
  const navigate = useNavigate();
  const { data: brands, isLoading } = useQuery({
    queryKey: ['homepage-brands'],
    queryFn: fetchBrands,
    staleTime: 1000 * 60 * 5, // 5 min cache
  });

  return (
    <section className="bg-carbon-900 py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
              Populære bilmerker
            </h2>
            <p className="mt-2 text-base text-carbon-400">
              Bla i katalogen etter merke og modell
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/bla')}
            className="hidden sm:inline-flex items-center gap-1 text-sm text-glass-cyan hover:text-glass-cyanLight font-medium transition-colors"
          >
            Se alle merker
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-carbon-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {brands?.map((brand) => (
              <button
                key={brand.name}
                type="button"
                onClick={() => navigate(`/bla?brand=${encodeURIComponent(brand.name)}`)}
                className="group relative flex items-center gap-4 p-5 rounded-xl border border-carbon-800 bg-carbon-950/50 hover:border-glass-cyan/50 hover:bg-carbon-950 transition-all duration-200 text-left"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-carbon-800 group-hover:bg-glass-cyan/10 flex items-center justify-center transition-colors">
                  <Car className="h-5 w-5 text-carbon-400 group-hover:text-glass-cyan transition-colors" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                    {brand.name}
                  </h3>
                  <p className="text-xs text-carbon-500">
                    {brand.productCount.toLocaleString('nb-NO')} produkter
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-carbon-600 group-hover:text-glass-cyan ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all" />
              </button>
            ))}
          </div>
        )}

        {/* Mobile "see all" link */}
        <div className="mt-6 text-center sm:hidden">
          <button
            type="button"
            onClick={() => navigate('/bla')}
            className="inline-flex items-center gap-1 text-sm text-glass-cyan font-medium"
          >
            Se alle merker
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
