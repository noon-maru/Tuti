import { fetchHarumadi, updateHarumadi } from "./harumadis";
import { HARUMADI_PDF_MAX_ENTRIES } from "@/shared/api/harumadiPdf";

/** 저장된 마디만 연결한다. 재시도는 중복을 만들지 않고 다른 화면의 수정은 덮지 않는다. */
export async function addMadiToHarumadi(owner: string, bookId: string, entryId: string) {
  const book = await fetchHarumadi(owner, bookId);
  if (book.entryIds.includes(entryId)) return book;
  if (book.entryIds.length >= HARUMADI_PDF_MAX_ENTRIES) throw new Error("이 하루마디는 가득 찼어요. 다른 하루마디를 골라주세요.");
  return updateHarumadi(owner, bookId, { ...book, entryIds: [...book.entryIds, entryId] });
}
