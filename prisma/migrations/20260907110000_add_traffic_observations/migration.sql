CREATE TABLE "traffic_observations" (
    "id" TEXT NOT NULL,
    "bucket_started_at" TIMESTAMP(3) NOT NULL,
    "visitor_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "path_group" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 1,
    "rate_limited_count" INTEGER NOT NULL DEFAULT 0,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retention_until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "traffic_observations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "traffic_observations_bucket_started_at_visitor_key_path_group_method_signal_key"
ON "traffic_observations"("bucket_started_at", "visitor_key", "path_group", "method", "signal");

CREATE INDEX "traffic_observations_bucket_started_at_idx"
ON "traffic_observations"("bucket_started_at");

CREATE INDEX "traffic_observations_kind_bucket_started_at_idx"
ON "traffic_observations"("kind", "bucket_started_at");

CREATE INDEX "traffic_observations_risk_level_bucket_started_at_idx"
ON "traffic_observations"("risk_level", "bucket_started_at");

CREATE INDEX "traffic_observations_retention_until_idx"
ON "traffic_observations"("retention_until");
