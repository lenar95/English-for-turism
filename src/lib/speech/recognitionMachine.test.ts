import { describe, expect, it } from 'vitest';
import { initialState, step, type RecEffect, type RecEvent, type RecState, type TimerName } from './recognitionMachine';

const OPTS = { silenceMs: 1500, maxMs: 12000 };

/** Прогоняет события по машине, собирая эффекты; таймеры считает по имени. */
class Harness {
  state: RecState;
  effects: RecEffect[] = [];
  constructor(strategy = 0, emptyInRow = 0) {
    this.state = initialState(strategy, emptyInRow);
  }
  send(event: RecEvent): RecEffect[] {
    const out = step(this.state, event, OPTS);
    this.state = out.state;
    this.effects.push(...out.effects);
    return out.effects;
  }
  /** Есть ли среди эффектов таймер с таким именем. */
  timer(effects: RecEffect[], name: TimerName) {
    return effects.find((e) => e.type === 'timer' && e.name === name) as { ms: number } | undefined;
  }
  types(effects: RecEffect[]) {
    return effects.map((e) => e.type);
  }
  fire(name: TimerName, now: number) {
    return this.send({ type: 'timer', now, name });
  }
}

const start = (h: Harness, now = 0, msSinceSpeech = 10_000, micLive = false) => h.send({ type: 'start', now, msSinceSpeech, micLive });

