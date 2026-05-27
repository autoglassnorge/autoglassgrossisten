import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';

type Tab = 'regnr' | 'vin' | 'oem';

export function HeroSearch() {
  const [tab, setTab] = useState<Tab>('regnr');
  const [value, setValue] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    const param = tab === 'regnr' ? 'regnr' : tab === 'vin' ? 'vin' : 'oem';
    navigate(`/sok?${param}=${encodeURIComponent(v)}`);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'regnr', label: 'Reg.nr' },
    { id: 'vin', label: 'VIN' },
    { id: 'oem', label: 'OEM' },
  ];

  return (
    <div className="w-full max-w-2xl">
      {/* Tabs */}
      <div className="flex gap-1 mb-3" role="tablist">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            role="tab"
            aria-selected={tab === tb.id}
            onClick={() => setTab(tb.id)}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-wider rounded-t-md transition-colors ${
              tab === tb.id
                ? 'bg-carbon-800 text-glass-cyan border-t border-x border-carbon-700'
                : 'bg-transparent text-carbon-400 hover:text-carbon-200'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit}>
        <div className="flex items-stretch bg-carbon-800/90 backdrop-blur border border-carbon-700 rounded-md shadow-glow-cyan focus-within:border-glass-cyan transition-colors">
          <div className="flex items-center pl-4 pr-2 text-carbon-400">
            <Search className="h-5 w-5" />
          </div>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            placeholder="Reg.nr, VIN eller OEM-nummer..."
            className="flex-1 bg-transparent py-4 px-2 text-base sm:text-lg text-white placeholder:text-carbon-500 font-mono tracking-wider outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="group flex items-center gap-2 px-5 sm:px-6 bg-glass-cyan hover:bg-glass-cyanLight text-carbon-950 font-semibold transition-colors rounded-r-md"
          >
            <span className="hidden sm:inline">Søk</span>
            <ArrowRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </form>

      {/* Helper micro-text */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-carbon-500 uppercase tracking-wider">
        <span>· SVV oppslag</span>
        <span>· VIN dekoding</span>
        <span>· Eurocode match</span>
      </div>
    </div>
  );
}
