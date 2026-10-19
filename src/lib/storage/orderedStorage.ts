import type { StateStorage } from "zustand/middleware";

// 비동기 네이티브 저장소에서 철회 후의 빈 상태보다 예전 상태 쓰기가 늦게 끝나지 않게 한다.
export function createOrderedStorage(storage: StateStorage) {
  let pending = Promise.resolve();
  const enqueue = (operation: () => void | Promise<void>) => {
    const result = pending.catch(() => {}).then(operation);
    pending = result;
    return result;
  };
  return {
    async getItem(key: string) { await pending; return storage.getItem(key); },
    setItem: (key: string, value: string) => enqueue(async () => { await storage.setItem(key, value); }),
    removeItem: (key: string) => enqueue(async () => { await storage.removeItem(key); }),
    flush: () => pending,
  };
}
