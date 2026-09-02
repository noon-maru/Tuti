-- 현재까지 검토 대기로 남은 장소를 추천 노출 대상에서 명시적으로 제외합니다.
-- 장소 원천과 후보 판정 데이터는 보존하고 검수·노출 상태만 변경합니다.
UPDATE "places"
SET
  "review_status" = 'rejected'::"PlaceReviewStatus",
  "is_active" = FALSE,
  "visibility_override" = 'hide'::"PlaceVisibilityOverride",
  "updated_at" = NOW()
WHERE "review_status" = 'pending'::"PlaceReviewStatus";
