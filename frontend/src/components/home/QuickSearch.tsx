import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Circle, X, Clock } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

interface RecentSearch {
  type: 'regnr' | 'brand';
  value: string;
  timestamp: number;
}

const STORAGE_KEY = 'autoglass:recentSearches';
const MAX_RECENT_SEARCHES = 5;

const POPULAR_BRANDS = [
  { name: 'Volkswagen', display: 'VW', icon: Car },
  { name: 'BMW', display: 'BMW', icon: Circle },
  { name: 'Mercedes', display: 'Mercedes', icon: Car },
  { name: 'Toyota', display: 'Toyota', icon: Car },
  { name: 'Volvo', display: 'Volvo', icon: Car },
  { name: 'Audi', display: 'Audi', icon: Circle },
  { name: 'Ford', display: 'Ford', icon: Car },
  { name: 'Tesla', display: 'Tesla', icon: Car },
] as const;

export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as RecentSearch[];
        setRecentSearches(parsed);
      }
    } catch {
      // Ignore parsing errors
    }
  }, []);

  const addRecentSearch = useCallback((type: 'regnr' | 'brand', value: string) => {
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => !(s.type === type && s.value === value));
      const newSearch: RecentSearch = { type, value, timestamp: Date.now() };
      const updated = [newSearch, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage errors
      }
      return updated;
    });
  }, []);

  const removeRecentSearch = useCallback((type: 'regnr' | 'brand', value: string) => {
    setRecentSearches((prev) => {
      const updated = prev.filter((s) => !(s.type === type && s.value === value));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage errors
      }
      return updated;
    });
  }, []);

  const clearAllRecentSearches = useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  return {
    recentSearches,
    addRecentSearch,
    removeRecentSearch,
    clearAllRecentSearches,
  };
}

export function QuickSearch() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { recentSearches, removeRecentSearch } = useRecentSearches();

  const handleBrandClick = (brandName: string) => {
    navigate(`/bla?brand=${encodeURIComponent(brandName)}`);
  };

  const handleRecentSearchClick = (search: RecentSearch) => {
    if (search.type === 'regnr') {
      navigate(`/sok?regnr=${encodeURIComponent(search.value)}`);
    } else {
      navigate(`/bla?brand=${encodeURIComponent(search.value)}`);
    }
  };

  const formatSearchLabel = (search: RecentSearch): string => {
    if (search.type === 'regnr') {
      return search.value.toUpperCase();
    }
    return search.value;
  };

  return (
    <div className="w-full space-y-6">
      {/* Popular Brands Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em] text-carbon-400">
          <Car className="h-3.5 w-3.5" />
          <span>{t('quicksearch.popularBrands')}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {POPULAR_BRANDS.map((brand) => {
            const IconComponent = brand.icon;
            return (
              <button
                key={brand.name}
                onClick={() => handleBrandClick(brand.name)}
                className="group flex items-center gap-1.5 px-3 py-2 bg-carbon-800/50 hover:bg-carbon-700 border border-carbon-700 hover:border-carbon-600 rounded-full transition-all duration-200"
                title={brand.name}
              >
                <IconComponent className="h-3.5 w-3.5 text-carbon-500 group-hover:text-glass-cyan transition-colors" />
                <span className="text-xs font-medium text-carbon-300 group-hover:text-white transition-colors">
                  {brand.display}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Searches Section */}
      {recentSearches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em] text-carbon-400">
            <Clock className="h-3.5 w-3.5" />
            <span>{t('quicksearch.recentSearches')}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((search, index) => (
              <div
                key={`${search.type}-${search.value}-${index}`}
                className="group flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-carbon-900/50 hover:bg-carbon-800 border border-carbon-700 hover:border-carbon-600 rounded-md transition-all duration-200 cursor-pointer"
                onClick={() => handleRecentSearchClick(search)}
              >
                <span
                  className={`text-[10px] font-mono uppercase tracking-wider ${
                    search.type === 'regnr' ? 'text-glass-cyan' : 'text-carbon-500'
                  }`}
                >
                  {search.type === 'regnr' ? 'REG' : 'MERKE'}
                </span>
                <span className="text-xs font-medium text-carbon-200 group-hover:text-white">
                  {formatSearchLabel(search)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRecentSearch(search.type, search.value);
                  }}
                  className="ml-1 p-0.5 rounded-sm hover:bg-carbon-700 text-carbon-500 hover:text-carbon-300 transition-colors"
                  aria-label="Fjern søk"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
