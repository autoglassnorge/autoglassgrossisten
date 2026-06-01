import { ReactNode } from 'react';

interface ProductGridProps<T> {
  products: T[];
  renderItem: (product: T, index: number) => ReactNode;
  emptyState?: ReactNode;
}

export function ProductGrid<T>({ products, renderItem, emptyState }: ProductGridProps<T>) {
  if (products.length === 0 && emptyState) {
    return <div className="w-full">{emptyState}</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {products.map((product, index) => (
        <div key={index}>{renderItem(product, index)}</div>
      ))}
    </div>
  );
}
