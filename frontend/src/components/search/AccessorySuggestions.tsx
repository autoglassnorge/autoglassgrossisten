import { Wrench, ArrowRight } from 'lucide-react';

interface ApiAccessory {
  sku: string;
  name: string;
  price: number;
  category: string;
  sourceUrl?: string;
}

interface AccessorySuggestionsProps {
  typeCode?: string;
  accessories?: ApiAccessory[];
}

// Fallback: Type code → accessory mapping (hardkodet)
const ACCESSORY_MAP: Record<string, { label: string; description: string; icon: string }[]> = {
  F: [
    { label: 'Lister', description: 'Vinduslister til frontrute', icon: '📏' },
    { label: 'Lim / Kleber', description: 'Strukturelt lim til frontrute', icon: '🧴' },
    { label: 'Kalibrering', description: 'ADAS-kalibrering etter montering', icon: '🎯' },
  ],
  B: [
    { label: 'Lister', description: 'Vinduslister til bakrute', icon: '📏' },
    { label: 'Lim / Kleber', description: 'Strukturelt lim til bakrute', icon: '🧴' },
  ],
  DFF: [
    { label: 'Klips', description: 'Dørklips til frontrute førerside', icon: '🔩' },
    { label: 'Lister', description: 'Dørlist til frontrute førerside', icon: '📏' },
  ],
  DPF: [
    { label: 'Klips', description: 'Dørklips til frontrute passasjerside', icon: '🔩' },
    { label: 'Lister', description: 'Dørlist til frontrute passasjerside', icon: '📏' },
  ],
  DFB: [
    { label: 'Klips', description: 'Dørklips til bakrute førerside', icon: '🔩' },
    { label: 'Lister', description: 'Dørlist til bakrute førerside', icon: '📏' },
  ],
  DPB: [
    { label: 'Klips', description: 'Dørklips til bakrute passasjerside', icon: '🔩' },
    { label: 'Lister', description: 'Dørlist til bakrute passasjerside', icon: '📏' },
  ],
  SFB1: [
    { label: 'Klips', description: 'Klips til sideglass førerside', icon: '🔩' },
  ],
  SPB1: [
    { label: 'Klips', description: 'Klips til sideglass passasjerside', icon: '🔩' },
  ],
};

export function AccessorySuggestions({ typeCode, accessories }: AccessorySuggestionsProps) {
  // Prefer API accessories if available
  if (accessories && accessories.length > 0) {
    const total = accessories.reduce((sum, a) => sum + a.price, 0);
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="h-5 w-5 text-amber-600" />
          <h3 className="font-semibold text-amber-900">Tilbehør du trenger</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {accessories.map((a) => (
            <div
              key={a.sku}
              className="flex items-center gap-3 rounded-lg bg-white border border-amber-100 p-3"
            >
              <span className="text-xl">📦</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900">{a.name}</div>
                <div className="text-xs text-gray-500">
                  {a.price > 0 ? `${a.price.toLocaleString('no-NO')} kr` : 'Pris på forespørsel'}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-amber-400 flex-shrink-0" />
            </div>
          ))}
        </div>
        {total > 0 && (
          <p className="mt-3 text-sm font-medium text-amber-800">
            Tilbehør totalt: {total.toLocaleString('no-NO')} kr
          </p>
        )}
      </div>
    );
  }

  // Fallback: hardkodet per typeCode
  const suggestions = typeCode ? ACCESSORY_MAP[typeCode] : undefined;
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Wrench className="h-5 w-5 text-amber-600" />
        <h3 className="font-semibold text-amber-900">Tilbehør du kanskje trenger</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {suggestions.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-lg bg-white border border-amber-100 p-3"
          >
            <span className="text-xl">{s.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-gray-900">{s.label}</div>
              <div className="text-xs text-gray-500">{s.description}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-amber-400 flex-shrink-0" />
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-amber-700">
        Kontakt oss for bestilling av tilbehør. Tilbehør selges separat.
      </p>
    </div>
  );
}
