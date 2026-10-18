import { normalizeProductInteraction, type ProductInteractionAction, type ProductInteractionInput, type ProductInteractionSurface } from "@/shared/api/productInteraction";

export const PRODUCT_INTERACTION_QUEUE_KEY = "tuti-product-interactions-v1";
const MAX_PENDING = 100;
const MAX_AGE_MS = 7 * 86400_000;
type Owner = { userId: string; accessToken: string };
type Pending = { ownerId: string; input: ProductInteractionInput; queuedAt: number };
type Dependencies = {
  session: () => Promise<Owner>;
  send: (input: ProductInteractionInput, owner: Owner) => Promise<void>;
  platform: () => ProductInteractionInput["platform"];
  storage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };
  now?: () => number;
};

/** Owner-bound retry queue. Transport must never refresh into another account. */
export function createProductInteractionQueue(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const views = new Set<string>();
  let queue: Pending[] | undefined;
  let flushing: Promise<void> | undefined;
  const fresh = (item: Pending) => item.queuedAt > now() - MAX_AGE_MS && item.queuedAt <= now();
  const pending = () => {
    if (queue) return queue;
    try {
      const stored: unknown = JSON.parse(deps.storage.getItem(PRODUCT_INTERACTION_QUEUE_KEY) ?? "[]");
      queue = Array.isArray(stored) ? stored.flatMap((item): Pending[] => {
        if (!item || typeof item !== "object" || typeof item.ownerId !== "string" || !Number.isFinite(item.queuedAt)) return [];
        const input = normalizeProductInteraction(item.input);
        if (!input) return [];
        const entry = { ownerId: item.ownerId, input, queuedAt: item.queuedAt };
        return fresh(entry) ? [entry] : [];
      }).slice(-MAX_PENDING) : [];
    } catch { queue = []; }
    return queue;
  };
  const persist = () => {
    try { deps.storage.setItem(PRODUCT_INTERACTION_QUEUE_KEY, JSON.stringify(pending())); }
    catch { /* Storage may be blocked; retain the in-memory queue. */ }
  };

  async function flush(): Promise<void> {
    if (flushing) {
      await flushing;
      if (pending().length) await flush();
      return;
    }
    if (!pending().length) { persist(); return; }
    flushing = (async () => {
      while (pending().length) {
        const owner = await deps.session();
        // Recheck both ownership and age for every send, not just page load.
        queue = pending().filter((item) => item.ownerId === owner.userId && fresh(item));
        persist();
        const event = pending()[0];
        if (!event) return;
        await deps.send(event.input, owner);
        queue = pending().filter((item) => item.ownerId !== event.ownerId || item.input.eventId !== event.input.eventId);
        persist();
      }
    })().finally(() => { flushing = undefined; });
    return flushing;
  }

  async function record(action: ProductInteractionAction, surface: ProductInteractionSurface, eventId: string) {
    const owner = await deps.session();
    const viewKey = `${owner.userId}:${surface}:${action}`;
    if (action === "welcome_viewed" && views.has(viewKey)) return;
    const input = normalizeProductInteraction({ eventId, action, surface, platform: deps.platform() });
    if (!input) throw new Error("활동 기록 요청을 확인해주세요.");
    if (!pending().some((item) => item.ownerId === owner.userId && item.input.eventId === eventId)) {
      pending().push({ ownerId: owner.userId, input, queuedAt: now() });
    }
    queue = pending().slice(-MAX_PENDING);
    persist();
    if (action === "welcome_viewed") views.add(viewKey);
    await flush();
  }
  return { record, flush };
}
