// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { probe, renderApp } from '../test/render';

// Всё, что трогает браузерные API и сеть, подменено: хранилище, service worker, распознавание, озвучка.
vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: async () => ({ value: null }), set: async () => undefined },
}));
vi.mock('../lib/push', () => ({
  registerServiceWorker: async () => null,
  probeBackend: async () => 'none',
  onUpdateReady: () => () => undefined,
  applyUpdate: () => undefined,
  sendStatus: async () => true,
  newIdentity: () => ({ id: 'id', token: 'token' }),
  pushSupport: () => 'unsupported',
}));
vi.mock('../lib/speech/recognition', () => ({
  recognitionAvailable: async () => true,
  recognitionLikelyAvailable: () => true,
  listen: () => ({ result: Promise.reject(new Error('no mic in tests')), stop() {}, abort() {} }),
  recognitionErrorText: () => 'ошибка',
}));
vi.mock('../lib/speech/tts', () => ({ speak: async () => undefined, stopSpeaking: () => undefined, msSinceSpeech: () => 10_000 }));
vi.mock('../lib/haptics', () => ({ hapticSuccess: () => undefined, hapticError: () => undefined }));
vi.mock('./PronunciationCheck', () => ({
  // Микрофон в тестах заменён кнопкой: нажатие «говорит» фразу с заданной оценкой.
  PronunciationCheck: ({ onResult, targets }: { onResult?: (r: { score: number; words: never[]; matchedTarget: string; transcript: string }) => void; targets: string[] }) => (
    <button type="button" onClick={() => onResult?.({ score: 90, words: [], matchedTarget: targets[0], transcript: targets[0] })}>
      сказать
    </button>
  ),
}));

import { scenarios } from '../data';
import { fixedSource } from '../lib/adaptive';
import { makeExercise, phraseWords, type ExerciseType } from '../lib/exercises';
import { ExerciseRunner } from './ExerciseRunner';

const pool = scenarios.slice(0, 2).flatMap((scenario) => scenario.phrases.map((phrase) => ({ phrase, scenario })));
const you = pool.filter((l) => l.phrase.speaker === 'you' && phraseWords(l.phrase.en).length >= 3);
const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const exercise = (type: ExerciseType, i = 0) => makeExercise(type, you[i], pool, seeded(i + 1));

afterEach(cleanup);

describe('ExerciseRunner', () => {
  it('выбор варианта: ошибка показывает правильный ответ, «Дальше» ведёт к следующему заданию, итог уходит в onFinish', async () => {
    const first = exercise('choose-en', 0);
    const second = exercise('choose-en', 1);
    const onFinish = vi.fn();
    renderApp(<ExerciseRunner source={fixedSource([first, second])} kind="practice" mode="practice" onFinish={onFinish} onExit={() => undefined} />);
    await screen.findByText(first.phrase.ru);

    const wrong = first.options!.find((o) => o.id !== first.phrase.id)!;
    fireEvent.click(screen.getByRole('button', { name: wrong.en }));
    expect(screen.getByText('Правильный ответ')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));

    await screen.findByText(second.phrase.ru);
    fireEvent.click(screen.getByRole('button', { name: second.phrase.en }));
    expect(screen.getByText('Верно!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Посмотреть результат' }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    const outcomes = onFinish.mock.calls[0][0] as { memoryCorrect?: boolean }[];
    expect(outcomes.map((o) => o.memoryCorrect)).toEqual([false, true]);
    // Ответы записаны в прогресс и в журнал сессии.
    await waitFor(() => expect(probe.data?.progress[second.phrase.id]?.memory.level).toBe(1));
    expect(probe.data?.progress[first.phrase.id]?.memory.reviews).toBe(1);
    expect(probe.data?.sessions.at(-1)).toMatchObject({ kind: 'practice', planned: 2, done: 2, correct: 1, exitedEarly: false });
  });

  it('сборка фразы: плитки в правильном порядке засчитываются', async () => {
    const ex = exercise('build', 0);
    renderApp(<ExerciseRunner source={fixedSource([ex])} kind="practice" mode="practice" onFinish={() => undefined} onExit={() => undefined} />);
    await screen.findByText('Соберите фразу из слов');
    const tiles = screen.getAllByRole('button').filter((b) => ex.tiles!.includes(b.textContent ?? '') && !b.classList.contains('used'));
    for (const word of phraseWords(ex.phrase.en)) {
      const tile = tiles.find((b) => b.textContent === word && !b.classList.contains('used'))!;
      fireEvent.click(tile);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Верно!')).toBeTruthy();
  });

  it('вспомнить и сказать: распознанная фраза засчитывается и по памяти, и по произношению', async () => {
    const ex = exercise('recall-speak', 0);
    const onFinish = vi.fn();
    renderApp(<ExerciseRunner source={fixedSource([ex])} kind="practice" mode="practice" onFinish={onFinish} onExit={() => undefined} />);
    await screen.findByText('Скажите по-английски');
    fireEvent.click(screen.getByRole('button', { name: 'сказать' }));
    expect(screen.getByText('Вспомнили!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Посмотреть результат' }));
    expect(onFinish.mock.calls[0][0][0]).toMatchObject({ memoryCorrect: true, pronScore: 90 });
    await waitFor(() => expect(probe.data?.progress[ex.phrase.id]?.pron).toEqual([90]));
  });

  it('выход посреди сессии записывается как досрочный', async () => {
    const first = exercise('choose-en', 0);
    const onExit = vi.fn();
    renderApp(<ExerciseRunner source={fixedSource([first, exercise('choose-en', 1)])} kind="practice" mode="practice" onFinish={() => undefined} onExit={onExit} />);
    await screen.findByText(first.phrase.ru);
    fireEvent.click(screen.getByRole('button', { name: first.phrase.en }));
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(onExit).toHaveBeenCalled();
    await waitFor(() => expect(probe.data?.sessions.at(-1)).toMatchObject({ done: 1, correct: 1, exitedEarly: true }));
  });
});
