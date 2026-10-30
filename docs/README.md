# Tuti 문서 안내

정리 기준: 2026-10-29. 현재 제품은 **마디를 하루마디에 채워 소장하는 라이프로그 서비스**다.
홈은 책장이며 작은 여행은 별도 화면이다. 실물 주문·결제·배송과 사용자 LLM 개인화는 제공하지 않는다.

## 문서를 읽는 순서

| 목적 | 기준 문서 |
| --- | --- |
| 서비스·개발 시작 | [저장소 README](../README.md) |
| 제품 방향·고객 가설 | [제품 방향](./product-direction.md) |
| 화면 흐름·마디·하루마디·PDF | [마디 작성](./madi.md) · [하루마디 구현](./harumadi.md) |
| 웹·앱·서버 경계·인증 | [Capacitor API 구조](./capacitor-api-architecture.md) |
| 시행 원문·선택 동의·개인정보 | [법적 문서 안내](./legal/README.md) |
| 현재 버전의 출시 문구 | [출시 노트](./release-notes.md) |

## 개발·배포·운영

| 영역 | 문서 |
| --- | --- |
| 웹 수동 배포·백업·복구 | [운영 명령](./operations.md) |
| env 예제·직접 편집 기준 | [운영 설정](./operations.md#env-예제의-역할과-편집-경계) |
| 런타임·보안 업데이트 | [Node 실행 기준](./node-runtime.md) |
| 네이티브 빌드·스토어 업로드 | [Android](./android-build.md) · [iOS](./ios-build.md) |
| 스토어 제출 점검 | [iOS 심사 체크리스트](./ios-app-review.md) · [위치정보 공개](./store-location-disclosures.md) |
| 관리자·권한·로그 | [관리자 콘솔](./admin-console.md) · [라이프로그 지표](./admin-lifelog-metrics.md) |
| 상주 ops worker·예약 실행 | [운영 작업 컨테이너](./ops-workers.md) |
| 객체 스토리지 | [오브젝트 스토리지](./object-storage.md) |
| 공공데이터 | [관광 데이터 동기화](./tourism-data-sync.md) · [장소 체류시간 전처리](./place-visit-time-preprocessing.md) |
| 푸시·로컬 알림 | [Android 푸시](./android-push-notifications.md) · [iOS 푸시](./ios-push-notifications.md) · [로컬 알림](./local-notifications.md) |
| 개인정보 예약 정리·원장·보관 | [자동화](./legal/privacy-automation-operations.md) · [복원 방지](./legal/privacy-replay-operations.md) · [보관기한](./legal/operational-retention.md) |

## 제품·기술

| 영역 | 문서 |
| --- | --- |
| 위치·권한·지역 선택 | [위치 흐름](./location-access.md) |
| 추천과 이후 행동 | [행동 루프](./recommendation-action-loop.md) |
| 성능·과거 측정값 | [추천 성능](./recommendation-performance.md) · [시작·약관 확인](./startup-performance.md) |
| AI 역할과 제한 | [LLM 개인화 원칙](./llm-personalization.md) |
| PNG·웹 공유와 권리 대응 | [기록 공유](./journal-sharing.md) · [공개 운영](./journal-publication-operations.md) |
| 글꼴·애니메이션 | [PDF 폰트](./pdf-fonts.md) · [모션](./cross-platform-motion.md) |
| 브랜드 원본 | [에셋 README](../assets/README.md) |

위치 보호의 승인·작성 기록은 별도 통제 문서로 유지한다:
[내부관리계획](./compliance/location-information-protection-plan.md),
[자체점검](./compliance/location-security-self-inspection.md),
[사고 대응](./compliance/location-incident-response.md),
[취급자 교육](./compliance/location-handler-training-record.md).
이 양식이 존재한다고 점검·교육·신고가 완료된 것은 아니다.

## 계획과 과거 기록

- [하루마디 BM 검증 계획](./harumadi-bm-validation-plan.md): 실물 상품·자동 초안·주문 등 **미구현 계획**.
- [향후 검토 사양](./future-product-specs.md): 미제공 후보. 실행 약속이나 출시 일정이 아니다.
- [함께 채우기](./harumadi-together.md): 여러 명의 하루마디 공동작성 구현·전환 기준. 운영 제공 여부는 별도다.
- [과거 기록 안내](./archive/README.md): 이전 BM을 통합한 요약, 앱 전환, 공모전·QA·약관 검토 이력.
- 법적 문서의 초안·확정본·운영 절차 구분은 [법적 문서 안내](./legal/README.md)를 따른다.

## 저장소 전체 문서 관리 기준

이 기준은 루트·각 디렉터리 README, `docs/**` 및 저장소의 모든 직접 관리 문서에 적용한다.

1. **한 주제에 기준 문서 하나:** README는 입구로 두고 상세 절차는 링크한다. 기능 설명을
   여러 문서에 복제하지 않는다. 제품 방향·구현·운영·계획·관측 이력을 구분한다.
2. **현재 코드를 먼저 대조:** 경로·필드·환경변수·명령은 실제 소스와 맞춘다. 내부
   `journal` 식별자나 승인 원문을 UI의 ‘마디’ 용어로 무조건 치환하지 않는다.
3. **상태를 명시:** 계획은 계획으로, 완료된 전환은 과거 기록으로 쓴다. ‘이번 작업’,
   ‘로컬 구현’, ‘아직 미시행’ 같은 상대 시점은 날짜와 적용 범위를 붙이거나 제거한다.
4. **중복·폐기 문서 정리:** 유효한 내용은 기준 문서에 합치고 이전 수익 가정·완료된
   체크리스트는 제거한다. 보존할 실측·승인 근거는 `archive/`로 옮겨 현행 지침과 분리한다.
   삭제 전문은 Git 이력으로 복구할 수 있다.
5. **측정과 완료를 과장하지 않음:** 수치에는 날짜·환경·커밋·한계를 남긴다. 코드 구현,
   DB 적용, 운영 활성화, 실기기 확인, 스토어 업로드·심사·공개 출시는 별개다.
6. **보호 자료 제외:** 승인 약관·해시·마이그레이션·감사 증거는 일반 문서처럼 정정·삭제하지
   않는다. 비공개 운영 증거와 생성물·벤더 README도 출처의 보존·생성 절차를 따른다.
   백업 제외 테이블 TXT는 실행 정책 입력이지 폐기 가능한 메모가 아니다.
7. **안전한 예시:** 비밀값·사용자 본문을 넣지 않는다. 파괴적 명령은 고정된 과거 계정 수·해시를
   재사용하지 않으며 새 대상·권한·승인을 확인한다. 문서 정리는 실제 운영 변경을 승인하지 않는다.
8. **변경 검증:** `pnpm docs:check`와 `git diff --check`를 실행한다. 약관 관련 변경은
   `pnpm exec tsx scripts/verify-bundled-legal-documents.ts`로 무결성도 확인한다.
   UI·API·DB·배포 동작이 바뀌면 관련 문서와 이 색인을 같은 작업에서 갱신한다.
