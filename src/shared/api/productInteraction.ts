import { PRODUCT_ACTIVITY_PLATFORMS, type ProductActivityPlatform } from "./productActivity";

export const PRODUCT_INTERACTION_ACTIONS = [
  "welcome_viewed",
  "welcome_record_started",
  "welcome_explore_started",
  "journal_book_purchase_clicked",
] as const;
export type ProductInteractionAction = (typeof PRODUCT_INTERACTION_ACTIONS)[number];
export type ProductInteractionSurface = "welcome" | "completed_book";
export type ProductInteractionInput = {
  eventId: string;
  action: ProductInteractionAction;
  surface: ProductInteractionSurface;
  platform: ProductActivityPlatform;
};

export function normalizeProductInteraction(input: unknown): ProductInteractionInput | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Partial<ProductInteractionInput>;
  if (
    typeof value.eventId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.eventId) ||
    !PRODUCT_INTERACTION_ACTIONS.includes(value.action as ProductInteractionAction) ||
    !PRODUCT_ACTIVITY_PLATFORMS.includes(value.platform as ProductActivityPlatform) ||
    (value.surface !== "welcome" && value.surface !== "completed_book") ||
    (value.surface === "completed_book" && value.action !== "journal_book_purchase_clicked")
  ) return null;
  return {
    eventId: value.eventId,
    action: value.action!,
    platform: value.platform!,
    surface: value.surface,
  };
}
