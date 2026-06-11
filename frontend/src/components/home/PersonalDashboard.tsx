/**
 * PersonalDashboard — Shows personalized info for logged-in B2B customers.
 * Displays: open order, recent vehicle searches, discount tier.
 * Falls back to WhyChooseUs when not logged in.
 */

import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Clock, Search, Tag, ChevronRight } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

// Mock data — replace with real API calls when available
const MOCK_DATA = {
  openOrder: {
    lines: 3,
    total: 12450,
    status: 'Under behandling',
  },
  recentVehicles: [
    { regnr: 'SU18018', make: 'VW', model: 'Transporter', year: 2019 },
    { regnr: 'BR77770', make: 'BMW', model: 'X5', year: 2021 },
    { regnr: 'HB82058', make: 'Audi', model: 'A4', year: 2018 },
  ],
  discountTier: {
    name: 'Gullkunde',
    discount: 12,
  },
};

function isLoggedIn(): boolean {
  // TODO: Replace with real auth check
  return false;
}

export function PersonalDashboard() {
  const sectionRef = useRef<HTMLElement>(null);
  const isVisible = useScrollReveal(sectionRef);
  const navigate = useNavigate();

  const loggedIn = isLoggedIn();
  if (!loggedIn) return null;

  const { openOrder, recentVehicles, discountTier } = MOCK_DATA;

  return (
    <section
      ref={sectionRef}
      className={`bg-carbon-50 py-16 sm:py-20 border-y border-carbon-200 transition-all duration-500 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-carbon-900 tracking-tight">
            Din oversikt
          </h2>
          <p className="mt-1 text-base text-carbon-500">
            Rask tilgang til dine bestillinger og søk
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Open Order */}
          <div className="rounded-xl border border-carbon-200 bg-white p-6 hover:border-glass-cyan/40 hover:shadow-md transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-glass-cyan/10">
                <Package className="h-5 w-5 text-glass-cyan" />
              </div>
              <div>
                <h3 className="font-semibold text-carbon-900">Åpen ordre</h3>
                <p className="text-xs text-carbon-400">Siste bestilling</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-carbon-500">Antall linjer</span>
                <span className="font-medium text-carbon-900">{openOrder.lines}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-carbon-500">Total</span>
                <span className="font-medium text-carbon-900">{openOrder.total.toLocaleString('no-NO')} kr</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-carbon-500">Status</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                  <Clock className="h-3 w-3" />
                  {openOrder.status}
                </span>
              </div>
            </div>
            <button
              onClick={() => navigate('/kasse')}
              className="mt-4 w-full text-center text-sm font-medium text-autoglass-blue hover:underline flex items-center justify-center gap-1"
            >
              Se ordredetaljer
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Recent Vehicles */}
          <div className="rounded-xl border border-carbon-200 bg-white p-6 hover:border-glass-cyan/40 hover:shadow-md transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-glass-cyan/10">
                <Search className="h-5 w-5 text-glass-cyan" />
              </div>
              <div>
                <h3 className="font-semibold text-carbon-900">Sist søkte kjøretøy</h3>
                <p className="text-xs text-carbon-400">Hurtigsøk</p>
              </div>
            </div>
            <div className="space-y-2">
              {recentVehicles.map((v) => (
                <button
                  key={v.regnr}
                  onClick={() => navigate(`/sok?regnr=${v.regnr}`)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-carbon-50 transition-colors text-left"
                >
                  <div>
                    <div className="text-sm font-medium text-carbon-900">
                      {v.make} {v.model} ({v.year})
                    </div>
                    <div className="text-xs text-carbon-400 font-mono">{v.regnr}</div>
                  </div>
                  <Search className="h-3.5 w-3.5 text-carbon-400" />
                </button>
              ))}
            </div>
          </div>

          {/* Discount Tier */}
          <div className="rounded-xl border border-carbon-200 bg-white p-6 hover:border-glass-cyan/40 hover:shadow-md transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-glass-cyan/10">
                <Tag className="h-5 w-5 text-glass-cyan" />
              </div>
              <div>
                <h3 className="font-semibold text-carbon-900">Din rabatt</h3>
                <p className="text-xs text-carbon-400">B2B-avtale</p>
              </div>
            </div>
            <div className="text-center py-4">
              <div className="text-4xl font-bold text-glass-cyan">{discountTier.discount}%</div>
              <div className="text-sm text-carbon-500 mt-1">{discountTier.name}</div>
            </div>
            <p className="text-xs text-carbon-400 text-center">
              Rabatten trekkes automatisk ved utsjekk
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
