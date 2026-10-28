"use client";

import { HarumadiPageSheet } from "./HarumadiSheet";
import { buildHarumadiCoverPage } from "@/shared/harumadi/readerPages";
import type { HarumadiPdfCoverStyle } from "@/shared/api/harumadiPdf";
import type { TutiJournalEntry } from "@/shared/api/journal";

/** 실제 표지 데이터를 쓰되 작은 미리보기에서는 제목·사진을 과장해 구분하기 쉽게 표시한다. */
export function HarumadiSettingsCover({ title, coverStyle, entries, className }: {
  title: string; coverStyle: HarumadiPdfCoverStyle; entries: TutiJournalEntry[]; className?: string;
}) {
  const page = buildHarumadiCoverPage({ title: title.trim() || "하루마디 제목", coverStyle }, entries);
  return <div className={className} aria-label="하루마디 표지 미리보기" data-harumadi-settings-cover>
    <HarumadiPageSheet page={page} coverStyle={coverStyle} number={0} compactCover />
  </div>;
}
