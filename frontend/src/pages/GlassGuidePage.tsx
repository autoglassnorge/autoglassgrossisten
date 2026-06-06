import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Search, Loader2, Wrench, Car, Sparkles, Hash, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageMeta } from '@/components/seo/PageMeta';
import { guideGlass, type GuideState } from '@/api/glass';
import { GuideStep } from '@/components/guide/GuideStep';
import { GuideResult } from '@/components/guide/GuideResult';
import { GuideProgress } from '@/components/guide/GuideProgress';
import { SearchError } from '@/api/glass';

export default function GlassGuidePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialRegnr = searchParams.get('regnr') ?? '';
  const initialCategory = searchParams.get('category') ?? undefined;

  const [inputType, setInputType] = useState<'regnr' | 'vin'>('regnr');
  const [regnr, setRegnr] = useState(initialRegnr);
  const [vin, setVin] = useState('');
  const [activeInput, setActiveInput] = useState('');
  const [activeType, setActiveType] = useState<'regnr' | 'vin'>('regnr');
  const [categoryFilter] = useState<string | undefined>(initialCategory);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [guideState, setGuideState] = useState<GuideState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'rule' | 'llm'>('rule');

  const callGuide = useCallback(
    async (
      input: string,
      type: 'regnr' | 'vin',
      s: number,
      a: Record<string, string>,
      m: 'rule' | 'llm',
      cat?: string
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        const state = await guideGlass(
          type === 'regnr' ? input : '',
          s,
          a,
          cat,
          m,
          type === 'vin' ? input : undefined
        );
        setGuideState(state);
        setIsLoading(false);
        return state;
      } catch (e) {
        setIsLoading(false);
        if (e instanceof SearchError) {
          setError(e.message);
        } else {
          setError('Noe gikk galt. Prøv igjen.');
        }
        throw e;
      }
    },
    []
  );

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();

    let inputValue = '';
    if (inputType === 'regnr') {
      inputValue = regnr.trim().toUpperCase();
      if (inputValue.length < 2) return;
    } else {
      inputValue = vin.trim().toUpperCase();
      if (inputValue.length !== 17) {
        setError('VIN må være nøyaktig 17 tegn');
        return;
      }
      if (/[IOQ]/.test(inputValue)) {
        setError('VIN kan ikke inneholde bokstavene I, O eller Q');
        return;
      }
    }

    setActiveInput(inputValue);
    setActiveType(inputType);
    setStep(0);
    setAnswers({});
    setGuideState(null);
    setError(null);

    await callGuide(inputValue, inputType, 0, {}, mode, categoryFilter);
  };

  const handleAnswer = async (value: string) => {
    const newAnswers = { ...answers, [guideState!.question!.id]: value };
    setAnswers(newAnswers);
    const nextStep = step + 1;
    setStep(nextStep);

    await callGuide(activeInput, activeType, nextStep, newAnswers, mode, categoryFilter);
  };

  const handleBack = () => {
    if (step <= 0) return;
    const prevStep = step - 1;
    const prevAnswers: Record<string, string> = {};
    const keys = Object.keys(answers);
    for (let i = 0; i < prevStep; i++) {
      const qid = guideState?.answers ? Object.keys(guideState.answers)[i] : keys[i];
      if (qid && answers[qid] !== undefined) {
        prevAnswers[qid] = answers[qid];
      }
    }
    setStep(prevStep);
    setAnswers(prevAnswers);
    callGuide(activeInput, activeType, prevStep, prevAnswers, mode, categoryFilter);
  };

  const handleRestart = () => {
    setStep(0);
    setAnswers({});
    setGuideState(null);
    setError(null);
    setRegnr('');
    setVin('');
  };

  const handleShowAll = () => {
    navigate(`/sok?regnr=${encodeURIComponent(activeInput)}`);
  };

  const isInputValid = inputType === 'regnr'
    ? regnr.trim().length >= 2
    : vin.trim().length === 17;

  return (
    <>
      <PageMeta
        title="AI Glassvelger — finn riktig glass steg for steg"
        description="Svar på 3–5 spørsmål, så finner vi eksakt riktig bilglass for kjøretøyet ditt."
        canonicalPath="/glass-guide"
      />
      <div className="mx-auto max-w-3xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-10">
          <div className="inline-flex items-center gap-2 bg-autoglass-blue/10 text-autoglass-blue rounded-full px-3 py-1 text-sm font-medium mb-3">
            <Wrench className="w-4 h-4" />
            AI Glassvelger
          </div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mb-2">
            Finn riktig glass steg for steg
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Velg inngangsmåte og svar på noen enkle spørsmål.
          </p>
        </div>

        {/* Mode toggle (Standard / Smart) */}
        {(!guideState || guideState.recommendation) && (
          <div className="flex justify-center mb-4">
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => setMode('rule')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                  mode === 'rule'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => setMode('llm')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                  mode === 'llm'
                    ? 'bg-white text-autoglass-blue shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Smart hjelp
                </span>
              </button>
            </div>
          </div>
        )}

        {mode === 'llm' && (!guideState || guideState.recommendation) && (
          <div className="max-w-sm mx-auto mb-6 rounded-lg border border-autoglass-blue/20 bg-autoglass-blue/5 p-3 text-center">
            <p className="text-sm text-autoglass-blue">
              <Sparkles className="w-4 h-4 inline mr-1" />
              Moonshot Kimi K2.5 analyserer kjøretøyet og stiller smarte spørsmål
            </p>
          </div>
        )}

        {/* Input type toggle + input form */}
        {(!guideState || guideState.recommendation) && (
          <div className="max-w-sm mx-auto mb-8 space-y-4">
            {/* Regnr / VIN toggle */}
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => { setInputType('regnr'); setError(null); }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition ${
                  inputType === 'regnr'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Car className="w-4 h-4" />
                Regnr
              </button>
              <button
                type="button"
                onClick={() => { setInputType('vin'); setError(null); }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition ${
                  inputType === 'vin'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Hash className="w-4 h-4" />
                VIN
              </button>
            </div>

            <form onSubmit={handleStart}>
              <div className="flex gap-2">
                <Input
                  placeholder={inputType === 'regnr' ? 'AB12345' : 'WVWZZZ7HZDV000000'}
                  value={inputType === 'regnr' ? regnr : vin}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    if (inputType === 'regnr') setRegnr(val);
                    else setVin(val);
                  }}
                  className="h-12 text-lg uppercase"
                  maxLength={inputType === 'regnr' ? 8 : 17}
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  size="lg"
                  className="h-12 px-5"
                  disabled={isLoading || !isInputValid}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Search className="w-5 h-5" />
                  )}
                </Button>
              </div>
              {inputType === 'vin' && (
                <p className="text-xs text-gray-400 mt-1.5">
                  17 tegn, uten I, O eller Q
                </p>
              )}
            </form>

            {/* Fallback: ikke regnr/VIN */}
            <div className="text-center">
              <Link
                to="/bla"
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-autoglass-blue transition"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Jeg har ikke regnr eller VIN — bla i katalogen
              </Link>
            </div>
          </div>
        )}

        {/* Kjøretøy-info */}
        {guideState?.vehicle && !guideState.recommendation && (
          <div className="flex items-center justify-center gap-2 mb-6 text-sm text-gray-600">
            <Car className="w-4 h-4" />
            <span className="font-medium">
              {guideState.vehicle.make} {guideState.vehicle.model} ({guideState.vehicle.year})
            </span>
            {activeType === 'vin' && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                VIN
              </span>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="max-w-sm mx-auto mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Guide content */}
        {guideState && !guideState.recommendation && guideState.question && (
          <div className="space-y-6">
            <GuideProgress
              current={guideState.progress.current}
              total={guideState.progress.total}
            />
            <GuideStep
              question={guideState.question}
              onAnswer={handleAnswer}
              onBack={step > 0 ? handleBack : undefined}
              isLoading={isLoading}
            />
            <p className="text-center text-xs text-gray-400">
              {guideState.candidates} glass matcher så langt
            </p>
          </div>
        )}

        {/* Result */}
        {guideState?.recommendation && (
          <div className="space-y-6">
            <GuideProgress
              current={guideState.progress.current}
              total={guideState.progress.total}
            />
            <GuideResult
              recommendations={guideState.recommendation}
              vehicle={guideState.vehicle}
              onRestart={handleRestart}
              onShowAll={handleShowAll}
            />
          </div>
        )}

        {/* Info */}
        {!guideState && !isLoading && (
          <div className="mt-10 max-w-md mx-auto">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 text-center">
              Hvordan fungerer det?
            </h3>
            <div className="space-y-3">
              {[
                { num: '1', text: 'Velg regnr eller VIN' },
                { num: '2', text: 'Svar på 3–5 enkle spørsmål om utstyr' },
                { num: '3', text: 'Få anbefalt det riktige glasset' },
              ].map((item) => (
                <div key={item.num} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-autoglass-blue text-white text-sm font-bold">
                    {item.num}
                  </span>
                  <span className="text-sm text-gray-700">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
