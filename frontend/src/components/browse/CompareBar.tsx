import { X, Scale, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

// BrowseProduct type matching the one in BrowsePage.tsx
interface BrowseProduct {
  title: string;
  sku: string | null;
  typeCode: string | null;
  typeCodeRel: string | null;
  price: number | null;
}

export interface CompareBarProps {
  selectedProducts: BrowseProduct[];
  onRemove: (sku: string) => void;
  onClear: () => void;
  onOpenCompare: () => void;
  className?: string;
}

const MAX_PRODUCTS = 3;

export function CompareBar({
  selectedProducts,
  onRemove,
  onClear,
  onOpenCompare,
  className,
}: CompareBarProps) {
  const count = selectedProducts.length;

  if (count === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-white border-t border-gray-200',
        'shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]',
        'animate-in slide-in-from-bottom-4',
        className
      )}
    >
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3 gap-4">
          {/* Left: Count and product pills */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Sammenligner {count}/{MAX_PRODUCTS}
            </span>

            {/* Product pills */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {selectedProducts.map((product) => (
                <div
                  key={product.sku}
                  className={cn(
                    'flex items-center gap-2',
                    'bg-autoglass-blue/10 text-autoglass-blue',
                    'rounded-full pl-3 pr-1 py-1',
                    'text-xs font-medium',
                    'whitespace-nowrap',
                    'border border-autoglass-blue/20'
                  )}
                >
                  <span className="truncate max-w-[120px] sm:max-w-[160px]">
                    {product.title || product.sku || 'Ukjent'}
                  </span>
                  {product.sku && (
                    <button
                      type="button"
                      onClick={() => onRemove(product.sku!)}
                      className={cn(
                        'flex items-center justify-center',
                        'w-5 h-5 rounded-full',
                        'hover:bg-autoglass-blue/20',
                        'transition-colors',
                        'focus:outline-none focus:ring-2 focus:ring-autoglass-blue/30'
                      )}
                      aria-label={`Fjern ${product.title || product.sku}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              onClick={onOpenCompare}
              className={cn(
                'h-9 px-4',
                'bg-autoglass-blue hover:bg-autoglass-blue/90',
                'text-white font-medium',
                'flex items-center gap-2'
              )}
              disabled={count < 2}
            >
              <Scale className="w-4 h-4" />
              <span className="hidden sm:inline">Sammenlign</span>
              <span className="sm:hidden">
                <ChevronUp className="w-4 h-4" />
              </span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={onClear}
              className="h-9 px-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              <X className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Lukk</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
