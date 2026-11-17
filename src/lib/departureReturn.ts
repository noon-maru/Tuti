import type { PendingDeparture } from "@/store/tuti";
import type { RecommendationActionInput } from "@/shared/api/recommendationActions";
import { pendingMadiPath } from "@/shared/tuti/pendingMadi";

/** Explicit self-reported visit; writing remains a separate choice. No record is created here. */
export function handleDepartureReturn({ departure, ownerId, writeNow, now }: {
  departure?: PendingDeparture; ownerId?: string; writeNow: boolean; now: number;
}, effects: {
  record: (input: RecommendationActionInput) => void;
  complete: () => void; postponeWriting: () => void; navigate: (path: string) => void;
}) {
  if (!ownerId || !departure || departure.returnConfirmed) return false;
  const path = pendingMadiPath(departure, ownerId, now);
  if (!path) return false;
  effects.record({ journeyId: departure.journeyId, action: "return_confirmed", placeId: departure.placeId, routeMode: departure.routeMode });
  if (writeNow) {
    effects.record({ journeyId: departure.journeyId, action: "journal_started", placeId: departure.placeId });
    effects.complete();
    effects.navigate(path);
  } else effects.postponeWriting();
  return true;
}
