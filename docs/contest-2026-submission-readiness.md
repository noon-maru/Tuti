# 2026 관광데이터 활용 공모전 제출 준비

이 문서는 기능설명서의 한국관광공사 OpenAPI 활용 내역과 제출 직전 데이터
건수를 동일한 기준으로 유지하기 위한 내부 점검 자료다. 인증키 원문은 문서,
스크린샷, Git 저장소에 남기지 않고 한국관광콘텐츠랩의 지정 입력란에만 제출한다.

## 한국관광공사 OpenAPI 활용표

| 데이터 | 서비스 식별자·호출 작업 | Tuti에서의 실제 활용 | 호출 방식 | 근거 코드 |
| --- | --- | --- | --- | --- |
| 국문 관광정보 | `KorService2` · `areaBasedList2`, `detailCommon2`, `detailIntro2`, `detailInfo2`, `detailImage2`, `searchStay2` | 추천 장소 기본 후보와 주소·좌표·유형 구성, 소개·운영·반복정보·사진 보강, 주변 숙소 조회 | 기본정보 정기 동기화, 상세정보 조회 시 최대 30일 캐시 후 필요할 때 재호출 | `src/server/tourism/tourApiClient.ts`, `src/server/tourism/tourApiDetailClient.ts`, `src/server/tourism/enrichTourismPlaceDetail.ts`, `src/server/accommodations/accommodationService.ts` |
| 웰니스 관광정보 | `WellnessTursmService` · `areaBasedList` | 휴식·회복 성격 장소의 추천 후보 적합도 가산 | 정기 동기화 | `src/server/tourism/wellnessTourismApiClient.ts`, `src/server/recommendations/loadPlaceCandidateAssessments.ts` |
| 기초지자체 중심 관광지 | `LocgoHubTarService1` · `areaBasedList1` | 장소 중심성, 예상 혼잡도 보정, 후속 방문 후보 구성 | 월별 시계열 동기화 | `src/server/tourism/municipalCoreTourismApiClient.ts`, `scripts/refresh-crowd-estimates.ts`, `src/server/departure/departurePlan.ts` |
| 관광지별 연관 관광지 | `TarRlteTarService1` · `areaBasedList1` | 선택 장소와 함께 방문되는 장소를 `조금 더 머물고 싶다면` 후보로 구성한 뒤 Tuti 적합도 적용 | 월별 시계열 동기화 | `src/server/tourism/relatedTourismApiClient.ts`, `src/server/departure/departurePlan.ts` |
| 관광지 집중률 | `TatsCnctrRateService` · `tatsCnctrRatedList` | 서울 실시간 도시데이터가 없는 장소의 관광공사 기반 예상 혼잡도 산출 | 일별 예측값 순환 동기화 | `src/server/tourism/touristSpotConcentrationApiClient.ts`, `src/server/recommendations/crowdForecast.ts` |
| 지역 방문자 수 | `DataLabService` · `metcoRegnVisitrDDList`, `locgoRegnVisitrDDList` | 지역·요일별 방문 압력 산출과 Tuti 예상 혼잡도 계산의 55% 기본 가중치 | 최근 14일 주간 재수집 | `src/server/tourism/regionalVisitorCountApiClient.ts`, `scripts/refresh-crowd-estimates.ts` |
| 지역 관광자원 수요 | `AreaTarResDemService` · `areaTarSvcDemList`, `areaCulResDemList` | 서비스·문화자원 수요를 지역 수요 압력으로 변환하여 Tuti 예상 혼잡도 보정 | 최신 기준월 월간 동기화 | `src/server/tourism/regionalTourismApiClient.ts`, `scripts/refresh-crowd-estimates.ts` |
| 지역 관광수요 밀집도 | `AreaTarDemDsService` · `areaTarSjrnDsList`, `areaTarExpDsList` | 체류·소비 밀집도를 지역 수요 압력으로 변환하여 Tuti 예상 혼잡도 보정 | 최신 기준월 월간 동기화 | `src/server/tourism/regionalTourismApiClient.ts`, `scripts/refresh-crowd-estimates.ts` |
| 관광사진 갤러리 | `PhotoGalleryService1` · `gallerySyncDetailList1` | 사진 원천 메타데이터 수집과 관리자 검증 자료 제공 | 정기 동기화 | `src/server/tourism/tourismPhotoGalleryApiClient.ts`, `src/app/api/admin/tourism-data/route.ts` |

관광사진 갤러리는 현재 사용자 추천 랭킹의 직접 feature가 아니다. 기능설명서에는
관리자 검증용 원천으로 구분하며, 추천에 직접 활용한다고 과장하지 않는다.

## 기능설명서용 활용 흐름

1. `KorService2`의 장소·주소·좌표·유형으로 추천 후보 구성
2. 웰니스 정보와 장소 상세·소개정보로 저부담 상태 전환 적합도 판정
3. 실시간 혼잡도가 있으면 이를 우선 사용하고, 없으면 집중률과 지역 방문·수요
   시계열로 예상 혼잡도 산출
