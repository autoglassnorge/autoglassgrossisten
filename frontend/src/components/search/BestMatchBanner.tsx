import { Star, Check, AlertCircle, HelpCircle } from 'lucide-react';
import type { Product, VehicleInfo, EquipmentFlags } from '@/types/api';
import { extractEquipment } from '@/lib/extractFeatures';

interface Props {
  products: Product[];
  vehicle: VehicleInfo;
}

/**
 * Calculate how well a product matches the vehicle's equipment
 * Returns score and explanation
 */
export function calculateMatchScore(
  product: Product,
  vehicle: VehicleInfo
): { score: number; matches: string[]; mismatches: string[]; explanation: string } {
  const eq = vehicle.effectiveEquipment;
  if (!eq) {
    return { score: 0, matches: [], mismatches: [], explanation: 'Ingen utstyrsdata tilgjengelig' };
  }

  const pe = extractEquipment(product.description || '');
  const matches: string[] = [];
  const mismatches: string[] = [];

  const featureLabels: Record<string, string> = {
    adas: 'ADAS / Kamera',
    rainSensor: 'Regnsensor',
    heated: 'Varme',
    acoustic: 'Akustisk',
    antenna: 'Antenne',
    hud: 'HUD',
    camera: 'Kamera',
    coated: 'Coated',
  };

  // Check each feature
  for (const [key, label] of Object.entries(featureLabels)) {
    const vehicleHas = eq[key as keyof EquipmentFlags] ?? false;
    const productHas = pe[key] || false;

    if (vehicleHas && productHas) {
      matches.push(label);
    } else if (!vehicleHas && productHas) {
      mismatches.push(label);
    }
  }

  // Score: +2 per match, -1 per mismatch
  const score = matches.length * 2 - mismatches.length;

  let explanation = '';
  if (matches.length > 0 && mismatches.length === 0) {
    explanation = `Perfekt match — har allt utstyr bilen har (${matches.join(', ')})`;
  } else if (matches.length > 0 && mismatches.length > 0) {
    explanation = `Har riktig utstyr (${matches.join(', ')}), men også ekstra: ${mismatches.join(', ')}`;
  } else if (mismatches.length > 0) {
    explanation = `Har utstyr bilen ikke har: ${mismatches.join(', ')}`;
  } else {
    explanation = 'Basisglass uten spesialutstyr';
  }

  return { score, matches, mismatches, explanation };
}

/**
 * Rank products by equipment match and return sorted with scores
 */
export function rankByEquipmentMatch(products: Product[], vehicle: VehicleInfo) {
  return products
    .map((p) => ({ product: p, ...calculateMatchScore(p, vehicle) }))
    .sort((a, b) => b.score - a.score);
}

export function BestMatchBanner({ products, vehicle }: Props) {
  const eq = vehicle.effectiveEquipment;
  if (!eq) return null;

  const ranked = rankByEquipmentMatch(products, vehicle);
  const best = ranked[0];
  if (!best) return null;

  // Only show banner if there's a meaningful difference
  if (ranked.length < 2) return null;

  const hasClearWinner = best.score > ranked[1]?.score;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <Star className="h-5 w-5 text-amber-600 fill-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-amber-900 text-sm">
            Smart anbefaling basert på din bil
          </h4>
          <p className="text-xs text-amber-700 mt-1">
            Vi har analysert utstyret på {vehicle.make} {vehicle.model} ({vehicle.year}) og funnet
            den beste matchen:
          </p>

          {hasClearWinner ? (
            <div className="mt-2 rounded-lg bg-white/80 border border-amber-200 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                  <Check className="h-3 w-3" /> ANBEFALT
                </span>
                <span className="font-mono text-sm font-bold text-gray-900">
                  {best.product.eurocode || best.product.articleNumber}
                </span>
                <span className="text-xs text-gray-500">
                  kr {best.product.price?.toLocaleString('no-NO')}
                </span>
              </div>
              <p className="text-xs text-gray-600">{best.explanation}</p>

              {best.mismatches.length > 0 && (
                <p className="text-[10px] text-amber-600 mt-1">
                  <AlertCircle className="h-3 w-3 inline mr-0.5" />
                  Vil du ha en rimeligere variant uten {best.mismatches.join(', ')}?
                  Se alternativene nedenfor.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-700">
              <HelpCircle className="h-4 w-4 flex-shrink-0" />
              <span>
                Flere glass passer like bra. Sjekk beskrivelsen for å se forskjellen
                (farge, utstyr, etc.).
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
