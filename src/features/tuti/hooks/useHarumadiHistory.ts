"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createHarumadiHistory } from "@/lib/harumadiHistory";
import type { BookOpening } from "@/features/tuti/components/HarumadiBookReader";

export function useHarumadiHistory<T = BookOpening>(ownerId: string) {
  const [opening, setOpening] = useState<T | null>(null);
  const controller = useRef<ReturnType<typeof createHarumadiHistory<T>> | null>(null);
  useEffect(() => {
    const history = createHarumadiHistory<T>(window, ownerId, setOpening);
    controller.current = history;
    return () => { controller.current = null; history.dispose(); };
  }, [ownerId]);
  const openBook = useCallback((book: T) => { controller.current?.open(book); }, []);
  const closeBook = useCallback(() => { controller.current?.close(); }, []);
  const registerCloseGuard = useCallback((guard: (() => Promise<boolean>) | null) => { controller.current?.setCloseGuard(guard); }, []);
  return { opening, openBook, closeBook, registerCloseGuard };
}
