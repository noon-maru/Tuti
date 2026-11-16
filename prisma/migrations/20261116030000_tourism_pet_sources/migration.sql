CREATE TABLE "tourism_pet_source_records" (
 "source" TEXT NOT NULL CHECK ("source" IN ('kor','pet')),
 "content_id" TEXT NOT NULL,
 "place_id" TEXT REFERENCES "places"("id") ON DELETE SET NULL,
 "raw_payload" JSONB NOT NULL, "list_payload" JSONB,
 "source_url" TEXT NOT NULL, "fetched_at" TIMESTAMP(3) NOT NULL,
 "provider_modified_at" TEXT, "facility_verified_at" TIMESTAMP(3),
 PRIMARY KEY ("source", "content_id")
);
CREATE INDEX "tourism_pet_source_records_place_id_idx" ON "tourism_pet_source_records"("place_id");
