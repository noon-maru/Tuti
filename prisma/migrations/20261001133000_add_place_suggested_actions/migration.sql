ALTER TABLE "places"
  ADD COLUMN "suggested_action" TEXT;

ALTER TABLE "places"
  ADD CONSTRAINT "places_suggested_action_format_check"
  CHECK (
    "suggested_action" IS NULL
    OR (
      char_length(btrim("suggested_action")) BETWEEN 1 AND 60
      AND strpos("suggested_action", chr(10)) = 0
      AND strpos("suggested_action", chr(13)) = 0
    )
  );
