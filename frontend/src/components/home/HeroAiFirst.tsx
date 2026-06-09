/**
 * HeroAiFirst — AI-first homepage hero with unified multi-mode search.
 *
 * Features:
 *   - Tabbed input: Reg.nr, VIN, OEM, Fritekst
 *   - Visual-only unified search (no backend changes)
 *   - Professor Autoglass as secondary copilot
 *   - Quick stats from businessMetrics constants
 *   - Quick category chips
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Car,
  ScanLine,
  Hash,
  Sparkles,
  MessageCircle,
  X,
  Shield,
  Square,
  AlignLeft,
  Camera,
  ChevronRight,
} from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { BUSINESS_METRICS, formatCompact, formatFull } from '@/constants/businessMetrics';

type SearchTab = 'regnr' | 'vin' | 'oem' | 'text';

const TABS: { key: SearchTab; label: string; icon: React.ElementType; placeholder: string }[] = [
  { key: 'regnr', label: 'Reg.nr', icon: Car, placeholder: 'AB12345' },
  { key: 'vin', label: 'VIN', icon: ScanLine, placeholder: 'Skriv inn VIN (17 tegn)...' },
  { key: 'oem', label: 'OEM', icon: Hash, placeholder: 'OEM- eller artikkelnummer...' },
  { key: 'text', label: 'Fritekst', icon: Sparkles, placeholder: 'Beskriv bil og glass, f.eks. "VW Transporter frontrute med regnsensor"...' },
];

const CATEGORIES = [
  { label: 'Frontrute', icon: Shield, href: '/bilglassguide/frontrute' },
  { label: 'Bakrute', icon: Square, href: '/bilglassguide/frontrute' },
  { label: 'Sideglass', icon: AlignLeft, href: '/bilglassguide' },
  { label: 'ADAS-glass', icon: Camera, href: '/bilglassguide/frontrute-adas-kamera' },
];

function normalizeRegnr(v: string): string {
  return v.toUpperCase().replace(/\s/g, '');
}

function isValidRegnr(v: string): boolean {
  return /^[A-Z]{2}\d{4,5}$/.test(v);
}

function isValidVin(v: string): boolean {
  return v.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/i.test(v);
}

export function HeroAiFirst() {
  const [activeTab, setActiveTab] = useState<SearchTab>('regnr');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { openChat } = useChatStore();

  const activeTabConfig = TABS.find((t) => t.key === activeTab)!;

  const handleTabChange = (tab: SearchTab) => {
    setActiveTab(tab);
    setValue('');
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const validate = (): boolean => {
    setError(null);
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Vennligst fyll inn et søk');
      return false;
    }
    if (activeTab === 'regnr' && !isValidRegnr(normalizeRegnr(trimmed))) {
      setError('Ugyldig registreringsnummer (format: AB12345)');
      return false;
    }
    if (activeTab === 'vin' && !isValidVin(trimmed)) {
      setError('Ugyldig VIN (17 tegn, ingen I, O eller Q)');
      return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const trimmed = value.trim();

    switch (activeTab) {
      case 'regnr':
        navigate(`/sok?regnr=${encodeURIComponent(normalizeRegnr(trimmed))}`);
        break;
      case 'vin':
        navigate(`/sok?vin=${encodeURIComponent(trimmed.toUpperCase())}`);
        break;
      case 'oem':
        navigate(`/sok?q=${encodeURIComponent(trimmed)}`);
        break;
      case 'text':
        openChat({ message: trimmed });
        break;
    }
  };

  const handleProfessorClick = () => {
    if (value.trim()) {
      openChat({ message: value.trim() });
    } else {
      openChat();
    }
  };

  return (
    <section className="relative min-h-[70vh] sm:min-h-[75vh] flex items-center justify-center overflow-hidden bg-carbon-950">
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
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        {/* Eyebrow */}
        <div className="text-center mb-6">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-glass-cyan/10 border border-glass-cyan/30 text-glass-cyan text-sm font-medium">
            <Car className="h-4 w-4" />
            B2B Grossist av bilglass — eks. mva
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-center text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
          Finn riktig glass med{' '}
          <span className="text-glass-cyan">AI</span>
        </h1>

        <p className="text-center text-base sm:text-lg text-carbon-300 mb-10 max-w-2xl mx-auto">
          Søk med registreringsnummer, VIN, OEM-nummer eller beskriv bilen.
          <br className="hidden sm:block" />
          {formatFull(BUSINESS_METRICS.GLASS_IN_STOCK)}+ glass på lager.{' '}
          {formatFull(BUSINESS_METRICS.VARIANTS)}+ forskjellige varianter.
        </p>

        {/* Search container */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-white/10 shadow-2xl">
          {/* Tabs */}
          <div className="flex justify-center mb-4">
            <div className="inline-flex bg-carbon-900/50 rounded-lg p-1 border border-carbon-800">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleTabChange(tab.key)}
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-glass-cyan text-carbon-950'
                        : 'text-carbon-400 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Input + CTA */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-carbon-400">
                <Search className="h-5 w-5" />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={activeTabConfig.placeholder}
                className="w-full bg-carbon-900/80 border border-carbon-700 rounded-xl py-4 pl-12 pr-10 text-white placeholder:text-carbon-500 text-lg focus:outline-none focus:border-glass-cyan focus:ring-2 focus:ring-glass-cyan/20 transition-all"
                maxLength={activeTab === 'vin' ? 17 : activeTab === 'regnr' ? 8 : 100}
                autoComplete="off"
              />
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    setValue('');
                    inputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-carbon-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {error && (
              <p className="text-red-400 text-sm px-1">{error}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-glass-cyan hover:bg-glass-cyanLight text-carbon-950 font-semibold rounded-xl transition-colors"
              >
                <Search className="h-5 w-5" />
                Finn glass
              </button>
              <button
                type="button"
                onClick={handleProfessorClick}
                className="flex items-center justify-center gap-2 px-6 py-4 bg-carbon-800/80 border border-carbon-700 text-white font-medium rounded-xl hover:bg-carbon-700 transition-colors"
              >
                <MessageCircle className="h-5 w-5" />
                Spør Professor Autoglass
              </button>
            </div>
          </form>

          {/* Quick categories */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <a
                  key={cat.label}
                  href={cat.href}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-carbon-800/60 border border-carbon-700 text-sm text-carbon-300 hover:text-white hover:border-glass-cyan/40 hover:bg-carbon-700/60 transition-all"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {cat.label}
                  <ChevronRight className="h-3 w-3 opacity-60" />
                </a>
              );
            })}
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex flex-wrap justify-center gap-6 sm:gap-10 mt-10 text-center">
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-glass-cyan">
              {formatCompact(BUSINESS_METRICS.GLASS_IN_STOCK)}+
            </div>
            <div className="text-sm text-carbon-400">Glass på lager</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-glass-cyan">
              {formatCompact(BUSINESS_METRICS.VARIANTS)}+
            </div>
            <div className="text-sm text-carbon-400">Varianter</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-glass-cyan">
              {BUSINESS_METRICS.BRANDS}
            </div>
            <div className="text-sm text-carbon-400">Merker</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-glass-cyan">
              {BUSINESS_METRICS.DELIVERY_HOURS}t
            </div>
            <div className="text-sm text-carbon-400">Levering</div>
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-carbon-950 to-transparent" />
    </section>
  );
}
