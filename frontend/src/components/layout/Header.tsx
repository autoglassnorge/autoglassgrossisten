import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Search, ShoppingCart, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCartStore } from '@/stores/cartStore';

export function Header() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const cartTotal = useCartStore((s) => s.totalItems());

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/sok?regnr=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setMobileOpen(false);
    }
  };

  const navLinks = [
    { label: 'Katalog', href: '/katalog' },
    { label: 'Søk', href: '/sok' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b bg-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link to="/" className="flex-shrink-0">
          <span className="text-xl font-bold text-autoglass-blue tracking-tight">
            Autoglass<span className="text-gray-800">.no</span>
          </span>
        </Link>

        {/* Desktop search */}
        <form onSubmit={handleSearch} className="hidden md:block flex-1 max-w-md">
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
          <Button variant="ghost" size="sm" className="relative">
            <ShoppingCart className="h-5 w-5" />
            {cartTotal > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {cartTotal}
              </span>
            )}
          </Button>
        </nav>

        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden ml-auto"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-white px-4 py-3 space-y-2">
          <form onSubmit={handleSearch}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Reg.nr eller VIN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none"
              />
            </div>
          </form>
          {navLinks.map((link) => (
            <Button key={link.href} variant="ghost" className="w-full justify-start" onClick={() => { navigate(link.href); setMobileOpen(false); }}>
              {link.label}
            </Button>
          ))}
        </div>
      )}
    </header>
  );
}
