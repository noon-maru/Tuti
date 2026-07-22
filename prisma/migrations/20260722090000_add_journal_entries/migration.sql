CREATE TABLE "journal_entries" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "image" TEXT,
  "crowd" TEXT NOT NULL,
  "place_name" TEXT NOT NULL,
  "difficulty" TEXT NOT NULL,
  "visited_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "journal_entries_visited_at_idx" ON "journal_entries"("visited_at");
