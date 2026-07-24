"use client";

import { useEffect, useState } from "react";

/**
 * 화면의 초기 상태와 진입 애니메이션 시작을 서로 다른 렌더링 프레임으로
 * 분리한다. 마운트 직후 자동으로 실행되는 순차 진입 애니메이션에만 사용한다.
 */
export function useDeferredAnimationStart() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let secondFrame = 0;

    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setReady(true);
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  return ready;
}
