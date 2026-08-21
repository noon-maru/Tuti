# 앱스토어 위치정보 공개 체크리스트

## 공통 원칙

- 앱 실행 직후가 아니라 이용자가 `장소 확인하기`를 선택한 뒤 Tuti 약관 동의와 OS 권한을 순서대로 요청한다.
- 정밀 위치는 주변 추천, 이동 부담, 예상 이동시간과 출발 계획에만 사용한다.
- 백그라운드 위치와 지속 위치 추적은 사용하지 않는다.
- 현재 좌표는 계정·저널·추천 이력에 원본 형태로 저장하지 않는다.
- 사진 EXIF 촬영 위치는 현행 위치약관 동의가 있을 때만 주변 장소 자동 선택에 일시 이용하고 업로드 전에 제거한다.
- 권한 거부 시 지역 직접 선택 추천을 제공한다.

## Apple App Store Connect

- App Privacy의 `Location > Precise Location`을 서비스 기능 목적으로 공개한다.
- Tracking 목적은 선택하지 않는다.
- 계정과 연결 여부는 원본 좌표 미저장 구조와 Apple의 최신 질문 문구를 대조하여 제출 시 다시 확인한다.
- `NSLocationWhenInUseUsageDescription`에는 “현재 위치에 맞는 장소와 이동시간을 추천하기 위해 사용합니다. 위치는 백그라운드에서 추적하지 않습니다.”와 같은 구체적 목적을 기재한다.
- 백그라운드 위치 capability와 Always 권한 요청은 사용하지 않는다. Capacitor
  Geolocation 8의 기반 라이브러리가 요구하는
  `NSLocationAlwaysAndWhenInUseUsageDescription` 목적 문구는 포함하지만 실제
  Always 권한 프롬프트를 요청하지 않는다.

## Google Play Console

- Data safety의 `Location > Precise location`을 앱 기능 제공 목적으로 공개한다.
- 데이터 판매·광고·교차 앱 추적 목적은 선택하지 않는다.
- 포그라운드 위치 권한만 선언하고 백그라운드 위치 권한은 선언하지 않는다.
- 데이터 삭제 요청 경로로 `admin@tuti.today`와 서비스 내 위치 설정을 안내한다.

## 배포 전 확인

1. 공개 개인정보 처리방침 URL을 `https://tuti.today/legal/privacy`로 등록
2. 공개 위치약관 URL을 `https://tuti.today/legal/location-terms`로 등록
3. Kakao 좌표 처리 관계가 `processor`로 서면 확인되기 전 `LOCATION_EXTERNAL_COORDINATE_MODE=pending` 유지
4. 제3자 제공으로 확인되면 `third_party`를 바로 활성화하지 않고 별도 동의·제공사실 통보 기능을 먼저 구현
