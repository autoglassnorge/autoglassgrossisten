import { useState, useRef, useCallback } from 'react';
import { Camera, Upload, X, Loader2, ScanLine, AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface Props {
  onRegnrFound: (regnr: string) => void;
}

/**
 * Norwegian license plate patterns:
 * - Standard: AB12345 (2 letters + 5 digits)
 * - Vintage: A1234 (1 letter + 4 digits)
 * - Diplomatic: CD12345
 * - Military: XN12345 etc.
 */
const REGNR_PATTERNS = [
  /\b[A-Z]{2}\d{5}\b/,       // AB12345
  /\b[A-Z]\d{4,5}\b/,        // A1234, A12345
  /\bCD\d{4,5}\b/,           // Diplomatic
];

function extractRegnr(text: string): string | null {
  const clean = text.toUpperCase().replace(/\s/g, '').replace(/[\-_]/g, '');
  for (const pattern of REGNR_PATTERNS) {
    const match = clean.match(pattern);
    if (match) return match[0];
  }
  // Try looser matching in original text
  const words = text.toUpperCase().split(/\s+/);
  for (const word of words) {
    const w = word.replace(/[^A-Z0-9]/g, '');
    if (/^[A-Z]{2}\d{4,5}$/.test(w)) return w;
    if (/^[A-Z]\d{4,5}$/.test(w)) return w;
  }
  return null;
}

export function ImageUploadOcr({ onRegnrFound }: Props) {
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading-model' | 'scanning' | 'found' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [foundRegnr, setFoundRegnr] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setStatus('error');
      setErrorMsg('Vennligst last opp et bilde (JPG, PNG)');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Start OCR
    setStatus('loading-model');
    setProgress(0);
    setErrorMsg('');

    try {
      const { createWorker } = await import('tesseract.js');
      setStatus('scanning');

      const worker = await createWorker('nor', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      const result = await worker.recognize(file);
      await worker.terminate();

      const text = result.data.text;
      const regnr = extractRegnr(text);

      if (regnr) {
        setFoundRegnr(regnr);
        setStatus('found');
        onRegnrFound(regnr);
      } else {
        setStatus('error');
        setErrorMsg(`Fant ingen registreringsnummer. OCR fant: "${text.slice(0, 100)}..."`);
      }
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Ukjent feil under OCR');
    }
  }, [onRegnrFound]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropRef.current) dropRef.current.classList.remove('border-blue-400', 'bg-blue-50');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (dropRef.current) dropRef.current.classList.add('border-blue-400', 'bg-blue-50');
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (dropRef.current) dropRef.current.classList.remove('border-blue-400', 'bg-blue-50');
  }, []);

  const reset = () => {
    setImage(null);
    setStatus('idle');
    setProgress(0);
    setErrorMsg('');
    setFoundRegnr('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {status === 'idle' && (
        <div
          ref={dropRef}
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={cn(
            'cursor-pointer rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center transition-all hover:border-blue-400 hover:bg-blue-50/50'
          )}
        >
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <Camera className="h-6 w-6 text-blue-600" />
          </div>
          <p className="text-sm font-medium text-gray-700">
            Ta bilde av regnr-skiltet
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Dra inn bilde, eller klikk for å velge
          </p>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <Upload className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs text-gray-500">JPG, PNG • Maks 10 MB</span>
          </div>
        </div>
      )}

      {/* Preview + scanning state */}
      {(status === 'loading-model' || status === 'scanning' || status === 'found' || status === 'error') && image && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {/* Image preview */}
          <div className="relative">
            <img src={image} alt="Opplastet bilde" className="w-full h-40 object-contain bg-gray-50" />
            <button
              onClick={reset}
              className="absolute top-2 right-2 rounded-full bg-white/90 p-1.5 shadow-sm hover:bg-white"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>

          <div className="p-3">
            {status === 'loading-model' && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span>Laster OCR-modell...</span>
              </div>
            )}

            {status === 'scanning' && (
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                  <ScanLine className="h-4 w-4 text-blue-600" />
                  <span>Leser tekst fra bildet...</span>
                  <span className="text-sm text-gray-500 ml-auto">{progress}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {status === 'found' && (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                  <Check className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500">Registreringsnummer funnet:</p>
                  <p className="text-lg font-bold font-mono text-gray-900 tracking-wider">
                    {foundRegnr}
                  </p>
                </div>
                <Button size="sm" onClick={() => onRegnrFound(foundRegnr)}>
                  Søk
                </Button>
              </div>
            )}

            {status === 'error' && (
              <div>
                <div className="flex items-start gap-2 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium">Fant ikke registreringsnummer</p>
                    <p className="text-xs text-red-500 mt-1 break-words">{errorMsg}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="mt-2 w-full" onClick={reset}>
                  Prøv igjen
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
