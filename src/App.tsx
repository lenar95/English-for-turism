import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { TabBar } from './components/Layout';
import { Toasts } from './components/Toasts';
import { UpdateBanner } from './components/UpdateBanner';
import { HomePage } from './pages/HomePage';
import { OnboardingPage } from './pages/OnboardingPage';
import { AppProvider, useApp } from './state/AppContext';

// Главная и онбординг — в основном чанке, остальные экраны подгружаются при первом переходе
// (и всё равно попадают в офлайн-кэш при установке service worker'а).
const ScenariosPage = lazy(() => import('./pages/ScenariosPage').then((m) => ({ default: m.ScenariosPage })));
const ScenarioPage = lazy(() => import('./pages/ScenarioPage').then((m) => ({ default: m.ScenarioPage })));
const CityPage = lazy(() => import('./pages/CityPage').then((m) => ({ default: m.CityPage })));
const LocalPracticePage = lazy(() => import('./pages/LocalPracticePage').then((m) => ({ default: m.LocalPracticePage })));
const DialoguePage = lazy(() => import('./pages/DialoguePage').then((m) => ({ default: m.DialoguePage })));
const SessionPage = lazy(() => import('./pages/SessionPage').then((m) => ({ default: m.SessionPage })));
const PhrasebookPage = lazy(() => import('./pages/PhrasebookPage').then((m) => ({ default: m.PhrasebookPage })));
const ProgressPage = lazy(() => import('./pages/ProgressPage').then((m) => ({ default: m.ProgressPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

function ScrollToTop() {
  const { pathname } = useLocation();
  // Тело в фигурных скобках намеренно: эффект не должен возвращать результат scrollTo,
  // иначе React примет его за функцию очистки (в Chrome это значение не undefined и страница падает).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Shell() {
  const { ready, data } = useApp();
  const { pathname } = useLocation();
  if (!ready) return null;
  if (!data.onboarded) return <OnboardingPage />;
  // В упражнениях и диалогах панель вкладок не показываем, чтобы не отвлекала.
  const focused = /^\/(practice|exam)\//.test(pathname) || pathname.includes('/dialogue/') || /^\/city\/[^/]+\/local/.test(pathname);
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/scenarios" element={<ScenariosPage />} />
        <Route path="/scenario/:id" element={<ScenarioPage />} />
        <Route path="/city/:id" element={<CityPage />} />
        <Route path="/city/:id/local" element={<LocalPracticePage />} />
        <Route path="/scenario/:id/dialogue/:did" element={<DialoguePage />} />
        <Route path="/practice/:scope" element={<SessionPage key="practice" mode="practice" />} />
        <Route path="/exam/:scope" element={<SessionPage key="exam" mode="exam" />} />
        <Route path="/phrasebook" element={<PhrasebookPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      {!focused && <TabBar />}
      <Toasts />
      <UpdateBanner />
    </>
  );
}

export function App() {
  return (
    <AppProvider>
      <HashRouter>
        <div className="app">
          <Shell />
        </div>
      </HashRouter>
    </AppProvider>
  );
}
