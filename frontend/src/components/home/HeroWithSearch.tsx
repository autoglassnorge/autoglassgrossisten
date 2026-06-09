/**
 * HeroWithSearch — Direct regnr search as the primary CTA on homepage.
 * Dark gradient background, B2B badge, quick stats.
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Clock, X, Car, MessageCircle } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { BUSINESS_METRICS, formatCompact, formatFull } from '@/constants/businessMetrics';

const RECENT_SEARCHES_KEY = 'ag_recent_searches';

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function HeroWithSearch() {
  const [regnr, setRegnr] = useState('');
  const [showRecent, setShowRecent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { openChat } = useChatStore();

  const recentSearches = getRecentSearches();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = regnr.trim().toUpperCase();
    if (v.length >= 2) {
      if (window.innerWidth < 640) {
        openChat({ regnr: v });
      } else {
        navigate(`/sok?regnr=${encodeURIComponent(v)}`);
      }
    }
  };

  const handleSelectRecent = (r: string) => {
    setRegnr(r);
    if (window.innerWidth < 640) {
      openChat({ regnr: r });
    } else {
      navigate(`/sok?regnr=${encodeURIComponent(r)}`);
    }
    setShowRecent(false);
  };

  return (
    <section className="relative min-h-[60vh] sm:min-h-[70vh] flex items-center justify-center overflow-hidden bg-carbon-950">
      {/* Background image with dark overlay */}
      <div className="absolute inset-0">
        <img
          src="/hero-bg.jpg"
          alt=""
          className="h-full w-full object-cover object-center"
          loading="eager"
        />
        <div className="absolute inset-0 bg-carbon-950/75" />
        <div className="absolute inset-0 bg-gradient-to-t from-carbon-950 via-transparent to-carbon-950/50" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        {/* Eyebrow */}
        <div className="text-center mb-6">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-glass-cyan/10 border border-glass-cyan/30 text-glass-cyan text-sm font-medium">
            <Car className="h-4 w-4" />
            B2B Grossist av bilglass — eks. mva
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-center text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
          Finn riktig glass til{' '}
          <span className="text-glass-cyan">din bil</span>
        </h1>

        <p className="text-center text-base sm:text-lg text-carbon-300 mb-10 max-w-xl mx-auto">
          Søk med registreringsnummer for å finne kompatibelt bilglass.
          {formatFull(BUSINESS_METRICS.GLASS_IN_STOCK)}+ glass på lager.{' '}
          {formatFull(BUSINESS_METRICS.VARIANTS)}+ forskjellige varianter.
        </p>

        {/* Search form */}
        <div className="relative">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-carbon-400">
                <Search className="h-5 w-5" />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={regnr}
                onChange={(e) => setRegnr(e.target.value.toUpperCase())}
                onFocus={() => setShowRecent(true)}
                placeholder="AB12345"
                className="w-full bg-carbon-900/80 border border-carbon-700 rounded-xl py-4 pl-12 pr-10 text-white placeholder:text-carbon-500 text-lg uppercase focus:outline-none focus:border-glass-cyan focus:ring-2 focus:ring-glass-cyan/20 transition-all"
                maxLength={8}
                autoComplete="off"
              />
              {regnr && (
                <button
                  type="button"
                  onClick={() => { setRegnr(''); inputRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-carbon-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="flex items-center justify-center gap-2 px-6 py-4 bg-glass-cyan hover:bg-glass-cyanLight text-carbon-950 font-semibold rounded-xl transition-colors flex-shrink-0"
            >
              <ArrowRight className="h-5 w-5" />
              <span className="hidden sm:inline">Søk</span>
            </button>
          </form>

          {/* Recent searches dropdown */}
          {showRecent && recentSearches.length > 0 && !regnr && (
            <div
              className="absolute z-50 w-full mt-1 bg-carbon-900 rounded-lg border border-carbon-700 shadow-xl overflow-hidden"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="px-3 py-2 text-xs font-medium text-carbon-500 uppercase tracking-wider border-b border-carbon-800">
                Siste søk
              </div>
              {recentSearches.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleSelectRecent(r)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-carbon-200 hover:bg-carbon-800 transition text-left"
                >
                  <Clock className="h-3.5 w-3.5 text-carbon-500 flex-shrink-0" />
                  <span className="font-mono">{r}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Desktop: Spør Professor Autoglass button */}
        <div className="hidden sm:flex justify-center mt-6">
          <button
            type="button"
            onClick={() => openChat()}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-carbon-800/80 border border-carbon-700 text-white text-sm font-medium hover:bg-carbon-700 transition-colors min-h-[44px]"
          >
            <MessageCircle className="h-4 w-4" />
            Spør Professor Autoglass
          </button>
        </div>

        {/* Quick stats */}
        <div className="flex flex-wrap justify-center gap-6 sm:gap-10 mt-10 text-center">
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-glass-cyan">{formatCompact(BUSINESS_METRICS.GLASS_IN_STOCK)}+</div>
            <div className="text-sm text-carbon-400">Glass på lager</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-glass-cyan">{formatCompact(BUSINESS_METRICS.VARIANTS)}+</div>
            <div className="text-sm text-carbon-400">Varianter</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-glass-cyan">{BUSINESS_METRICS.BRANDS}</div>
            <div className="text-sm text-carbon-400">Merker</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-glass-cyan">{BUSINESS_METRICS.DELIVERY_HOURS}t</div>
            <div className="text-sm text-carbon-400">Levering</div>
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-carbon-950 to-transparent" />
    </section>
  );
}