4. 사용자가 고른 장소의 상세·운영정보와 이동 준비 정보 제공
5. 연관 관광지와 중심 관광지 데이터를 조합한 뒤 Tuti 추천 적합 장소만 후속 제안

## 데이터 건수 집계 기준

- `관광지 수`와 월별·일별 관측치를 포함한 `원천 레코드 수`를 구분한다.
- 한국관광공사 원천 레코드 합계에는 9개 데이터셋의 저장 행을 합산한다.
- 국문 관광정보 상세·소개 보강은 같은 콘텐츠의 추가 응답이므로 원천 합계와
  분리하여 표기한다.
- 제출 문서에는 `집계 기준일`과 `운영 DB 기준`을 함께 기재한다.
- API 응답의 중복 여부와 무관한 물리적 저장 행 수이며, 고유 관광지 수로
  해석하지 않는다.

### 2026-09-08 개발·운영 DB 확인값

| 데이터 | 개발 DB | 운영 DB |
| --- | ---: | ---: |
| 국문 관광정보 | 19,256 | 19,256 |
| 웰니스 관광정보 | 173 | 173 |
| 기초지자체 중심 관광지 | 416,868 | 416,868 |
| 관광지별 연관 관광지 | 1,516,186 | 1,516,186 |
| 관광지 집중률 | 460,048 | 460,048 |
| 지역 방문자 수 | 106,903 | 106,903 |
| 관광사진 갤러리 | 102,679 | 102,679 |
| 지역 관광자원 수요 | 139,616 | 139,616 |
| 지역 관광수요 밀집도 | 81,040 | 81,040 |
| **한국관광공사 원천 레코드 합계** | **2,842,769** | **2,842,769** |
| 국문 관광정보 상세·소개 보강(별도) | 17,667 | 17,667 |

집계 기준 시각은 `2026-09-08T10:20:31+09:00`이다. 두 환경의 원천 레코드와
상세·소개 보강 건수가 모두 일치한다. 제출 직전에는 아래 명령을 다시 실행하고,
그때의 운영 DB 값을 최종 제출본에 사용한다.

### 호출 이력 해석

- 외부 OpenAPI는 개발 DB 수집 작업에서 한 번 호출하고 성공한 원천 레코드만
  운영 DB에 증분 반영한다.
- `external_data_sync_runs`는 운영 DB로 이관하지 않으므로 운영 DB의 최근 30일
  실행 이력이 0건인 것은 정상이다. 공공데이터포털 호출 이력은 같은 통합
  인증키 기준으로 별도 확인된다.
- 운영 DB의 국문 관광정보 상세·소개 보강 최근 시각은
  `2026-09-05T13:00:36.325Z`로, 운영 서비스의 필요 시 상세 API 보강이 수행된
  사실을 데이터로 확인할 수 있다.
- 최근 실패 기록은 주로 HTTP 429 호출 한도 응답이다. 성공한 페이지는 저장되고
  실패한 작업은 체크포인트에 완료 처리하지 않아 다음 실행에서 재시도한다.
- 관광지별 연관 관광지의 마지막 실패 뒤에는 성공 실행이 이어졌고, 관광지
  집중률도 2026-09-07 성공 실행으로 재개됐다. 반면 2026-09-04의 기초지자체
  중심 관광지와 지역 관광자원 수요 `serviceDemand` 갱신은 성공 실행 뒤 429가
  발생한 상태이므로 제출 전에 월간 시계열 갱신을 재실행해 확인한다.
- 내부 실행 로그는 API 활용 보조 증빙이며, 제출 시에는 공공데이터포털에서
  확인되는 인증키별 호출 기록을 주 증빙으로 사용한다.

## 제출 직전 재집계 명령

운영 명령을 설치하거나 갱신한 뒤 다음 명령을 실행한다.

```sh
sudo -n /usr/local/sbin/tuti-contest-data-report
```

명령은 개발·운영 DB의 데이터별 행 수, 최초·최근 동기화 시각과 최근 30일
OpenAPI 동기화 실행 이력을 읽기 전용으로 출력한다. 제출 직전 출력은 별도 증빙
파일로 보관하고 기능설명서에는 운영 DB 집계만 반영한다.

## 제출 문구 초안

> Tuti는 한국관광공사 OpenAPI에서 수집한 관광지 기본·상세정보와 웰니스,
> 관광지 집중률, 지역 방문자·수요, 중심·연관 관광지 데이터를 추천 후보 생성,
> 혼잡도 추정 및 후속 방문지 선정에 활용합니다. 2026년 9월 8일 운영 DB 기준
> 총 2,842,769건의 원천 레코드를 활용하며, 이는 월별·일별 관측값을 포함한
> 수치로 고유 관광지 수와 구분됩니다.
