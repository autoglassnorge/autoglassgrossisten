import { FileText } from 'lucide-react';
import type { QuoteDraft, QuoteDraftProduct } from '@/api/ordremottaker';

interface QuoteDraftCardProps {
  draft: QuoteDraft;
}

function formatCurrency(value: number) {
  return `${value.toLocaleString('no-NO')} kr`;
}

function productCode(product: QuoteDraftProduct) {
  return product.eurocode || product.article_number || product.supplier_sku || `#${product.id}`;
}

export default function QuoteDraftCard({ draft }: QuoteDraftCardProps) {
  return (
    <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-autoglass-blue" />
        <div>
          <div className="text-sm font-semibold text-gray-900">Tilbudskladd</div>
          <div className="text-xs text-gray-500">{draft.items.length} linje(r)</div>
        </div>
      </div>

      <div className="space-y-3">
        {draft.items.map((item) => (
          <div key={`${item.product.id}-${productCode(item.product)}`} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-900">
                  {item.product.brand} {item.product.model}
                </div>
                <div className="text-xs text-gray-500">
                  {productCode(item.product)} - {item.qty} stk
                </div>
              </div>
              <div className="shrink-0 text-sm font-semibold text-gray-900">
                {formatCurrency((item.product.price || 0) * item.qty)}
              </div>
            </div>

            {item.accessories.length > 0 && (
              <div className="mt-2 space-y-1">
                {item.accessories.map((accessory) => (
                  <div key={accessory.sku} className="flex justify-between gap-3 text-xs text-gray-600">
                    <span className="min-w-0 truncate">{accessory.name}</span>
                    <span className="shrink-0">{formatCurrency(accessory.price * item.qty)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Glass</span>
          <span>{formatCurrency(draft.subtotal)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Tilbehør</span>
          <span>{formatCurrency(draft.accessoryTotal)}</span>
        </div>
        <div className="flex justify-between text-base font-bold text-autoglass-blue">
          <span>Totalt</span>
          <span>{formatCurrency(draft.total)}</span>
        </div>
      </div>
    </div>
  );
}
