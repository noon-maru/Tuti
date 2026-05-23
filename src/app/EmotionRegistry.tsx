/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { type ReactNode, useState } from "react";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { useServerInsertedHTML } from "next/navigation";

// Emotion cache를 만들 때 key를 고정해두면 클래스 충돌을 줄이는 데 도움이 됨.
function createEmotionCache() {
  return createCache({ key: "css", prepend: true });
}

export default function EmotionRegistry({ children }: { children: ReactNode }) {
  const [cache] = useState(() => {
    const c = createEmotionCache();
    // Next SSR에서 생성된 스타일을 수집하기 위해 inserted를 추적
    (c as any).compat = true;
    return c;
  });

  useServerInsertedHTML(() => {
    const inserted = (cache as any).inserted as Record<string, string | true>;
    const keys = Object.keys(inserted);
    if (keys.length === 0) return null;

    const styles = keys
      .map((k) => inserted[k])
      .filter((v): v is string => typeof v === "string")
      .join("");

    // 중요한 포인트: SSR 렌더링 사이클에서 중복 삽입 방지
    keys.forEach((k) => {
      inserted[k] = true;
    });

    return (
      <style
        data-emotion={`${cache.key} ${keys.join(" ")}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
