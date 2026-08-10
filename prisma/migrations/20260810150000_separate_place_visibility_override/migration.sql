CREATE TYPE "PlaceVisibilityOverride" AS ENUM ('auto', 'show', 'hide');

ALTER TABLE "places"
  ADD COLUMN "visibility_override" "PlaceVisibilityOverride" NOT NULL DEFAULT 'auto';

-- 기존 관리자 승인·숨김 동작이 후보 수동 포함·제외까지 함께 바꾸던 상태를
-- 별도의 노출 의도로 옮긴다. 수동 포함은 추천풀 의도로 유지하고,
-- 기존 수동 제외는 숨김으로 보존한 뒤 자동 후보 판정으로 되돌린다.
UPDATE "places"
SET "visibility_override" = CASE
  WHEN "candidate_override" = 'include' THEN 'show'::"PlaceVisibilityOverride"
  WHEN "candidate_override" = 'exclude' THEN 'hide'::"PlaceVisibilityOverride"
  ELSE 'auto'::"PlaceVisibilityOverride"
END;

UPDATE "places"
SET "candidate_override" = 'auto'
WHERE "candidate_override" = 'exclude';

-- 추천풀에 자동 또는 수동으로 포함된 미검수 장소는 기본 승인한다.
-- 관리자가 이미 거절한 장소는 그대로 보존한다.
UPDATE "places"
SET "review_status" = 'approved'
WHERE "review_status" = 'pending'
  AND (
    "candidate_override" = 'include'
    OR (
      "candidate_override" = 'auto'
      AND "candidate_status" = 'selected'
    )
  );

-- 추천풀 장소는 기본 노출하되 기존에 수동으로 숨긴 장소는 유지한다.
UPDATE "places"
SET "is_active" = TRUE
WHERE "review_status" = 'approved'
  AND "visibility_override" <> 'hide'
  AND (
    "candidate_override" = 'include'
    OR (
      "candidate_override" = 'auto'
      AND "candidate_status" = 'selected'
    )
  );

UPDATE "places"
SET "is_active" = FALSE
WHERE "visibility_override" = 'hide';

CREATE INDEX "places_source_candidate_status_visibility_idx"
  ON "places"("source", "candidate_status", "visibility_override");
