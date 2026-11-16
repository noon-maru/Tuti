CREATE TABLE "pet_profiles" (
 "id" TEXT PRIMARY KEY, "owner_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "name" TEXT NOT NULL CHECK (length("name") BETWEEN 1 AND 60), "revision" INTEGER NOT NULL DEFAULT 0,
 "species" TEXT NOT NULL CHECK ("species" IN ('dog','cat')),
 "weight_kg" DOUBLE PRECISION CHECK ("weight_kg" > 0 AND "weight_kg" <= 150),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "pet_profiles_owner_id_idx" ON "pet_profiles"("owner_id");
CREATE TABLE "madi_pet_links" (
 "entry_id" TEXT NOT NULL REFERENCES "journal_entries"("id") ON DELETE CASCADE,
 "pet_id" TEXT NOT NULL REFERENCES "pet_profiles"("id") ON DELETE CASCADE,
 PRIMARY KEY ("entry_id", "pet_id")
);
CREATE INDEX "madi_pet_links_pet_id_idx" ON "madi_pet_links"("pet_id");
