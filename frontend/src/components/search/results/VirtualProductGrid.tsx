import { useRef, useMemo, useState, useEffect, type ReactNode } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function getColumns(width: number): number {
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

interface VirtualProductGridProps<T> {
  products: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  estimateItemHeight?: number;
  overscan?: number;
}

export function VirtualProductGrid<T>({
  products,
  getKey,
  renderItem,
  estimateItemHeight = 420,
  overscan = 2,
}: VirtualProductGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(() => getColumns(window.innerWidth));

  useEffect(() => {
    const update = () => {
      const width = parentRef.current?.clientWidth ?? window.innerWidth;
      setColumns(getColumns(width));
    };
    update();

    let resizeObserver: ResizeObserver | null = null;
    if (parentRef.current && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(parentRef.current);
    } else {
      window.addEventListener('resize', update);
    }

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const rows = useMemo(() => chunk(products, columns), [products, columns]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => estimateItemHeight,
    overscan,
    getItemKey: (index) => rows[index].map(getKey).join('-'),
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div ref={parentRef} className="relative w-full" style={{ height: `${totalSize}px` }}>
      <div
        className="absolute left-0 top-0 w-full"
        style={{ transform: `translateY(${virtualItems[0]?.start ?? 0}px)` }}
      >
        {virtualItems.map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 pb-3"
          >
            {rows[virtualRow.index].map((product) => renderItem(product))}
          </div>
        ))}
      </div>
    </div>
  );
}
