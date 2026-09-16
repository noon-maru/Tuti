-- 위치 없는 추천에서 시·군·구를 직접 선택하므로, 원천 코드와 주소가
-- 충돌할 때 실제 노출 주소를 우선하여 지역 라벨을 복구한다.
WITH address_parts AS (
  SELECT
    source."content_id",
    BTRIM(COALESCE(NULLIF(source."raw_payload"->>'addr1', ''), '')) AS address,
    SPLIT_PART(
      BTRIM(COALESCE(NULLIF(source."raw_payload"->>'addr1', ''), '')),
      ' ',
      1
    ) AS sido_token
  FROM "tourism_place_source_records" AS source
),
normalized_sido AS (
  SELECT
    parts.*,
    CASE parts.sido_token
      WHEN '서울' THEN '서울특별시'
      WHEN '서울특별시' THEN '서울특별시'
      WHEN '부산' THEN '부산광역시'
      WHEN '부산광역시' THEN '부산광역시'
      WHEN '대구' THEN '대구광역시'
      WHEN '대구광역시' THEN '대구광역시'
      WHEN '인천' THEN '인천광역시'
      WHEN '인천광역시' THEN '인천광역시'
      WHEN '광주' THEN '광주광역시'
      WHEN '광주광역시' THEN '광주광역시'
      WHEN '대전' THEN '대전광역시'
      WHEN '대전광역시' THEN '대전광역시'
      WHEN '울산' THEN '울산광역시'
      WHEN '울산광역시' THEN '울산광역시'
      WHEN '세종' THEN '세종특별자치시'
      WHEN '세종특별자치시' THEN '세종특별자치시'
      WHEN '경기' THEN '경기도'
      WHEN '경기도' THEN '경기도'
      WHEN '강원' THEN '강원특별자치도'
      WHEN '강원특별자치도' THEN '강원특별자치도'
      WHEN '충북' THEN '충청북도'
      WHEN '충청북도' THEN '충청북도'
      WHEN '충남' THEN '충청남도'
      WHEN '충청남도' THEN '충청남도'
      WHEN '전북' THEN '전북특별자치도'
      WHEN '전북특별자치도' THEN '전북특별자치도'
      WHEN '전남' THEN '전라남도'
      WHEN '전라남도' THEN '전라남도'
      WHEN '경북' THEN '경상북도'
      WHEN '경상북도' THEN '경상북도'
      WHEN '경남' THEN '경상남도'
      WHEN '경상남도' THEN '경상남도'
      WHEN '제주' THEN '제주특별자치도'
      WHEN '제주특별자치' THEN '제주특별자치도'
      WHEN '제주특별자치도' THEN '제주특별자치도'
      WHEN '전남광주통특별시' THEN '전남광주통합특별시'
      WHEN '전남광주통합특별시' THEN '전남광주통합특별시'
      ELSE NULL
    END AS sido_name,
    BTRIM(REGEXP_REPLACE(parts.address, '^[^[:space:]]+[[:space:]]*', '')) AS remainder
  FROM address_parts AS parts
),
district_tokens AS (
  SELECT
    normalized.*,
    SPLIT_PART(normalized.remainder, ' ', 1) AS district_token
  FROM normalized_sido AS normalized
  WHERE normalized.sido_name IS NOT NULL
),
resolved AS (
  SELECT
    tokens.*,
    CASE
      WHEN tokens.sido_name = '세종특별자치시' THEN NULL
      WHEN NULLIF(tokens.district_token, '') IS NULL THEN NULL
      WHEN tokens.district_token ~ '구광역시$'
        THEN REGEXP_REPLACE(tokens.district_token, '광역시$', '')
      WHEN tokens.district_token !~ '(시|군|구)$' THEN NULL
      ELSE tokens.district_token
    END AS sigungu_name
  FROM district_tokens AS tokens
)
UPDATE "tourism_place_source_records" AS source
SET
  "sido_name" = resolved.sido_name,
  "sigungu_name" = CASE
    WHEN resolved.sido_name = '세종특별자치시' THEN NULL
    ELSE COALESCE(
      NULLIF(resolved.sigungu_name, ''),
      source."sigungu_name"
    )
  END
FROM resolved
WHERE source."content_id" = resolved."content_id";

UPDATE "places" AS place
SET
  "source_sido_name" = source."sido_name",
  "source_sigungu_name" = source."sigungu_name"
FROM "tourism_place_source_records" AS source
WHERE source."linked_place_id" = place."id"
  AND place."source" = 'tourapi';
