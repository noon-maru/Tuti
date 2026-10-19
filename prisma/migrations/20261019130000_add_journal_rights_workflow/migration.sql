CREATE TABLE "journal_rights_cases" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "report_id" TEXT NOT NULL UNIQUE REFERENCES "content_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "reference" TEXT NOT NULL UNIQUE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('privacy', 'copyright')),
  "state" TEXT NOT NULL DEFAULT 'received' CHECK ("state" IN ('received', 'temporary_block', 'copyright_block', 'counter_received', 'resume_scheduled', 'court_block', 'closed', 'expired')),
  "proof_reference" TEXT NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL,
  "blocked_at" TIMESTAMP(3), "expires_at" TIMESTAMP(3),
  "counter_requested_at" TIMESTAMP(3), "decision_due_at" TIMESTAMP(3),
  "resume_at" TIMESTAMP(3), "litigation_notified_at" TIMESTAMP(3),
  "next_review_at" TIMESTAMP(3) NOT NULL, "last_reminded_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3), "revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CHECK ("state" <> 'temporary_block' OR ("kind" = 'privacy' AND "blocked_at" IS NOT NULL AND "expires_at" IS NOT NULL AND "expires_at" > "blocked_at" AND "expires_at" <= "blocked_at" + INTERVAL '30 days')),
  CHECK ("state" <> 'resume_scheduled' OR ("kind" = 'copyright' AND "counter_requested_at" IS NOT NULL AND "resume_at" IS NOT NULL AND "resume_at" >= "counter_requested_at" + INTERVAL '7 days' AND "resume_at" <= "counter_requested_at" + INTERVAL '14 days'))
);
CREATE INDEX "journal_rights_cases_state_next_review_at_idx" ON "journal_rights_cases"("state", "next_review_at");
CREATE INDEX "journal_rights_cases_state_expires_at_idx" ON "journal_rights_cases"("state", "expires_at");
CREATE INDEX "journal_rights_cases_state_resume_at_idx" ON "journal_rights_cases"("state", "resume_at");
CREATE TABLE "journal_rights_notices" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "case_id" TEXT NOT NULL REFERENCES "journal_rights_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "event_sequence" INTEGER NOT NULL,
  "recipient_role" TEXT NOT NULL CHECK ("recipient_role" IN ('applicant', 'author', 'operator')),
  "recipient_user_id" TEXT, "recipient_email" TEXT,
  "kind" TEXT NOT NULL, "message" TEXT NOT NULL,
  "requires_formal_notice" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'sending', 'sent', 'failed', 'manual_required', 'manual_confirmed', 'cancelled')),
  "attempts" INTEGER NOT NULL DEFAULT 0, "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_until" TIMESTAMP(3), "sent_at" TIMESTAMP(3), "delivery_proof_reference" TEXT, "error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  UNIQUE ("case_id", "event_sequence", "recipient_role"),
  CHECK ("status" <> 'manual_confirmed' OR ("sent_at" IS NOT NULL AND "delivery_proof_reference" IS NOT NULL)),
  CHECK (NOT "requires_formal_notice" OR "status" <> 'sent')
);
CREATE INDEX "journal_rights_notices_status_next_attempt_at_idx" ON "journal_rights_notices"("status", "next_attempt_at");
CREATE INDEX "journal_rights_notices_recipient_user_id_idx" ON "journal_rights_notices"("recipient_user_id");
