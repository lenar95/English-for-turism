/** Кто произносит фразу в реальной ситуации. */
export type Speaker =
  /** Турист говорит сам — нужно помнить и уметь произнести. */
  | 'you'
  /** Фразу говорят туристу — нужно узнать на слух и понять. */
  | 'them';

/** Этап поездки — используется для группировки сценариев по маршруту. */
export type Stage = 'basics' | 'airport' | 'hotel' | 'city' | 'help' | 'departure';

export interface Phrase {
  /** Уникальный id в формате `<scenarioId>-<номер>`, например `hotel-checkin-03`. */
  id: string;
  /** Английская фраза — естественная, короткая, как её реально говорят. */
  en: string;
  /** Перевод на русский. */
  ru: string;
  /** Произношение русскими буквами. */
  tr: string;
  speaker: Speaker;
  /** Ключевая фраза: без неё сценарий не пройти. Весит вдвое больше при расчёте готовности. */
  key?: boolean;
  /** Другие допустимые английские варианты — засчитываются, когда турист вспоминает фразу вслух. */
  alt?: string[];
  /** Короткая подсказка по-русски: когда говорить, на что обратить внимание. */
  note?: string;
}

export interface DialogueLine {
  phraseId: string;
}

export interface Dialogue {
  id: string;
  title: string;
  /** Реплики по порядку. Говорящий берётся из самой фразы. */
  lines: DialogueLine[];
}

export interface Scenario {
  id: string;
  title: string;
  emoji: string;
  stage: Stage;
  /** Одно предложение: что умеет турист после сценария. */
  goal: string;
  phrases: Phrase[];
  dialogues: Dialogue[];
  /** Практические советы по ситуации (по-русски). */
  tips: string[];
}
