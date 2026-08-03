"use client";

import styled from "@emotion/styled";
import { Search } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import { apiUrl } from "@/lib/api/apiUrl";
import type {
  PlaceSearchResponse,
  PlaceSearchResult,
} from "@/shared/api/placeSearch";
import { BaseButton } from "@/features/tuti/components/buttons";

const PANEL_GAP = 8;
const PANEL_MARGIN = 16;

export function JournalPlacePicker({
  placeId,
  value,
  onChange,
}: {
  placeId: string | null;
  value: string;
  onChange: (place: PlaceSearchResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [places, setPlaces] = useState<PlaceSearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 320,
    maxHeight: 360,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportRect =
      triggerRef.current
        .closest<HTMLElement>("[data-app-viewport]")
        ?.getBoundingClientRect() ?? {
        bottom: window.innerHeight,
        height: window.innerHeight,
        left: 0,
        right: window.innerWidth,
        top: 0,
        width: window.innerWidth,
      };
    const width = Math.min(328, viewportRect.width - PANEL_MARGIN * 2);
    const maxHeight = Math.min(368, viewportRect.height - PANEL_MARGIN * 2);
    const left = Math.min(
      Math.max(triggerRect.left, viewportRect.left + PANEL_MARGIN),
      viewportRect.right - width - PANEL_MARGIN,
    );
    const belowTop = triggerRect.bottom + PANEL_GAP;
    const top =
      belowTop + maxHeight <= viewportRect.bottom - PANEL_MARGIN
        ? belowTop
        : Math.max(
            viewportRect.top + PANEL_MARGIN,
            triggerRect.top - maxHeight - PANEL_GAP,
          );

    setPosition({ left, top, width, maxHeight });
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");

      try {
        const response = await fetch(
          `${apiUrl("places/search")}?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );

        if (!response.ok) throw new Error("place_search_failed");

        const data = (await response.json()) as PlaceSearchResponse;
        setPlaces(data.places);
        setStatus("idle");
      } catch {
        if (controller.signal.aborted) return;
        setPlaces([]);
        setStatus("error");
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const selectPlace = (place: PlaceSearchResult) => {
    onChange(place);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      <PlaceTrigger
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setQuery(value);
          setOpen(true);
        }}
      >
        <PlaceMarker aria-hidden="true" />
        <span data-selected={Boolean(placeId)}>{value || "장소 추가"}</span>
      </PlaceTrigger>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <DismissLayer onPointerDown={() => setOpen(false)}>
            <Panel
              role="dialog"
              aria-modal="true"
              aria-label="장소 검색"
              style={position}
              data-swipe-back-ignore
              onPointerDown={(event) => event.stopPropagation()}
            >
              <PanelHeader>
                <p>장소를 검색해보세요</p>
                <CloseButton
                  type="button"
                  aria-label="장소 검색 닫기"
                  onClick={() => setOpen(false)}
                >
                  ×
                </CloseButton>
              </PanelHeader>

              <SearchField>
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  aria-label="장소 검색어"
                  placeholder="장소를 검색해 보세요"
                  onChange={(event) => setQuery(event.target.value)}
                />
                <SearchIcon aria-hidden="true" />
              </SearchField>

              <ResultList aria-live="polite">
                {status === "loading" && (
                  <ResultStatus>
                    <LoadingIndicator label="장소를 찾고 있어요." compact />
                  </ResultStatus>
                )}
                {status === "error" && (
                  <ResultStatus>장소를 불러오지 못했어요.</ResultStatus>
                )}
                {status === "idle" && places.length === 0 && (
                  <ResultStatus>
                    {query.trim()
                      ? "검색 결과가 없어요."
                      : "등록된 장소를 불러오고 있어요."}
                  </ResultStatus>
                )}
                {status === "idle" &&
                  places.map((place) => (
                    <ResultButton
                      key={place.id}
                      type="button"
                      aria-pressed={place.id === placeId}
                      onClick={() => selectPlace(place)}
                    >
                      <PlaceMarker aria-hidden="true" />
                      <span>
                        <strong>{place.name}</strong>
                        {place.region && <small>{place.region}</small>}
                      </span>
                      {place.id === placeId && (
                        <SelectedMark aria-hidden="true">✓</SelectedMark>
                      )}
                    </ResultButton>
                  ))}
              </ResultList>
            </Panel>
          </DismissLayer>,
          document.body,
        )}
    </>
  );
}

const PlaceTrigger = styled(BaseButton)`
  width: fit-content;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 2px 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  font-weight: 500;
  line-height: var(--line-height-subtitle);
  letter-spacing: var(--letter-spacing-subtitle);

  > span:nth-of-type(2) {
    overflow: hidden;
    border-bottom: 1px solid currentColor;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const PlaceMarker = styled.span`
  position: relative;
  width: 11px;
  height: 14px;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 50% 50% 55% 55% / 42% 42% 70% 70%;
  background: linear-gradient(
    to bottom,
    var(--color-secondary-500) 0 50%,
    var(--color-brand-500) 50% 100%
  );
  clip-path: polygon(0 0, 100% 0, 100% 56%, 50% 100%, 0 56%);
  transform: translateY(-1px);
`;

const DismissLayer = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2147482100;
`;

const Panel = styled.section`
  position: fixed;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid rgb(var(--color-black-rgb) / 0.08);
  border-radius: 22px;
  background: rgb(var(--color-white-rgb) / 0.98);
  box-shadow: 0 18px 48px rgb(var(--color-black-rgb) / 0.2);
  overflow: hidden;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
`;

const PanelHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
    line-height: var(--line-height-subtitle);
    letter-spacing: var(--letter-spacing-subtitle);
  }
`;

const CloseButton = styled(BaseButton)`
  width: var(--space-8);
  height: var(--space-8);
  flex: 0 0 auto;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-600);
  font-weight: 300;
  line-height: 1;
`;

const SearchField = styled.label`
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  border-radius: 999px;
  background: var(--color-secondary-200);

  input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-100);

    &::placeholder {
      color: var(--color-text-muted);
      opacity: 1;
    }

    &::-webkit-search-cancel-button {
      display: none;
    }
  }
`;

const SearchIcon = styled(Search)`
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  color: var(--color-brand-500);
  stroke-width: 2;
`;

const ResultList = styled.div`
  min-height: 96px;
  display: grid;
  align-content: start;
  gap: var(--space-2);
  overflow-y: auto;
  overscroll-behavior: contain;
`;

const ResultButton = styled(BaseButton)`
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: 999px;
  background: var(--color-neutral-200);
  color: var(--color-text);
  text-align: left;

  > span:nth-of-type(2) {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  strong {
    overflow: hidden;
    font-size: var(--font-size-100);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-100) - 2px);
    line-height: var(--line-height-body);
  }

  &:hover {
    background: var(--color-secondary-200);
  }
`;

const SelectedMark = styled.span`
  color: var(--color-secondary-900);
  font-size: var(--font-size-200);
  font-weight: 700;
`;

const ResultStatus = styled.div`
  padding: var(--space-5) var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  text-align: center;
`;
