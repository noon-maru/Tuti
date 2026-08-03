CREATE TYPE "RecommendationActionType" AS ENUM (
  'recommendation_shown',
  'place_selected',
  'departure_peek_opened',
  'departure_plan_expanded',
  'navigation_started',
  'return_confirmed',
  'return_dismissed',
  'return_deferred',
  'journal_started',
  'journal_created'
);

CREATE TABLE "recommendation_actions" (
  "id" TEXT NOT NULL,
  "journey_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "place_id" TEXT,
  "action" "RecommendationActionType" NOT NULL,
  "route_mode" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "recommendation_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recommendation_actions_journey_id_created_at_idx"
  ON "recommendation_actions"("journey_id", "created_at");
CREATE INDEX "recommendation_actions_user_id_created_at_idx"
  ON "recommendation_actions"("user_id", "created_at");
CREATE INDEX "recommendation_actions_place_id_action_created_at_idx"
  ON "recommendation_actions"("place_id", "action", "created_at");
CREATE INDEX "recommendation_actions_action_created_at_idx"
  ON "recommendation_actions"("action", "created_at");

ALTER TABLE "recommendation_actions"
  ADD CONSTRAINT "recommendation_actions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recommendation_actions"
  ADD CONSTRAINT "recommendation_actions_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
