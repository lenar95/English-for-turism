import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Subscriber } from './schedule';

/** Простое хранилище подписок в JSON-файле. Для десятков тысяч подписчиков этого достаточно. */
export class Store {
  private file: string;
  private subs = new Map<string, Subscriber>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'subscribers.json');
    if (existsSync(this.file)) {
      const list = JSON.parse(readFileSync(this.file, 'utf8')) as Subscriber[];
      for (const s of list) this.subs.set(s.id, s);
    }
  }

  get size(): number {
    return this.subs.size;
  }

  get(id: string): Subscriber | undefined {
    return this.subs.get(id);
  }

  all(): Subscriber[] {
    return [...this.subs.values()];
  }

  set(sub: Subscriber): void {
    this.subs.set(sub.id, sub);
    this.save();
  }

  delete(id: string): void {
    this.subs.delete(id);
    this.save();
  }

  /** Отложенная запись с атомарной заменой файла. */
  save(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.all()));
      renameSync(tmp, this.file);
    }, 500);
  }

  readJson<T>(name: string): T | null {
    const f = join(this.dir, name);
    return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : null;
  }

  writeJson(name: string, value: unknown): void {
    writeFileSync(join(this.dir, name), JSON.stringify(value, null, 2), { mode: 0o600 });
  }
}
