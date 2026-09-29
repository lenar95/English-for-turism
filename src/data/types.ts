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
  /** Та же фраза на местном языке города (для городских наборов). Язык берётся из CityPack.localLanguage. */
  local?: LocalPhrase;
}

/** Перевод фразы на местный язык. */
export interface LocalPhrase {
  text: string;
  /** Произношение русскими буквами. */
  tr: string;
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
  /** Если задан — ситуация из городского набора. */
  cityId?: string;
}

/** Слово на местном языке (не английском) — для вежливости и базовых ситуаций. */
export interface LocalWord {
  /** Слово или фраза на местном языке. */
  text: string;
  ru: string;
  /** Произношение русскими буквами. */
  tr: string;
}

/** Набор для конкретного города: местные нюансы поверх общих ситуаций. */
export interface CityPack {
  id: string;
  name: string;
  /** Предложный падеж для заголовков: «в Стамбуле». */
  nameIn: string;
  /** Родительный падеж: «ситуации Стамбула». */
  nameGen: string;
  /** Код аэропорта для посадочного талона, например IST. */
  code: string;
  country: string;
  emoji: string;
  /** Коротко: чем город отличается и к чему готовиться. */
  intro: string;
  /** Общие советы по городу. */
  tips: string[];
  localLanguage: {
    /** Наречие для подписей: «по-турецки». */
    name: string;
    /** BCP 47 для озвучки, например tr-TR. */
    lang: string;
    /** Короткая похвала на местном языке для итога тренировки: «Çok iyi!». */
    praise: string;
    note: string;
    words: LocalWord[];
  };
  /** Ситуации города. У каждой задан cityId. */
  scenarios: Scenario[];
}
