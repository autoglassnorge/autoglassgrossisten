import { ShoppingCart, Check, AlertTriangle, Paperclip, Target } from 'lucide-react';
import { GlassVisualizer } from './GlassVisualizer';
import { Card, CardContent, CardFooter } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Product } from '@/types/api';
import { formatPrice, typeCodeShort, positionColor } from '@/utils/formatters';
import { useCartStore } from '@/stores/cartStore';
import { useState } from 'react';
import { logFeedback } from '@/api/glass';
import { FeatureBadges } from './FeatureBadges';

/**
 * Badge component displaying product match score
 */
function MatchScoreBadge({ score }: { score: number }) {
  // Normalize score to 0-100%
  const pct = Math.min(100, Math.max(0, Math.round(score)));
  let colorClass = '';
  let label = '';

  if (pct >= 80) {
    colorClass = 'bg-emerald-500 text-white';
    label = 'Eksakt';
  } else if (pct >= 50) {
    colorClass = 'bg-green-500 text-white';
    label = 'God';
  } else if (pct >= 25) {
    colorClass = 'bg-amber-500 text-white';
    label = 'Middels';
  } else {
    colorClass = 'bg-red-500 text-white';
    label = 'Lav';
  }

  return (
    <div className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${colorClass}`}>
      <Target className="h-3 w-3" />
      {pct}% {label}
    </div>
  );
}

interface SearchContext {
  regnr: string;
  kType?: number;
  layer?: number;
  score?: number;
}

interface ProductCardProps {
  product: Product;
  onDetail?: (product: Product) => void;
  searchContext?: SearchContext;
}

function useInCart(id: number) {
  return useCartStore((s) => s.items.some((i) => i.product.id === id));
}

export function ProductCard({ product, onDetail, searchContext }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const inCart = useInCart(product.id);
  const [imgError, setImgError] = useState(false);

  const handleDetail = () => {
    if (searchContext) {
      logFeedback({
        regnr: searchContext.regnr,
        eurocode: product.eurocode || product.articleNumber,
        ktype: searchContext.kType,
        layer: searchContext.layer,
        score: product._score,
        action: 'view',
      }).catch(() => {}); // fire-and-forget
    }
    onDetail?.(product);
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (searchContext) {
      logFeedback({
        regnr: searchContext.regnr,
        eurocode: product.eurocode || product.articleNumber,
        ktype: searchContext.kType,
        layer: searchContext.layer,
        score: product._score,
        action: 'cart',
      }).catch(() => {}); // fire-and-forget
    }
    addItem(product);
  };

  const stockDot = product.stockStatus > 0 ? 'bg-green-500' : 'bg-amber-500';
  const stockText = product.stockStatus > 0 ? `${product.stockStatus} på lager` : 'Bestillingsvare';

  return (
    <Card
      className="group flex flex-col h-full overflow-hidden cursor-pointer"
      onClick={handleDetail}
    >
      {/* Image */}
      <div className="relative aspect-[16/10] bg-gray-100 overflow-hidden">
        {!imgError && product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="h-full w-full p-3">
            <GlassVisualizer product={product} className="h-full w-full" />
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

        {/* Type code badge + match score */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          {product._score !== undefined && (
            <MatchScoreBadge score={product._score} />
          )}
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
          <span className="inline-flex items-center rounded bg-carbon-900 border border-carbon-700 px-2 py-1">
            <span className="text-[9px] font-medium text-carbon-400 uppercase tracking-wider mr-1.5">
              {product.eurocode ? 'Eurokode' : 'Varenr'}
            </span>
            <span className="text-sm font-mono font-bold text-glass-cyan">
              {product.eurocode || product.articleNumber}
            </span>
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

        {/* Equipment feature badges */}
        <FeatureBadges product={product} maxVisible={4} />
      </CardContent>

      {/* Footer */}
      <CardFooter className="pt-0 px-3 pb-3 sm:px-4 sm:pb-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base sm:text-lg font-bold text-autoglass-blue">
            {formatPrice(product.price)}
          </div>
          <div className="text-[10px] text-gray-400">eks. mva</div>
          <div className="flex items-center gap-1.5 text-xs mt-1">
            <span className={`inline-flex h-2 w-2 rounded-full ${stockDot}`} />
            <span className={product.stockStatus > 0 ? 'text-signal-green font-medium' : 'text-signal-amber'}>
              {stockText}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant={inCart ? 'secondary' : 'default'}
          onClick={handleAddToCart}
          className="gap-1 min-h-[44px] px-3 sm:px-4 flex-shrink-0"
          aria-label={inCart ? 'Lagt til i ordre' : 'Legg til i ordre'}
        >
          {inCart ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
          <span className="hidden sm:inline">{inCart ? 'Lagt til i ordre' : 'Legg til i ordre'}</span>
        </Button>
      </CardFooter>
    </Card>
  );
}
