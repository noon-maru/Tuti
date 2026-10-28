import type { HarumadiContent } from "@/shared/api/harumadi";

export function harumadiContent(id = "book-a"): HarumadiContent {
  return { harumadi: { id, title: "함께한 하루", coverStyle: "white-plain", revision: 1,
    entryIds: ["entry-a"], createdAt: "2026-10-27T00:00:00Z", updatedAt: "2026-10-27T00:00:00Z" },
    entries: [{ id: "entry-a", title: "산책", content: "가볍게 걸었던 하루", image: null, placeId: null, placeName: "동네 공원",
      visitedAt: "2026-10-26T00:00:00Z", sensitiveContent: false, publicationStatus: "private", publication: null }],
    version: "a".repeat(64), totalRecordCount: 1, cacheable: true };
}
