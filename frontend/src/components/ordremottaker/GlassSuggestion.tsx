import { useState, useMemo } from 'react';
import { ShoppingCart, Check } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import type { Product } from '@/types/api';

interface GlassSuggestionProps {
  candidates: Product[];
}

function isOem(product: Product): boolean {
  return (
    product.brand.toLowerCase().includes('oem') ||
    product.title.toLowerCase().includes('original')
  );
}

function GlassCard({ product }: { product: Product }) {
  const addItem = useCartStore((s) => s.addItem);
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    addItem(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const code = product.eurocode || product.articleNumber;

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {code}
      </div>
      <div className="mb-1 text-sm font-medium text-gray-900">
        {product.brand} {product.model}
      </div>
      {product.typeDescription && (
        <div className="mb-2 text-xs text-gray-500">{product.typeDescription}</div>
      )}
      <div className="mb-3 text-lg font-bold text-autoglass-blue">
        {product.price.toLocaleString('no-NO')} kr
      </div>
      <button
        onClick={handleAdd}
        disabled={added}
        className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          added
            ? 'bg-green-500 text-white'
            : 'bg-autoglass-blue text-white hover:bg-autoglass-dark'
        }`}
      >
        {added ? (
          <>
            <Check className="h-4 w-4" />
            Lagt til
          </>
        ) : (
          <>
            <ShoppingCart className="h-4 w-4" />
            Legg i kurv
          </>
        )}
      </button>
    </div>
  );
}

export default function GlassSuggestion({ candidates }: GlassSuggestionProps) {
  const { oem, aftermarket } = useMemo(() => {
    const oem: Product[] = [];
    const aftermarket: Product[] = [];
    for (const p of candidates) {
      if (isOem(p)) oem.push(p);
      else aftermarket.push(p);
    }
    return { oem, aftermarket };
  }, [candidates]);

  return (
    <div className="mb-4 space-y-4">
      {oem.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-700">Original (OEM)</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {oem.map((p) => (
              <GlassCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
      {aftermarket.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-700">Aftermarket</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {aftermarket.map((p) => (
              <GlassCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
