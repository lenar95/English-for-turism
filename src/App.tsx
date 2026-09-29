import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { TabBar } from './components/Layout';
import { Toasts } from './components/Toasts';
import { UpdateBanner } from './components/UpdateBanner';
import { LocalPracticePage } from './pages/LocalPracticePage';
import { CityPage } from './pages/CityPage';
import { DialoguePage } from './pages/DialoguePage';
import { HomePage } from './pages/HomePage';
import { OnboardingPage } from './pages/OnboardingPage';
import { PhrasebookPage } from './pages/PhrasebookPage';
import { ProgressPage } from './pages/ProgressPage';
import { ScenarioPage } from './pages/ScenarioPage';
import { ScenariosPage } from './pages/ScenariosPage';
import { SessionPage } from './pages/SessionPage';
import { SettingsPage } from './pages/SettingsPage';
import { AppProvider, useApp } from './state/AppContext';

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
