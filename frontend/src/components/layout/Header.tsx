import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Search, ShoppingCart, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCartStore } from '@/stores/cartStore';

export function Header() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const cartTotal = useCartStore((s) => s.totalItems());

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/sok?regnr=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setMobileOpen(false);
      setSearchOpen(false);
    }
  };

  const navLinks = [
    { label: 'Katalog', href: '/katalog' },
    { label: 'Søk', href: '/sok' },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-white shadow-sm">
        <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center gap-3 px-3 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <img
              src="/logo.png"
              alt="Autoglass"
              className="h-10 w-auto object-contain"
            />
          </Link>

          {/* Desktop search */}
          <form onSubmit={handleSearch} className="hidden md:block flex-1 max-w-md ml-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Reg.nr eller VIN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue"
              />
            </div>
          </form>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 ml-auto">
            {navLinks.map((link) => (
              <Button key={link.href} variant="ghost" size="sm" onClick={() => navigate(link.href)}>
                {link.label}
              </Button>
            ))}
            <Button variant="ghost" size="sm" className="relative min-h-[44px] min-w-[44px]" onClick={() => navigate('/kasse')}>
              <ShoppingCart className="h-5 w-5" />
              {cartTotal > 0 && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {cartTotal}
                </span>
              )}
            </Button>
          </nav>

          {/* Mobile actions */}
          <div className="flex items-center gap-1 ml-auto md:hidden">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] min-w-[44px] px-2"
              onClick={() => setSearchOpen(true)}
              aria-label="Søk"
            >
              <Search className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="relative min-h-[44px] min-w-[44px] px-2"
              onClick={() => navigate('/kasse')}
              aria-label="Handlekurv"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartTotal > 0 && (
                <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {cartTotal}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] min-w-[44px] px-2"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Meny"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileOpen && (
          <div className="md:hidden border-t bg-white px-4 py-3 space-y-2 animate-fade-in">
            {navLinks.map((link) => (
              <Button key={link.href} variant="ghost" className="w-full justify-start min-h-[44px]" onClick={() => { navigate(link.href); setMobileOpen(false); }}>
                {link.label}
              </Button>
            ))}
          </div>
        )}
      </header>

      {/* Mobile search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-[70] bg-white md:hidden animate-fade-in">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Reg.nr eller VIN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full rounded-md border border-gray-200 bg-gray-50 py-3 pl-10 pr-3 text-base outline-none focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue"
                />
              </div>
            </form>
            <Button variant="ghost" size="sm" className="min-h-[44px] px-3" onClick={() => setSearchOpen(false)}>
              Avbryt
            </Button>
          </div>
          <div className="p-4 text-sm text-gray-500">
            <p>Tast inn registreringsnummer eller VIN for å finne riktig glass.</p>
          </div>
        </div>
      )}
    </>
  );
}
