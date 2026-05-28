import { ShoppingCart, Check, Thermometer, Droplets, Shield, AlertTriangle, Paperclip } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Product } from '@/types/api';
import { formatPrice, typeCodeShort, positionColor } from '@/utils/formatters';
import { useCartStore } from '@/stores/cartStore';
import { useState } from 'react';

interface ProductCardProps {
  product: Product;
  onDetail?: (product: Product) => void;
}

function useInCart(eurocode: string) {
  return useCartStore((s) => s.items.some((i) => i.product.eurocode === eurocode));
}

export function ProductCard({ product, onDetail }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const inCart = useInCart(product.eurocode);
  const [imgError, setImgError] = useState(false);

  const stockDot = product.stockStatus > 0 ? 'bg-green-500' : 'bg-amber-500';
  const stockText = product.stockStatus > 0 ? `${product.stockStatus} på lager` : 'Bestillingsvare';

  return (
    <Card
      className="group flex flex-col h-full overflow-hidden cursor-pointer"
      onClick={() => onDetail?.(product)}
    >
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

        {/* Standardized description */}
        {product.standardDescription && (
          <p className="text-[11px] text-gray-500 leading-relaxed mt-1 line-clamp-3">
            {product.standardDescription}
          </p>
        )}

        {/* Compatibility info (lists/clips) */}
        {(product.properties?.listRequired || product.properties?.listIncluded || product.properties?.klipsRequired || product.properties?.hasKlips) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {product.properties?.listRequired && (
              <span className="inline-flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 border border-red-100">
                <AlertTriangle className="h-3 w-3" />
                Krever {product.properties?.listType || 'lister'} — bestill separat
              </span>
            )}
            {product.properties?.listIncluded && (
              <span className="inline-flex items-center gap-0.5 rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700 border border-green-100">
                <Check className="h-3 w-3" />
                Inkl. {product.properties?.listType || 'lister'}
              </span>
            )}
            {product.properties?.klipsRequired && (
              <span className="inline-flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 border border-red-100">
                <AlertTriangle className="h-3 w-3" />
                Krever {product.properties?.klipsType || 'klips'} — bestill separat
              </span>
            )}
            {product.properties?.hasKlips && !product.properties?.klipsRequired && (
              <span className="inline-flex items-center gap-0.5 rounded bg-yellow-50 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700 border border-yellow-100">
                <Paperclip className="h-3 w-3" />
                Inkl. {product.properties?.klipsType || 'klips'}
              </span>
            )}
          </div>
        )}

        {/* Equipment badges */}
        <div className="mt-2 flex flex-wrap gap-1">
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
          {product.properties?.antenna && (
            <span className="inline-flex items-center gap-0.5 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
              Antenne
            </span>
          )}
          {product.properties?.camera && (
            <span className="inline-flex items-center gap-0.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
              Kamera
            </span>
          )}
          {product.properties?.solar && (
            <span className="inline-flex items-center gap-0.5 rounded bg-yellow-50 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">
              Solar
            </span>
          )}
          {product.properties?.tinted && (
            <span className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
              Tinted
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
          onClick={(e) => {
            e.stopPropagation();
            addItem(product);
          }}
          className="gap-1 min-h-[44px] px-3 sm:px-4 flex-shrink-0"
        >
          {inCart ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
          <span className="hidden sm:inline">{inCart ? 'Lagt til' : 'Legg til'}</span>
        </Button>
      </CardFooter>
    </Card>
  );
}
