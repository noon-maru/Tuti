# Tuti 문서 안내

문서는 **현재 운영 기준**, **제품·기술 설명**, **향후 계획**, **과거 검토 기록**으로
구분한다. 문서의 오래된 수치·버전보다 실행 중인 코드와 설정을 우선 확인한다.
특히 과거 QA와 사업 시뮬레이션을 현재 기능 또는 성과로 인용하지 않는다.

## 현재 운영 기준

| 영역 | 기준 문서 |
| --- | --- |
| 웹 배포·백업·보안·정기 작업 | [운영 명령](operations.md) |
| Android / iOS 빌드 | [Android 빌드](android-build.md) · [iOS 빌드](ios-build.md) |
| 출시 문구 | [공통 출시 노트](release-notes.md) |
| 관리자 운영 | [관리자 콘솔](admin-console.md) |
| 기록 공개·신고 | [기록 공유](journal-sharing.md) · [기록 웹 공개 운영 지침](journal-publication-operations.md) |
| 알림 | [Android 서버 푸시](android-push-notifications.md) · [iOS 서버 푸시](ios-push-notifications.md) · [로컬 알림](local-notifications.md) |
| 데이터·파일 | [관광 공공데이터 동기화](tourism-data-sync.md) · [오브젝트 스토리지](object-storage.md) |
| 위치정보 | [위치정보 이용 흐름](location-access.md) · [스토어 위치정보 공개](store-location-disclosures.md) · [위치정보 보호 문서](compliance/location-information-protection-plan.md) |

위치정보 보호 문서는 [내부관리계획](compliance/location-information-protection-plan.md),
[자체점검](compliance/location-security-self-inspection.md),
[침해사고 대응](compliance/location-incident-response.md),
[취급자 교육 기록](compliance/location-handler-training-record.md)으로 나뉜다.
작성·승인 이력이 필요한 통제 문서이므로 일반 제품 문서와 임의로 합치지 않는다.

## 현재 제품과 기술

| 주제 | 문서 |
| --- | --- |
| 앱·API 경계 | [Capacitor API 구조](capacitor-api-architecture.md) |
| 위치와 추천 | [추천 이후 행동 루프](recommendation-action-loop.md) · [추천 성능](recommendation-performance.md) · [장소 체류시간 전처리](place-visit-time-preprocessing.md) |
| 개인화 제한 | [LLM 개인화 운영 원칙](llm-personalization.md) — 현재 사용자 AI 개인화는 비활성화 |
| 기록과 기록집 | [기록 공유](journal-sharing.md) · [디지털 기록집](journal-books.md) · [PDF 폰트](pdf-fonts.md) |
| 화면 동작 | [크로스플랫폼 모션](cross-platform-motion.md) |

## 계획과 검증 기준

- [제품 방향과 우선 고객 가설](product-direction.md): 라이프로그 서비스의
  정의, 작은 외출·기록·소장의 방향과 20~25세 여성·커플 고객 가설.
  현재 출시 기능과 구분한다.
- [향후 검토 사양](future-product-specs.md): 아직 제공하지 않는 UI·안전 기능.
- [기록집 BM 적용·검증 계획](journal-book-bm-validation-plan.md): 무료 디지털
  기록집 이후 개인 실물 상품의 정상가 구매를 우선 검증하고 기관 프로그램은
  후순위로 다룬다. 현재 결제 기능이 아니다.
- [iOS 심사 점검표](ios-app-review.md): 제출할 때마다 콘솔·빌드·심사 계정을
  다시 확인하는 템플릿. 이전 버전을 그대로 제출하지 않는다.

## 과거 결정·조사 기록

다음 자료는 당시 판단과 실측을 보존한다. 현재 기능 설명이나 최신 숫자의
단일 출처로 사용하지 않는다.

- [Capacitor 전환 로드맵](capacitor-app-transition-roadmap.md)
- [2026 공모전 제출 준비](contest-2026-submission-readiness.md): 당시 제출용 수치
- [2026-09-08 실사용성 감사](usability-usefulness-audit-2026-09-08.md) ·
  [2026-09-09 재점검](usability-usefulness-recheck-2026-09-09.md)
- [이전 사업모델 탐색](business-model-strategy.md) ·
  [B2C 시나리오](b2c-scenario-exploration.md) ·
  [이전 매출 시뮬레이션](b2c-revenue-simulation.md)
- [Kakao 위치정보 처리 문의 초안](kakao-location-processing-inquiry.md)

문서를 고칠 때는 현재 상태와 제안 상태를 분리하고, 날짜가 있는 관측값에는
측정 시점·환경을 남긴다. 기능을 출시하거나 비활성화하면 이 안내와 해당
운영 문서를 같이 갱신한다.
