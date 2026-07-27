"use client";

import styled from "@emotion/styled";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  BaseButton,
  PrimaryButton,
} from "@/features/tuti/components/buttons";

const CROP_ASPECT_RATIO = 4 / 3;
const MAX_OUTPUT_WIDTH = 1200;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type Size = {
  width: number;
  height: number;
};

type Offset = {
  x: number;
  y: number;
};

export function ImageCropDialog({
  source,
  onCancel,
  onConfirm,
}: {
  source: string;
  onCancel: () => void;
  onConfirm: (image: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    offset: Offset;
  } | null>(null);
  const [viewportSize, setViewportSize] = useState<Size>({
    width: 0,
    height: 0,
  });
  const [imageSize, setImageSize] = useState<Size>({
    width: 0,
    height: 0,
  });
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const geometry = useMemo(
    () => getImageGeometry(viewportSize, imageSize, zoom),
    [imageSize, viewportSize, zoom],
  );
  const displayOffset = clampOffset(offset, geometry);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) return;

    const updateViewportSize = () => {
      setViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, []);

  const moveImage = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const dragStart = dragStartRef.current;

    if (!dragStart) return;

    setOffset(
      clampOffset(
        {
          x: dragStart.offset.x + event.clientX - dragStart.pointerX,
          y: dragStart.offset.y + event.clientY - dragStart.pointerY,
        },
        geometry,
      ),
    );
  };

  const finishMovingImage = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!dragStartRef.current) return;

    dragStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const confirmCrop = () => {
    const image = imageRef.current;

    if (
      !image ||
      !geometry ||
      viewportSize.width === 0 ||
      processing
    ) {
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const displayScale = geometry.baseScale * zoom;
      const sourceWidth = viewportSize.width / displayScale;
      const sourceHeight = viewportSize.height / displayScale;
      const sourceX =
        imageSize.width / 2 -
        displayOffset.x / displayScale -
        sourceWidth / 2;
      const sourceY =
        imageSize.height / 2 -
        displayOffset.y / displayScale -
        sourceHeight / 2;
      const outputWidth = Math.max(
        1,
        Math.min(MAX_OUTPUT_WIDTH, Math.round(sourceWidth)),
      );
      const outputHeight = Math.max(
        1,
        Math.round(outputWidth / CROP_ASPECT_RATIO),
      );
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("canvas_context_unavailable");
      }

      canvas.width = outputWidth;
      canvas.height = outputHeight;
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, outputWidth, outputHeight);
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputWidth,
        outputHeight,
      );
      onConfirm(canvas.toDataURL("image/jpeg", 0.9));
    } catch {
      setError("이미지를 자르지 못했어요. 다른 이미지를 선택해주세요.");
      setProcessing(false);
    }
  };

  return (
    <Dialog role="dialog" aria-modal="true" aria-labelledby="crop-title">
      <Header>
        <HeaderButton type="button" onClick={onCancel}>
          취소
        </HeaderButton>
        <h2 id="crop-title">사진 맞추기</h2>
        <HeaderButton
          type="button"
          disabled={!geometry || processing}
          onClick={confirmCrop}
        >
          {processing ? "처리 중" : "완료"}
        </HeaderButton>
      </Header>

      <CropContent>
        <CropViewport
          ref={viewportRef}
          tabIndex={0}
          aria-label="사진을 드래그해 보일 영역을 조절하세요"
          onPointerDown={(event) => {
            if (event.button !== 0) return;

            event.currentTarget.setPointerCapture(event.pointerId);
            dragStartRef.current = {
              pointerX: event.clientX,
              pointerY: event.clientY,
              offset: displayOffset,
            };
          }}
          onPointerMove={moveImage}
          onPointerUp={finishMovingImage}
          onPointerCancel={finishMovingImage}
          onKeyDown={(event) => {
            const movement = event.shiftKey ? 10 : 2;
            const nextOffset =
              event.key === "ArrowLeft"
                ? {
                    ...displayOffset,
                    x: displayOffset.x - movement,
                  }
                : event.key === "ArrowRight"
                  ? {
                      ...displayOffset,
                      x: displayOffset.x + movement,
                    }
                  : event.key === "ArrowUp"
                    ? {
                        ...displayOffset,
                        y: displayOffset.y - movement,
                      }
                    : event.key === "ArrowDown"
                      ? {
                          ...displayOffset,
                          y: displayOffset.y + movement,
                        }
                      : null;

            if (!nextOffset) return;
            event.preventDefault();
            setOffset(clampOffset(nextOffset, geometry));
          }}
        >
          <CropImage
            ref={imageRef}
            src={source}
            alt=""
            draggable="false"
            $width={geometry?.baseWidth ?? 0}
            $height={geometry?.baseHeight ?? 0}
            $offset={displayOffset}
            $zoom={zoom}
            onLoad={(event) => {
              setImageSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
              setOffset({ x: 0, y: 0 });
              setError(null);
            }}
            onError={() =>
              setError("이미지를 불러오지 못했어요. 다시 선택해주세요.")
            }
          />
          <CropGuide aria-hidden="true" />
        </CropViewport>

        <CropHint>사진을 움직여 남기고 싶은 부분을 맞춰주세요.</CropHint>
        <ZoomControl>
          <span aria-hidden="true">−</span>
          <input
            type="range"
            aria-label="사진 확대"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(event) => {
              const nextZoom = Number(event.target.value);
              const nextGeometry = getImageGeometry(
                viewportSize,
                imageSize,
                nextZoom,
              );

              setZoom(nextZoom);
              setOffset((current) =>
                clampOffset(current, nextGeometry),
              );
            }}
          />
          <span aria-hidden="true">＋</span>
        </ZoomControl>
        {error && <CropError role="alert">{error}</CropError>}
      </CropContent>

      <MobileConfirmButton
        type="button"
        disabled={!geometry || processing}
        onClick={confirmCrop}
      >
        {processing ? "사진을 준비하고 있어요" : "이대로 사용하기"}
      </MobileConfirmButton>
    </Dialog>
  );
}

