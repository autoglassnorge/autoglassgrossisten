/**
 * StickySearchBar — Appears when user scrolls past hero.
 * Uses IntersectionObserver on a sentinel element.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';

export function StickySearchBar() {
  const [visible, setVisible] = useState(false);
  const [regnr, setRegnr] = useState('');
  const navigate = useNavigate();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '-80px 0px 0px 0px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (regnr.trim().length >= 2) {
      navigate(`/sok?regnr=${encodeURIComponent(regnr.trim())}`);
    }
  };

  return (
    <>
      {/* Sentinel — placed right after hero */}
      <div ref={sentinelRef} className="h-px" />

      {/* Sticky bar */}
      <div
        className={`fixed top-[56px] sm:top-[64px] left-0 right-0 z-40 bg-carbon-950/95 backdrop-blur-md border-b border-carbon-800 transition-transform duration-300 ${
          visible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2">
          <form onSubmit={handleSearch} className="flex items-center gap-2 max-w-xl mx-auto">
            <Search className="h-4 w-4 text-carbon-500 flex-shrink-0" />
            <input
              type="text"
              value={regnr}
              onChange={(e) => setRegnr(e.target.value.toUpperCase())}
              placeholder="Reg.nr — f.eks. SU18018"
              className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-carbon-500 focus:outline-none"
              maxLength={8}
            />
            <button
              type="submit"
              disabled={regnr.trim().length < 2}
              className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-glass-cyan hover:bg-glass-cyanLight text-carbon-950 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Finn glass
              <ArrowRight className="h-3 w-3" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
