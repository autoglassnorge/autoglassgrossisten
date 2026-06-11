import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { TopBar } from '@/components/layout/TopBar'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import ChatWidget from '@/components/ordremottaker/ChatWidget'

/* ========================================================================
   Lazy-loaded pages — code split per route
   ======================================================================== */

// Public pages (most visited — keep lightweight)
const HomePage = lazy(() => import('@/pages/HomePage'))
const SearchPage = lazy(() => import('@/pages/SearchPage'))
const BrowsePage = lazy(() => import('@/pages/BrowsePage'))
const BilglassguidePage = lazy(() => import('@/pages/BilglassguidePage'))

// Bilglassguide article pages (dynamic + static fallback)
const ArticlePage = lazy(() => import('@/pages/ArticlePage'))
const FrontrutePage = lazy(() => import('@/pages/bilglassguide/FrontrutePage'))
const AdasKameraPage = lazy(() => import('@/pages/bilglassguide/AdasKameraPage'))
const KalibreringPage = lazy(() => import('@/pages/bilglassguide/KalibreringPage'))
const OemAftermarketPage = lazy(() => import('@/pages/bilglassguide/OemAftermarketPage'))
const HudPage = lazy(() => import('@/pages/bilglassguide/HudPage'))
const OppvarmetFrontrutePage = lazy(() => import('@/pages/bilglassguide/OppvarmetFrontrutePage'))
const IdentifiserePage = lazy(() => import('@/pages/bilglassguide/IdentifiserePage'))
const FlereFrontruterPage = lazy(() => import('@/pages/bilglassguide/FlereFrontruterPage'))
const AkustiskPage = lazy(() => import('@/pages/bilglassguide/AkustiskPage'))
const VariantMatchingPage = lazy(() => import('@/pages/bilglassguide/VariantMatchingPage'))
const ProdusenterPage = lazy(() => import('@/pages/bilglassguide/ProdusenterPage'))

// B2B pages
const CartPage = lazy(() => import('@/pages/CartPage'))
const AccountPage = lazy(() => import('@/pages/AccountPage'))

// Info pages
const OmOssPage = lazy(() => import('@/pages/OmOssPage'))
const KontaktPage = lazy(() => import('@/pages/KontaktPage'))
const PersonvernPage = lazy(() => import('@/pages/PersonvernPage'))
const VilkarPage = lazy(() => import('@/pages/VilkarPage'))

// Admin
const AdminPage = lazy(() => import('@/pages/AdminPage'))

function App() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar />
      <Header />
      <main className="flex-1">
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            {/* Public / Landing */}
            <Route path="/" element={<HomePage />} />

            {/* Search — unified (regnr + wizard) */}
            <Route path="/sok" element={<SearchPage />} />
            <Route path="/glass-guide" element={<Navigate to="/sok?wizard=1" replace />} />

            {/* Catalog */}
            <Route path="/bla" element={<BrowsePage />} />

            {/* Bilglassguide — static pages first (React Router matches top-to-bottom) */}
            <Route path="/bilglassguide" element={<BilglassguidePage />} />
            <Route path="/bilglassguide/frontrute" element={<FrontrutePage />} />
            <Route path="/bilglassguide/frontrute-adas-kamera" element={<AdasKameraPage />} />
            <Route path="/bilglassguide/frontrute-hud" element={<HudPage />} />
            <Route path="/bilglassguide/oppvarmet-frontrute" element={<OppvarmetFrontrutePage />} />
            <Route path="/bilglassguide/kalibrering-etter-ruteskift" element={<KalibreringPage />} />
            <Route path="/bilglassguide/oem-vs-aftermarket" element={<OemAftermarketPage />} />
            <Route path="/bilglassguide/identifisere-riktig-bilglass" element={<IdentifiserePage />} />
            <Route path="/bilglassguide/flere-frontruter-samme-modell" element={<FlereFrontruterPage />} />
            <Route path="/bilglassguide/akustisk-bilglass" element={<AkustiskPage />} />
            <Route path="/bilglassguide/variantmatching" element={<VariantMatchingPage />} />
            <Route path="/bilglassguide/produsenter" element={<ProdusenterPage />} />

            {/* Dynamic article fallback — must be AFTER static routes */}
            <Route path="/bilglassguide/:slug" element={<ArticlePage />} />

            {/* B2B */}
            <Route path="/kasse" element={<CartPage />} />
            <Route path="/konto" element={<AccountPage />} />

            {/* Info */}
            <Route path="/om-oss" element={<OmOssPage />} />
            <Route path="/kontakt" element={<KontaktPage />} />
            <Route path="/personvern" element={<PersonvernPage />} />
            <Route path="/vilkar" element={<VilkarPage />} />

            {/* Admin */}
            <Route path="/admin" element={<AdminPage />} />

            {/* 404 */}
            <Route path="*" element={
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-carbon-950 min-h-[60vh]">
                <h1 className="text-5xl font-bold text-white mb-4">404</h1>
                <p className="text-carbon-400 mb-6">Siden finnes ikke.</p>
                <a href="/" className="text-glass-cyan hover:underline font-medium">Gå til forsiden</a>
              </div>
            } />
          </Routes>
        </Suspense>
      </main>
      <Footer />
      <ChatWidget />
    </div>
  )
}

export default App
