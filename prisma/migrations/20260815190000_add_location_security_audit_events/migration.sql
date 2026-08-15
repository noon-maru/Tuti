CREATE TYPE "LocationSecurityEventCategory" AS ENUM (
  'system_access',
  'permission_change',
  'maintenance',
  'inspection',
  'incident'
);

CREATE TYPE "LocationSecurityEventResult" AS ENUM (
  'success',
  'denied',
  'failed'
);

CREATE TABLE "location_security_audit_events" (
  "id" TEXT NOT NULL,
  "category" "LocationSecurityEventCategory" NOT NULL,
  "result" "LocationSecurityEventResult" NOT NULL,
  "actor_key" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "target_key" TEXT,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "details" JSONB,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retention_until" TIMESTAMP(3) NOT NULL,
  "signature_version" TEXT NOT NULL DEFAULT 'hmac-sha256-v1',
  "signature" TEXT NOT NULL,
  CONSTRAINT "location_security_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "location_security_audit_events_category_occurred_at_idx"
  ON "location_security_audit_events"("category", "occurred_at");
CREATE INDEX "location_security_audit_events_result_occurred_at_idx"
  ON "location_security_audit_events"("result", "occurred_at");
CREATE INDEX "location_security_audit_events_actor_user_id_occurred_at_idx"
  ON "location_security_audit_events"("actor_user_id", "occurred_at");
CREATE INDEX "location_security_audit_events_retention_until_idx"
  ON "location_security_audit_events"("retention_until");
