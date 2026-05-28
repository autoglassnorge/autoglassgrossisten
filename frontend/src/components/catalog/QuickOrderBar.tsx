import { useState, useMemo, useCallback } from 'react';
import { ClipboardList, ShoppingCart, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCartStore } from '@/stores/cartStore';
import type { Product } from '@/types/api';

interface QuickOrderBarProps {
  onLookup?: (codes: string[]) => Promise<{ found: Product[]; notFound: string[] }>;
}

export function QuickOrderBar({ onLookup }: QuickOrderBarProps) {
  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [results, setResults] = useState<{ found: Product[]; notFound: string[] } | null>(null);
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);

  const parsedCodes = useMemo(() => {
    return input
      .split(/[\n,;]+/)
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length >= 3);
  }, [input]);

  const handleValidate = useCallback(async () => {
    if (parsedCodes.length === 0 || !onLookup) return;
    setValidating(true);
    try {
      const res = await onLookup(parsedCodes);
      setResults(res);
    } catch {
      setResults({ found: [], notFound: parsedCodes });
    } finally {
      setValidating(false);
    }
  }, [parsedCodes, onLookup]);

  const handleAddAll = useCallback(() => {
    if (!results?.found.length) return;
    results.found.forEach((p) => addItem(p));
    setInput('');
    setResults(null);
  }, [results, addItem]);

  const alreadyInCart = useMemo(() => {
    const cartCodes = new Set(cartItems.map((i) => i.product.eurocode));
    return results?.found.filter((p) => cartCodes.has(p.eurocode)) ?? [];
  }, [results, cartItems]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-autoglass-blue text-white px-4 py-3 shadow-lg hover:bg-autoglass-blue/90 transition-colors"
      >
        <ClipboardList className="h-5 w-5" />
        <span className="text-sm font-medium hidden sm:inline">Quick Order</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[420px]">
      <div className="bg-white border border-gray-200 shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-autoglass-blue" />
            <span className="font-semibold text-sm">Quick Order</span>
          </div>
          <button
            type="button"
            onClick={() => { setIsOpen(false); setResults(null); setInput(''); }}
            className="p-1.5 rounded-md hover:bg-gray-200 transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Input */}
        <div className="p-4 space-y-3">
          <textarea
            placeholder="Lim inn eurokoder (én per linje eller kommaseparert)..."
            value={input}
            onChange={(e) => { setInput(e.target.value); setResults(null); }}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue"
          />

          {parsedCodes.length > 0 && !results && (
            <div className="text-xs text-gray-500">
              {parsedCodes.length} kode{parsedCodes.length !== 1 ? 'r' : ''} gjenkjent
            </div>
          )}

          {/* Validation results */}
          {results && (
            <div className="space-y-2">
              {results.found.length > 0 && (
                <div className="rounded-lg bg-green-50 border border-green-100 p-3">
                  <div className="flex items-center gap-1.5 text-green-700 text-sm font-medium">
                    <Check className="h-4 w-4" />
                    {results.found.length} funnet
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {results.found.map((p) => (
                      <span
                        key={p.eurocode}
                        className="inline-flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-xs text-green-800"
                      >
                        {p.eurocode}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {results.notFound.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                  <div className="flex items-center gap-1.5 text-red-700 text-sm font-medium">
                    <X className="h-4 w-4" />
                    {results.notFound.length} ikke funnet
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {results.notFound.map((code) => (
                      <span
                        key={code}
                        className="inline-flex items-center rounded bg-red-100 px-2 py-0.5 text-xs text-red-800"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleValidate}
              disabled={parsedCodes.length === 0 || validating}
            >
              {validating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                'Valider'
              )}
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1"
              onClick={handleAddAll}
              disabled={!results?.found.length}
            >
              <ShoppingCart className="h-4 w-4" />
              Legg til alle
              {alreadyInCart.length > 0 && (
                <span className="text-xs opacity-75">({alreadyInCart.length} allerede i kurv)</span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
