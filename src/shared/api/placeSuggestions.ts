export const PLACE_SUGGESTION_QUERY_LIMIT = 120;

export type SelectedJournalPlace = {
  id: string | null;
  name: string;
  region: string | null;
};

export type JournalPlaceSuggestion = SelectedJournalPlace & {
  key: string;
  source: "history" | "place";
};

export type PlaceSuggestionsResponse = {
  history: JournalPlaceSuggestion[];
  places: JournalPlaceSuggestion[];
};

export function normalizePlaceQuery(value: string) {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim().slice(0, PLACE_SUGGESTION_QUERY_LIMIT);
}

export function placeNameIdentity(value: string) {
  return normalizePlaceQuery(value).replace(/\s/gu, "").toLowerCase();
}

/** 개인 장소를 먼저 유지하되, 동명이면서 ID가 다른 일반 장소는 주소로 구별한다. */
export function distinctPlaceSuggestions(history: JournalPlaceSuggestion[], places: JournalPlaceSuggestion[]): PlaceSuggestionsResponse {
  const personal = history.filter((row, i) => history.findIndex(other => placeNameIdentity(other.name) === placeNameIdentity(row.name)) === i);
  const ids = new Set(personal.flatMap(row => row.id ? [row.id] : []));
  const manualNames = new Set(personal.filter(row => !row.id).map(row => placeNameIdentity(row.name)));
  const seen = new Set<string>();
  return { history: personal, places: places.filter(row => {
    if ((row.id && ids.has(row.id)) || manualNames.has(placeNameIdentity(row.name)) || seen.has(row.key)) return false;
    seen.add(row.key); return true;
  }) };
}
