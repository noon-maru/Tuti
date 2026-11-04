import type { QueryClient } from "@tanstack/react-query";
import { getSessionSnapshot } from "./auth/session";
import { authoritativeReadError, loadCachedHarumadi } from "./harumadiContent";
import { canCacheHarumadi, harumadiReadCache } from "./harumadiReadCache";

type Dependencies = {
  load: typeof loadCachedHarumadi;
  session: () => { userId: string; accessToken: string } | null;
  current: typeof harumadiReadCache.current;
};

/** Seed only an empty query. A server result, rejection or account change always wins. */
export function createCachedHarumadiHydrator({ load, session, current }: Dependencies) {
  return async (client: QueryClient, owner: string, id: string, active = () => true): Promise<boolean> => {
    const started = session(), key = ["harumadi-content", owner, id];
    if (!started || started.userId !== owner || !active() || client.getQueryData(key) || authoritativeReadError(client.getQueryState(key)?.error)) return false;
    const cached = await load(owner, id);
    if (!cached || !cached.cached || cached.content.harumadi.id !== id || !canCacheHarumadi(cached.content) ||
      !active() || session()?.accessToken !== started.accessToken || session()?.userId !== owner ||
      !current(owner, id, cached.ticket) || client.getQueryData(key) || authoritativeReadError(client.getQueryState(key)?.error)) return false;
    client.setQueryData(key, cached, { updatedAt: cached.savedAt });
    return true;
  };
}

export const hydrateCachedHarumadi = createCachedHarumadiHydrator({
  load: loadCachedHarumadi, session: getSessionSnapshot, current: harumadiReadCache.current,
});
