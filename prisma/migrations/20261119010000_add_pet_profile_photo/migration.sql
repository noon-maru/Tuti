ALTER TABLE "pet_profiles" ADD COLUMN "photo" TEXT;
ALTER TABLE "pet_profiles" ADD CONSTRAINT "pet_profiles_photo_size"
  CHECK ("photo" IS NULL OR octet_length("photo") <= 180000);
