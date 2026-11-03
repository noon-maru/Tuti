"use client";
import { useEffect, useState } from "react";
import { libraryViewPreferences } from "@/lib/libraryViewPreferences";
import type { HarumadiLibraryView } from "@/shared/harumadi/libraryView";

export function useLibraryView(ownerId: string) {
  const [view, setView] = useState(() => libraryViewPreferences.peek(ownerId));
  useEffect(() => {
    let active = true;
    void libraryViewPreferences.load(ownerId).then(value => { if (active) setView(value); });
    return () => { active = false; };
  }, [ownerId]);
  const chooseView = (value: HarumadiLibraryView) => {
    setView(value);
    void libraryViewPreferences.save(ownerId, value);
  };
  return { view, chooseView };
}
