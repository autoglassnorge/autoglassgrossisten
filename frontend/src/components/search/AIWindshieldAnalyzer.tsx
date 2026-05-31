import { useState, useRef, useCallback } from 'react';
import { Camera, X, Loader2, Scan, Sparkles, Check, AlertTriangle } from 'lucide-react';
import type { Product } from '@/types/api';
import { extractFeatures, extractColor } from '@/lib/extractFeatures';

const API_URL = import.meta.env.VITE_API_URL || 'https://autoglass-glass-sok.autoglassnorge.workers.dev';

interface AIAnalysis {
  hud: boolean;
  rainSensor: boolean;
  camera: boolean;
  heated: boolean;
  antenna: boolean;
  acoustic: boolean;
  color: string | null;
  confidence: number;
  reasoning: string;
}

interface Props {
  products: Product[];
  onFilter: (filtered: Product[]) => void;
}

// Note: extractFeatures and extractColor now imported from @/lib/extractFeatures

function scoreProduct(product: Product, analysis: AIAnalysis): number {
  const pf = extractFeatures(product.description);
  const pc = extractColor(product.description);
  let score = 0;

  // Feature matching
  if (analysis.hud === pf.hud) score += 3;
  if (analysis.rainSensor === pf.rainSensor) score += 3;
  if (analysis.camera === pf.camera) score += 3;
  if (analysis.heated === pf.heated) score += 2;
  if (analysis.antenna === pf.antenna) score += 2;
  if (analysis.acoustic === pf.acoustic) score += 2;

  // Color matching
  if (analysis.color && pc && analysis.color === pc) score += 3;

  return score;
}

export function AIWindshieldAnalyzer({ products, onFilter }: Props) {
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'done' | 'error'>('idle');
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Vennligst last opp et bilde');
      setStatus('error');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setImage(base64);
      setStatus('uploading');
      setErrorMsg('');

      try {
        // Extract base64 data only
        const base64Data = base64.split(',')[1];

        const res = await fetch(`${API_URL}/api/analyze-windshield`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Data }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        const aiResult: AIAnalysis = data.analysis;
        setAnalysis(aiResult);
        setStatus('done');

        // Auto-filter products
        const scored = products.map(p => ({
          product: p,
          score: scoreProduct(p, aiResult),
        })).sort((a, b) => b.score - a.score);

        onFilter(scored.map(s => s.product));

      } catch (e) {
        setStatus('error');
        setErrorMsg(e instanceof Error ? e.message : 'Ukjent feil');
      }
    };
    reader.readAsDataURL(file);
  }, [products, onFilter]);

  const reset = () => {
    setImage(null);
    setStatus('idle');
    setAnalysis(null);
    setErrorMsg('');
    onFilter(products);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const featureLabels: Record<string, string> = {
    hud: 'Head-Up Display',
    rainSensor: 'Regnsensor',
    camera: 'Kamera / ADAS',
    heated: 'Varmeelement',
    antenna: 'Antenne i glass',
    acoustic: 'Akustisk glass',
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/80 p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-violet-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-violet-900 text-sm">
            AI-analyse av din frontrute
          </h4>
          <p className="text-xs text-violet-700 mt-1">
            Last opp et bilde av frontruten din — vår AI analyserer utstyret automatisk.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          {status === 'idle' && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 w-full cursor-pointer rounded-lg border-2 border-dashed border-violet-300 bg-white/60 p-4 text-center hover:border-violet-500 hover:bg-white transition-all"
            >
              <Camera className="mx-auto h-6 w-6 text-violet-500 mb-1" />
              <p className="text-xs font-medium text-violet-800">Ta bilde av frontruten din</p>
              <p className="text-[10px] text-violet-600">Fokuser på øvre del (bak speilet)</p>
            </button>
          )}

          {(status === 'uploading' || status === 'analyzing') && image && (
            <div className="mt-3 rounded-lg border border-violet-200 bg-white overflow-hidden">
              <div className="relative">
                <img src={image} alt="Din frontrute" className="w-full h-32 object-cover" />
              </div>
              <div className="p-3 flex items-center gap-2 text-sm text-violet-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI analyserer bildet...</span>
              </div>
            </div>
          )}

          {status === 'done' && analysis && (
            <div className="mt-3 space-y-3">
              {image && (
                <div className="relative rounded-lg overflow-hidden border border-violet-200">
                  <img src={image} alt="Din frontrute" className="w-full h-28 object-cover" />
                  <button
                    onClick={reset}
                    className="absolute top-1.5 right-1.5 rounded-full bg-white/90 p-1 shadow-sm"
                  >
                    <X className="h-3.5 w-3.5 text-gray-500" />
                  </button>
                </div>
              )}

              {/* AI Results */}
              <div className="rounded-lg bg-white border border-violet-200 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Scan className="h-4 w-4 text-violet-600" />
                  <span className="text-xs font-bold text-violet-800">AI fant følgende:</span>
                  <span className="text-[10px] text-violet-500 ml-auto">
                    Sikkerhet: {Math.round(analysis.confidence * 100)}%
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(featureLabels).map(([key, label]) => {
                    const val = (analysis as unknown as Record<string, boolean | string | null>)[key];
                    const isBool = typeof val === 'boolean';
                    if (!isBool) return null;
                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium ${
                          val
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-gray-50 text-gray-500 border border-gray-200'
                        }`}
                      >
                        {val ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {label}
                      </div>
                    );
                  })}
                  {analysis.color && (
                    <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      <Check className="h-3 w-3" />
                      Farge: {analysis.color}
                    </div>
                  )}
                </div>

                {analysis.reasoning && (
                  <p className="text-[10px] text-gray-500 mt-2 italic">
                    "{analysis.reasoning.slice(0, 200)}"
                  </p>
                )}
              </div>

              <div className="rounded-lg bg-green-50 border border-green-200 p-2.5">
                <div className="flex items-center gap-1.5 text-green-800">
                  <Check className="h-4 w-4" />
                  <span className="text-xs font-medium">Glass sortert etter AI-match!</span>
                </div>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-red-700">Analyse feilet</p>
                  <p className="text-[10px] text-red-600">{errorMsg}</p>
                </div>
              </div>
              <button
                onClick={reset}
                className="mt-2 text-xs text-red-600 hover:underline"
              >
                Prøv igjen
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
