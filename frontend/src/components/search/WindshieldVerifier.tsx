import { useState, useRef, useCallback } from 'react';
import { Camera, X, Check, Eye, EyeOff, HelpCircle, ChevronDown, ChevronUp, Scan, AlertTriangle } from 'lucide-react';
import type { Product } from '@/types/api';
import { extractFeaturesExtended } from '@/lib/extractFeatures';

interface Props {
  products: Product[];
  onFilter: (filtered: Product[]) => void;
}

interface FeatureCheck {
  key: string;
  label: string;
  description: string;
  howToCheck: string;
  answer?: boolean | null;
}

/**
 * Features that can be visually verified on a windshield
 */
const FEATURE_CHECKS: FeatureCheck[] = [
  {
    key: 'hud',
    label: 'Head-Up Display (HUD)',
    description: 'En liten projektor bak rattet som viser hastighet i frontruten',
    howToCheck: 'Se etter en liten kvadratisk/rund flekk midt på ruten bak rattet, eller en reflektiv sone der du ser hastighet/prosjisert.',
  },
  {
    key: 'sensor',
    label: 'Regn-/lyssensor',
    description: 'Sensor bak frontruten som styrer vindusviskere og lys automatisk',
    howToCheck: 'Se etter en liten rund "øye" eller oval flekk i midten øverst på frontruten (bak speilet).',
  },
  {
    key: 'kamera',
    label: 'Kamera / ADAS',
    description: 'Kamera bak frontruten for filholder, adaptiv cruise, etc.',
    howToCheck: 'Se etter en liten rektangulær åpning eller svart flekk bak speilet, ofte med to kameraer.',
  },
  {
    key: 'varme',
    label: 'Varmeelement',
    description: 'Tynne ledninger i glasset som gir rask avising',
    howToCheck: 'Se nøye etter tynne, nesten usynlige horisontale eller vertikale tråder i glasset (som på bakruten, men mye finere).',
  },
  {
    key: 'antenne',
    label: 'Antenne i glass',
    description: 'Radio/GPS-antenne integrert i frontruten',
    howToCheck: 'Se etter tynne sølvfargede linjer (mønster) i glasset, ofte i øvre kant eller langs sidene.',
  },
  {
    key: 'akustisk',
    label: 'Akustisk glass',
    description: 'Dempet støy for bedre komfort',
    howToCheck: 'Vanskelig å se visuelt. Sjekk om det står "Acoustic" eller et symbol på glasskanten (nederst i hjørnet).',
  },
];

function getProductFeatures(product: Product): Record<string, boolean> {
  const features = extractFeaturesExtended(product.description) as unknown as Record<string, boolean>;
  const properties = product.properties as Record<string, unknown> | undefined;
  if (properties) {
    for (const key of ['hud', 'heated', 'rainSensor', 'camera', 'adas', 'acoustic', 'antenna']) {
      if (key in properties) {
        features[key] = properties[key] === true || properties[key] === 1;
      }
    }
    features.sensor = features.rainSensor;
    features.kamera = features.camera;
    features.varme = features.heated;
    features.akustisk = features.acoustic;
    features.antenne = features.antenna;
  }
  return features;
}

function scoreProduct(product: Product, answers: Record<string, boolean | null>): number {
  const pf = getProductFeatures(product);
  let score = 0;
  let checked = 0;
  for (const [key, answer] of Object.entries(answers)) {
    if (answer === null) continue;
    checked++;
    const has = pf[key] || false;
    if (answer === true && has) score += 2;
    else if (answer === false && !has) score += 1;
    else if (answer === true && !has) score -= 2; // Product missing feature customer HAS
    else if (answer === false && has) score -= 1; // Product has feature customer DOESN'T have
  }
  // Normalize: if nothing checked, return 0
  return checked > 0 ? score : 0;
}

