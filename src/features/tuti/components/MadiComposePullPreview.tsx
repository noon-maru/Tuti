"use client";

import { memo, type RefObject } from "react";
import styled from "@emotion/styled";
import type { Harumadi } from "@/shared/api/harumadi";
import type { MadiComposePullPreview as PullPreview } from "../hooks/useMadiComposePull";
import { MadiCreateScreen } from "../screens/journal/MadiCreateScreen";

const noop = () => {};
// 입력·초안·활동 기록은 진입 확정 후에만 시작한다. 드래그 중에는 읽기 전용 UI만 보여준다.
const Composer = memo(function Composer({ book }: { book: Harumadi }) {
  return <MadiCreateScreen preview inHarumadi destination={book} destinationVerified onBack={noop} onCollection={noop} />;
});

export function MadiComposePullPreview({ preview, layerRef }: { preview: PullPreview; layerRef: RefObject<HTMLDivElement | null> }) {
  return <Layer ref={layerRef} inert aria-hidden="true" data-compose-pull-preview
    style={{ transform: `translateY(calc(-100% + ${preview.offset}px))` }}><Composer book={preview.book} /></Layer>;
}
const Layer = styled.div`position: absolute; inset: 0; z-index: 30; overflow: hidden; background: var(--color-surface); pointer-events: none;`;
