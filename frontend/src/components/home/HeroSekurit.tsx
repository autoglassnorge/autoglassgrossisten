import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, ScanLine, Sparkles } from 'lucide-react';
import { HeroVideo } from './HeroVideo';
import { HeroSearch } from './HeroSearch';

/**
 * HeroSekurit - Inspirert av Sekurit Service design
 * Mørk hero med VehicleWizard for guided search
 * Autoglass farger: carbon-950 bg, glass-cyan aksenter
 */

type SearchMode = 'wizard' | 'vin';

export function HeroSekurit() {
  const [searchMode, setSearchMode] = useState<SearchMode>('wizard');
  const [vinValue, setVinValue] = useState('');
  const navigate = useNavigate();

  const handleVinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = vinValue.trim().toUpperCase();
    if (!v || v.length !== 17) return;
    navigate(`/sok?vin=${encodeURIComponent(v)}`);
  };

  // Wizard handles its own navigation via SummaryStep

  return (
    <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden bg-carbon-950">
      {/* Bakgrunnsvideo med mørk overlay */}
      <div className="absolute inset-0">
        <HeroVideo />
        <div className="absolute inset-0 bg-gradient-to-b from-carbon-950/80 via-carbon-950/70 to-carbon-950/90" />
      </div>

      {/* Innhold */}
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        {/* Eyebrow */}
        <div className="text-center mb-6">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-glass-cyan/10 border border-glass-cyan/30 text-glass-cyan text-sm font-medium">
            <Car className="h-4 w-4" />
            B2B Grossist av bilglass
          </span>
        </div>

        {/* Hovedtittel */}
        <h1 className="text-center text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
          Finn riktig glass til{' '}
          <span className="text-glass-cyan">din bil</span>
        </h1>

        <p className="text-center text-lg text-carbon-300 mb-10 max-w-2xl mx-auto">
          Søk med registreringsnummer for å finde kompatibelt bilglass.
          27 000+ produkter på lager.
        </p>

        {/* Search mode toggle */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex bg-carbon-900/50 rounded-lg p-1 border border-carbon-800">
            <button
              type="button"
              onClick={() => setSearchMode('wizard')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                searchMode === 'wizard'
                  ? 'bg-glass-cyan text-carbon-950'
                  : 'text-carbon-400 hover:text-white'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              Veiviser
            </button>
            <button
              type="button"
              onClick={() => setSearchMode('vin')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                searchMode === 'vin'
                  ? 'bg-glass-cyan text-carbon-950'
                  : 'text-carbon-400 hover:text-white'
              }`}
            >
              <ScanLine className="h-4 w-4" />
              VIN-søk
            </button>
          </div>
        </div>

        {/* Search container */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-white/10 shadow-2xl">
          {searchMode === 'wizard' ? (
            <HeroSearch />
          ) : (
            <form onSubmit={handleVinSubmit} className="space-y-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-carbon-400">
                  <ScanLine className="h-5 w-5" />
                </div>
                <input
                  type="text"
                  value={vinValue}
                  onChange={(e) => setVinValue(e.target.value.toUpperCase())}
                  placeholder="Skriv inn VIN (17 tegn)..."
                  className="w-full bg-carbon-900/80 border border-carbon-700 rounded-xl py-4 pl-12 pr-16 text-white placeholder:text-carbon-500 text-lg focus:outline-none focus:border-glass-cyan focus:ring-2 focus:ring-glass-cyan/20 transition-all"
                  maxLength={17}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-carbon-500">
                  {vinValue.length}/17
                </div>
              </div>
              <button
                type="submit"
                disabled={vinValue.length !== 17}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-glass-cyan hover:bg-glass-cyanLight disabled:bg-carbon-700 disabled:text-carbon-500 text-carbon-950 font-semibold rounded-xl transition-colors"
              >
                Søk med VIN
              </button>
              <p className="text-center text-xs text-carbon-500">
                VIN (Vehicle Identification Number) finner du i vognkortet eller på bilens dashboard
              </p>
            </form>
          )}
        </div>

        {/* Quick stats */}
        <div className="flex flex-wrap justify-center gap-6 sm:gap-10 mt-10 text-center">
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-glass-cyan">27k+</div>
            <div className="text-sm text-carbon-400">Produkter</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-glass-cyan">88</div>
            <div className="text-sm text-carbon-400">Merker</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-glass-cyan">24t</div>
            <div className="text-sm text-carbon-400">Levering</div>
          </div>
        </div>
      </div>

      {/* Bunn-gradient */}
      <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-carbon-950 to-transparent" />
    </section>
  );
}
