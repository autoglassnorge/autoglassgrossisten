import { Routes, Route } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import HomePage from '@/pages/HomePage'
import CatalogPage from '@/pages/CatalogPage'
import SearchPage from '@/pages/SearchPage'

function App() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/katalog" element={<CatalogPage />} />
          <Route path="/sok" element={<SearchPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
