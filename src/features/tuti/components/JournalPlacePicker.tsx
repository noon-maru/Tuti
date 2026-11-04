"use client";

import styled from "@emotion/styled";
import { Search, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { AppDialogFrame } from "@/shared/ui/AppDialogFrame";
import { captionStyles } from "@/shared/ui/typography";
import { LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import { TutiPlaceIcon } from "@/features/tuti/components/TutiPlaceIcon";
import { fetchWithSession } from "@/lib/auth/session";
import type {
  PlaceSearchResponse,
  PlaceSearchResult,
} from "@/shared/api/placeSearch";
import { BaseButton } from "@/features/tuti/components/buttons";

export function JournalPlacePicker({
  placeId,
  value,
  helperText,
  helperStatus,
  onChange,
}: {
  placeId: string | null;
  value: string;
  helperText?: string;
  helperStatus?: "loading" | "success" | "notice";
  onChange: (place: PlaceSearchResult) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [places, setPlaces] = useState<PlaceSearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");

      try {
        const response = await fetchWithSession(
          `places/search?q=${encodeURIComponent(query.trim())}`,
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
  };

  return (
    <>
      <PlaceField>
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
          <PlacePickerIcon $size="small" aria-hidden="true" />
          <span data-selected={Boolean(placeId)}>
            {value || "장소 추가"}
          </span>
        </PlaceTrigger>
        {helperText && (
          <PlaceHelper aria-live="polite" data-status={helperStatus}>
            {helperStatus === "loading" && <HelperDot aria-hidden="true" />}
            {helperText}
          </PlaceHelper>
        )}
      </PlaceField>

      {open && <AppDialogFrame role="dialog" titleId={`${id}-title`} initialFocus={inputRef} onCancel={() => setOpen(false)}>
              <PanelHeader>
                <h2 id={`${id}-title`}>장소 검색</h2>
                <CloseButton
                  type="button"
                  aria-label="장소 검색 닫기"
                  onClick={() => setOpen(false)}
                >
                  <X size={20} aria-hidden="true" />
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
                      : "검색어를 입력해 장소를 찾아보세요."}
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
                      <PlacePickerIcon $size="small" aria-hidden="true" />
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
          </AppDialogFrame>}
    </>
  );
}

const PlaceField = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
`;

const PlacePickerIcon = styled(TutiPlaceIcon)`
  transform: translateY(-1px);
`;

const PlaceTrigger = styled(BaseButton)`
  width: fit-content;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--ui-control-height);
  padding: 8px 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--ui-body-size);
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

const PlaceHelper = styled.p`
  ${captionStyles}
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
  line-height: var(--line-height-body);
  letter-spacing: var(--letter-spacing-body);

  &[data-status="success"] {
    color: var(--color-secondary-900);
  }
`;

const HelperDot = styled.span`
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--color-brand-500);
  animation: place-helper-pulse 800ms ease-in-out infinite alternate;

  @keyframes place-helper-pulse {
    from {
      opacity: 0.35;
      transform: scale(0.8);
    }

    to {
      opacity: 1;
      transform: scale(1);
    }
  }
`;

const PanelHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);

`;

const CloseButton = styled(BaseButton)`
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
`;

const SearchField = styled.label`
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  border-radius: 999px;
  background: var(--color-secondary-200);
  &:focus-within { outline: 2px solid var(--color-brand-700); outline-offset: -2px; }

  input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: var(--ui-input-size);

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
  max-height: min(320px, 45cqh);
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