function getImageGeometry(
  viewport: Size,
  image: Size,
  zoom: number,
) {
  if (
    viewport.width === 0 ||
    viewport.height === 0 ||
    image.width === 0 ||
    image.height === 0
  ) {
    return null;
  }

  const baseScale = Math.max(
    viewport.width / image.width,
    viewport.height / image.height,
  );
  const baseWidth = image.width * baseScale;
  const baseHeight = image.height * baseScale;

  return {
    baseScale,
    baseWidth,
    baseHeight,
    maxOffsetX: Math.max(0, (baseWidth * zoom - viewport.width) / 2),
    maxOffsetY: Math.max(0, (baseHeight * zoom - viewport.height) / 2),
  };
}

function clampOffset(
  offset: Offset,
  geometry: ReturnType<typeof getImageGeometry>,
) {
  if (!geometry) return { x: 0, y: 0 };

  return {
    x: Math.max(
      -geometry.maxOffsetX,
      Math.min(geometry.maxOffsetX, offset.x),
    ),
    y: Math.max(
      -geometry.maxOffsetY,
      Math.min(geometry.maxOffsetY, offset.y),
    ),
  };
}

const Dialog = styled.section`
  position: absolute;
  z-index: 100;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: calc(var(--space-5) + var(--app-safe-area-top, 0px))
    calc(var(--space-5) + var(--app-safe-area-right, 0px))
    calc(var(--space-6) + var(--app-safe-area-bottom, 0px))
    calc(var(--space-5) + var(--app-safe-area-left, 0px));
  background: var(--color-surface);
`;

const Header = styled.header`
  min-height: var(--space-11);
  display: grid;
  grid-template-columns: var(--space-14) 1fr var(--space-14);
  align-items: center;

  h2 {
    font-size: var(--font-size-400);
    font-weight: 700;
    text-align: center;
  }
`;

