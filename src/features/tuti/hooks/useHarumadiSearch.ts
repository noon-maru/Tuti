"use client";
import { useState } from "react";
import type { Harumadi } from "@/shared/api/harumadi";

export function filterHarumadis(books: Harumadi[], search: string) {
  const term = search.normalize("NFC").trim().toLocaleLowerCase("ko-KR");
  return term ? books.filter(book => book.title.normalize("NFC").toLocaleLowerCase("ko-KR").includes(term)) : books;
}
export function useHarumadiSearch(books: Harumadi[]) {
  const [search, setSearch] = useState("");
  return { search, setSearch, books: filterHarumadis(books, search), searching: Boolean(search.trim()) };
}
