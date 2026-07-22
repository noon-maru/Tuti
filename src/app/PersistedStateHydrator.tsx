"use client";

import { useEffect } from "react";
import { useTutiStore } from "@/store/tuti";

let hydrationStarted = false;

export function PersistedStateHydrator() {
  useEffect(() => {
    if (hydrationStarted) return;

    hydrationStarted = true;
    void useTutiStore.persist.rehydrate().finally(() => {
      useTutiStore.getState().markHydrated();
    });
  }, []);

  return null;
}
