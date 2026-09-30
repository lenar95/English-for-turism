import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Burst } from '../components/Burst';
import { TopBar } from '../components/Layout';
import { PronunciationCheck } from '../components/PronunciationCheck';
import { Ring } from '../components/Readiness';
import { SessionFrame } from '../components/SessionFrame';
import { NO_VOICE_HINT, SpeakButtons, useVoiceFor } from '../components/Speak';
import { cityById, translationOf } from '../data';
import type { CityPack } from '../data/types';
import { RECALL_PASS_SCORE } from '../lib/thresholds';
import { hapticSuccess } from '../lib/haptics';
import { localLearned, localProgressKey, localSession, type LocalItem } from '../lib/localPractice';
import type { PronunciationResult } from '../lib/pronunciation';
import { plural } from '../lib/ru';
import { useActions, useAppData } from '../state/AppContext';
import { useSpeechFor } from '../lib/speech/useSpeechFor';
import { useSessionLog } from '../state/useSessionLog';

const SESSION_SIZE = 8;

interface LocalOutcome {
  item: LocalItem;
  /** Сказал (или вспомнил) без подсказки и достаточно понятно. */
  ok: boolean;
  /**
   * Вспомнил ли для модели памяти. null — вспомнил только с подсказкой:
   * память не трогаем (ни повышаем, ни наказываем), засчитываем только произношение.
   */
  memory: boolean | null;
  pronScore?: number;
}

/** Тренировка фраз города на местном языке: повторить за диктором, потом вспомнить самому. */
export function LocalPracticePage() {
  const { id = '' } = useParams();
  const [search] = useSearchParams();
  const city = cityById[id];
  const [round, setRound] = useState(0);
  if (!city) {
    return (
      <div className="page">
        <TopBar back="/scenarios" />
        <p className="empty">Город не найден.</p>
      </div>
    );
  }
  return <LocalRun key={round} city={city} scenarioId={search.get('s') ?? undefined} onRestart={() => setRound((r) => r + 1)} />;
}

function LocalRun({ city, scenarioId, onRestart }: { city: CityPack; scenarioId?: string; onRestart: () => void }) {
  const { data, ready } = useAppData();
  const { answer, pronunciation } = useActions();
  const navigate = useNavigate();
  const back = scenarioId ? `/scenario/${scenarioId}` : `/city/${city.id}`;
  // Набор фиксируется на раунд, чтобы не перестраиваться после каждого ответа.
  const items = useMemo(
    () => localSession(city, data.progress, SESSION_SIZE, scenarioId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city.id, scenarioId, ready],
  );
  const [outcomes, setOutcomes] = useState<LocalOutcome[]>([]);
  const [current, setCurrent] = useState<LocalOutcome | null>(null);
  const index = outcomes.length;
  const item = items[index];
  const lang = city.localLanguage;
  // Распознавание этого языка могло зависнуть на устройстве — тогда тренировка идёт с самопроверкой.
  const speechOn = useSpeechFor(lang.lang);
  const session = useSessionLog('practice', items.length, { done: index, correct: outcomes.filter((o) => o.ok).length });

  const next = () => {
    if (!current) return;
    const key = localProgressKey(current.item.phrase.id, lang.lang);
    if (current.memory !== null) answer(key, current.memory, current.item.mode === 'recall' ? 'recall' : 'recognition');
    if (current.pronScore !== undefined) pronunciation(key, current.pronScore);
    const all = [...outcomes, current];
    setOutcomes(all);
    setCurrent(null);
    if (all.length >= items.length) session.finish({ done: all.length, correct: all.filter((o) => o.ok).length });
  };

  const exit = () => {
    session.exit();
    navigate(back);
  };

  if (!items.length) {
    return (
      <div className="page">
        <TopBar back={back} title={`Тренировка ${lang.name}`} />
        <p className="empty">Здесь пока нет фраз для тренировки.</p>
      </div>
    );
  }

  if (!item) return <LocalResult city={city} outcomes={outcomes} back={back} onRestart={onRestart} />;

  return (
    <SessionFrame
      arena="city"
      index={index}
      planned={items.length}
      unit="Фраза"
      onExit={exit}
      footer={
        <button type="button" className="btn btn--block" disabled={!current} onClick={next}>
          {index + 1 >= items.length ? 'Посмотреть результат' : 'Дальше'}
        </button>
      }
    >
      <LocalCard key={`${item.phrase.id}-${index}`} item={item} lang={lang.lang} name={lang.name} speechOn={speechOn} onAnswered={setCurrent} />
    </SessionFrame>
  );
}

