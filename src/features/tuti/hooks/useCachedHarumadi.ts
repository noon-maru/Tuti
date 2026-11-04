"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { hydrateCachedHarumadi } from "@/lib/harumadiCachedQuery";

/** Read cache and network in parallel; never stop the fresh server request. */
export function useCachedHarumadi(owner: string, id: string | null | undefined, enabled = true) {
  const client = useQueryClient();
  useEffect(() => {
    if (!id || !enabled) return;
    let active = true;
    void hydrateCachedHarumadi(client, owner, id, () => active).catch(() => {});
    return () => { active = false; };
  }, [client, owner, id, enabled]);
}
