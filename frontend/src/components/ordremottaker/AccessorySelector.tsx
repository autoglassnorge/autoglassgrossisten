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

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold text-gray-700">Tilbehør</h4>
      <div className="space-y-2">
        {accessories.map((a) => {
          const isChecked = selected.has(a.sku);
          return (
            <label
              key={a.sku}
              className={`flex items-center justify-between rounded-md px-2 py-2 ${
                a.removable ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default opacity-70'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(a.sku, a.removable)}
                  disabled={!a.removable}
                  className="h-4 w-4 rounded border-gray-300 text-autoglass-blue focus:ring-autoglass-blue"
                />
                <span className="text-sm text-gray-800">{a.name}</span>
              </div>
              <span className="text-sm font-medium text-gray-600">
                {a.price.toLocaleString('no-NO')} kr
              </span>
            </label>
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
