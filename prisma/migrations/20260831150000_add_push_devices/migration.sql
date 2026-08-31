CREATE TYPE "PushPlatform" AS ENUM ('android', 'ios');

CREATE TABLE "push_devices" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "installation_id" TEXT NOT NULL,
  "platform" "PushPlatform" NOT NULL,
  "token" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "app_version" TEXT,
  "locale" TEXT,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invalidated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_devices_installation_id_key"
  ON "push_devices"("installation_id");
CREATE UNIQUE INDEX "push_devices_token_key"
  ON "push_devices"("token");
CREATE INDEX "push_devices_user_id_enabled_idx"
  ON "push_devices"("user_id", "enabled");
CREATE INDEX "push_devices_platform_enabled_idx"
  ON "push_devices"("platform", "enabled");
CREATE INDEX "push_devices_last_seen_at_idx"
  ON "push_devices"("last_seen_at");

ALTER TABLE "push_devices"
  ADD CONSTRAINT "push_devices_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
