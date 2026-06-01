import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Car, ScanLine } from 'lucide-react';
import { HeroVideo } from './HeroVideo';

/**
 * HeroSekurit - Inspirert av Sekurit Service design
 * Mørk hero med stort, prominent søkefelt
 * Autoglass farger: carbon-950 bg, glass-cyan aksenter
 */

export function HeroSekurit() {
  const [searchValue, setSearchValue] = useState('');
  const [searchType, setSearchType] = useState<'regnr' | 'vin'>('regnr');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = searchValue.trim().toUpperCase();
    if (!v) return;
    
    // Bestem om det er VIN (17 tegn) eller regnr
    const isVin = v.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/i.test(v);
    const param = isVin ? 'vin' : 'regnr';
    
    navigate(`/sok?${param}=${encodeURIComponent(v)}`);
  };

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
          Søk med registreringsnummer eller VIN for å finne kompatibelt bilglass. 
          27 000+ produkter på lager.
        </p>

        {/* Søkefelt-container */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-2 sm:p-4 border border-white/10 shadow-2xl">
          {/* Toggle VIN/Regnr */}
          <div className="flex justify-center mb-4">
            <div className="inline-flex bg-carbon-900/50 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setSearchType('regnr')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  searchType === 'regnr'
                    ? 'bg-glass-cyan text-carbon-950'
                    : 'text-carbon-400 hover:text-white'
                }`}
              >
                Reg.nr
              </button>
              <button
                type="button"
                onClick={() => setSearchType('vin')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  searchType === 'vin'
                    ? 'bg-glass-cyan text-carbon-950'
                    : 'text-carbon-400 hover:text-white'
                }`}
              >
                VIN
              </button>
            </div>
          </div>

          {/* Søkefelt */}
          <form onSubmit={handleSubmit} className="relative">
            <div className="flex items-stretch gap-2">
              <div className="relative flex-1">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-carbon-400">
                  {searchType === 'vin' ? (
                    <ScanLine className="h-5 w-5" />
                  ) : (
                    <Car className="h-5 w-5" />
                  )}
                </div>
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
                  placeholder={searchType === 'vin' 
                    ? 'Skriv inn VIN (17 tegn)...' 
                    : 'F.eks. EB21570...'
                  }
                  className="w-full bg-carbon-900/80 border border-carbon-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-carbon-500 text-lg focus:outline-none focus:border-glass-cyan focus:ring-2 focus:ring-glass-cyan/20 transition-all"
                  maxLength={searchType === 'vin' ? 17 : 10}
                />
                {searchType === 'vin' && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-carbon-500">
                    {searchValue.length}/17
                  </div>
                )}
              </div>
              <button
                type="submit"
                className="flex items-center gap-2 px-6 sm:px-8 py-4 bg-glass-cyan hover:bg-glass-cyanLight text-carbon-950 font-semibold rounded-xl transition-colors"
              >
                <Search className="h-5 w-5" />
                <span className="hidden sm:inline">Søk</span>
              </button>
            </div>
          </form>

          {/* Hjelpetekst */}
          <p className="text-center text-xs text-carbon-500 mt-3">
            {searchType === 'vin' 
              ? 'VIN (Vehicle Identification Number) finner du i vognkortet eller på bilens dashboard'
              : 'Registreringsnummer finner du på skiltene på bilen'
            }
          </p>
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
