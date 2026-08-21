# LLM 개인화 운영 원칙

## 역할

Tuti의 LLM은 사용자와 대화하는 챗봇이 아니다. 현재 출시 구성에서는 공개된
관광지 원천정보로 장소의 성격만 낮은 빈도로 구조화한다. 이용자의 질문 답변,
행동 이력, 기록과 위치는 외부 AI로 전송하지 않는다.

추천 API 요청 중에는 OpenAI를 호출하지 않는다. 오늘 사용자가 고른 거리,
공기, 분위기, 동행자와 예산은 결정론적 규칙으로 즉시 해석하며 과거 프로필보다
항상 우선한다. 거리 제한, 운영 여부, 혼잡도, 이동시간과 추천풀 검수 같은 사실
판단도 기존 코드와 원천 데이터가 담당한다.

## 두 프로필

- `place_meaning_profiles`: 관광지 상세·소개정보를 quietness, openness,
  walkability, sensoryIntensity, soloFriendliness, decisionBurden,
  stayBurden, novelty의 0~1 값으로 구조화한다. 원천 지문이 바뀐 장소만 다시
  생성한다.
- `user_signal_profiles`: 향후 명시적 동의·철회·기존 데이터 삭제 기능을 갖춘
  뒤에만 다시 검토할 보류 기능이다. 현재 데이터는 배포 마이그레이션에서
  삭제하며 `TUTI_USER_AI_PROFILING_ENABLED=false`로 생성을 차단한다.

프로필에는 모델, 버전, 생성시각, 신뢰도와 원천 커서를 저장한다. OpenAI가
실패하거나 키가 없어도 기존 추천은 그대로 동작한다.

## 적용 단계

`TUTI_PERSONALIZATION_MODE`로 적용 범위를 제어한다.

- `off`: 프로필을 조회하지 않는다.
- `shadow`: 별도 검증 환경에서 기존 결과를 그대로 반환하고 가상의 개인화 순위만
  `recommendation_runs.personalization`에 기록한다.
- `active`: 충분한 비교 검증 후에만 사용한다. 이미 통과한 후보의 원래 순위를
  기준으로 최대 약 두 칸의 동점권 보정만 허용한다.

출시 기본값은 `off`다. shadow 비교에서는 추천 결과 다양성, 길찾기 전환, 기록 전환과 특정 장소의
과노출을 함께 확인한다. 프로필 신뢰도가 0.35 미만이면 순위를 계산하지 않는다.

## 배치 실행

운영 명령을 다시 설치한 뒤 아래 명령을 스케줄러에서 실행한다.

```sh
sudo sh scripts/ops/install-tuti-operations.sh
sudo -n /usr/local/sbin/tuti-llm-profile-refresh
```

기본 실행은 개발·운영 DB에서 변경된 장소 100곳만 처리한다.
`TUTI_LLM_PLACE_LIMIT`로 한도를 조절할 수 있다. 장소 상세정보 보강 작업 뒤
매일 한 차례 실행하는 구성이 적당하다. 사용자 프로필 명령은
`TUTI_USER_AI_PROFILING_ENABLED=true`가 아니면 실행을 거부한다.

## 계정 병합과 삭제

익명 상태에서 기존 계정에 로그인할 때 사용자가 `병합`을 명시한 경우에만
추천 실행과 행동 신호를 계정으로 옮긴다. `기존 계정 사용`을 고르면 익명
신호는 익명 사용자 삭제와 함께 제거된다. 현재 출시 구성에서는 사용자 AI
프로필을 생성하거나 추천에 적용하지 않는다.
