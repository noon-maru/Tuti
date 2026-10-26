import { Preferences } from "@capacitor/preferences";
import type { StateStorage } from "zustand/middleware";
import { createOrderedStorage } from "./storage/orderedStorage";
import { validateFinalizedTermsReference } from "@/shared/legal/validateFinalizedTerms";

export type CachedTermsAcceptance = { userId: string; version: string; documentHash: string };
const keyFor = (userId: string) => `tuti-service-terms-acceptance:${encodeURIComponent(userId)}`;

// UX 표시용 캐시다. API 권한이나 서버 동의 영수증으로 사용하지 않는다.
export function createTermsAcceptanceCache(storage: StateStorage) {
  const invalidated = new Set<string>();
  const revisions = new Map<string, number>();
  return {
    async read(userId: string): Promise<CachedTermsAcceptance | null> {
      try {
        if (invalidated.has(userId)) return null;
        const raw = await storage.getItem(keyFor(userId));
        if (!raw || invalidated.has(userId)) return null;
        const value = JSON.parse(raw);
        if (value.schema !== 1 || value.userId !== userId || typeof value.version !== "string" || !value.version.trim() ||
            typeof value.documentHash !== "string" || !/^[a-f0-9]{64}$/.test(value.documentHash)) return null;
        validateFinalizedTermsReference(value);
        return { userId, version: value.version, documentHash: value.documentHash };
      } catch { return null; }
    },
    async write(receipt: CachedTermsAcceptance) {
      const revision = revisions.get(receipt.userId) ?? 0;
      try {
        if (!receipt.userId || !receipt.version.trim() || !/^[a-f0-9]{64}$/.test(receipt.documentHash)) return;
        validateFinalizedTermsReference(receipt);
        await storage.setItem(keyFor(receipt.userId), JSON.stringify({ schema: 1, ...receipt }));
        if ((revisions.get(receipt.userId) ?? 0) === revision) invalidated.delete(receipt.userId);
      } catch { /* 캐시 장애가 서버에 저장된 실제 동의를 실패로 바꾸지는 않는다. */ }
    },
    async clear(userId: string) {
      invalidated.add(userId);
      revisions.set(userId, (revisions.get(userId) ?? 0) + 1);
      try { await storage.removeItem(keyFor(userId)); } catch { /* 계정별 키로 다른 계정에는 재사용되지 않는다. */ }
    },
  };
}

// 인증 저장소의 쓰기 큐와 분리해 캐시 쓰기 장애가 세션 조회를 막지 않게 한다.
export const serviceTermsAcceptanceCache = createTermsAcceptanceCache(createOrderedStorage({
  async getItem(key) { return (await Preferences.get({ key })).value; },
  async setItem(key, value) { await Preferences.set({ key, value }); },
  async removeItem(key) { await Preferences.remove({ key }); },
}));
