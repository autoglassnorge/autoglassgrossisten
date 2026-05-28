import type { Product } from '@/types/api';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: Product[];
  onDetail?: (product: Product) => void;
}

export function ProductGrid({ products, onDetail }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <p className="text-lg font-medium">Ingen produkter funnet</p>
        <p className="text-sm">Prøv å endre filtrene dine</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <ProductCard key={product.eurocode} product={product} onDetail={onDetail} />
      ))}
    </div>
  );
}