describe('машина распознавания', () => {
  it('обычный путь: запуск, результат, тишина, остановка, onend → результат', () => {
    const h = new Harness();
    const first = start(h);
    expect(h.types(first)).toContain('begin');
    expect(h.timer(first, 'noWords')?.ms).toBe(9000);
    expect(h.timer(first, 'max')?.ms).toBe(12000);
    expect(h.timer(first, 'restartCheck')?.ms).toBe(2500);
    const run = h.state.run;
    h.send({ type: 'rec-audio', now: 300, run });
    const res = h.send({ type: 'rec-result', now: 900, run, alternatives: ['hello', 'hallo'] });
    expect(res).toContainEqual({ type: 'partial', text: 'hello' });
    expect(h.timer(res, 'silence')?.ms).toBe(1500);
    const stopped = h.fire('silence', 2400);
    expect(h.types(stopped)).toContain('stopRec');
    expect(h.timer(stopped, 'afterStop')?.ms).toBe(600);
    const done = h.send({ type: 'rec-end', now: 2500, run });
    expect(done).toContainEqual({ type: 'resolve', alternatives: ['hello', 'hallo'] });
    expect(h.state.phase).toBe('done');
    // После завершения события игнорируются.
    expect(h.send({ type: 'rec-error', now: 2600, run, error: 'network' })).toEqual([]);
  });

  it('после озвучки ждёт полсекунды, прежде чем включить микрофон', () => {
    const h = new Harness();
    const first = start(h, 0, 100);
    expect(h.types(first)).not.toContain('begin');
    expect(h.timer(first, 'begin')?.ms).toBe(400);
    expect(h.types(h.fire('begin', 400))).toContain('begin');
  });

  it('режим 1: сначала держим микрофон открытым, потом запускаем', () => {
    const h = new Harness(1);
    const first = start(h, 0, 10_000, false);
    expect(h.types(first)).toContain('keepMic');
    expect(h.types(first)).not.toContain('begin');
    const ready = h.send({ type: 'mic-ready', now: 200, msSinceSpeech: 10_000 });
    expect(h.timer(ready, 'begin')?.ms).toBe(0);
    expect(h.types(h.fire('begin', 200))).toContain('begin');
    // Микрофон уже открыт — запускаем сразу.
    const h2 = new Harness(1);
    expect(h2.types(start(h2, 0, 10_000, true))).toContain('begin');
  });

  it('микрофон не включился — перезапуск со свежим объектом, но не больше двух раз', () => {
    const h = new Harness();
    start(h);
    const r1 = h.fire('restartCheck', 2500);
    expect(h.types(r1)).toContain('detachRec');
    expect(h.timer(r1, 'restartBegin')?.ms).toBe(300);
    const b = h.fire('restartBegin', 2800);
    expect(b).toContainEqual(expect.objectContaining({ type: 'begin', fresh: true }));
    h.fire('restartCheck', 5300);
    h.fire('restartBegin', 5600);
    expect(h.state.restarts).toBe(2);
    expect(h.types(h.fire('restartCheck', 8100))).not.toContain('detachRec');
    // Ни одного слова за 9 с — «ничего не услышали».
    const end = h.fire('noWords', 9000);
    expect(end).toContainEqual({ type: 'reject', code: 'no-speech' });
  });

  it('после стопа браузер молчит — берём то, что распозналось', () => {
    const h = new Harness();
    start(h);
    const run = h.state.run;
    h.send({ type: 'rec-result', now: 500, run, alternatives: ['taxi'] });
    const stopped = h.send({ type: 'stop', now: 700 });
    expect(h.timer(stopped, 'afterStop')?.ms).toBe(600);
    expect(h.fire('afterStop', 1300)).toContainEqual({ type: 'resolve', alternatives: ['taxi'] });
    // Без результата ждём дольше и сообщаем «ничего не услышали».
    const h2 = new Harness();
    start(h2);
    expect(h2.timer(h2.send({ type: 'stop', now: 700 }), 'afterStop')?.ms).toBe(1200);
    expect(h2.fire('afterStop', 1900)).toContainEqual({ type: 'reject', code: 'no-speech' });
  });

  it('холостая попытка переключает режим: с 0 сразу, с 1 — после двух подряд', () => {
    const h = new Harness(0);
    start(h, 0);
    const run = h.state.run;
    h.send({ type: 'rec-audio', now: 100, run });
    const end = h.send({ type: 'rec-end', now: 3000, run });
    expect(end).toContainEqual(expect.objectContaining({ type: 'strategy', value: 1 }));
    expect(h.state.strategy).toBe(1);
    expect(h.state.emptyInRow).toBe(0);

    const h1 = new Harness(1, 0);
    start(h1, 0, 10_000, true);
    h1.send({ type: 'rec-audio', now: 100, run: h1.state.run });
    expect(h1.types(h1.send({ type: 'rec-end', now: 3000, run: h1.state.run }))).not.toContain('strategy');
    expect(h1.state.emptyInRow).toBe(1);
    const h1b = new Harness(1, h1.state.emptyInRow);
    start(h1b, 0, 10_000, true);
    h1b.send({ type: 'rec-audio', now: 100, run: h1b.state.run });
    expect(h1b.send({ type: 'rec-end', now: 3000, run: h1b.state.run })).toContainEqual(expect.objectContaining({ type: 'strategy', value: 2 }));

    // Короткая попытка или попытка с речью — не холостая.
    const h3 = new Harness(0);
    start(h3, 0);
    h3.send({ type: 'rec-audio', now: 100, run: h3.state.run });
    h3.send({ type: 'rec-end', now: 1000, run: h3.state.run });
    expect(h3.state.emptyInRow).toBe(0);
  });

  it('режим 2 запускает без промежуточных результатов', () => {
    const h = new Harness(2);
    expect(start(h, 0, 10_000, true)).toContainEqual(expect.objectContaining({ type: 'begin', interim: false }));
  });

  it('отмена отклоняет промис кодом aborted, а «aborted» от браузера — как «не услышали»', () => {
    const h = new Harness();
    start(h);
    const a = h.send({ type: 'abort', now: 100 });
    expect(h.types(a)).toContain('abortRec');
    expect(a).toContainEqual({ type: 'reject', code: 'aborted' });

    const h2 = new Harness();
    start(h2);
    const run = h2.state.run;
    h2.send({ type: 'rec-error', now: 100, run, error: 'aborted' });
    expect(h2.send({ type: 'rec-end', now: 200, run })).toContainEqual({ type: 'reject', code: 'no-speech' });
  });

  it('нет доступа к микрофону или сети — завершаем сразу с этой ошибкой', () => {
    const h = new Harness();
    start(h);
    expect(h.send({ type: 'rec-error', now: 100, run: h.state.run, error: 'not-allowed' })).toContainEqual({ type: 'reject', code: 'permission' });
    const h2 = new Harness();
    start(h2);
    expect(h2.send({ type: 'rec-error', now: 100, run: h2.state.run, error: 'network' })).toContainEqual({ type: 'reject', code: 'network' });
  });

  it('события старого объекта после перезапуска игнорируются', () => {
    const h = new Harness();
    start(h);
    const oldRun = h.state.run;
    h.fire('restartCheck', 2500);
    h.fire('restartBegin', 2800);
    expect(h.state.run).toBe(oldRun + 1);
    expect(h.send({ type: 'rec-end', now: 2900, run: oldRun })).toEqual([]);
    expect(h.state.phase).toBe('active');
  });

  it('максимальная длительность останавливает запись', () => {
    const h = new Harness();
    start(h);
    h.send({ type: 'rec-result', now: 500, run: h.state.run, alternatives: ['one'] });
    expect(h.types(h.fire('max', 12000))).toContain('stopRec');
  });
});
