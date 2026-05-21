import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, Car, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { searchByRegnr } from '@/api/glass';
import { formatPrice, formatLayerLabel, formatConfidence, maskVin, categoryLabel } from '@/utils/formatters';
import { useCartStore } from '@/stores/cartStore';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const initialRegnr = searchParams.get('regnr') ?? '';
  const [regnr, setRegnr] = useState(initialRegnr);
  const [activeRegnr, setActiveRegnr] = useState(initialRegnr);
  const addItem = useCartStore((s) => s.addItem);

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', activeRegnr],
    queryFn: () => searchByRegnr(activeRegnr),
    enabled: activeRegnr.length >= 2,
    retry: 1,
  });

  useEffect(() => {
    if (initialRegnr) setActiveRegnr(initialRegnr);
  }, [initialRegnr]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (regnr.trim().length >= 2) {
      setActiveRegnr(regnr.trim().toUpperCase());
    }
  };

  const vehicle = data?.vehicle;
  const candidates = data?.candidates ?? [];
  const conf = data?.confidence ? formatConfidence(data.confidence) : null;

  const equipmentIcons: Record<string, string> = {
    adas: '🛡️',
    rainSensor: '🌧️',
    heated: '🔥',
    acoustic: '🔇',
    antenna: '📡',
    hud: '🎯',
    camera: '📷',
    laneAssist: '🛣️',
  };

  const equipmentLabels: Record<string, string> = {
    adas: 'ADAS',
    rainSensor: 'Regnsensor',
    heated: 'Oppvarmet',
    acoustic: 'Akustisk',
    antenna: 'Antenne',
    hud: 'HUD',
    camera: 'Kamera',
    laneAssist: 'Filskifteass.',
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Søk med registreringsnummer</h1>
      <p className="text-gray-600 mb-8">Tast inn bilens registreringsnummer for å finne riktig glass.</p>

      <form onSubmit={handleSearch} className="flex gap-2 mb-8">
        <Input
          placeholder="AB12345"
          value={regnr}
          onChange={(e) => setRegnr(e.target.value)}
          className="h-12 flex-1 text-lg uppercase"
          maxLength={8}
        />
        <Button type="submit" size="lg" className="h-12 px-6 gap-2" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
          Søk
        </Button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Kunne ikke finne kjøretøy</p>
            <p className="text-sm text-red-700">Sjekk at registreringsnummeret er riktig, eller prøv å søke i katalogen.</p>
          </div>
        </div>
      )}

      {data && vehicle && (
        <div className="space-y-6 animate-slide-up">
          {/* Vehicle info */}
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-autoglass-light">
                <Car className="h-6 w-6 text-autoglass-blue" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {vehicle.make} {vehicle.model} {vehicle.year}
                </h2>
                <div className="mt-1 flex flex-wrap gap-2 text-sm text-gray-500">
                  <span>VIN: {maskVin(vehicle.vin)}</span>
                  {vehicle.k_type > 0 && <span>kType: {vehicle.k_type}</span>}
                </div>
                {conf && (
                  <div className="mt-3 flex items-center gap-2">
                    <Badge className={conf.color}>{conf.label}</Badge>
                    <span className="text-sm text-gray-500">
                      {formatLayerLabel(data.layer)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Equipment */}
            {data.equipment && (
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(data.equipment)
                  .filter(([_, val]) => val)
                  .map(([key]) => (
                    <span key={key} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                      <span>{equipmentIcons[key]}</span>
                      {equipmentLabels[key]}
                    </span>
                  ))}
              </div>
            )}
          </div>

          {/* Candidates */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {candidates.length} resultat{candidates.length !== 1 ? 'er' : ''}
            </h3>
            <div className="space-y-3">
              {candidates.slice(0, 5).map((c, idx) => (
                <div
                  key={c.eurocode}
                  className={`rounded-lg border p-4 transition-colors ${
                    idx === 0 ? 'border-autoglass-blue bg-blue-50/50' : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-autoglass-blue">
                          {c.eurocode}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {categoryLabel(c.category)}
                        </Badge>
                        {c.nagsCodes.length > 0 && (
                          <Badge variant="outline" className="text-xs bg-white">
                            🇺🇸 {c.nagsCodes[0]}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-700">
                        {c.description || `${c.brand} ${c.model}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        {c.brand} {c.model} · {c.yearFrom ?? ''}{c.yearTo ? `–${c.yearTo}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-lg font-bold text-autoglass-blue">
                          {formatPrice(c.price)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {c.stockStatus > 0 ? `${c.stockStatus} på lager` : 'Bestillingsvare'}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => addItem(c as any)}>
                        Legg til
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data && candidates.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
          <p className="font-medium text-amber-800">Ingen glass funnet</p>
          <p className="text-sm text-amber-700 mt-1">
            Vi fant kjøretøyet, men har ingen registrerte glass som passer. Prøv å søke i katalogen manuelt.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.href = '/katalog'}>
            Åpne katalog
          </Button>
        </div>
      )}
    </div>
  );
}
