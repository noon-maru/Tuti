import type { TutiPlace } from "@/lib/recommendations";
import { getPlaceExperienceType } from "@/server/recommendations/experienceType";

const QUALITY_WINDOW = 24;
const MAX_PER_EXPERIENCE = 2;

export function selectDiverseRecommendations(
  places: readonly TutiPlace[],
  limit = 6,
) {
  if (places.length <= 1) return [...places].slice(0, limit);

  const indexed = places.map((place, index) => ({ place, index }));
  const bestScore = Math.min(...indexed.map(({ place }) => getScore(place)));
  const qualityCandidates = indexed.filter(
    ({ place }) => getScore(place) <= bestScore + QUALITY_WINDOW,
  );
  const remaining = qualityCandidates.length >= Math.min(limit, indexed.length)
    ? [...qualityCandidates]
    : [
        ...qualityCandidates,
        ...indexed.filter((candidate) => !qualityCandidates.includes(candidate)),
      ];
  const selected: typeof indexed = [];
  const experienceCounts = new Map<string, number>();

  while (selected.length < limit && remaining.length > 0) {
    const withinExperienceCap = remaining.filter(({ place }) => {
      const experience = getPlaceExperienceType(place);
      return (experienceCounts.get(experience) ?? 0) < MAX_PER_EXPERIENCE;
    });
    const selectable = withinExperienceCap.length > 0
      ? withinExperienceCap
      : remaining;
    selectable.sort(
      (left, right) =>
        adjustedScore(left.place, selected.map(({ place }) => place)) -
          adjustedScore(right.place, selected.map(({ place }) => place)) ||
        left.index - right.index ||
        left.place.id.localeCompare(right.place.id),
    );
    const next = selectable[0];
    selected.push(next);
    remaining.splice(remaining.indexOf(next), 1);
    const experience = getPlaceExperienceType(next.place);
    experienceCounts.set(experience, (experienceCounts.get(experience) ?? 0) + 1);
  }

  return selected.map(({ place }) => place);
}

function adjustedScore(place: TutiPlace, selected: TutiPlace[]) {
  const sameExperience = selected.filter(
    (selectedPlace) =>
      getPlaceExperienceType(selectedPlace) === getPlaceExperienceType(place),
  ).length;
  const sameDistrict = selected.filter(
    (selectedPlace) =>
      place.sourceSigunguName &&
      selectedPlace.sourceSigunguName === place.sourceSigunguName,
  ).length;
  const samePhrase = selected.filter(
    (selectedPlace) =>
      place.cardPhrase && selectedPlace.cardPhrase === place.cardPhrase,
  ).length;
  const nearbyDuplicate = selected.some(
    (selectedPlace) => distanceMeters(place, selectedPlace) < 700,
  );

  return (
    getScore(place) +
    sameExperience * 9 +
    sameDistrict * 2 +
    samePhrase * 4 +
    (nearbyDuplicate ? 6 : 0)
  );
}

function getScore(place: TutiPlace) {
  return place.rankingScore ?? place.fatigueScore ?? place.fatigue;
}

function distanceMeters(left: TutiPlace, right: TutiPlace) {
  if (
    left.latitude === undefined ||
    left.longitude === undefined ||
    right.latitude === undefined ||
    right.longitude === undefined
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const latitude = toRadians(left.latitude);
  const otherLatitude = toRadians(right.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude) *
      Math.cos(otherLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}
