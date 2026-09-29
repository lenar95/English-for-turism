/**
 * Обвязка для компонентных тестов: настоящий AppProvider с подменёнными платформенными
 * модулями (хранилище, service worker, распознавание, озвучка), маршрутизатор в памяти.
 * Тест-файл объявляет `// @vitest-environment jsdom` и подменяет платформенные модули через vi.mock
 * на верхнем уровне (vitest поднимает такие вызовы только из самого тест-файла).
 */
import { render, type RenderResult } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider, useAppData } from '../state/AppContext';
import type { AppData } from '../state/model';

/** Последнее состояние данных, доступное тесту через `probe.data`. */
export const probe: { data: AppData | null } = { data: null };

function Probe() {
  const { data } = useAppData();
  useEffect(() => {
    probe.data = data;
  }, [data]);
  return null;
}

export function renderApp(ui: ReactNode): RenderResult {
  return render(
    <AppProvider>
      <MemoryRouter>
        {ui}
        <Probe />
      </MemoryRouter>
    </AppProvider>,
  );
}
