import { useState } from 'react';
import { Sparkles, RotateCcw, List, ShoppingCart, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Product } from '@/types/api';
import { useCartStore } from '@/stores/cartStore';

interface GuideResultProps {
  recommendations: Product[];
  vehicle?: { make: string; model: string; year: number };
  onRestart: () => void;
  onShowAll: () => void;
}

export function GuideResult({ recommendations, vehicle, onRestart, onShowAll }: GuideResultProps) {
  const [addedToCart, setAddedToCart] = useState<Set<string>>(new Set());
  const addItem = useCartStore((s) => s.addItem);

  const handleAddToCart = (product: Product) => {
    addItem(product);
    setAddedToCart((prev) => new Set(prev).add(product.eurocode || product.articleNumber || ''));
  };

  if (!recommendations || recommendations.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">Ingen glass matcher valgene dine.</p>
        <Button onClick={onRestart} variant="outline">
          <RotateCcw className="w-4 h-4 mr-2" />
          Prøv på nytt
        </Button>
      </div>
    );
  }

  const topPick = recommendations[0];
  const alternatives = recommendations.slice(1);

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 rounded-full px-4 py-1.5 text-sm font-medium mb-3">
          <Sparkles className="w-4 h-4" />
          Anbefalt glass
        </div>
        {vehicle && (
          <p className="text-sm text-gray-500">
            Basert på {vehicle.make} {vehicle.model} ({vehicle.year})
          </p>
        )}
      </div>

      {/* Top pick */}
      <div className="bg-autoglass-blue/5 border-2 border-autoglass-blue rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs font-bold text-autoglass-blue uppercase tracking-wide">
            Beste match
          </span>
          {topPick.equipmentMatch === 'perfect' && (
            <span className="text-xs font-medium text-green-600 bg-green-100 rounded-full px-2 py-0.5">
              Perfekt match
            </span>
          )}
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">
          {topPick.title}
        </h3>
        <p className="text-sm text-gray-500 mb-1">
          Eurocode: <span className="font-mono">{topPick.eurocode}</span>
        </p>
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {topPick.description}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-gray-900">
            {topPick.price > 0 ? `${topPick.price.toLocaleString('nb-NO')} kr` : 'Pris på forespørsel'}
          </span>
          <Button
            size="sm"
            onClick={() => handleAddToCart(topPick)}
            disabled={addedToCart.has(topPick.eurocode || topPick.articleNumber || '')}
          >
            {addedToCart.has(topPick.eurocode || topPick.articleNumber || '') ? (
              <>
                <Check className="w-4 h-4 mr-1.5" />
                Lagt til
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 mr-1.5" />
                Legg i handlekurv
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Alternativer */}
      {alternatives.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-500 mb-2">Alternativer</h4>
          {alternatives.map((product, idx) => (
            <div
              key={product.eurocode || product.articleNumber || idx}
              className="border border-gray-200 rounded-lg p-4 mb-2"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h5 className="text-sm font-medium text-gray-900 truncate">
                    {product.title}
                  </h5>
                  <p className="text-xs text-gray-500">
                    {product.eurocode}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span className="text-sm font-semibold text-gray-900">
                    {product.price > 0 ? `${product.price.toLocaleString('nb-NO')} kr` : '-'}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2"
                    onClick={() => handleAddToCart(product)}
                    disabled={addedToCart.has(product.eurocode || product.articleNumber || '')}
                  >
                    {addedToCart.has(product.eurocode || product.articleNumber || '') ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <ShoppingCart className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={onShowAll} variant="outline" className="flex-1">
          <List className="w-4 h-4 mr-2" />
          Se alle alternativer
        </Button>
        <Button onClick={onRestart} variant="outline" className="flex-1">
          <RotateCcw className="w-4 h-4 mr-2" />
          Start på nytt
        </Button>
      </div>
    </div>
  );
}
