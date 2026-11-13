CREATE TABLE "place_familiarities" (
  "user_id" TEXT NOT NULL,
  "place_id" TEXT NOT NULL,
  "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "place_familiarities_pkey" PRIMARY KEY ("user_id", "place_id"),
  CONSTRAINT "place_familiarities_expiry_check" CHECK ("expires_at" > "marked_at"),
  CONSTRAINT "place_familiarities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "place_familiarities_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "place_familiarities_expires_at_idx" ON "place_familiarities"("expires_at");
