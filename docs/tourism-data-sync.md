# 관광 공공데이터 동기화

관광 원천 데이터는 공급자의 식별자와 기준 시점으로 레코드를 식별한다. 동기화는
각 테이블의 유니크 제약을 대상으로 Prisma `upsert`를 사용하므로, 동일한 범위를
다시 수집해도 기존 레코드를 갱신한다. `rawPayload`에는 공급자 응답 원문을 유지하고,
`syncedAt`에는 마지막 수집 시각을 기록한다.

## 정기 동기화 대상과 자연 키

| 데이터 | 테이블 | 유니크 키 | 권장 주기 |
| --- | --- | --- | --- |
| 관광정보 | `tourism_place_source_records` | `contentId` | 일 1회 및 수정분 수집 |
| 웰니스 관광 | `wellness_tourism_source_records` | `contentId`, `langDivCd` | 일 1회 |
| 중심 관광지 | `municipal_core_tourism_source_records` | `baseYm`, `areaCode`, `sigunguCode`, `touristSpotCode` | 월 1회 |
| 지역 방문자 수 | `regional_visitor_count_records` | `aggregationLevel`, `baseYmd`, `regionCode`, `weekdayCode`, `visitorTypeCode` | 일 1회 |
| 관광사진 갤러리 | `tourism_photo_gallery_source_records` | `contentId` | 수정일 기준 일 1회 |
| 지역 관광 지표 | `tourism_region_metrics` | `metricType`, `metricCode`, `baseYm`, `areaCode`, `sigunguCode` | 월 1회 |

`metricType`은 서비스 수요·문화자원 수요·숙박 강도·소비 강도를 구분한다. 각
`metricType`은 하나의 원천 데이터셋에만 대응하므로 유니크 키에 `dataset`을 중복해
넣지 않는다.

## 관광지 지역 분류

TourAPI 관광지는 원본의 `areaCode`, `sigunguCode`와 함께 사람이 읽을 수 있는
`sidoName`, `sigunguName`을 저장한다. 시도명은 TourAPI 지역 코드표로 확정하고,
시군구명은 원본 도로명 주소에서 추출한다. 추천 풀에는 `source = tourapi`인 승인된
장소만 포함하므로 UI 검증용 목업 장소가 섞이지 않는다.

TourAPI의 지역 코드는 관광 데이터랩의 법정 지역 코드와 다른 체계다. 집중률·방문자
데이터를 연결할 때 두 코드를 직접 동일시하지 않고, 중심 관광지 원천 데이터의 장소명과
법정 지역 코드를 기준으로 연결한다.

## 실시간 활용 대상

관광지 집중률 방문자 추이 예측 정보는 추천을 요청하는 시점에 서버에서 직접 호출한다.
응답은 필요하면 감사·장애 대응용으로
`tourist_spot_concentration_rate_records`에 저장할 수 있으며, 중복 기준은
`baseYmd`, `areaCode`, `sigunguCode`, `touristSpotName`이다. 이 데이터는 정기
동기화 결과가 아니라 추천 응답의 최신성 보강에 사용한다. 이 데이터는 실측 혼잡도가
아닌 관광공사 방문 패턴 기반의 예측값이므로 UI에는 `예상 혼잡도`로만 표시한다.

추천 호출에서 원천 API를 읽지 못하면 최근 48시간 안에 저장한 같은 관광지의 예측값을
사용하고, 그것도 없으면 같은 요일의 누적 예측값 3건 이상으로 평시 예상 집중률을
계산한다. 어느 기준도 충분하지 않으면 정적인 장소 혼잡도만 사용하며, 예측 데이터가
있는 것처럼 표시하지 않는다.

## 동기화 실행 원칙

- 각 실행 결과는 `external_data_sync_runs`에 남긴다.
- 정기 작업은 공급자 데이터가 갱신된 단위(일·월)만 요청한다.
- 실패 시 기존 레코드를 지우지 않는다. 다음 실행에서 같은 자연 키를 upsert한다.
- 사진은 원본 URL과 메타데이터만 보관하며 원본 이미지를 별도 복제하지 않는다.
