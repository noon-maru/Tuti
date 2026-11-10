ALTER TABLE "journal_entries" ADD COLUMN "image_width" INTEGER, ADD COLUMN "image_height" INTEGER;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_image_dimensions_check"
CHECK (("image_width" IS NULL AND "image_height" IS NULL) OR
       ("image_width" IS NOT NULL AND "image_height" IS NOT NULL AND "image_width" > 0 AND "image_height" > 0));
