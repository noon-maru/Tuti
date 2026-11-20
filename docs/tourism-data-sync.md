# 관광 공공데이터 동기화

관광 원천 데이터는 공급자의 식별자와 기준 시점으로 레코드를 식별한다. 동기화는
각 테이블의 유니크 제약을 대상으로 Prisma `upsert`를 사용하므로, 동일한 범위를
다시 수집해도 기존 레코드를 갱신한다. `rawPayload`에는 공급자 응답 원문을 유지하고,
`syncedAt`에는 마지막 수집 시각을 기록한다.

## 정기 동기화 대상과 자연 키

| 데이터 | 테이블 | 유니크 키 | 권장 주기 |
| --- | --- | --- | --- |
| 관광정보 | `tourism_place_source_records` | `contentId` | 전수수집 완료·수동 복구 |
| 웰니스 관광 | `wellness_tourism_source_records` | `contentId`, `langDivCd` | 전수수집 완료·수동 복구 |
| 중심 관광지 | `municipal_core_tourism_source_records` | `baseYm`, `areaCode`, `sigunguCode`, `touristSpotCode` | 월 1회 |
| 관광지 집중률 | `tourist_spot_concentration_rate_records` | `baseYmd`, `areaCode`, `sigunguCode`, `touristSpotName` | 7개 묶음 순환·일 1회 |
| 지역 방문자 수 | `regional_visitor_count_records` | `aggregationLevel`, `baseYmd`, `regionCode`, `weekdayCode`, `visitorTypeCode` | 주 1회·최근 14일 갱신 |
| 관광사진 갤러리 | `tourism_photo_gallery_source_records` | `contentId` | 전수수집 완료·수동 복구 |
| 지역 관광 지표 | `tourism_region_metrics` | `metricType`, `metricCode`, `baseYm`, `areaCode`, `sigunguCode` | 월 1회 |

`metricType`은 서비스 수요·문화자원 수요·숙박 강도·소비 강도를 구분한다. 각
`metricType`은 하나의 원천 데이터셋에만 대응하므로 유니크 키에 `dataset`을 중복해
넣지 않는다.

## 관광지 지역 분류

TourAPI 관광지는 원본의 `areaCode`, `sigunguCode`와 함께 사람이 읽을 수 있는
`sidoName`, `sigunguName`을 저장한다. 시도명은 TourAPI 지역 코드표로 확정하고,
시군구명은 원본 도로명 주소에서 추출한다. UI 검증용 목업 장소는 실제 추천에 넣지 않는다.
구 일반 승인 후보와 2.0 동반 카탈로그의 독립 준비 상태를 구분한다.
공식 등록·검색 가능·해당 외출 조건 적격은 서로 다른 범위이며 [현행 추천 정책](./dog-outing-v2-policy.md)을 따른다.

TourAPI의 지역 코드는 관광 데이터랩의 법정 지역 코드와 다른 체계다. 집중률·방문자
데이터를 연결할 때 두 코드를 직접 동일시하지 않고, 중심 관광지 원천 데이터의 장소명과
법정 지역 코드를 기준으로 연결한다.

## 실시간 활용 대상

관광지 집중률 방문자 추이 예측 정보는 일곱 지역 묶음을 순환하며 매일 미리 수집한다.
중복 기준은 `baseYmd`, `areaCode`, `sigunguCode`, `touristSpotName`이다. 이 데이터는
실측 혼잡도가 아닌 관광공사 방문 패턴 기반의 예측값이므로 UI에는 `예상 혼잡도`로만
표시한다.

장소 혼잡도 표시는 서울 실시간 혼잡도를 최우선으로 사용하고, 없으면 저장된 관광지 집중률을
사용한다. 둘 다 없으면 `place_crowd_estimates`의 지역 방문 패턴 기반 예상값을 사용한다.
추정 근거가 하나도 없으면 혼잡도 정보가 없는 상태를 유지한다.
이 데이터 보유가 2.0 반려견 엔진의 구 피로도·혼잡도 중심 순위를 복구하는 근거는 아니다.

## 동기화 실행 원칙

- 각 실행 결과는 단기 운영 로그인 `external_data_sync_runs`에 남긴다.
- 성공한 작업의 재개 기준은 별도 테이블인 `external_data_sync_checkpoints`에 영속적으로 남긴다. 실행 로그를 비워도 완료 범위를 다시 수집하지 않는다.
- 정기 작업은 공급자 데이터가 갱신된 단위(일·월)만 요청한다.
- 실패 시 기존 레코드를 지우지 않는다. 다음 실행에서 같은 자연 키를 upsert한다.
- 사진은 원본 URL과 메타데이터만 보관하며 원본 이미지를 별도 복제하지 않는다.

## 저장 원문과 파생 자료의 일치

2.0의 `pnpm db:derived:check`와 `pnpm db:derived:sync`는 동반 카탈로그 스키마와 준비 건수를
읽기 전용으로 확인한다. 기존 저부담 후보 재평가·요약 일괄 입력은 실행하지 않는다.
운영 배포는 `--require-data`로 준비된 카탈로그가 없으면 앱 교체 전에 중단한다.
최초 적용 때는 새 ops 이미지로 추가형 마이그레이션·국문 원문 입력·기본 정보 등록을 먼저 완료한다.
상세 절차와 입력 파일 검증은 [동반 추천 문서](./pets-and-dog-outings.md)를 따른다.

아래 원문 복원은 기존 장소의 편집 자료 관리 절차다. 요약·행동 문구 누락만으로
새 동반 카탈로그에서 탈락시키지 않는다.

- 원문은 남아 있지만 가공 필드만 비어 있으면 `scripts/repair-place-editorial-fields.ts --ids ...`
  로 대상을 확인하고 `--apply`로 복원한다. 기존 편집값은 덮어쓰지 않으며 외부 API는 호출하지 않는다.
- 누락된 요약·행동 문구는 저장 원문에서 확인되는 내용만 추가한다. 원문의 건강 효능 주장을
  요약에 그대로 확대 재생산하지 않는다.
- 체류시간 원문이 바뀌면 입력 사본과 판정 근거를 함께 검토한다. 2026-11-10 확인한
  진주어린이박물관의 `약 1~2시간`은 기존 60~120분 범위를 유지하며 일반 90분은 중간값이다.
  직접 재검토한 결과는 `manual_override`로 기록한다.
- 입력 파일 수정만으로 운영 DB가 바뀌지는 않는다. 구 파생 자료의 일괄 반영은
  `db:derived:sync:legacy`로 분리했다. 이 명령은 구 후보 상태를 재평가하므로 자동 배포에 넣지 않는다.