export function WindshieldVerifier({ products, onFilter }: Props) {
  const [step, setStep] = useState<'upload' | 'guide' | 'checking' | 'result'>('upload');
  const [image, setImage] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean | null>>({});
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target?.result as string);
      setStep('guide');
    };
    reader.readAsDataURL(file);
  }, []);

  const setAnswer = (key: string, value: boolean | null) => {
    const next = { ...answers, [key]: value };
    setAnswers(next);

    const matched = products.filter(p => {
      for (const [k, answer] of Object.entries(next)) {
        if (answer === null) continue;
        const has = getProductFeatures(p)[k] || false;
        if (answer === true && !has) return false;
        if (answer === false && has) return false;
      }
      return true;
    });

    const source = matched.length > 0 ? matched : products;
    const scored = source.map(p => ({
      product: p,
      score: scoreProduct(p, next),
    })).sort((a, b) => b.score - a.score);

    const filtered = scored.map(s => s.product);
    onFilter(filtered);
  };

  const checkedCount = Object.values(answers).filter(v => v !== null).length;
  const matchedCount = products.filter(p => {
    for (const [key, answer] of Object.entries(answers)) {
      if (answer === null) continue;
      const has = getProductFeatures(p)[key] || false;
      if (answer === true && !has) return false;
      if (answer === false && has) return false;
    }
    return true;
  }).length;

  const bestMatch = products.map(p => ({ product: p, score: scoreProduct(p, answers) }))
    .sort((a, b) => b.score - a.score)[0];

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
      <div className="flex items-start gap-3">
        <Scan className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-emerald-900 text-sm">
            Ikke sikker på hvilket glass? Sjekk din frontrute!
          </h4>
          <p className="text-xs text-emerald-700 mt-1">
            Last opp et bilde av din frontrute, eller svar på spørsmålene nedenfor for å finne riktig glass.
          </p>

          {/* Upload */}
          {step === 'upload' && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 cursor-pointer rounded-lg border-2 border-dashed border-emerald-300 bg-white/60 p-4 text-center hover:border-emerald-500 hover:bg-white transition-all"
            >
              <Camera className="mx-auto h-6 w-6 text-emerald-500 mb-1" />
              <p className="text-xs font-medium text-emerald-800">Last opp bilde av frontruten</p>
              <p className="text-[10px] text-emerald-600">Klikk eller dra bilde hit</p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          {/* Guide with image + questions */}
          {(step === 'guide' || step === 'checking') && (
            <div className="mt-3 space-y-3">
              {image && (
                <div className="relative rounded-lg overflow-hidden border border-emerald-200">
                  <img src={image} alt="Din frontrute" className="w-full h-32 object-cover" />
                  <button
                    onClick={() => { setImage(null); setStep('upload'); setAnswers({}); onFilter(products); }}
                    className="absolute top-1.5 right-1.5 rounded-full bg-white/90 p-1 shadow-sm"
                  >
                    <X className="h-3.5 w-3.5 text-gray-500" />
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {FEATURE_CHECKS.map((feature) => {
                  const answer = answers[feature.key];
                  const isExpanded = expandedFeature === feature.key;

                  return (
                    <div
                      key={feature.key}
                      className="rounded-lg border border-emerald-100 bg-white/80 overflow-hidden"
                    >
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button
                          onClick={() => setExpandedFeature(isExpanded ? null : feature.key)}
                          className="flex items-center gap-1 text-emerald-700 flex-shrink-0"
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                        <span className="text-xs font-medium text-gray-800 flex-1">{feature.label}</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setAnswer(feature.key, true)}
                            className={`inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
                              answer === true
                                ? 'bg-green-100 text-green-700 border border-green-300'
                                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <Eye className="h-3 w-3" /> Ja
                          </button>
                          <button
                            onClick={() => setAnswer(feature.key, false)}
                            className={`inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
                              answer === false
                                ? 'bg-red-100 text-red-700 border border-red-300'
                                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <EyeOff className="h-3 w-3" /> Nei
                          </button>
                          <button
                            onClick={() => setAnswer(feature.key, null)}
                            className={`inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
                              answer === null || answer === undefined
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <HelpCircle className="h-3 w-3" /> Usikker
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-3 pb-2 text-[11px] text-gray-600 border-t border-emerald-50 pt-2">
                          <p className="font-medium text-gray-700">{feature.description}</p>
                          <p className="mt-1 text-emerald-700">
                            <span className="font-medium">Hvordan sjekke:</span> {feature.howToCheck}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Results summary */}
              {checkedCount > 0 && (
                <div className="rounded-lg bg-white border border-emerald-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700">
                      {matchedCount} av {products.length} glass passer
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {checkedCount} av {FEATURE_CHECKS.length} sjekket
                    </span>
                  </div>

                  {bestMatch && matchedCount > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-bold font-mono text-gray-900">
                        {bestMatch.product.eurocode || bestMatch.product.articleNumber}
                      </span>
                      <span className="text-xs text-gray-500">
                        {bestMatch.product.description?.slice(0, 60)}...
                      </span>
                    </div>
                  )}

                  {matchedCount === 0 && (
                    <div className="mt-2 flex items-center gap-2 text-amber-700">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs">
                        Ingen glass matcher alle valgene. Prøv å endre "Nei" til "Usikker".
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
