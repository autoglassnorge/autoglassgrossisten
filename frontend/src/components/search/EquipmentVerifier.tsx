import { useState } from 'react';
import { Check, X, HelpCircle, Thermometer, Droplets, Volume2, Radio, Monitor, Sun, Eye } from 'lucide-react';
import type { Product } from '@/types/api';

interface Props {
  products: Product[];
  onFilter: (filtered: Product[]) => void;
}

const FEATURES = [
  { key: 'hud', label: 'Head-Up Display (HUD)', icon: <Monitor className="h-4 w-4" />, desc: 'Viser hastighet/navigasjon i frontruten' },
  { key: 'acoustic', label: 'Akustisk glass', icon: <Volume2 className="h-4 w-4" />, desc: 'Dempet støy fra trafikk' },
  { key: 'heated', label: 'Varmeelement', icon: <Thermometer className="h-4 w-4" />, desc: 'Rask avising av ruten' },
  { key: 'rainSensor', label: 'Regnsensor', icon: <Droplets className="h-4 w-4" />, desc: 'Automatisk vindusviskere' },
  { key: 'camera', label: 'Kamera / ADAS', icon: <Eye className="h-4 w-4" />, desc: 'Kamera bak frontruten (sporholder, etc.)' },
  { key: 'antenna', label: 'Antenne i glass', icon: <Radio className="h-4 w-4" />, desc: 'FM/GPS-antenne integrert i ruten' },
  { key: 'shade', label: 'Solar / Varmereflekterende', icon: <Sun className="h-4 w-4" />, desc: 'Reduserer varme fra solen' },
];

/**
 * Check if a product description contains a feature.
 * Matches the backend detectFlagsFromDescription logic.
 */
function productHasFeature(product: Product, key: string): boolean {
  const d = (product.description || '').toUpperCase();
  const tokens = d.split(/[\s;,.\[\]()+-]+/).filter(t => t.length >= 1);
  const s = new Set(tokens);

  switch (key) {
    case 'hud':
      return s.has('HUD') || s.has('H.U.D') || /\bHEAD\s*UP\b|\bHEADUP\b|\bPROJEKSJON\b|\bPROJECTION\b/.test(d);
    case 'acoustic':
      return s.has('ACO') || s.has('AKU') || /\bACOUSTIC\b|\bAKUSTIK\b|\bQUIET\b|\bSILENT\b/.test(d);
    case 'heated':
      return s.has('HTD') || s.has('HT') || s.has('UHTD') || s.has('ELEK') || s.has('VARM') ||
        /\bHEATED\b|\bOPPVARM\b|\bVARME\b|\bDEFROST\b|\bDEFOG\b|\bEL[\s-]?VARME\b|\bHEATING\b/.test(d) ||
        /(?:^|[\s+])(EL)(?:[\s+.]|[+-]|$)/.test(d);
    case 'rainSensor':
      return s.has('RSN') || s.has('RSNL') || s.has('RSNLSN') ||
        s.has('REGN') || s.has('REGNS') || s.has('REGNSEN') || s.has('REGNSENSOR') ||
        /\bRAIN\b|\bAUTOMATIC\s+WIPER\b|\bVINDRUTETORKARE\b|\bLYS\/REGN\b|\bLYS\/REGNS\b/.test(d);
    case 'camera': {
      const hasCam = s.has('CAMERA') || s.has('CAM') || /\bKAMERA\b|\bBACKUP\b|\bREVERSING\b|\b360\b/.test(d);
      const hasLdw = /\bLDW\b/.test(d);
      const hasAdasText = s.has('ADAS') || s.has('FILSKIFTE') ||
        /\bLANE\s+ASSIST\b|\bLANE\s+DEPARTURE\b|\bCOLLISION\b|\bAUTO\s+BRAKE\b|\bEMERGENCY\s+BRAKE\b|\bDRIVE\s+ASSIST\b|\bPRO\s+PILOT\b|\bAUTOPILOT\b|\bTRAFFIC\s+ASSIST\b|\bCITY\s+SAFETY\b/.test(d);
      const sensWithAdas = (s.has('SENS') || s.has('SENSOR')) && (hasLdw || hasCam || s.has('HUD') || s.has('H.U.D'));
      return hasCam || hasLdw || hasAdasText || sensWithAdas;
    }
    case 'antenna':
      return s.has('ANT') || s.has('GNAG') || /\bANTENNA\b|\bANTENNE\b|\bGPS\b|\bRADIO\b|\bFM\b|\bDAB\b|\bAERIAL\b/.test(d);
    case 'shade':
      return s.has('SOLAR') || s.has('SOL') || s.has('SOLA') || s.has('PRIVACY') || s.has('PRIV') ||
        s.has('DARK') || s.has('TOP') || s.has('TINT') || s.has('COATED') || s.has('HMSL') ||
        /\bSOTET\b|\bSOLAR\s+CONTROL\b|\bTOPSHADE\b/.test(d);
    default:
      return false;
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
