import { useState } from 'react';
import { Check, X, HelpCircle, Shield, Thermometer, Droplets, Volume2, Radio, Monitor, Sun, Eye } from 'lucide-react';
import type { Product } from '@/types/api';

interface Props {
  products: Product[];
  onFilter: (filtered: Product[]) => void;
}

const FEATURES = [
  { key: 'hud', label: 'Head-Up Display (HUD)', icon: <Monitor className="h-4 w-4" />, desc: 'Viser hastighet/navigasjon i frontruten' },
  { key: 'akustisk', label: 'Akustisk glass', icon: <Volume2 className="h-4 w-4" />, desc: 'Dempet støy fra trafikk' },
  { key: 'coated', label: 'Coated / Hydrophobic', icon: <Shield className="h-4 w-4" />, desc: 'Vannavvisende belegg' },
  { key: 'varme', label: 'Varmeelement', icon: <Thermometer className="h-4 w-4" />, desc: 'Rask avising av ruten' },
  { key: 'sensor', label: 'Regnsensor', icon: <Droplets className="h-4 w-4" />, desc: 'Automatisk vindusviskere' },
  { key: 'kamera', label: 'Kamera / ADAS', icon: <Eye className="h-4 w-4" />, desc: 'Kamera bak frontruten (sporholder, etc.)' },
  { key: 'antenne', label: 'Antenne i glass', icon: <Radio className="h-4 w-4" />, desc: 'FM/GPS-antenne integrert i ruten' },
  { key: 'solar', label: 'Solar / Varmereflekterende', icon: <Sun className="h-4 w-4" />, desc: 'Reduserer varme fra solen' },
];

/**
 * Check if a product description contains a feature
 */
function productHasFeature(product: Product, key: string): boolean {
  const d = (product.description || '').toUpperCase();
  switch (key) {
    case 'hud': return d.includes('HUD');
    case 'akustisk': return d.includes('AKU') || d.includes('AKUST');
    case 'coated': return d.includes('COAT') || d.includes('CS');
    case 'varme': return d.includes('ELM') || d.includes('VARM') || d.includes('+EL') || d.includes('EL ');
    case 'sensor': return d.includes('SENS') || d.includes('RSN');
    case 'kamera': return d.includes('LDW') || d.includes('ADAS') || d.includes('CITY');
    case 'antenne': return d.includes('ANT') || d.includes('AG') || d.includes('GNAG');
    case 'solar': return d.includes('SOLAR') || d.includes('SOL');
    default: return false;
  }
}

export function EquipmentVerifier({ products, onFilter }: Props) {
  const [answers, setAnswers] = useState<Record<string, boolean | null>>({});
  const [showAll, setShowAll] = useState(false);

  // Only show features that actually differ between products
  const relevantFeatures = FEATURES.filter(f => {
    const hasCount = products.filter(p => productHasFeature(p, f.key)).length;
    return hasCount > 0 && hasCount < products.length;
  });

  if (relevantFeatures.length === 0) {
    return null;
  }

  const handleAnswer = (key: string, value: boolean | null) => {
    const next = { ...answers, [key]: value };
    setAnswers(next);

    // Filter products based on answers
    const filtered = products.filter(p => {
      for (const [k, v] of Object.entries(next)) {
        if (v === null) continue;
        const has = productHasFeature(p, k);
        if (v === true && !has) return false;
        if (v === false && has) return false;
      }
      return true;
    });

    onFilter(filtered.length > 0 ? filtered : products);
  };

  const filtered = products.filter(p => {
    for (const [k, v] of Object.entries(answers)) {
      if (v === null) continue;
      const has = productHasFeature(p, k);
      if (v === true && !has) return false;
      if (v === false && has) return false;
    }
    return true;
  });

  const matchedCount = filtered.length;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4 mb-4">
      <div className="flex items-start gap-3">
        <HelpCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-blue-900 text-sm">
            Hjelp oss å finne riktig glass
          </h4>
          <p className="text-xs text-blue-700 mt-1">
            Bilen din kan ha forskjellig utstyrspakke. Velg hva som gjelder:
          </p>

          <div className="mt-3 space-y-2">
            {(showAll ? relevantFeatures : relevantFeatures.slice(0, 4)).map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-blue-700 min-w-0 flex-1">
                  {f.icon}
                  <span className="text-xs font-medium truncate">{f.label}</span>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleAnswer(f.key, true)}
                    className={`inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
                      answers[f.key] === true
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Check className="h-3 w-3" /> Ja
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAnswer(f.key, false)}
                    className={`inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
                      answers[f.key] === false
                        ? 'bg-red-100 text-red-700 border border-red-300'
                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <X className="h-3 w-3" /> Nei
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAnswer(f.key, null)}
                    className={`inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
                      answers[f.key] === null || answers[f.key] === undefined
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Vet ikke
                  </button>
                </div>
              </div>
            ))}
          </div>

          {relevantFeatures.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAll(v => !v)}
              className="text-[10px] text-blue-600 hover:underline mt-2"
            >
              {showAll ? 'Vis færre' : `Vis alle ${relevantFeatures.length} spørsmål`}
            </button>
          )}

          {matchedCount < products.length && (
            <div className="mt-3 rounded-lg bg-white/80 border border-blue-200 p-2.5">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-xs font-medium text-gray-900">
                  {matchedCount} av {products.length} glass passer dine valg
                </span>
              </div>
              {matchedCount === 1 && (
                <p className="text-[10px] text-green-700 mt-1">
                  🎯 Eksakt match funnet!
                </p>
              )}
              {matchedCount === 0 && (
                <p className="text-[10px] text-red-600 mt-1">
                  Ingen glass matcher alle valgene. Viser alle alternativer.
                </p>
              )}
            </div>
          )}

          <div className="mt-2 text-[10px] text-blue-500">
            Usikker? Sjekk original frontrute eller spør forhandler.
          </div>
        </div>
      </div>
    </div>
  );
}
