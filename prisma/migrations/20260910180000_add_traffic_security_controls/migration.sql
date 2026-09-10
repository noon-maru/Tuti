ALTER TABLE "traffic_observations"
ADD COLUMN "actor_key" TEXT,
ADD COLUMN "address_key" TEXT,
ADD COLUMN "agent_key" TEXT,
ADD COLUMN "address_preview" TEXT,
ADD COLUMN "agent_summary" TEXT,
ADD COLUMN "blocked_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "traffic_observations_actor_key_bucket_started_at_idx"
ON "traffic_observations"("actor_key", "bucket_started_at");

CREATE INDEX "traffic_observations_address_key_bucket_started_at_idx"
ON "traffic_observations"("address_key", "bucket_started_at");

CREATE TABLE "traffic_block_rules" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "subject_key" TEXT NOT NULL,
    "subject_preview" TEXT NOT NULL,
    "agent_summary" TEXT,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_by_user_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traffic_block_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "traffic_block_rules_scope_subject_key_revoked_at_idx"
ON "traffic_block_rules"("scope", "subject_key", "revoked_at");

CREATE INDEX "traffic_block_rules_expires_at_idx"
ON "traffic_block_rules"("expires_at");

CREATE INDEX "traffic_block_rules_created_at_idx"
ON "traffic_block_rules"("created_at");
