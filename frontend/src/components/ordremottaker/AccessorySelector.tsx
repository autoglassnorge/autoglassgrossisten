import { useState, useMemo } from 'react';
import type { AccessoryItem } from '@/api/ordremottaker';

interface AccessorySelectorProps {
  accessories: AccessoryItem[];
}

export default function AccessorySelector({ accessories }: AccessorySelectorProps) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const a of accessories) {
      if (a.included || !a.removable) initial.add(a.sku);
    }
    return initial;
  });

  const toggle = (sku: string, removable: boolean) => {
    if (!removable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const total = useMemo(() => {
    return accessories
      .filter((a) => selected.has(a.sku))
      .reduce((sum, a) => sum + a.price, 0);
  }, [accessories, selected]);

  const getCategoryStyles = (category?: AccessoryItem['category']) => {
    switch (category) {
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'recommended':
        return 'bg-blue-50 border-blue-200';
      case 'required':
      default:
        return 'bg-white border-gray-100';
    }
  };

  const getCheckboxStyles = (category?: AccessoryItem['category']) => {
    switch (category) {
      case 'warning':
        return 'text-yellow-600 focus:ring-yellow-500';
      case 'recommended':
        return 'text-blue-600 focus:ring-blue-500';
      case 'required':
      default:
        return 'text-autoglass-blue focus:ring-autoglass-blue';
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold text-gray-700">Tilbehør</h4>
      <div className="space-y-2">
        {accessories.map((a) => {
          const isChecked = selected.has(a.sku);
          const isWarning = a.category === 'warning';
          return (
            <div
              key={a.sku}
              className={`rounded-md border ${getCategoryStyles(a.category)}`}
            >
              <label
                className={`flex items-center justify-between rounded-md px-3 py-2.5 ${
                  a.removable ? 'cursor-pointer hover:opacity-80' : 'cursor-default opacity-70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(a.sku, a.removable)}
                    disabled={!a.removable}
                    className={`h-4 w-4 rounded border-gray-300 ${getCheckboxStyles(a.category)}`}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-800">
                      {a.name}
                      {a.category === 'required' && (
                        <span className="ml-1.5 text-xs font-normal text-gray-400">(obligatorisk)</span>
                      )}
                      {a.category === 'recommended' && (
                        <span className="ml-1.5 text-xs font-normal text-blue-600">(anbefalt)</span>
                      )}
                    </span>
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-600">
                  {a.price > 0 ? `${a.price.toLocaleString('no-NO')} kr` : '—'}
                </span>
              </label>
              {a.notes && (
                <div className={`px-3 pb-2.5 text-xs ${isWarning ? 'text-yellow-800 font-medium' : 'text-gray-500'}`}>
                  {isWarning && (
                    <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-yellow-400 text-xs text-white">
                      !
                    </span>
                  )}
                  {a.notes}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 border-t border-gray-100 pt-3 text-right">
        <span className="text-sm text-gray-500">Totalt tilbehør: </span>
        <span className="text-base font-bold text-autoglass-blue">
          {total.toLocaleString('no-NO')} kr
        </span>
      </div>
    </div>
  );
}
