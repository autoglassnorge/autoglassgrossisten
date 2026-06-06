import { Link } from 'react-router-dom';
import { useState } from 'react';
import { ShoppingCart, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCartStore } from '@/stores/cartStore';
import { useChatStore } from '@/stores/chatStore';
import ProfessorAvatar from '@/components/ordremottaker/ProfessorAvatar';

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const cartItems = useCartStore((s) => s.items);
  const cartTotal = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const { openChat } = useChatStore();

  const navLinks = [
    { label: 'Katalog', href: '/bla' },
    { label: 'Bilglassguide', href: '/bilglassguide' },
    { label: 'Om oss', href: '/om-oss' },
    { label: 'Kontakt', href: '/kontakt' },
  ];

  const authLink = { label: 'Min konto', href: '/konto' };

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

          {/* Desktop: Spør Professor Autoglass */}
          <div className="hidden md:block flex-1 max-w-md ml-4">
            <button
              onClick={() => openChat()}
              className="w-full flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-500 hover:border-autoglass-blue hover:bg-autoglass-light hover:text-autoglass-blue transition-colors"
            >
              <ProfessorAvatar size="sm" className="!h-6 !w-6" />
              <span>Spør Professor Autoglass...</span>
            </button>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 ml-auto">
            {navLinks.map((link) => (
              <Link key={link.href} to={link.href}>
                <Button variant="ghost" size="sm">{link.label}</Button>
              </Link>
            ))}
            <Link to="/kasse">
              <Button variant="ghost" size="sm" className="relative min-h-[44px] min-w-[44px]">
                <ShoppingCart className="h-5 w-5" />
                {cartTotal > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {cartTotal}
                  </span>
                )}
              </Button>
            </Link>
            <Link to={authLink.href}>
              <Button variant="default" size="sm" className="min-h-[44px]">{authLink.label}</Button>
            </Link>
          </nav>

          {/* Mobile actions */}
          <div className="flex items-center gap-1 ml-auto md:hidden">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] min-w-[44px] px-2"
              onClick={() => openChat()}
              aria-label="Spør Professor Autoglass"
            >
              <ProfessorAvatar size="sm" className="!h-6 !w-6" />
            </Button>
            <Link to="/kasse" aria-label="Handlekurv">
              <Button
                variant="ghost"
                size="sm"
                className="relative min-h-[44px] min-w-[44px] px-2"
              >
                <ShoppingCart className="h-5 w-5" />
                {cartTotal > 0 && (
                  <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {cartTotal}
                  </span>
                )}
              </Button>
            </Link>
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
              <Link key={link.href} to={link.href} className="block" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="w-full justify-start min-h-[44px]">{link.label}</Button>
              </Link>
            ))}
            <Link to="/kasse" className="block" onClick={() => setMobileOpen(false)}>
              <Button variant="ghost" className="w-full justify-start min-h-[44px]">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Handlekurv {cartTotal > 0 && `(${cartTotal})`}
              </Button>
            </Link>
            <Link to={authLink.href} className="block" onClick={() => setMobileOpen(false)}>
              <Button variant="default" className="w-full justify-start min-h-[44px]">{authLink.label}</Button>
            </Link>
          </div>
        )}
      </header>


    </>
  );
}
