import { fetchHarumadi, updateHarumadi } from "./harumadis";
import { changeTogether } from "./harumadiTogether";

/** 저장된 마디만 연결한다. 재시도는 중복을 만들지 않고 다른 화면의 수정은 덮지 않는다. */
export async function addMadiToHarumadi(owner: string, bookId: string, entryId: string, expectedShared?: boolean) {
  const book = await fetchHarumadi(owner, bookId);
  if (book.entryIds.includes(entryId)) return book;
  if (expectedShared !== undefined && Boolean(book.shared) !== expectedShared) throw new Error("하루마디의 공유 범위가 바뀌었어요. 목록을 다시 확인한 뒤 골라주세요.");
  if (book.shared) {
    await changeTogether(owner, bookId, "add-entry", entryId, { sharingConfirmed: true });
    return fetchHarumadi(owner, bookId);
  }
  return updateHarumadi(owner, bookId, { ...book, entryIds: [...book.entryIds, entryId] });
}
