import type { Harumadi } from "@/shared/api/harumadi";
import { harumadiTitleHint } from "@/shared/harumadi/titleHints";

export function HarumadiTitleHint({ book }: { book: Pick<Harumadi, "duplicateTitle" | "createdAt"> }) {
  const hint = harumadiTitleHint(book);
  if (!hint) return null;
  return <small data-harumadi-title-hint title={`${hint.date} ${hint.time}에 만든 하루마디`} aria-label={`${hint.date} ${hint.time}에 만든 하루마디`}><span>{hint.date}</span>{" "}<span>{hint.time}</span></small>;
}
