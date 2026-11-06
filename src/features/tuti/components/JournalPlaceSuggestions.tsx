"use client";

import styled from "@emotion/styled";
import { History, MapPin } from "lucide-react";
import { BaseButton, TextButton } from "./buttons";
import type { JournalPlaceSuggestion, PlaceSuggestionsResponse } from "@/shared/api/placeSuggestions";
import { placeSuggestionGroups } from "./placeSuggestionLayout";

export function JournalPlaceSuggestions({ id, data, activeKey, status, hasQuery, onSelect, onHighlight, onRetry }: {
  id: string; data: PlaceSuggestionsResponse; activeKey: string | null;
  status: "idle" | "loading" | "ready" | "error"; hasQuery: boolean;
  onSelect: (place: JournalPlaceSuggestion) => void; onHighlight: (key: string) => void; onRetry: () => void;
}) {
  if (status === "ready" && !hasQuery && !data.history.length) return null;
  let offset = 0;
  return <SuggestionPanel>
    {status === "loading" && <Notice role="status">장소를 찾고 있어요.</Notice>}
    {status === "error" && <Notice role="status">장소 제안을 불러오지 못했어요.<br />직접 입력해도 괜찮아요. <TextButton type="button" onClick={onRetry}>다시 찾기</TextButton></Notice>}
    {status === "ready" && !data.history.length && !data.places.length && <Notice role="status">일치하는 장소가 없어요.<br />입력한 이름 그대로 남길 수 있어요.</Notice>}
    <List id={id} role="listbox" aria-label="장소 제안" aria-busy={status === "loading"}>
      {status === "ready" && placeSuggestionGroups(data).map(group => {
        if (!group.rows.length) return null;
        const start = offset; offset += group.rows.length;
        const Icon = group.source === "history" ? History : MapPin;
        return <Group key={group.source} role="group" aria-label={group.label}>
          <GroupLabel aria-hidden="true">{group.label}</GroupLabel>
          {group.rows.map((place, index) => <Option key={place.key} id={`${id}-option-${start + index}`} role="option" type="button" tabIndex={-1}
            aria-selected={activeKey === place.key} onMouseMove={() => onHighlight(place.key)}
            onMouseDown={event => event.preventDefault()} onClick={() => onSelect(place)}>
            <Icon size={17} aria-hidden="true" /><span><strong>{place.name}</strong>{place.region && <small>{place.region}</small>}</span>
          </Option>)}
        </Group>;
      })}
    </List>
  </SuggestionPanel>;
}

const SuggestionPanel = styled.div`
  width: 100%; min-width: 0; box-sizing: border-box;
`;
const List = styled.div`min-width: 0;`;
const Group = styled.div`padding: 6px; & + & { border-top: 1px solid var(--color-border); }`;
const GroupLabel = styled.p`margin: 4px 8px; color: var(--color-text-muted); font-size: var(--ui-caption-size); font-weight: 500; line-height: 1.6;`;
const Option = styled(BaseButton)`
  display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; min-height: 48px;
  padding: 10px 8px; border-radius: 8px; background: transparent; color: var(--color-text); text-align: left;
  font-size: var(--ui-body-size); line-height: 1.5;
  > svg { flex: 0 0 auto; color: var(--color-text-muted); }
  > span { display: grid; min-width: 0; gap: 2px; }
  strong { font-weight: 500; overflow-wrap: anywhere; }
  small { color: var(--color-text-muted); font-size: var(--ui-caption-size); line-height: 1.5; }
  &:hover, &[aria-selected="true"] { background: var(--color-brand-100); }
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; }
`;
const Notice = styled.p`margin: 0; padding: 12px 14px; color: var(--color-text-muted); font-size: var(--ui-caption-size); line-height: 1.7;`;
