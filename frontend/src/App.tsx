import { Routes, Route } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import HomePage from '@/pages/HomePage'
import CatalogPage from '@/pages/CatalogPage'
import SearchPage from '@/pages/SearchPage'
import AccountPage from '@/pages/AccountPage'
import BrowsePage from '@/pages/BrowsePage'

function App() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/katalog" element={<CatalogPage />} />
          <Route path="/bla" element={<BrowsePage />} />
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
