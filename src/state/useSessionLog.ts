import { useCallback, useEffect, useRef } from 'react';
import { useActions } from './AppContext';
import type { SessionKind } from './model';

/** Сессия короче этого времени без единого ответа считается открытой случайно и не записывается. */
const ACCIDENTAL_MS = 3000;

export interface SessionCounts {
  done: number;
  correct: number;
}

/**
 * Журнал сессии для оценки вовлечённости (досрочные выходы, длительность).
 * Время начала берётся при монтировании, запись делается один раз: при завершении,
 * при явном выходе или при размонтировании посреди сессии (ушли со страницы) —
 * как досрочный выход. Живые счётчики передаются при каждом рендере; завершение
 * принимает итог явно, потому что состояние в этот момент ещё не закоммичено.
 */
export function useSessionLog(kind: SessionKind, planned: number, live: SessionCounts) {
  const { logSession } = useActions();
  const startedAt = useRef(0);
  const logged = useRef(false);
  const latest = useRef({ planned, ...live });
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  useEffect(() => {
    latest.current = { planned, done: live.done, correct: live.correct };
  }, [planned, live.done, live.correct]);

  const write = useCallback(
    (exitedEarly: boolean, counts?: SessionCounts) => {
      if (logged.current) return;
      const { planned: p, done, correct } = { ...latest.current, ...counts };
      const end = Date.now();
      if (exitedEarly && done === 0 && end - startedAt.current < ACCIDENTAL_MS) return;
      logged.current = true;
      logSession({ start: startedAt.current, end, kind, planned: p, done, correct, exitedEarly });
    },
    [kind, logSession],
  );

  useEffect(() => () => write(true), [write]);

  return {
    /** Сессия доведена до конца. */
    finish: (counts: SessionCounts) => write(false, counts),
    /** Явный выход по кнопке. */
    exit: () => write(true),
  };
}
