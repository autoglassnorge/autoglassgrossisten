import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Truck, Shield, Users, Package } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function HomePage() {
  const [regnr, setRegnr] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (regnr.trim()) {
      navigate(`/sok?regnr=${encodeURIComponent(regnr.trim())}`);
    }
  };

  const stats = [
    { icon: Package, value: '130 000+', label: 'Ruter på lager' },
    { icon: Users, value: '500+', label: 'Verksteder' },
    { icon: Truck, value: 'Neste dag', label: 'Levering' },
    { icon: Shield, value: '30+', label: 'Års erfaring' },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-autoglass-blue to-autoglass-dark py-12 sm:py-20 px-4 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight lg:text-6xl">
            Norges største bilglass-grossist
          </h1>
          <p className="mt-3 sm:mt-4 text-base sm:text-lg text-blue-100">
            130 000+ ruter. Levering neste dag. Vi sier ja der andre sier nei.
          </p>

          {/* Regnr search */}
          <form onSubmit={handleSearch} className="mt-6 sm:mt-8 mx-auto max-w-xl">
            <div className="flex gap-2">
              <Input
                placeholder="Tast inn registreringsnummer..."
                value={regnr}
                onChange={(e) => setRegnr(e.target.value)}
                className="h-14 flex-1 bg-white text-gray-900 placeholder:text-gray-400 text-base sm:text-lg"
              />
              <Button type="submit" size="lg" className="h-14 px-4 sm:px-8 gap-2 flex-shrink-0 min-w-[44px]">
                <Search className="h-5 w-5" />
                <span className="hidden sm:inline">Finn glass</span>
              </Button>
            </div>
          </form>

          {/* Quick links */}
          <div className="mt-4 sm:mt-6 flex flex-wrap justify-center gap-2 sm:gap-3">
            <Link to="/katalog">
              <Button
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10 min-h-[44px]"
              >
                Bla i katalog
              </Button>
            </Link>
            <Link to="/katalog">
              <Button
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10 min-h-[44px]"
              >
                Frontruter
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-8 sm:py-12 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 sm:gap-8 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <stat.icon className="mx-auto h-6 w-6 sm:h-8 sm:w-8 text-autoglass-blue" />
                <div className="mt-1 sm:mt-2 text-xl sm:text-2xl font-bold text-gray-900">{stat.value}</div>
                <div className="text-xs sm:text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-12 sm:py-16 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-8 sm:mb-12">Slik fungerer det</h2>
          <div className="grid gap-6 sm:gap-8 md:grid-cols-3">
            {[
              { step: '1', title: 'Søk', desc: 'Tast inn registreringsnummer eller VIN — vi finner riktig glass på sekunder.' },
              { step: '2', title: 'Tilbud', desc: 'Logg inn for din skreddersydde pris, eller be om tilbud som ny kunde.' },
              { step: '3', title: 'Levering', desc: 'Bestill før 14:00 og få levert neste virkedag til verkstedet.' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-autoglass-blue text-white text-base sm:text-lg font-bold">
                  {item.step}
                </div>
                <h3 className="mt-3 sm:mt-4 text-base sm:text-lg font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 sm:py-16 bg-autoglass-blue text-white text-center">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-2xl sm:text-3xl font-bold">Klar for å finne riktig glass?</h2>
          <p className="mt-3 sm:mt-4 text-sm sm:text-base text-blue-100">Søk i katalogen eller bruk registreringsnummer for å finne eksakt match.</p>
          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <Link to="/katalog">
              <Button size="lg" className="bg-white text-autoglass-blue hover:bg-blue-50 min-h-[44px]">
                Åpne katalog
              </Button>
            </Link>
            <Link to="/sok">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 min-h-[44px]">
                Søk med regnr
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
