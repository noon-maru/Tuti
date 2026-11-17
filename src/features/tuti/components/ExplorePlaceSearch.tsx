"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { Search, X } from "lucide-react";
import { AppDialogFrame } from "@/shared/ui/AppDialogFrame";
import { fetchWithSession } from "@/lib/auth/session";
import type { PlaceSearchResponse, PlaceSearchResult } from "@/shared/api/placeSearch";
import { IconButton, BaseButton } from "./buttons";
import { MadiSearchField } from "./MadiSearchField";
import type { TutiPlace } from "@/lib/recommendations";

export function searchResultPlace(result: PlaceSearchResult): TutiPlace {
  return { id: result.id, name: result.name, image: result.image ?? "", latitude: result.latitude,
    longitude: result.longitude, sourceContentType: result.sourceContentType,
    phrase: "남기고 싶은 다음 하루", note: "방문 전 이용 안내를 확인해주세요.", travelTime: "이동 시간 확인 필요",
    today: "운영 정보 확인 필요", crowd: "정보 없음", fatigue: 0, movementLevel: "near", moodTags: [] };
}
export async function fetchExplorePlaces(query: string, signal?: AbortSignal): Promise<PlaceSearchResponse> {
  const response = await fetchWithSession(`places/search?scope=explore&q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) throw Error("장소를 검색하지 못했어요.");
  return response.json() as Promise<PlaceSearchResponse>;
}
export function ExplorePlaceSearch({ onSelect, disabled = false }: { onSelect: (place: TutiPlace) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => { setOpen(false); setClosing(false); }, 180);
    return () => clearTimeout(timer);
  }, [closing]);
  return <>
    <IconButton type="button" disabled={disabled} aria-label="장소 검색" aria-haspopup="dialog" aria-expanded={open && !closing && !disabled} onClick={() => { if (disabled) return; setClosing(false); setOpen(true); }}><Search size={21} aria-hidden="true" /></IconButton>
    {open && !disabled && <SearchPanel closing={closing} onClose={() => setClosing(true)} onSelect={place => { setOpen(false); setClosing(false); onSelect(place); }} />}
  </>;
}
function SearchPanel({ onClose, onSelect, closing }: { onClose: () => void; onSelect: (place: TutiPlace) => void; closing: boolean }) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(""), [query, setQuery] = useState("");
  useEffect(() => { const timer = setTimeout(() => setQuery(text.trim()), 250); return () => clearTimeout(timer); }, [text]);
  const results = useQuery({ queryKey: ["explore-place-search", "dog-catalog", query], queryFn: ({ signal }) => fetchExplorePlaces(query, signal), enabled: Boolean(query), staleTime: 60_000, retry: 1 });
  const waiting = text.trim() !== query;
  return <Panel role="dialog" closing={closing} titleId={`${id}-title`} descriptionId={`${id}-scope`} initialFocus={input} onCancel={onClose}>
    <Heading><h2 id={`${id}-title`}>장소 찾기</h2><IconButton type="button" aria-label="검색 닫기" onClick={onClose}><X size={20} aria-hidden="true" /></IconButton></Heading>
    <MadiSearchField value={text} onChange={value => setText(value.slice(0, 80))} inputRef={input} label="장소 이름 또는 지역 검색" placeholder="장소 이름이나 지역을 입력하세요" />
    <p id={`${id}-scope`}>반려견 동반 등록 장소에서 찾아요. 몸무게 등 세부 조건은 방문 전 확인해주세요.</p>
    <Results aria-live="polite" aria-busy={Boolean(text.trim() && (waiting || results.isFetching))}>
      {!text.trim() ? <p>찾고 싶은 장소가 있나요?</p> : waiting || results.isPending ? <p>장소를 찾고 있어요.</p> : results.isError ? <><p>검색하지 못했어요. 다시 시도해주세요.</p><BaseButton type="button" onClick={() => void results.refetch()}>다시 검색하기</BaseButton></> : results.data?.places.length ? results.data.places.map(place => <Result key={place.id} type="button" onClick={() => onSelect(searchResultPlace(place))}><strong>{place.name}</strong>{place.region && <span>{place.region}</span>}</Result>) : <p>검색한 장소가 없어요. 이름이나 지역을 바꿔보세요.</p>}
    </Results>
  </Panel>;
}
const expand = keyframes`from { clip-path: inset(0 85% 85% 0 round 22px); opacity: .6; } to { clip-path: inset(0 0 0 0 round 16px); opacity: 1; }`;
const Panel = styled(AppDialogFrame)`
  align-self: start; margin-top: var(--app-header-top-space, 24px); width: min(100%, 520px);
  max-height: calc(100% - var(--app-header-top-space, 24px)); min-height: 250px;
  border-radius: 16px; gap: 14px; animation: ${expand} 300ms cubic-bezier(.16, 1, .3, 1);
  p { font-size: var(--ui-secondary-size, 13px); }
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;
const Heading = styled.div`display: flex; justify-content: space-between; align-items: center; gap: 12px;`;
const Results = styled.div`min-height: 80px; display: grid; align-content: start; gap: 4px;`;
const Result = styled(BaseButton)`display: grid; justify-items: start; gap: 4px; min-height: 60px; padding: 12px 4px; border-radius: 0; border-bottom: 1px solid var(--color-border); background: transparent; text-align: left; strong { font-size: var(--ui-body-size); font-weight: 600; overflow-wrap: anywhere; } span { font-size: var(--ui-secondary-size, 13px); color: var(--color-text-muted); }`;
