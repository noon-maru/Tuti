import { resolveTourApiRegionLabels } from "@/shared/tourism/tourApiRegions";

export type DogPlaceBasicRecord = { contentId: string; source: "pet-list" | "kor-source" | "kor-common" | "accommodation"; fetchedAt: string; item: Record<string, unknown> };
export function normalizeDogPlaceBasic(record: DogPlaceBasicRecord) {
  const item = record.item;
  const text = (key: string) => typeof item[key] === "string" ? item[key].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
  if (!/^\d{1,20}$/.test(record.contentId) || item.contentid !== record.contentId) return null;
  const name = text("title"), latitude = Number(item.mapy), longitude = Number(item.mapx);
  if (!name || name.length > 500 || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 32 || latitude > 40 || longitude < 124 || longitude > 133) return null;
  if (/폐업|영구\s*폐쇄|운영\s*종료/.test(name)) return null;
  let image = "";
  try { const url = new URL(text("firstimage") || text("firstimage2")); if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) { url.protocol = "https:"; image = url.toString(); } } catch { /* Image absence is enrichment work, not catalog ineligibility. */ }
  const address = [text("addr1"), text("addr2")].filter(Boolean).join(" ") || null;
  const areaCode = text("lDongRegnCd") || text("areacode") || null;
  const region = resolveTourApiRegionLabels(areaCode, address, text("lDongRegnCd"));
  return { contentId: record.contentId, name, latitude, longitude, image, address,
    contentTypeId: text("contenttypeid") || null, areaCode, sidoName: region.sidoName,
    sigunguCode: text("lDongSignguCd") || text("sigungucode") || null, sigunguName: region.sigunguName,
    copyright: text("cpyrhtDivCd") || null };
}
