import { useState } from 'react';
import { ShoppingCart, Check, Clock, Package } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import type { ProactiveSuggestion, ProactiveSuggestionItem } from '@/api/ordremottaker';
import type { Product } from '@/types/api';

interface ProactiveSuggestionsProps {
  suggestions: ProactiveSuggestion[];
}

function SuggestionCard({ item }: { item: ProactiveSuggestionItem }) {
  const addItem = useCartStore((s) => s.addItem);
  const [added, setAdded] = useState(false);

  const handleReorder = () => {
    if (!item.product) return;
    addItem(item.product as Product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-1 text-xs font-medium text-gray-500 flex items-center gap-1">
        <Package className="h-3 w-3" />
        {item.sku}
      </div>
      <div className="mb-2 text-sm font-medium text-gray-900 line-clamp-2">
        {item.name}
      </div>
      <div className="mb-3 flex items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {item.lastOrdered}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
          {item.qty} stk
        </span>
      </div>
      <button
        onClick={handleReorder}
        disabled={added || !item.product}
        className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          added
            ? 'bg-green-500 text-white'
            : item.product
            ? 'bg-autoglass-blue text-white hover:bg-autoglass-dark'
            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
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
            Bestill igjen
          </>
        )}
      </button>
    </div>
  );
}

export default function ProactiveSuggestions({ suggestions }: ProactiveSuggestionsProps) {
  const reorderPrompt = suggestions.find((s) => s.type === 'reorder_prompt');

  if (!reorderPrompt || reorderPrompt.items.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
        <p className="text-sm font-medium text-blue-900">{reorderPrompt.message}</p>
      </div>

      <div className="grid gap-3">
        {reorderPrompt.items.map((item) => (
          <SuggestionCard key={item.sku} item={item} />
        ))}
      </div>
    </div>
  );
}
