
import { ShoppingCart, Check } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Product } from '@/types/api';
import { formatPrice, formatYearRange, categoryLabel } from '@/utils/formatters';
import { useCartStore } from '@/stores/cartStore';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const inCart = cartItems.some((i) => i.product.eurocode === product.eurocode);

  const categoryColors: Record<string, string> = {
    frontrute: 'bg-blue-100 text-blue-800',
    bakrute: 'bg-emerald-100 text-emerald-800',
    dørglass: 'bg-amber-100 text-amber-800',
    siderute: 'bg-purple-100 text-purple-800',
    sideglass: 'bg-pink-100 text-pink-800',
    tak: 'bg-cyan-100 text-cyan-800',
  };

  return (
    <Card className="group flex flex-col h-full overflow-hidden">
      {/* Image */}
      <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400 text-sm">
            Ingen bilde
          </div>
        )}
        <div className="absolute top-2 left-2">
          <Badge className={categoryColors[product.category] ?? 'bg-gray-100 text-gray-800'}>
            {categoryLabel(product.category)}
          </Badge>
        </div>
        {product.nagsCodes.length > 0 && (
          <div className="absolute top-2 right-2">
            <Badge variant="outline" className="bg-white/90 text-xs">
              🇺🇸 {product.nagsCodes[0]}
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <CardContent className="flex-1 pt-4">
        <div className="text-xs text-gray-500 mb-1">
          {product.brand} {product.model}
        </div>
        <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1">
          {product.title || `${product.brand} ${product.model}`}
        </h3>
        <div className="text-xs text-gray-500">
          {formatYearRange(product.yearFrom, product.yearTo)}
        </div>
        <div className="mt-2 text-xs font-mono text-gray-400">
          {product.eurocode}
        </div>
      </CardContent>

      {/* Footer */}
      <CardFooter className="pt-0 flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-autoglass-blue">
            {formatPrice(product.price)}
          </div>
          <div className="text-xs text-gray-500">
            {product.stockStatus > 0 ? `${product.stockStatus} på lager` : 'Bestillingsvare'}
          </div>
        </div>
        <Button
          size="sm"
          variant={inCart ? 'secondary' : 'default'}
          onClick={() => addItem(product)}
          className="gap-1"
        >
          {inCart ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
          <span className="hidden sm:inline">{inCart ? 'Lagt til' : 'Legg til'}</span>
        </Button>
      </CardFooter>
    </Card>
  );
}
