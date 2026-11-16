import { fetchTourApiPage } from "./tourApiClient";
export type PetSource = "kor" | "pet";
export type PetTourItem = Record<string, unknown>;
export const PET_SOURCE_URLS = { kor: "https://www.data.go.kr/data/15101578/openapi.do", pet: "https://www.data.go.kr/data/15135102/openapi.do" } as const;
export const fetchPetTourPage = (source: PetSource, pageNo: number, pageSize: number, contentId?: string) => {
  if ((source !== "kor" && source !== "pet") || !Number.isSafeInteger(pageNo) || pageNo < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || contentId !== undefined && !/^\d{1,20}$/.test(contentId)) throw new Error("INVALID_PET_TOUR_PAGE");
  // Pet service documents contentId as required; enumerate its area list before fetching details.
  return fetchTourApiPage<PetTourItem>(source === "pet" && !contentId ? "areaBasedList2" : "detailPetTour2", {
    pageNo: String(pageNo), numOfRows: String(pageSize), ...(contentId ? { contentId } : {}),
    ...(source === "pet" && !contentId ? { arrange: "A" } : {}),
  }, source === "kor" ? "KorService2" : "KorPetTourService2");
};
