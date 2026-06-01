import * as React from 'react';
import { X, Scale, Package, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatPrice, typeCodeLabel } from '@/utils/formatters';
import { cn } from '@/lib/utils';

// BrowseProduct type matching the one in BrowsePage.tsx
interface BrowseProduct {
  title: string;
  sku: string | null;
  typeCode: string | null;
  typeCodeRel: string | null;
  price: number | null;
}

export interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: BrowseProduct[];
  onRemove: (sku: string) => void;
  onSelectProduct?: (product: BrowseProduct) => void;
  className?: string;
}

export function CompareModal({
  isOpen,
  onClose,
  products,
  onRemove,
  onSelectProduct,
  className,
}: CompareModalProps) {
  // Close on escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  // Ensure we always show 3 columns (including empty slots)
  const displayProducts = [...products];
  while (displayProducts.length < 3) {
    displayProducts.push(null as unknown as BrowseProduct);
  }

  const hasProducts = products.length > 0;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[60]',
        'flex items-center justify-center',
        'p-4 sm:p-6',
        className
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className={cn(
          'relative w-full max-w-5xl max-h-[90vh]',
          'bg-white rounded-xl shadow-2xl',
          'flex flex-col',
          'animate-in fade-in zoom-in-95 duration-200'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-autoglass-blue/10 rounded-lg">
              <Scale className="w-5 h-5 text-autoglass-blue" />
            </div>
            <div>
              <h2
                id="compare-modal-title"
                className="text-lg font-semibold text-gray-900"
              >
                Sammenlign produkter
              </h2>
              <p className="text-sm text-gray-500">
                {products.length} produkt{products.length !== 1 ? 'er' : ''} valgt
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'p-2 rounded-lg',
              'text-gray-400 hover:text-gray-600',
              'hover:bg-gray-100',
              'transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-autoglass-blue/30'
            )}
            aria-label="Lukk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {!hasProducts ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Ingen produkter valgt for sammenligning</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {/* Row header column */}
                    <th className="text-left text-sm font-medium text-gray-500 p-3 bg-gray-50 border border-gray-200 w-32">
                      Egenskap
                    </th>
                    {/* Product columns */}
                    {products.map((product) => (
                      <th
                        key={product.sku || 'empty'}
                        className="p-3 bg-gray-50 border border-gray-200 min-w-[200px]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-900 line-clamp-2 text-left">
                            {product.title || 'Ukjent produkt'}
                          </span>
                          {product.sku && (
                            <button
                              type="button"
                              onClick={() => onRemove(product.sku!)}
                              className={cn(
                                'flex-shrink-0 p-1 rounded',
                                'text-gray-400 hover:text-red-500',
                                'hover:bg-red-50',
                                'transition-colors'
                              )}
                              aria-label={`Fjern ${product.title || product.sku}`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    {/* Empty columns for remaining slots */}
                    {Array.from({ length: 3 - products.length }).map((_, i) => (
                      <th
                        key={`empty-${i}`}
                        className="p-3 bg-gray-50/50 border border-gray-200 border-dashed min-w-[200px]"
                      >
                        <span className="text-sm text-gray-400">–</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* SKU Row */}
                  <tr className="bg-white">
                    <td className="p-3 text-sm font-medium text-gray-600 border border-gray-200 bg-gray-50">
                      SKU
                    </td>
                    {displayProducts.map((product, i) => (
                      <td
                        key={`sku-${i}`}
                        className={cn(
                          'p-3 text-sm text-gray-900 border border-gray-200',
                          !product?.sku && 'text-gray-300'
                        )}
                      >
                        {product?.sku || '–'}
                      </td>
                    ))}
                  </tr>

                  {/* Type Row */}
                  <tr className="bg-white">
                    <td className="p-3 text-sm font-medium text-gray-600 border border-gray-200 bg-gray-50">
                      Type
                    </td>
                    {displayProducts.map((product, i) => {
                      const typeCode = product?.typeCodeRel || product?.typeCode;
                      return (
                        <td
                          key={`type-${i}`}
                          className={cn(
                            'p-3 text-sm text-gray-900 border border-gray-200',
                            !typeCode && 'text-gray-300'
                          )}
                        >
                          {typeCode ? typeCodeLabel(typeCode) : '–'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Price Row */}
                  <tr className="bg-white">
                    <td className="p-3 text-sm font-medium text-gray-600 border border-gray-200 bg-gray-50">
                      Pris
                    </td>
                    {displayProducts.map((product, i) => (
                      <td
                        key={`price-${i}`}
                        className={cn(
                          'p-3 text-sm border border-gray-200',
                          product?.price
                            ? 'text-lg font-bold text-autoglass-blue'
                            : 'text-gray-300'
                        )}
                      >
                        {product?.price ? formatPrice(product.price) : '–'}
                      </td>
                    ))}
                  </tr>

                  {/* Select Row */}
                  {onSelectProduct && (
                    <tr className="bg-gray-50/50">
                      <td className="p-3 text-sm font-medium text-gray-600 border border-gray-200 bg-gray-50">
                        Handling
                      </td>
                      {products.map((product, i) => (
                        <td
                          key={`action-${i}`}
                          className="p-3 border border-gray-200"
                        >
                          <Button
                            size="sm"
                            onClick={() => onSelectProduct(product)}
                            className={cn(
                              'w-full',
                              'bg-autoglass-blue hover:bg-autoglass-blue/90',
                              'text-white'
                            )}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Velg dette
                          </Button>
                        </td>
                      ))}
                      {/* Empty action cells */}
                      {Array.from({ length: 3 - products.length }).map((_, i) => (
                        <td
                          key={`empty-action-${i}`}
                          className="p-3 border border-gray-200 border-dashed"
                        />
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <p className="text-sm text-gray-500">
            Maks 3 produkter kan sammenlignes samtidig
          </p>
          <Button variant="outline" onClick={onClose}>
            Lukk
          </Button>
        </div>
      </div>
    </div>
  );
}
