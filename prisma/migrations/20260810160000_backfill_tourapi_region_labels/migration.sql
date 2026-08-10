-- KorService2 원본은 기존 areacode/sigungucode 대신 법정동 코드 필드를
-- 제공하므로 법정동 코드를 우선 사용하고 주소를 보조 수단으로 삼는다.
WITH source_values AS (
  SELECT
    source."content_id",
    COALESCE(
      NULLIF(BTRIM(source."raw_payload"->>'lDongRegnCd'), ''),
      NULLIF(BTRIM(source."raw_payload"->>'areacode'), ''),
      source."area_code"
    ) AS "region_code",
    COALESCE(
      NULLIF(BTRIM(source."raw_payload"->>'lDongSignguCd'), ''),
      NULLIF(BTRIM(source."raw_payload"->>'sigungucode'), ''),
      source."sigungu_code"
    ) AS "sigungu_code",
    source."sido_name" AS "existing_sido_name",
    source."sigungu_name" AS "existing_sigungu_name",
    BTRIM(CONCAT_WS(
      ' ',
      NULLIF(BTRIM(source."raw_payload"->>'addr1'), ''),
      NULLIF(BTRIM(source."raw_payload"->>'addr2'), '')
    )) AS "address"
  FROM "tourism_place_source_records" AS source
),
region_labels AS (
  SELECT
    values.*,
    CASE values."region_code"
      WHEN '1' THEN '서울특별시'
      WHEN '2' THEN '인천광역시'
      WHEN '3' THEN '대전광역시'
      WHEN '4' THEN '대구광역시'
      WHEN '5' THEN '광주광역시'
      WHEN '6' THEN '부산광역시'
      WHEN '7' THEN '울산광역시'
      WHEN '8' THEN '세종특별자치시'
      WHEN '11' THEN '서울특별시'
      WHEN '12' THEN '전남광주통합특별시'
      WHEN '26' THEN '부산광역시'
      WHEN '27' THEN '대구광역시'
      WHEN '28' THEN '인천광역시'
      WHEN '29' THEN '광주광역시'
      WHEN '30' THEN '대전광역시'
      WHEN '31' THEN '울산광역시'
      WHEN '32' THEN '강원특별자치도'
      WHEN '33' THEN '충청북도'
      WHEN '34' THEN '충청남도'
      WHEN '35' THEN '경상북도'
      WHEN '36' THEN '경상남도'
      WHEN '37' THEN '전북특별자치도'
      WHEN '38' THEN '전라남도'
      WHEN '39' THEN '제주특별자치도'
      WHEN '41' THEN '경기도'
      WHEN '43' THEN '충청북도'
      WHEN '44' THEN '충청남도'
      WHEN '46' THEN '전라남도'
      WHEN '47' THEN '경상북도'
      WHEN '48' THEN '경상남도'
      WHEN '50' THEN '제주특별자치도'
      WHEN '51' THEN '강원특별자치도'
      WHEN '52' THEN '전북특별자치도'
      WHEN '36110' THEN '세종특별자치시'
      ELSE CASE SPLIT_PART(values."address", ' ', 1)
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
        ELSE values."existing_sido_name"
      END
    END AS "sido_name"
  FROM source_values AS values
),
resolved AS (
  SELECT
    labels.*,
    COALESCE((
      REGEXP_MATCH(
        CASE
          WHEN SPLIT_PART(labels."address", ' ', 1) IN (
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
              labels."address",
              '^[^[:space:]]+[[:space:]]*',
              ''
            )
          ELSE labels."address"
        END,
        '(^|[[:space:]])([^[:space:]]*(시|군|구))'
      )
    )[2], labels."existing_sigungu_name") AS "sigungu_name"
  FROM region_labels AS labels
)
UPDATE "tourism_place_source_records" AS source
SET
  "area_code" = resolved."region_code",
  "sido_name" = resolved."sido_name",
  "sigungu_code" = resolved."sigungu_code",
  "sigungu_name" = resolved."sigungu_name"
FROM resolved
WHERE source."content_id" = resolved."content_id";

-- 추천 및 관리자 필터가 직접 참조하는 장소 테이블에도 같은 결과를 반영한다.
UPDATE "places" AS place
SET
  "source_area_code" = source."area_code",
  "source_sido_name" = source."sido_name",
  "source_sigungu_code" = source."sigungu_code",
  "source_sigungu_name" = source."sigungu_name"
FROM "tourism_place_source_records" AS source
WHERE source."linked_place_id" = place."id"
  AND place."source" = 'tourapi';
