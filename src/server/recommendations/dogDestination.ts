import type { TutiPlace } from "@/lib/recommendations";
import { derivePlaceExperienceType } from "./experienceType";
import { cafeCategoryFromPayload, classifyCafe } from "@/server/tourism/cafeClassification";
import type { DogOuting } from "@/shared/pets/dogAccess";

type Destination = Pick<TutiPlace, "name" | "sourceContentType" | "phrase" | "note" | "moodTags"> & { overview?: string | null; basicPayload?: unknown };
/** Pet entry permission is not evidence that an individual shop is an outing destination. */
export function assessDogDestination(place: Destination, outing?: DogOuting) {
  const category = cafeCategoryFromPayload(place.basicPayload);
  const cafe = classifyCafe({ ...category, name: place.name, contentTypeId: place.sourceContentType, overview: place.overview });
  if (cafe.kind === "venue" && (place.sourceContentType !== "38" || ["FD050100", "FD050200"].includes(category.categoryCode ?? ""))) return { eligible: true, type: "cafe" as const };
  if (place.sourceContentType === "38") {
    // A branch inside a market/mall is not the market/mall itself.
    const destination = /(?:시장|상점가|쇼핑거리|쇼핑몰|아울렛|백화점)(?:\s*\([^)]*\))?$/u.test(place.name.trim());
    return { eligible: destination || Boolean(outing?.categories?.includes("shopping")), type: destination ? "neighborhood" as const : "other" as const };
  }
  // Food and accommodation brand names must not become rivers, spas or temples by substring.
  if (["39", "32"].includes(place.sourceContentType ?? "")) return { eligible: true, type: "other" as const };
  return { eligible: true, type: derivePlaceExperienceType({ ...place, ...category }) };
}

export function matchesDogPurpose(place: TutiPlace, outing?: DogOuting) {
  if (outing?.categories?.length) return outing.categories.some(category => {
    switch (category) {
      case "shopping": return place.sourceContentType === "38" && place.experienceType !== "cafe";
      case "cafe": return place.experienceType === "cafe";
      case "park": return place.experienceType === "forest_garden";
      case "nature": return ["waterside", "viewpoint"].includes(place.experienceType ?? "");
      case "culture": return ["art_exhibition", "museum_story", "history_heritage"].includes(place.experienceType ?? "");
      case "activity": return place.experienceType === "activity";
    }
  });
  if (!outing?.purpose) return true;
  if (outing.purpose === "cafe") return place.experienceType === "cafe";
  if (outing.purpose === "walk") return ["forest_garden", "waterside", "neighborhood"].includes(place.experienceType ?? "");
  return Boolean(place.experienceType && !["cafe", "other"].includes(place.experienceType));
}
