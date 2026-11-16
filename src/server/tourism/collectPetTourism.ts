import { fetchPetTourPage, type PetSource } from "./petTourClient";
import { petContentId, petTourRecord, type PetTourRecord } from "./petTourRecord";

type FetchPage = typeof fetchPetTourPage;
export async function collectPetTourism(input: { source: PetSource; startPage: number; pages: number; rows: number; maxRequests: number }, save: (records: PetTourRecord[], checkpoint: { nextPage: number; complete: boolean }) => Promise<void>, fetchPage: FetchPage = fetchPetTourPage) {
  const { source, startPage, pages, rows, maxRequests } = input;
  if ((source !== "kor" && source !== "pet") || ![startPage, pages, rows, maxRequests].every(n => Number.isSafeInteger(n) && n > 0) || pages > 1000 || rows > 100 || maxRequests > 1000) throw new Error("INVALID_COLLECTION_LIMITS");
  const result = { source, requests: 0, received: 0, totalAvailable: 0, pages: 0, nextPage: startPage, complete: false };
  const seen = new Set<string>();
  for (let pageNo = startPage; pageNo < startPage + pages; pageNo++) {
    // Reserve one full pet detail page before fetching; never checkpoint a half-written page.
    if (result.requests + 1 + (source === "pet" ? rows : 0) > maxRequests) break;
    const page = await fetchPage(source, pageNo, rows); result.requests++;
    if (page.pageNo !== pageNo || !Number.isSafeInteger(page.totalCount) || page.totalCount < 0 || page.items.length > rows) throw new Error("PET_PAGE_INVALID");
    result.totalAvailable = page.totalCount;
    const records: PetTourRecord[] = [];
    for (const item of page.items) {
      const contentId = petContentId(item);
      if (!contentId || seen.has(contentId)) throw new Error("PET_PAGE_REPEATED_OR_INVALID_ID");
      seen.add(contentId);
      if (source === "kor") records.push(petTourRecord(source, item, new Date()));
      else {
        const detail = await fetchPage(source, 1, 100, contentId); result.requests++;
        if (detail.items.length !== 1 || petContentId(detail.items[0]) !== contentId) throw new Error("PET_DETAIL_MISSING_OR_MISMATCHED");
        records.push(petTourRecord(source, detail.items[0], new Date(), item));
      }
    }
    if (!page.items.length && (pageNo - 1) * rows < page.totalCount) throw new Error("PET_PAGE_UNEXPECTEDLY_EMPTY");
    if (page.items.length < rows && pageNo * rows < page.totalCount) throw new Error("PET_PAGE_INCOMPLETE");
    const complete = pageNo * rows >= page.totalCount;
    await save(records, { nextPage: pageNo + 1, complete });
    result.received += records.length; result.pages++; result.nextPage = pageNo + 1; result.complete = complete;
    if (complete) break;
  }
  return result;
}
