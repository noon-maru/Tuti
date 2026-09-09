import type { TutiPlace } from "@/lib/recommendations";
import type { TutiJournalEntry } from "@/shared/api/journal";

const SIMILAR_PLACE_LIMIT = 3;

const themeMoodRules: Array<{ pattern: RegExp; tags: string[] }> = [
  { pattern: /걷|산책|길|골목/u, tags: ["walk"] },
  { pattern: /조용|한적|고요|쉼|머물/u, tags: ["quiet", "solitude"] },
  { pattern: /초록|숲|자연|바람|바다|전망|공원/u, tags: ["open"] },
  { pattern: /혼자|사색/u, tags: ["solitude", "quiet"] },
];

export function findSimilarVisitedPlaces({
  journalEntries,
  recommendationPlaces,
  savedPlaceIds,
}: {
  journalEntries: TutiJournalEntry[];
  recommendationPlaces: TutiPlace[];
  savedPlaceIds: string[];
}) {
  if (!journalEntries.length || !recommendationPlaces.length) return [];

  const visitedPlaceIds = new Set(
    journalEntries.flatMap((entry) => (entry.placeId ? [entry.placeId] : [])),
  );
  const excludedPlaceIds = new Set([...visitedPlaceIds, ...savedPlaceIds]);
  const moodWeights = collectMoodWeights(journalEntries, recommendationPlaces);

  if (!moodWeights.size) return [];

  return recommendationPlaces
    .filter((place) => !excludedPlaceIds.has(place.id))
    .map((place, index) => ({
      place,
      index,
      score: place.moodTags.reduce(
        (total, tag) => total + (moodWeights.get(tag) ?? 0),
        0,
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.place.fatigue - right.place.fatigue ||
        left.index - right.index,
    )
    .slice(0, SIMILAR_PLACE_LIMIT)
    .map(({ place }) => place);
}

function collectMoodWeights(
  journalEntries: TutiJournalEntry[],
  recommendationPlaces: TutiPlace[],
) {
  const moodWeights = new Map<string, number>();
  const recommendationById = new Map(
    recommendationPlaces.map((place) => [place.id, place]),
  );

  journalEntries.slice(0, 12).forEach((entry, index) => {
    const recencyWeight = Math.max(1, 4 - Math.floor(index / 4));
    const tags = new Set<string>();

    for (const rule of themeMoodRules) {
      if (rule.pattern.test(entry.theme)) {
        rule.tags.forEach((tag) => tags.add(tag));
      }
    }

    if (entry.placeId) {
      recommendationById
        .get(entry.placeId)
        ?.moodTags.forEach((tag) => tags.add(tag));
    }

    tags.forEach((tag) => {
      moodWeights.set(tag, (moodWeights.get(tag) ?? 0) + recencyWeight);
    });
  });

  return moodWeights;
}
