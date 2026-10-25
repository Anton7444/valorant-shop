import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import ShopPage from './pages/ShopPage';
import InventoryPage from './pages/InventoryPage';
import CatalogPage from './pages/CatalogPage';
import BundlePage from './pages/BundlePage';
import PricesPage from './pages/PricesPage';
import AccessoryPage from './pages/AccessoryPage';
import ReflectivePage from './pages/ReflectivePage';
import BattlePassPage from './pages/BattlePassPage';
import ProfilePage from './pages/ProfilePage';
import { LanguageProvider } from './context/LanguageContext';

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<LoginPage />} />
              <Route
                path="/shop"
                element={
                  <ProtectedRoute>
                    <ShopPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory"
                element={
                  <ProtectedRoute>
                    <InventoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/battlepass"
                element={
                  <ProtectedRoute>
                    <BattlePassPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/accessories"
                element={
                  <ProtectedRoute>
                    <AccessoryPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/bundle" element={<BundlePage />} />
              <Route path="/prices" element={<PricesPage />} />
              <Route path="/reflective" element={<ReflectivePage />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  );
}
