"use client";

import { useEffect } from "react";

const EXPANDED_LAYOUT_MIN_SIZE = 600;

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "portrait") => Promise<void>;
  unlock?: () => void;
};

/**
 * 설치형 웹앱에서는 작은 화면을 세로로 유지하고, 펼친 폴더블과
 * 태블릿에서는 회전을 허용한다. 일반 브라우저처럼 orientation lock을
 * 허용하지 않는 환경은 반응형 레이아웃에 맡긴다.
 */
export function AdaptiveOrientation() {
  useEffect(() => {
    const orientation = screen.orientation as
      | LockableScreenOrientation
      | undefined;
    let compact = false;

    const applyPolicy = () => {
      const nextCompact =
        Math.min(window.innerWidth, window.innerHeight) <
        EXPANDED_LAYOUT_MIN_SIZE;

      if (nextCompact === compact) return;
      compact = nextCompact;

      if (nextCompact) {
        void orientation?.lock?.("portrait").catch(() => undefined);
        return;
      }

      orientation?.unlock?.();
    };

    applyPolicy();
    window.addEventListener("resize", applyPolicy);
    orientation?.addEventListener?.("change", applyPolicy);

    return () => {
      window.removeEventListener("resize", applyPolicy);
      orientation?.removeEventListener?.("change", applyPolicy);
    };
  }, []);

  return null;
}
