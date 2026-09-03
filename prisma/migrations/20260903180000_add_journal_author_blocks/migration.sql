CREATE TABLE "journal_author_blocks" (
  "blocker_user_id" TEXT NOT NULL,
  "blocked_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "journal_author_blocks_pkey"
    PRIMARY KEY ("blocker_user_id", "blocked_user_id"),
  CONSTRAINT "journal_author_blocks_not_self_check"
    CHECK ("blocker_user_id" <> "blocked_user_id"),
  CONSTRAINT "journal_author_blocks_blocker_user_id_fkey"
    FOREIGN KEY ("blocker_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "journal_author_blocks_blocked_user_id_fkey"
    FOREIGN KEY ("blocked_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "journal_author_blocks_blocked_user_id_created_at_idx"
ON "journal_author_blocks"("blocked_user_id", "created_at");
