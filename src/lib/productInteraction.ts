import { Capacitor } from "@capacitor/core";
import { apiUrl } from "@/lib/api/apiUrl";
import { ensureSession } from "@/lib/auth/session";
import { createProductInteractionQueue } from "@/lib/analytics/productInteractionQueue";
import type { ProductInteractionAction, ProductInteractionSurface } from "@/shared/api/productInteraction";

const interactions = createProductInteractionQueue({
  session: ensureSession,
  platform: () => {
    const platform = Capacitor.getPlatform();
    return platform === "android" || platform === "ios" ? platform : "web";
  },
  storage: {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  },
  send: async (input, owner) => {
    // Do not use fetchWithSession: its 401 retry may create a different user.
    const response = await fetch(apiUrl("product-interactions"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.accessToken}` },
      body: JSON.stringify(input), keepalive: true,
    });
    if (!response.ok) throw new Error("선택 활동을 기록하지 못했어요.");
  },
});

export function recordProductInteraction(
  action: ProductInteractionAction,
  surface: ProductInteractionSurface,
  eventId = crypto.randomUUID(),
) {
  return interactions.record(action, surface, eventId);
}

export const flushProductInteractions = interactions.flush;