const HeaderButton = styled(BaseButton)`
  min-height: var(--space-10);
  padding: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
  font-weight: 600;

  &:last-of-type {
    color: var(--color-brand-800);
  }

  &:disabled {
    color: var(--color-neutral-600);
    cursor: default;
  }
`;

const CropContent = styled.div`
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-5);
`;

const CropViewport = styled.div`
  position: relative;
  width: min(100%, 344px);
  align-self: center;
  aspect-ratio: ${CROP_ASPECT_RATIO};
  overflow: hidden;
  border-radius: 28px;
  outline: none;
  background: var(--color-neutral-1200);
  box-shadow: 0 16px 40px rgb(var(--color-black-rgb) / 0.2);
  cursor: grab;
  touch-action: none;
  user-select: none;

  &:active {
    cursor: grabbing;
  }

  &:focus-visible {
    box-shadow: 0 0 0 3px var(--color-brand-500),
      0 16px 40px rgb(var(--color-black-rgb) / 0.2);
  }
`;

const CropImage = styled.img<{
  $width: number;
  $height: number;
  $offset: Offset;
  $zoom: number;
}>`
  position: absolute;
  top: 50%;
  left: 50%;
  width: ${({ $width }) => `${$width}px`};
  height: ${({ $height }) => `${$height}px`};
  max-width: none;
  pointer-events: none;
  transform: translate(-50%, -50%)
    translate(
      ${({ $offset }) => `${$offset.x}px, ${$offset.y}px`}
    )
    scale(${({ $zoom }) => $zoom});
  transform-origin: center;
  will-change: transform;
`;

const CropGuide = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(
        to right,
        transparent calc(33.333% - 0.5px),
        rgb(var(--color-white-rgb) / 0.5) calc(33.333% - 0.5px),
        rgb(var(--color-white-rgb) / 0.5) calc(33.333% + 0.5px),
        transparent calc(33.333% + 0.5px)
      ),
    linear-gradient(
        to right,
        transparent calc(66.666% - 0.5px),
        rgb(var(--color-white-rgb) / 0.5) calc(66.666% - 0.5px),
        rgb(var(--color-white-rgb) / 0.5) calc(66.666% + 0.5px),
        transparent calc(66.666% + 0.5px)
      ),
    linear-gradient(
        to bottom,
        transparent calc(33.333% - 0.5px),
        rgb(var(--color-white-rgb) / 0.5) calc(33.333% - 0.5px),
        rgb(var(--color-white-rgb) / 0.5) calc(33.333% + 0.5px),
        transparent calc(33.333% + 0.5px)
      ),
    linear-gradient(
        to bottom,
        transparent calc(66.666% - 0.5px),
        rgb(var(--color-white-rgb) / 0.5) calc(66.666% - 0.5px),
        rgb(var(--color-white-rgb) / 0.5) calc(66.666% + 0.5px),
        transparent calc(66.666% + 0.5px)
      );
  box-shadow: inset 0 0 0 1px rgb(var(--color-white-rgb) / 0.72);
`;

const CropHint = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
  text-align: center;
`;

const ZoomControl = styled.label`
  width: min(100%, 304px);
  display: grid;
  grid-template-columns: var(--space-6) 1fr var(--space-6);
  align-items: center;
  align-self: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-300);
  text-align: center;

  input {
    width: 100%;
    accent-color: var(--color-secondary-700);
    cursor: pointer;
  }
`;

const CropError = styled.p`
  color: var(--color-error);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
  text-align: center;
`;

const MobileConfirmButton = styled(PrimaryButton)`
  width: 100%;
  flex: 0 0 auto;
  background: var(--color-secondary-500);
  color: var(--color-text);

  &:hover:not(:disabled) {
    background: var(--color-secondary-600);
  }
`;
