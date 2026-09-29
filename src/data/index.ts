import { baggage } from './scenarios/baggage';
import { basics } from './scenarios/basics';
import { checkout } from './scenarios/checkout';
import { directions } from './scenarios/directions';
import { emergency } from './scenarios/emergency';
import { flightCheckin } from './scenarios/flight-checkin';
import { hotelCheckin } from './scenarios/hotel-checkin';
import { hotelService } from './scenarios/hotel-service';
import { money } from './scenarios/money';
import { passportControl } from './scenarios/passport-control';
import { pharmacyDoctor } from './scenarios/pharmacy-doctor';
import { publicTransport } from './scenarios/public-transport';
import { restaurant } from './scenarios/restaurant';
import { shopping } from './scenarios/shopping';
import { sightseeing } from './scenarios/sightseeing';
import { transfer } from './scenarios/transfer';
import { istanbul } from './cities/istanbul';
import type { CityPack, Phrase, Scenario, Stage } from './types';

/** Сценарии в порядке маршрута поездки. */
export const scenarios: Scenario[] = [
  basics,
  passportControl,
  baggage,
  transfer,
  hotelCheckin,
  hotelService,
  restaurant,
  shopping,
  money,
  publicTransport,
  directions,
  sightseeing,
  pharmacyDoctor,
  emergency,
  checkout,
  flightCheckin,
];

export const STAGES: { id: Stage; title: string }[] = [
  { id: 'basics', title: 'Основа' },
  { id: 'airport', title: 'Прилёт' },
  { id: 'hotel', title: 'Отель' },
  { id: 'city', title: 'В городе' },
  { id: 'help', title: 'Если что-то случилось' },
  { id: 'departure', title: 'Отъезд' },
];

/** Наборы для конкретных городов. */
export const cities: CityPack[] = [istanbul];

export const cityById: Record<string, CityPack> = Object.fromEntries(cities.map((c) => [c.id, c]));

/** Все ситуации: общие и городские. */
export const allScenarios: Scenario[] = [...scenarios, ...cities.flatMap((c) => c.scenarios)];

export const scenarioById: Record<string, Scenario> = Object.fromEntries(allScenarios.map((s) => [s.id, s]));

export interface PhraseRef {
  phrase: Phrase;
  scenario: Scenario;
}

export const phraseById: Record<string, PhraseRef> = Object.fromEntries(
  allScenarios.flatMap((scenario) => scenario.phrases.map((phrase) => [phrase.id, { phrase, scenario }])),
);

export const allPhrases: PhraseRef[] = Object.values(phraseById);

export interface LocalVersion {
  text: string;
  tr: string;
  /** BCP 47 для озвучки. */
  lang: string;
  /** «по-турецки». */
  name: string;
}

/** Фраза на местном языке города, если она есть в наборе. */
export function localOf(phrase: Phrase): LocalVersion | null {
  if (!phrase.local) return null;
  const cityId = phraseById[phrase.id]?.scenario.cityId;
  const city = cityId ? cityById[cityId] : undefined;
  if (!city) return null;
  return { ...phrase.local, lang: city.localLanguage.lang, name: city.localLanguage.name };
}
