-- 도·광역시 표기가 생략되거나 시군구와 읍면이 붙은 비정형 주소를 복구한다.
WITH resolved AS (
  SELECT
    source."content_id",
    (
      REGEXP_MATCH(
        CASE
          WHEN SPLIT_PART(
            BTRIM(source."raw_payload"->>'addr1'),
            ' ',
            1
          ) IN (
            '서울', '서울특별시', '부산', '부산광역시',
            '대구', '대구광역시', '인천', '인천광역시',
            '광주', '광주광역시', '대전', '대전광역시',
            '울산', '울산광역시', '세종', '세종특별자치시',
            '경기', '경기도', '강원', '강원특별자치도',
            '충북', '충청북도', '충남', '충청남도',
            '전북', '전북특별자치도', '전남', '전라남도',
            '경북', '경상북도', '경남', '경상남도',
            '제주', '제주특별자치', '제주특별자치도',
            '전남광주통특별시', '전남광주통합특별시'
          )
            THEN REGEXP_REPLACE(
              BTRIM(source."raw_payload"->>'addr1'),
              '^[^[:space:]]+[[:space:]]*',
              ''
            )
          ELSE BTRIM(source."raw_payload"->>'addr1')
        END,
        '(^|[[:space:]])([^[:space:]]*(시|군|구))'
      )
    )[2] AS "sigungu_name"
  FROM "tourism_place_source_records" AS source
  WHERE source."sigungu_name" IS NULL
)
UPDATE "tourism_place_source_records" AS source
SET "sigungu_name" = resolved."sigungu_name"
FROM resolved
WHERE source."content_id" = resolved."content_id"
  AND resolved."sigungu_name" IS NOT NULL;

UPDATE "places" AS place
SET "source_sigungu_name" = source."sigungu_name"
FROM "tourism_place_source_records" AS source
WHERE source."linked_place_id" = place."id"
  AND place."source" = 'tourapi'
  AND place."source_sigungu_name" IS NULL
  AND source."sigungu_name" IS NOT NULL;
