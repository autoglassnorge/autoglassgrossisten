import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

// Lazy load pages for code splitting
const HomePage = lazy(() => import('@/pages/HomePage'))
const SearchPage = lazy(() => import('@/pages/SearchPage'))
const AccountPage = lazy(() => import('@/pages/AccountPage'))
const BrowsePage = lazy(() => import('@/pages/BrowsePage'))
const BilglassguidePage = lazy(() => import('@/pages/BilglassguidePage'))
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

function App() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        <Suspense fallback={<div className="p-8 text-center">Laster...</div>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/bla" element={<BrowsePage />} />
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
            <Route path="/sok" element={<SearchPage />} />
            <Route path="/kasse" element={<AccountPage />} />
            <Route path="*" element={
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
                <p className="text-gray-600 mb-6">Siden finnes ikke.</p>
                <a href="/" className="text-autoglass-blue hover:underline">Gå til forsiden</a>
              </div>
            } />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}

export default App
