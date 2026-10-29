import { fetchHarumadi, updateHarumadi } from "./harumadis";

/** 저장된 마디만 연결한다. 재시도는 중복을 만들지 않고 다른 화면의 수정은 덮지 않는다. */
export async function addMadiToHarumadi(owner: string, bookId: string, entryId: string) {
  const book = await fetchHarumadi(owner, bookId);
  if (book.entryIds.includes(entryId)) return book;
  return updateHarumadi(owner, bookId, { ...book, entryIds: [...book.entryIds, entryId] });
}
