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
import type { Phrase, Scenario, Stage } from './types';

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

export const scenarioById: Record<string, Scenario> = Object.fromEntries(scenarios.map((s) => [s.id, s]));

export interface PhraseRef {
  phrase: Phrase;
  scenario: Scenario;
}

export const phraseById: Record<string, PhraseRef> = Object.fromEntries(
  scenarios.flatMap((scenario) => scenario.phrases.map((phrase) => [phrase.id, { phrase, scenario }])),
);

export const allPhrases: PhraseRef[] = Object.values(phraseById);
