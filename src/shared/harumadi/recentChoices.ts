import type { Harumadi } from "@/shared/api/harumadi";

export function groupHarumadiChoices(recent: Harumadi[], loaded: Harumadi[]) {
  const seen = new Set<string>();
  const preferred = recent.filter(book => { if (seen.has(book.id)) return false; seen.add(book.id); return true; }).slice(0, 3)
    .map(book => { const current = loaded.find(row => row.id === book.id); return current && current.revision >= book.revision ? current : book; });
  const ids = new Set(preferred.map(book => book.id));
  return { recent: preferred, other: loaded.filter(book => !ids.has(book.id)) };
}
