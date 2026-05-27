import { ShoppingCart, Check, Thermometer, Droplets, Shield } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Product } from '@/types/api';
import { formatPrice, formatYearRange, typeCodeShort, positionColor } from '@/utils/formatters';
import { useCartStore } from '@/stores/cartStore';
import { useState } from 'react';

interface ProductCardProps {
  product: Product;
}

function useInCart(eurocode: string) {
  return useCartStore((s) => s.items.some((i) => i.product.eurocode === eurocode));
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const inCart = useInCart(product.eurocode);
  const [imgError, setImgError] = useState(false);

  const stockDot = product.stockStatus > 0 ? 'bg-green-500' : 'bg-amber-500';
  const stockText = product.stockStatus > 0 ? `${product.stockStatus} på lager` : 'Bestillingsvare';

  return (
    <Card className="group flex flex-col h-full overflow-hidden">
      {/* Image */}
      <div className="relative aspect-[16/10] bg-gray-100 overflow-hidden">
        {!imgError && product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400 text-sm">
            Ingen bilde
          </div>
        )}

        {/* Position dot */}
        {product.position && (
          <div className="absolute top-2 left-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${positionColor(product.position)}`}
              title={product.position}
            />
          </div>
        )}

        {/* Type code badge */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <Badge className="bg-white/90 text-gray-800 text-[10px] sm:text-xs">
            {typeCodeShort(product.typeCode || product.category)}
          </Badge>
          {product.nagsCodes && product.nagsCodes.length > 0 && (
            <Badge variant="outline" className="bg-white/90 text-[10px] sm:text-xs font-mono text-blue-700 border-blue-200">
              🇺🇸 {product.nagsCodes[0]}
            </Badge>
          )}
        </div>
      </div>

      {/* Content */}
      <CardContent className="flex-1 pt-3 px-3 sm:px-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] sm:text-xs font-mono text-gray-400">
            {product.eurocode}
          </span>
          {product.position && (
            <span
              className={`inline-block h-2 w-2 rounded-full ${positionColor(product.position)}`}
              title={product.position}
            />
          )}
        </div>
        <h3 className="font-semibold text-gray-900 text-sm sm:text-base line-clamp-2 mb-1">
          {product.title || `${product.brand} ${product.model}`}
        </h3>
        <div className="text-xs text-gray-500">
          {product.brand} {product.model}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          {formatYearRange(product.yearFrom, product.yearTo)}
        </div>

        {/* Properties row */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {product.properties?.adas && (
            <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              <Shield className="h-3 w-3" /> ADAS
            </span>
          )}
          {product.properties?.heated && (
            <span className="inline-flex items-center gap-0.5 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
              <Thermometer className="h-3 w-3" /> Varme
            </span>
          )}
          {product.properties?.rainSensor && (
            <span className="inline-flex items-center gap-0.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
              <Droplets className="h-3 w-3" /> Regn
            </span>
          )}
          {product.properties?.acoustic && (
            <span className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
              Akustisk
            </span>
          )}
          {product.properties?.hud && (
            <span className="inline-flex items-center gap-0.5 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
              HUD
            </span>
          )}
        </div>
      </CardContent>

      {/* Footer */}
      <CardFooter className="pt-0 px-3 pb-3 sm:px-4 sm:pb-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base sm:text-lg font-bold text-autoglass-blue">
            {formatPrice(product.price)}
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${stockDot}`} />
            <span className="truncate">{stockText}</span>
          </div>
        </div>
        <Button
          size="sm"
          variant={inCart ? 'secondary' : 'default'}
          onClick={() => addItem(product)}
          className="gap-1 min-h-[44px] px-3 sm:px-4 flex-shrink-0"
        >
          {inCart ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
          <span className="hidden sm:inline">{inCart ? 'Lagt til' : 'Legg til'}</span>
        </Button>
      </CardFooter>
    </Card>
  );
}
