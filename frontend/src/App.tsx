import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import ShopPage from './pages/ShopPage';
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
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  );
}
