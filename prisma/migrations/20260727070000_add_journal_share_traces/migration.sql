CREATE TABLE "journal_share_traces" (
  "trace_id" TEXT NOT NULL,
  "short_code" TEXT NOT NULL,
  "origin_user_id" TEXT NOT NULL,
  "resolved_user_id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "image_sha256" TEXT,
  "signature" TEXT,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalized_at" TIMESTAMP(3),

  CONSTRAINT "journal_share_traces_pkey" PRIMARY KEY ("trace_id")
);

CREATE UNIQUE INDEX "journal_share_traces_short_code_key"
ON "journal_share_traces"("short_code");

CREATE INDEX "journal_share_traces_origin_user_id_idx"
ON "journal_share_traces"("origin_user_id");

CREATE INDEX "journal_share_traces_resolved_user_id_idx"
ON "journal_share_traces"("resolved_user_id");

CREATE INDEX "journal_share_traces_entry_id_idx"
ON "journal_share_traces"("entry_id");

CREATE INDEX "journal_share_traces_issued_at_idx"
ON "journal_share_traces"("issued_at");
