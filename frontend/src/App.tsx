import { Routes, Route } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { FoundationHome } from '@/pages/FoundationHome';
import { LoginPage } from '@/pages/LoginPage';
import { NotFound } from '@/pages/NotFound';
import { ProtectedRoute } from '@/auth/ProtectedRoute';

/**
 * /login is the only public route; everything else requires an
 * authenticated session (Prompt 02 §13/§15 — protected routing). Real
 * business routes (Students, Grades, Distribution, ...) are added
 * module-by-module in later phases (Prompt 01 §10).
 */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Routes>
                <Route path="/" element={<FoundationHome />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </MainLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
