CREATE TABLE "dog_place_access" (
 "place_id" TEXT PRIMARY KEY REFERENCES "places"("id") ON DELETE CASCADE,
 "allowed" BOOLEAN NOT NULL, "areas" TEXT NOT NULL, "rules" TEXT NOT NULL,
 "max_weight_kg" DOUBLE PRECISION CHECK ("max_weight_kg" > 0 AND "max_weight_kg" <= 150),
 "leash_required" BOOLEAN NOT NULL, "carrier_required" BOOLEAN NOT NULL,
 "source_url" TEXT NOT NULL, "checked_at" TIMESTAMP(3) NOT NULL, "valid_until" TIMESTAMP(3) NOT NULL,
 CHECK ("valid_until" > "checked_at")
);
