CREATE TYPE "PushDeliveryStatus" AS ENUM ('sent', 'failed', 'invalidated');

CREATE TABLE "push_deliveries" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "device_id" TEXT,
  "platform" "PushPlatform" NOT NULL,
  "provider" TEXT NOT NULL,
  "message_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "status" "PushDeliveryStatus" NOT NULL,
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "push_deliveries_created_at_idx"
  ON "push_deliveries"("created_at");
CREATE INDEX "push_deliveries_platform_status_created_at_idx"
  ON "push_deliveries"("platform", "status", "created_at");
CREATE INDEX "push_deliveries_user_id_created_at_idx"
  ON "push_deliveries"("user_id", "created_at");

ALTER TABLE "push_deliveries"
  ADD CONSTRAINT "push_deliveries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "push_deliveries"
  ADD CONSTRAINT "push_deliveries_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "push_devices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
