CREATE TABLE "dog_place_catalog" (
 "place_id" TEXT PRIMARY KEY REFERENCES "places"("id") ON DELETE CASCADE,
 "status" TEXT NOT NULL CHECK ("status" IN ('ready','review_required','excluded')),
 "reason" TEXT NOT NULL,
 "basic_source" TEXT NOT NULL,
 "algorithm_version" TEXT NOT NULL,
 "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "dog_place_catalog_status_idx" ON "dog_place_catalog"("status");
