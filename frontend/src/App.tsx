import { Routes, Route } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import HomePage from '@/pages/HomePage'
import CatalogPage from '@/pages/CatalogPage'
import SearchPage from '@/pages/SearchPage'
import AccountPage from '@/pages/AccountPage'
import BrowsePage from '@/pages/BrowsePage'
import BilglassguidePage from '@/pages/BilglassguidePage'
import FrontrutePage from '@/pages/bilglassguide/FrontrutePage'
import AdasKameraPage from '@/pages/bilglassguide/AdasKameraPage'
import KalibreringPage from '@/pages/bilglassguide/KalibreringPage'
import OemAftermarketPage from '@/pages/bilglassguide/OemAftermarketPage'
import HudPage from '@/pages/bilglassguide/HudPage'
import OppvarmetFrontrutePage from '@/pages/bilglassguide/OppvarmetFrontrutePage'
import IdentifiserePage from '@/pages/bilglassguide/IdentifiserePage'
import FlereFrontruterPage from '@/pages/bilglassguide/FlereFrontruterPage'
import AkustiskPage from '@/pages/bilglassguide/AkustiskPage'

function App() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/katalog" element={<CatalogPage />} />
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
      </main>
      <Footer />
    </div>
  )
}

export default App
