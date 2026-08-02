ALTER TABLE "journal_entries"
ADD COLUMN "theme" TEXT NOT NULL DEFAULT '걷기 좋은';

ALTER TABLE "journal_entries"
ADD COLUMN "place_id" TEXT;

CREATE INDEX "journal_entries_place_id_idx"
ON "journal_entries"("place_id");

ALTER TABLE "journal_entries"
ADD CONSTRAINT "journal_entries_place_id_fkey"
FOREIGN KEY ("place_id") REFERENCES "places"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
