"use client";

import styled from "@emotion/styled";
import { Search, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { captionStyles, inputControlStyles } from "@/shared/ui/typography";
import { MADI_FIELD_COPY } from "@/shared/tuti/madiFields";
import { FIRST_JOURNAL_PLACE_LIMIT } from "@/shared/api/firstJournal";
import { BaseButton } from "./buttons";
import { JournalPlaceSuggestions } from "./JournalPlaceSuggestions";
import { JournalPlaceSuggestionPopover } from "./JournalPlaceSuggestionPopover";
import { placeSuggestionGroups } from "./placeSuggestionLayout";
import { useJournalPlaceSuggestions } from "../hooks/useJournalPlaceSuggestions";
import { normalizePlaceQuery, type SelectedJournalPlace } from "@/shared/api/placeSuggestions";

export function JournalPlacePicker({ placeId, value, helperText, helperStatus, onChange, onTextChange, invalid, describedBy, onBlur }: {
  placeId: string | null; value: string; helperText?: string; helperStatus?: "loading" | "success" | "notice";
  onChange: (place: SelectedJournalPlace) => void; onTextChange: (value: string) => void;
  invalid?: boolean; describedBy?: string; onBlur?: () => void;
}) {
  const id = useId(), inputRef = useRef<HTMLInputElement>(null), popupRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false), [dismissed, setDismissed] = useState(false), [composing, setComposing] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const enabled = focused && !dismissed && !composing;
  const suggestions = useJournalPlaceSuggestions(value, enabled);
  const items = placeSuggestionGroups(suggestions).flatMap(group => group.rows);
  const hasQuery = Boolean(normalizePlaceQuery(value));
  const expanded = enabled && !(suggestions.status === "ready" && !hasQuery && !items.length);
  const active = expanded ? items.findIndex(row => row.key === activeKey) : -1;
  const selectPlace = (place: SelectedJournalPlace) => {
    onChange({ id: place.id, name: place.name, region: place.region });
    inputRef.current?.focus({ preventScroll: true }); setDismissed(true); setActiveKey(null);
  };

  return <PlaceField onBlur={event => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null) || popupRef.current?.contains(event.relatedTarget as Node | null)) return;
    setFocused(false); setActiveKey(null); onBlur?.();
  }}>
    <InputRow>
      <PlaceInput ref={inputRef} role="combobox" aria-label="장소 (선택)" aria-autocomplete="list" aria-haspopup="listbox"
        aria-expanded={expanded} aria-controls={expanded ? `${id}-suggestions` : undefined}
        aria-activedescendant={active >= 0 ? `${id}-suggestions-option-${active}` : undefined}
        value={value} maxLength={FIRST_JOURNAL_PLACE_LIMIT} autoComplete="off" data-selected={Boolean(placeId)}
        aria-invalid={invalid} aria-describedby={[describedBy, helperText ? `${id}-helper` : null].filter(Boolean).join(" ") || undefined}
        placeholder={MADI_FIELD_COPY.placePlaceholder}
        onFocus={() => { setFocused(true); setDismissed(false); }}
        onCompositionStart={() => setComposing(true)} onCompositionEnd={() => { setComposing(false); setActiveKey(null); }}
        onChange={event => { onTextChange(event.target.value); setDismissed(false); setActiveKey(null); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.keyCode === 229 || composing) return;
          if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); setDismissed(true); setActiveKey(null); }
          else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setDismissed(false);
            if (!items.length) return;
            const next = event.key === "ArrowDown" ? (active + 1) % items.length : active <= 0 ? items.length - 1 : active - 1;
            setActiveKey(items[next].key);
            window.requestAnimationFrame(() => document.getElementById(`${id}-suggestions-option-${next}`)?.scrollIntoView({ block: "nearest" }));
          } else if (event.key === "Enter" && active >= 0) { event.preventDefault(); selectPlace(items[active]); }
          else if (event.key === "Tab") { setDismissed(true); setActiveKey(null); }
        }} />
      {value ? <ClearButton type="button" aria-label="장소 빼기" onMouseDown={event => event.preventDefault()}
        onClick={() => { onTextChange(""); setActiveKey(null); setDismissed(false); inputRef.current?.focus(); }}><X size={18} aria-hidden="true" /></ClearButton>
        : <SearchMark size={18} aria-hidden="true" />}
    </InputRow>
    {expanded && <JournalPlaceSuggestionPopover anchor={inputRef} popup={popupRef}
      contentKey={`${normalizePlaceQuery(value)}:${suggestions.status}:${items.map(item => item.key).join(",")}`}
      onDismiss={() => { setDismissed(true); setActiveKey(null); }}>
      <JournalPlaceSuggestions id={`${id}-suggestions`} data={suggestions} activeKey={activeKey} status={suggestions.status}
        hasQuery={hasQuery} onSelect={selectPlace} onHighlight={setActiveKey} onRetry={suggestions.retry} />
    </JournalPlaceSuggestionPopover>}
    {helperText && <PlaceHelper id={`${id}-helper`} aria-live="polite" data-status={helperStatus}>{helperText}</PlaceHelper>}
  </PlaceField>;
}

const PlaceField = styled.div`width: 100%; min-width: 0;`;
const InputRow = styled.div`position: relative; width: 100%; min-width: 0;`;
const PlaceInput = styled.input`${inputControlStyles} padding-inline-end: 52px;`;
const ClearButton = styled(BaseButton)`position: absolute; inset-inline-end: 4px; top: 50%; transform: translateY(-50%); display: grid; place-items: center;
  width: 44px; height: 44px; border-radius: 8px; background: transparent; color: var(--color-text-muted);
  &:hover { color: var(--color-text); background: var(--color-brand-100); }`;
const SearchMark = styled(Search)`position: absolute; inset-inline-end: 16px; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); pointer-events: none;`;
const PlaceHelper = styled.p`${captionStyles} margin: var(--space-1) 0 0; &[data-status="success"] { color: var(--color-secondary-900); }`;
