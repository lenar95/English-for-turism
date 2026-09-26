import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { TabBar } from './components/Layout';
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
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

function Shell() {
  const { ready, data } = useApp();
  const { pathname } = useLocation();
  if (!ready) return null;
  if (!data.onboarded) return <OnboardingPage />;
  // В упражнениях и диалогах панель вкладок не показываем, чтобы не отвлекала.
  const focused = /^\/(practice|exam)\//.test(pathname) || pathname.includes('/dialogue/');
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/scenarios" element={<ScenariosPage />} />
        <Route path="/scenario/:id" element={<ScenarioPage />} />
        <Route path="/city/:id" element={<CityPage />} />
        <Route path="/scenario/:id/dialogue/:did" element={<DialoguePage />} />
        <Route path="/practice/:scope" element={<SessionPage key="practice" mode="practice" />} />
        <Route path="/exam/:scope" element={<SessionPage key="exam" mode="exam" />} />
        <Route path="/phrasebook" element={<PhrasebookPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!focused && <TabBar />}
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