function LocalCard({
  item,
  lang,
  name,
  speechOn,
  onAnswered,
}: {
  item: LocalItem;
  lang: string;
  name: string;
  speechOn: boolean;
  onAnswered: (o: LocalOutcome | null) => void;
}) {
  const { phrase } = item;
  const local = translationOf(phrase, lang)!;
  const recall = item.mode === 'recall';
  // Подсказки в режиме «вспомнить»: 1 — произношение русскими буквами, 2 — вся фраза с озвучкой.
  const [hint, setHint] = useState(recall ? 0 : 2);
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [selfCheck, setSelfCheck] = useState(false);
  const passed = result !== null && result.score >= RECALL_PASS_SCORE;
  const usedHint = recall && hint > 0;
  const voice = useVoiceFor(lang);

  const onResult = (r: PronunciationResult) => {
    // Засчитываем лучшую попытку.
    const best = result && result.score > r.score ? result : r;
    setResult(best);
    const said = best.score >= RECALL_PASS_SCORE;
    onAnswered({ item, ok: said && !usedHint, memory: said && usedHint ? null : said, pronScore: best.score });
  };

  const selfAnswer = (ok: boolean) => {
    setSelfCheck(true);
    setHint(2);
    onAnswered({ item, ok: ok && !usedHint, memory: ok && usedHint ? null : ok });
  };

  return (
    <div className="exercise">
      <span className="exercise__kind">{recall ? `Скажите ${name}` : 'Послушайте и повторите'}</span>
      <div className="card phrase">
        <span className="exercise__prompt">{phrase.ru}</span>
        {hint >= 1 && <span className="phrase__tr">{local.tr}</span>}
        {hint >= 2 && (
          <span className="phrase__en" lang={lang.slice(0, 2)} style={{ fontSize: 22 }}>
            {local.text}
          </span>
        )}
        {hint >= 2 && (
          <div className="phrase__actions">
            <SpeakButtons text={local.text} lang={lang} autoPlay={!recall} />
            {!recall && <span className="small muted">{voice.known && !voice.available ? NO_VOICE_HINT : 'Сначала послушайте, как это звучит'}</span>}
          </div>
        )}
        <span className="small muted" lang="en">
          По-английски: {phrase.en}
        </span>
      </div>

      {speechOn ? (
        <PronunciationCheck
          targets={[local.text]}
          lang={lang}
          onResult={onResult}
          showWords={hint >= 2 || passed}
          idleHint={recall && hint < 2 ? `Вспомните и скажите ${name}` : `Нажмите на микрофон и повторите ${name}`}
        />
      ) : !selfCheck ? (
        <div className="row">
          {recall ? (
            <>
              <button type="button" className="btn btn--outline grow" onClick={() => selfAnswer(false)}>
                Не вспомнил
              </button>
              <button type="button" className="btn grow" onClick={() => selfAnswer(true)}>
                Вспомнил
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--secondary grow" onClick={() => selfAnswer(true)}>
              Повторил вслух
            </button>
          )}
        </div>
      ) : null}

      {recall && hint < 2 && !passed && (
        <button type="button" className="btn btn--ghost" onClick={() => setHint(hint + 1)}>
          {hint === 0 ? 'Подсказка' : 'Показать фразу'}
        </button>
      )}
      {result && !passed && (
        <p className="small muted center">
          Пока не похоже. Послушайте ещё раз и повторите — можно несколько попыток.
          {hint < 2 && ' Или возьмите подсказку.'}
        </p>
      )}
      {speechOn && !result && (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          style={{ alignSelf: 'center' }}
          onClick={() => {
            setHint(2);
            onAnswered({ item, ok: false, memory: false });
          }}
        >
          Пропустить
        </button>
      )}
    </div>
  );
}

function LocalResult({ city, outcomes, back, onRestart }: { city: CityPack; outcomes: LocalOutcome[]; back: string; onRestart: () => void }) {
  const { data } = useAppData();
  const ok = outcomes.filter((o) => o.ok).length;
  const scores = outcomes.map((o) => o.pronScore).filter((s): s is number => s !== undefined);
  const pron = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const { started, learned, total } = localLearned(city, data.progress);
  const good = outcomes.length > 0 && ok / outcomes.length >= 0.7;
  // Вибрация один раз при удачном итоге.
  useEffect(() => {
    if (good) hapticSuccess();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <TopBar back={back} title={`Тренировка ${city.localLanguage.name}`} />
      <div className="card stack pop" style={{ alignItems: 'center', position: 'relative' }}>
        {good && <Burst count={20} />}
        <h2>{good ? `${city.localLanguage.praise} Отлично!` : 'Хорошее начало'}</h2>
        <Ring value={pron ?? Math.round((ok / Math.max(1, outcomes.length)) * 100)} size={120} label={pron === null ? 'результат' : 'произношение'} />
        <p className="center">
          Сказали сами: <b>{ok}</b> из {outcomes.length}
        </p>
        <p className="small muted center">
          Разучено {city.localLanguage.name}: {started} из {total} фраз{learned > 0 ? `, из них освоено ${learned}` : ''}. Через день-два
          тренировка попросит вспомнить их без подсказки — так они запомнятся надёжнее.
        </p>
        <button type="button" className="btn btn--block" onClick={onRestart}>
          Ещё {SESSION_SIZE} {plural(SESSION_SIZE, 'фраза', 'фразы', 'фраз')}
        </button>
        <Link className="btn btn--ghost btn--block" to={back}>
          Готово
        </Link>
      </div>
    </div>
  );
}
