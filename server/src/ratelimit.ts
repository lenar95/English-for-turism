/**
 * Ограничение частоты запросов по ключу (адресу клиента): скользящее окно.
 * Память ограничена: ключи без свежих событий вычищаются в sweep().
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Разрешён ли ещё один запрос от ключа в момент now; разрешённый запрос учитывается. */
  allow(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Забыть ключи, у которых не осталось событий в окне. */
  sweep(now: number): void {
    for (const [key, times] of this.hits) {
      if (!times.some((t) => now - t < this.windowMs)) this.hits.delete(key);
    }
  }

  get size(): number {
    return this.hits.size;
  }
}

/** Выполнить fn для каждого элемента, не больше `limit` одновременно. */
export async function forEachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}
