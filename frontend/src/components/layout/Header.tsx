import { Link } from 'react-router-dom';
import { useState } from 'react';
import { ShoppingCart, Menu, X, LogIn, User, Phone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCartStore } from '@/stores/cartStore';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { preloadPage, PAGE_IMPORTS } from '@/hooks/useRoutePreload';
import { COMPANY } from '@/config/company.config';
import OrdremottakerAvatar from '@/components/ordremottaker/OrdremottakerAvatar';

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const cartItems = useCartStore((s) => s.items);
  const cartTotal = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const { openChat } = useChatStore();
  const { isAuthenticated, user, logout } = useAuthStore();

  const navLinks = [
    { label: 'Katalog', href: '/bla', preload: PAGE_IMPORTS.browse },
    { label: 'Bilglassguide', href: '/bilglassguide', preload: PAGE_IMPORTS.bilglassguide },
    { label: 'Om oss', href: '/om-oss' },
    { label: 'Kontakt', href: '/kontakt', preload: PAGE_IMPORTS.kontakt },
  ];

  const authLink = isAuthenticated
    ? { label: user?.name ? `Hei, ${user.name.split(' ')[0]}` : 'Min side', href: '/konto', preload: PAGE_IMPORTS.account }
    : { label: 'Logg inn', href: '/konto', preload: PAGE_IMPORTS.account };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-carbon-800 bg-carbon-950 shadow-sm">
        <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center gap-3 px-3 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <img
              src="/logo-light.png"
              alt="Autoglass"
              className="h-10 w-auto object-contain"
            />
          </Link>

          {/* Desktop: Spør AI-ordremottakeren */}
          <div className="hidden md:block flex-1 max-w-md ml-4">
            <button
              onClick={() => openChat()}
              className="w-full flex items-center gap-2 rounded-md border border-carbon-700 bg-carbon-900 py-2 px-3 text-sm text-carbon-400 hover:border-glass-cyan/40 hover:bg-carbon-800 hover:text-glass-cyan transition-colors"
            >
              <OrdremottakerAvatar size="sm" className="!h-6 !w-6" />
              <span>Spør vårt glassteam...</span>
            </button>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 ml-auto">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onMouseEnter={() => link.preload && preloadPage(link.preload)}
              >
                <Button variant="ghost" size="sm" className="text-carbon-300 hover:text-white hover:bg-carbon-800">
                  {link.label}
                </Button>
              </Link>
            ))}
            <Link to="/kasse" onMouseEnter={() => preloadPage(PAGE_IMPORTS.cart)}>
              <Button variant="ghost" size="sm" className="relative min-h-[44px] min-w-[44px] text-carbon-300 hover:text-white hover:bg-carbon-800">
                <ShoppingCart className="h-5 w-5" />
                {cartTotal > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-glass-cyan text-[10px] font-bold text-carbon-950">
                    {cartTotal}
                  </span>
                )}
              </Button>
            </Link>
            {isAuthenticated ? (
              <div className="flex items-center gap-1">
                <Link to={authLink.href} onMouseEnter={() => preloadPage(authLink.preload!)}>
                  <Button variant="default" size="sm" className="min-h-[44px] bg-glass-cyan text-carbon-950 hover:bg-glass-cyanLight gap-1.5">
                    <User className="h-4 w-4" />
                    {authLink.label}
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  className="min-h-[44px] text-carbon-400 hover:text-white hover:bg-carbon-800"
                  title="Logg ut"
                >
                  <LogIn className="h-4 w-4 rotate-180" />
                </Button>
              </div>
            ) : (
              <Link to={authLink.href} onMouseEnter={() => preloadPage(authLink.preload!)}>
                <Button variant="default" size="sm" className="min-h-[44px] bg-glass-cyan text-carbon-950 hover:bg-glass-cyanLight gap-1.5">
                  <LogIn className="h-4 w-4" />
                  {authLink.label}
                </Button>
              </Link>
            )}
          </nav>

          {/* Mobile actions */}
          <div className="flex items-center gap-1 ml-auto md:hidden">
            <a
              href={`tel:${COMPANY.PHONE_RAW}`}
              aria-label={`Ring ${COMPANY.PHONE}`}
              className="inline-flex"
            >
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[44px] min-w-[44px] px-2 text-carbon-300 hover:text-white hover:bg-carbon-800 focus-visible:ring-2 focus-visible:ring-glass-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-carbon-950"
              >
                <Phone className="h-5 w-5" />
              </Button>
            </a>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] min-w-[44px] px-2 text-carbon-300 hover:text-white hover:bg-carbon-800"
              onClick={() => openChat()}
              aria-label="Spør vårt glassteam"
            >
              <OrdremottakerAvatar size="sm" className="!h-6 !w-6" />
            </Button>
            <Link to="/kasse" aria-label="Ordre">
              <Button
                variant="ghost"
                size="sm"
                className="relative min-h-[44px] min-w-[44px] px-2 text-carbon-300 hover:text-white hover:bg-carbon-800"
              >
                <ShoppingCart className="h-5 w-5" />
                {cartTotal > 0 && (
                  <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-glass-cyan text-[10px] font-bold text-carbon-950">
                    {cartTotal}
                  </span>
                )}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] min-w-[44px] px-2 text-carbon-300 hover:text-white hover:bg-carbon-800"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Meny"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileOpen && (
          <div className="md:hidden border-t border-carbon-800 bg-carbon-950 px-4 py-3 space-y-2 animate-fade-in">
            {navLinks.map((link) => (
              <Link key={link.href} to={link.href} className="block" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="w-full justify-start min-h-[44px] text-carbon-300 hover:text-white hover:bg-carbon-800">
                  {link.label}
                </Button>
              </Link>
            ))}
            <Link to="/kasse" className="block" onClick={() => setMobileOpen(false)}>
              <Button variant="ghost" className="w-full justify-start min-h-[44px] text-carbon-300 hover:text-white hover:bg-carbon-800">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Ordre {cartTotal > 0 && `(${cartTotal})`}
              </Button>
            </Link>
            {isAuthenticated && (
              <Button
                variant="ghost"
                className="w-full justify-start min-h-[44px] text-carbon-300 hover:text-white hover:bg-carbon-800"
                onClick={() => { logout(); setMobileOpen(false); }}
              >
                <LogIn className="h-4 w-4 mr-2 rotate-180" />
                Logg ut
              </Button>
            )}
            <Link to={authLink.href} className="block" onClick={() => setMobileOpen(false)}>
              <Button variant="default" className="w-full justify-start min-h-[44px] bg-glass-cyan text-carbon-950 hover:bg-glass-cyanLight">
                {isAuthenticated ? <User className="h-4 w-4 mr-2" /> : <LogIn className="h-4 w-4 mr-2" />}
                {authLink.label}
              </Button>
            </Link>
          </div>
        )}
      </header>
    </>
  );
}
