// 후속 요청이 없어도 만료 항목을 해제한다. 원본 값·키를 로그에 남기지 않는다.
export class ExpiringCache<K, V> {
  private readonly entries = new Map<K, { value: V; expiresAt: number; timer: ReturnType<typeof setTimeout> }>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Invalid cache capacity");
  }

  get size() { return this.entries.size; }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) { this.delete(key); return undefined; }
    return entry.value;
  }

  set(key: K, value: V, ttlMs: number): void {
    if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 2_147_483_647) throw new Error("Invalid cache lifetime");
    this.delete(key);
    while (this.entries.size >= this.capacity) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.delete(oldest.value);
    }
    const timer = setTimeout(() => { this.delete(key); }, ttlMs);
    timer.unref?.();
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs, timer });
  }

  delete(key: K): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.entries.delete(key);
  }

  deleteIfValue(key: K, value: V): void {
    if (this.entries.get(key)?.value === value) this.delete(key);
  }
}
