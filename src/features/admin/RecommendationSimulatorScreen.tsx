"use client";

import styled from "@emotion/styled";
import { ArrowLeft, MapPin, Play, Route, TimerReset } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  adminJsonRequest,
  AdminApiError,
  fetchAdminJson,
} from "@/lib/adminApi";
import type { TutiPlace } from "@/lib/recommendations";
import type {
  AdminRecommendationScoreBreakdown,
  AdminRecommendationSimulationRequest,
  AdminRecommendationSimulationResponse,
  AdminOverviewResponse,
} from "@/shared/api/admin";
import { tourApiSidoOptions } from "@/shared/tourism/tourApiRegions";
import type {
  AirAnswer,
  BudgetAnswer,
  CompanionAnswer,
  DensityAnswer,
  MovementAnswer,
} from "@/shared/tuti/types";

type LocationMode = "location" | "region" | "none";
type SimulationCandidate =
  AdminRecommendationSimulationResponse["candidates"][number];

const movementOptions: Array<{ value: MovementAnswer; label: string; hint: string }> = [
  { value: "near", label: "집 근처", hint: "대중교통 20분 안쪽" },
  { value: "short", label: "조금만", hint: "대중교통 20~50분" },
  { value: "half", label: "반나절 정도", hint: "대중교통 45~100분" },
];

const airOptions: Array<{ value: AirAnswer; label: string }> = [
  { value: "quiet", label: "조용한 곳" },
  { value: "open", label: "트인 곳" },
  { value: "walk", label: "걷기 좋은 곳" },
];

const densityOptions: Array<{ value: DensityAnswer; label: string }> = [
  { value: "quiet", label: "조금 한적하게" },
  { value: "balanced", label: "적당히 북적여도" },
  { value: "lively", label: "활기찬 곳도" },
];

const scoreLabels: Record<keyof AdminRecommendationScoreBreakdown, string> = {
  base: "기본 피로도",
  physicalDistance: "직선거리",
  travelTime: "이동시간",
  movementPenalty: "이동 범위",
  moodAdjustment: "공기 성향",
  crowdPenalty: "혼잡도",
  energyPenalty: "에너지 부담",
  executionPenalty: "시간·운영 적합도",
  transferPenalty: "환승 부담",
  walkingPenalty: "실제 도보 부담",
  weatherPenalty: "도착 시각 날씨",
  companionPenalty: "동행자 적합도",
  budgetPenalty: "입장 예산 적합도",
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "medium",
});

export function RecommendationSimulatorScreen() {
  const [locationMode, setLocationMode] = useState<LocationMode>("location");
  const [movement, setMovement] = useState<MovementAnswer>("short");
  const [air, setAir] = useState<AirAnswer>("quiet");
  const [density, setDensity] = useState<DensityAnswer>("balanced");
  const [companion, setCompanion] = useState<CompanionAnswer | undefined>();
  const [budget, setBudget] = useState<BudgetAnswer | undefined>();
  const [latitude, setLatitude] = useState("37.5665");
  const [longitude, setLongitude] = useState("126.9780");
  const [areaCode, setAreaCode] = useState("1");
  const [result, setResult] =
    useState<AdminRecommendationSimulationResponse | null>(null);
  const [resultLocationMode, setResultLocationMode] =
    useState<LocationMode>("location");
  const [loading, setLoading] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<number | null>(null);

  const selectedRegion = useMemo(
    () => tourApiSidoOptions.find(([code]) => code === areaCode),
    [areaCode],
  );

  useEffect(() => {
    let active = true;

    void fetchAdminJson<AdminOverviewResponse>("overview")
      .then(() => {
        if (active) setAccessStatus(null);
      })
      .catch((accessError) => {
        if (!active) return;
        setError(
          accessError instanceof Error
            ? accessError.message
            : "관리자 권한을 확인하지 못했어요.",
        );
        setAccessStatus(
          accessError instanceof AdminApiError ? accessError.status : null,
        );
      })
      .finally(() => {
        if (active) setCheckingAccess(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const request: AdminRecommendationSimulationRequest = {
      answers: { movement, air, density, companion, budget },
    };

    if (locationMode === "location") {
      request.location = {
        latitude: Number(latitude),
        longitude: Number(longitude),
      };
    } else if (locationMode === "region" && selectedRegion) {
      request.preferredRegion = {
        areaCode: selectedRegion[0],
        name: selectedRegion[1],
      };
    }

    try {
      const response =
        await fetchAdminJson<AdminRecommendationSimulationResponse>(
          "recommendation-simulator",
          adminJsonRequest("POST", request),
        );
      setResult(response);
      setResultLocationMode(locationMode);
      setAccessStatus(null);
    } catch (simulationError) {
      setError(
        simulationError instanceof Error
          ? simulationError.message
          : "추천 시뮬레이션을 실행하지 못했어요.",
      );
      setAccessStatus(
        simulationError instanceof AdminApiError
          ? simulationError.status
          : null,
      );
    } finally {
      setLoading(false);
    }
  };

  if (checkingAccess) {
    return (
      <AccessPage>
        <AccessLoading role="status">
          관리자 권한을 확인하고 있어요.
        </AccessLoading>
      </AccessPage>
    );
  }

  if (accessStatus === 401 || accessStatus === 403) {
    return (
      <AccessPage>
        <AccessCard>
          <strong>Tuti Admin</strong>
          <h1>{accessStatus === 401 ? "로그인이 필요해요." : "관리자 권한이 필요해요."}</h1>
          <p>{error}</p>
          <PrimaryLink href="/login">로그인하기</PrimaryLink>
          <TextLink href="/">서비스로 돌아가기</TextLink>
        </AccessCard>
      </AccessPage>
    );
  }

  return (
    <Page>
      <Header>
        <HeaderInner>
          <BackLink href="/admin?section=funnel">
            <ArrowLeft aria-hidden="true" />
            관리자 콘솔
          </BackLink>
          <HeaderCopy>
            <span>추천 품질 검증</span>
            <h1>추천 시뮬레이터</h1>
            <p>사용자 조건을 재현하고 장소별 점수와 선정 근거를 확인합니다.</p>
          </HeaderCopy>
        </HeaderInner>
      </Header>

      <Content>
        <ConditionPanel
          as="form"
          aria-busy={loading}
          aria-describedby={error ? "simulation-error" : undefined}
          onSubmit={submit}
        >
          <PanelHeading>
            <div>
              <span>테스트 조건</span>
              <h2>사용자 상태 재현</h2>
            </div>
            <ResetButton
              type="button"
              onClick={() => {
                setLocationMode("location");
                setMovement("short");
                setAir("quiet");
                setDensity("balanced");
                setCompanion(undefined);
                setBudget(undefined);
                setLatitude("37.5665");
                setLongitude("126.9780");
                setAreaCode("1");
              }}
            >
              <TimerReset aria-hidden="true" />
              초기화
            </ResetButton>
          </PanelHeading>

          <FieldGroup>
            <FieldLabel>추천 기준</FieldLabel>
            <SegmentedGrid $columns={3}>
              {([
                ["location", "현재 위치", "실제 경로 계산"],
                ["region", "선택 지역", "위치 거부 흐름"],
                ["none", "전국", "지역 조건 없음"],
              ] as const).map(([value, label, hint]) => (
                <OptionButton
                  key={value}
                  type="button"
                  $active={locationMode === value}
                  aria-pressed={locationMode === value}
                  onClick={() => setLocationMode(value)}
                >
                  <strong>{label}</strong>
                  <span>{hint}</span>
                </OptionButton>
              ))}
            </SegmentedGrid>
          </FieldGroup>

          {locationMode === "location" ? (
            <CoordinateGrid>
              <LabeledInput>
                <span>위도</span>
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                  required
                />
              </LabeledInput>
              <LabeledInput>
                <span>경도</span>
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                  required
                />
              </LabeledInput>
            </CoordinateGrid>
          ) : locationMode === "region" ? (
            <LabeledInput>
              <span>추천 지역</span>
              <select value={areaCode} onChange={(event) => setAreaCode(event.target.value)}>
                {tourApiSidoOptions.map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
            </LabeledInput>
          ) : (
            <ModeNotice>위치와 지역 조건 없이 전체 추천 풀에서 계산합니다.</ModeNotice>
          )}

          <FieldGroup>
            <FieldLabel>오늘 닿을 수 있는 거리</FieldLabel>
            <SegmentedGrid $columns={3}>
              {movementOptions.map((option) => (
                <OptionButton
                  key={option.value}
                  type="button"
                  $active={movement === option.value}
                  aria-pressed={movement === option.value}
                  onClick={() => setMovement(option.value)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.hint}</span>
                </OptionButton>
              ))}
            </SegmentedGrid>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>필요한 공기</FieldLabel>
            <CompactOptions>
              {airOptions.map((option) => (
                <CompactButton
                  key={option.value}
                  type="button"
                  $active={air === option.value}
                  aria-pressed={air === option.value}
                  onClick={() => setAir(option.value)}
                >
                  {option.label}
                </CompactButton>
              ))}
            </CompactOptions>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>원하는 분위기</FieldLabel>
            <CompactOptions>
              {densityOptions.map((option) => (
                <CompactButton
                  key={option.value}
                  type="button"
                  $active={density === option.value}
                  aria-pressed={density === option.value}
                  onClick={() => setDensity(option.value)}
                >
                  {option.label}
                </CompactButton>
              ))}
            </CompactOptions>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>보조 조건 · 선택</FieldLabel>
            <OptionalOptions>
              {([
                ["solo", "혼자"],
                ["friend", "친구와"],
                ["partner", "연인과"],
                ["family", "가족과"],
              ] as const).map(([value, label]) => (
                <CompactButton
                  key={value}
                  type="button"
                  $active={companion === value}
                  aria-pressed={companion === value}
                  onClick={() =>
                    setCompanion(companion === value ? undefined : value)
                  }
                >
                  {label}
                </CompactButton>
              ))}
            </OptionalOptions>
            <OptionalOptions>
              {([
                ["free", "입장료 무료"],
                ["under_20000", "입장료 2만원 안쪽"],
              ] as const).map(([value, label]) => (
                <CompactButton
                  key={value}
                  type="button"
                  $active={budget === value}
                  aria-pressed={budget === value}
                  onClick={() => setBudget(budget === value ? undefined : value)}
                >
                  {label}
                </CompactButton>
              ))}
            </OptionalOptions>
          </FieldGroup>

          <RunButton type="submit" disabled={loading} aria-busy={loading}>
            <Play aria-hidden="true" />
            {loading ? "실제 추천 경로를 계산하고 있어요" : "시뮬레이션 실행"}
          </RunButton>
          {error && (
            <ErrorNotice id="simulation-error" role="alert">
              {error}
            </ErrorNotice>
          )}
        </ConditionPanel>

        <ResultArea aria-busy={loading}>
          <ResultAnnouncement role="status" aria-live="polite">
            {loading
              ? "시뮬레이션을 실행하고 있습니다."
              : result
                ? `추천 후보 ${result.candidates.length}개의 비교 결과를 표시했습니다.`
                : ""}
          </ResultAnnouncement>
          {!result ? (
            <EmptyResult>
              <Route aria-hidden="true" />
              <h2>아직 실행 결과가 없어요.</h2>
              <p>조건을 정하고 실행하면 최종 추천과 점수 구성을 보여드려요.</p>
            </EmptyResult>
          ) : (
            <>
              <ResultHeader>
                <div>
                  <span>{result.algorithmVersion}</span>
                  <h2>추천 진단 결과</h2>
                  <p>
                    <time dateTime={result.generatedAt}>
                      {dateFormatter.format(new Date(result.generatedAt))}
                    </time>{" "}
                    · {result.elapsedMs.toLocaleString()}ms
                  </p>
                  <ScoreGuide>총점은 낮을수록 부담이 낮고, 음수 항목은 추천 보너스예요.</ScoreGuide>
                </div>
                <FeatureSummary>
                  <span>에너지 {featureLabel(result.feature.energy)}</span>
                  <span>이동 {movementLabel(result.feature.movement)}</span>
                  <span>혼잡 허용 {crowdToleranceLabel(result.feature.crowdTolerance)}</span>
                </FeatureSummary>
              </ResultHeader>

              <MetricGrid>
                <MetricCard><span>원천 후보</span><strong>{result.sourceCandidateCount.toLocaleString()}</strong></MetricCard>
                <MetricCard><span>제외 반영 후</span><strong>{result.eligibleCandidateCount.toLocaleString()}</strong></MetricCard>
                <MetricCard><span>정밀 비교</span><strong>{result.shortlistCount.toLocaleString()}</strong></MetricCard>
                <MetricCard $accent><span>최종 추천</span><strong>{result.candidates.filter((candidate) => candidate.selected).length}</strong></MetricCard>
              </MetricGrid>

              <CandidateComparison aria-labelledby="candidate-comparison-title">
                <CandidateComparisonHeader>
                  <div>
                    <h3 id="candidate-comparison-title">후보 비교</h3>
                    <p>순위, 이동 부담, 선정 근거를 같은 행에서 비교합니다.</p>
                  </div>
                  <span>{result.candidates.length}개 후보</span>
                </CandidateComparisonHeader>

                <CandidateTableViewport>
                  <CandidateTable>
                    <caption>추천 시뮬레이션 후보 비교</caption>
                    <thead>
                      <tr>
                        <th scope="col">순위</th>
                        <th scope="col">장소</th>
                        <th scope="col">결과</th>
                        <th scope="col">부담 점수</th>
                        <th scope="col">이동</th>
                        <th scope="col">선정 근거</th>
                        <th scope="col">점수 구성</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.candidates.map((candidate) => (
                        <CandidateTableRow
                          key={candidate.place.id}
                          $selected={candidate.selected}
                        >
                          <td>
                            <RankCell>
                              <strong>{candidate.finalRank}</strong>
                              <span>최종</span>
                              {candidate.initialRank && (
                                <small>초기 {candidate.initialRank}위</small>
                              )}
                            </RankCell>
                          </td>
                          <th scope="row">
                            <TablePlace>
                              <CandidateThumbnail
                                $image={candidate.place.image}
                                aria-hidden="true"
                              />
                              <div>
                                <strong>{candidate.place.name}</strong>
                                <span>
                                  {candidate.place.sourceContentType ??
                                    "유형 미상"}
                                </span>
                              </div>
                            </TablePlace>
                          </th>
                          <td>
                            <StatusPill $selected={candidate.selected}>
                              {candidate.selected ? "추천" : "비추천"}
                            </StatusPill>
                          </td>
                          <td>
                            <Score>
                              {candidate.place.fatigueScore ?? "—"}
                              <small>점</small>
                            </Score>
                          </td>
                          <td>
                            <RouteMeta>
                              <span>
                                <MapPin aria-hidden="true" />
                                {formatDistance(
                                  candidate.place.distanceMeters,
                                )}
                              </span>
                              <span>
                                <Route aria-hidden="true" />
                                {formatTravelTime(
                                  candidate.place.travelTimeSummary,
                                )}
                              </span>
                            </RouteMeta>
                          </td>
                          <td>
                            <ReasonText>
                              <strong>
                                {candidate.place.reason ??
                                  "추천 근거 확인 필요"}
                              </strong>
                              <p>
                                {candidate.place.reasonDetail ??
                                  "세부 추천 근거가 없습니다."}
                              </p>
                              {!candidate.selected && (
                                <ExclusionReason>
                                  {getExclusionReason(resultLocationMode)}
                                </ExclusionReason>
                              )}
                            </ReasonText>
                          </td>
                          <td>
                            <CandidateScoreDetails candidate={candidate} />
                          </td>
                        </CandidateTableRow>
                      ))}
                    </tbody>
                  </CandidateTable>
                </CandidateTableViewport>

                <MobileCandidateList role="list" aria-label="추천 후보 비교">
                  {result.candidates.map((candidate) => (
                    <MobileCandidateRow
                      key={candidate.place.id}
                      $selected={candidate.selected}
                    >
                      <MobileCandidateHeader>
                        <div>
                          <RankLine>
                            <StatusPill $selected={candidate.selected}>
                              {candidate.selected ? "추천" : "비추천"}
                            </StatusPill>
                            <span>최종 {candidate.finalRank}위</span>
                            {candidate.initialRank && (
                              <span>초기 {candidate.initialRank}위</span>
                            )}
                          </RankLine>
                          <h4>{candidate.place.name}</h4>
                          <small>
                            {candidate.place.sourceContentType ?? "유형 미상"}
                          </small>
                        </div>
                        <Score data-mobile-score>
                          {candidate.place.fatigueScore ?? "—"}
                          <small>점</small>
                        </Score>
                      </MobileCandidateHeader>

                      <RouteMeta>
                        <span>
                          <MapPin aria-hidden="true" />
                          {formatDistance(candidate.place.distanceMeters)}
                        </span>
                        <span>
                          <Route aria-hidden="true" />
                          {formatTravelTime(
                            candidate.place.travelTimeSummary,
                          )}
                        </span>
                      </RouteMeta>

                      <ReasonText>
                        <strong>
                          {candidate.place.reason ?? "추천 근거 확인 필요"}
                        </strong>
                        <p>
                          {candidate.place.reasonDetail ??
                            "세부 추천 근거가 없습니다."}
                        </p>
                        {!candidate.selected && (
                          <ExclusionReason>
                            {getExclusionReason(resultLocationMode)}
                          </ExclusionReason>
                        )}
                      </ReasonText>

                      <CandidateScoreDetails candidate={candidate} />
                    </MobileCandidateRow>
                  ))}
                </MobileCandidateList>
              </CandidateComparison>

              <RawDetails>
                <summary>결과 JSON 확인</summary>
                <pre>{JSON.stringify(result, null, 2)}</pre>
              </RawDetails>
            </>
          )}
        </ResultArea>
      </Content>
    </Page>
  );
}

function CandidateScoreDetails({
  candidate,
}: {
  candidate: SimulationCandidate;
}) {
  return (
    <BreakdownDetails>
      <summary aria-label={`${candidate.place.name} 세부 점수 구성`}>
        세부 점수
      </summary>
      <ScoreDefinitionList>
        {Object.entries(candidate.breakdown).map(([key, value]) => (
          <div key={key}>
            <dt>
              {scoreLabels[key as keyof AdminRecommendationScoreBreakdown]}
            </dt>
            <dd data-tone={value < 0 ? "bonus" : value > 0 ? "penalty" : "zero"}>
              {formatScoreValue(value)}
            </dd>
          </div>
        ))}
      </ScoreDefinitionList>
    </BreakdownDetails>
  );
}

function formatScoreValue(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function getExclusionReason(locationMode: LocationMode) {
  return locationMode === "location"
    ? "최종 피로도 순위가 추천 6곳 밖이라 제외"
    : "최종 순위와 장소 유형 다양성 제한에 따라 제외";
}

function formatDistance(meters?: number) {
  if (!Number.isFinite(meters)) return "직선거리 없음";
  return meters! < 1_000 ? `${Math.round(meters!)}m` : `${(meters! / 1_000).toFixed(1)}km`;
}

function formatTravelTime(summary?: TutiPlace["travelTimeSummary"]) {
  if (!summary) return "경로 정보 없음";
  const mode = summary.mode === "walking" ? "도보" : "대중교통";
  const transfer = summary.transfers === null
    ? ""
    : ` · 환승 ${summary.transfers}회`;
  return `${mode} ${Math.round(summary.durationSeconds / 60)}분${transfer}`;
}

function featureLabel(value: string) {
  return value === "low" ? "낮음" : value === "soft" ? "부드러움" : "열림";
}

function movementLabel(value: string) {
  return value === "near" ? "집 근처" : value === "half" ? "반나절" : "조금만";
}

function crowdToleranceLabel(value: string) {
  return value === "low" ? "낮음" : value === "high" ? "높음" : "보통";
}

const Page = styled.main`
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: auto;
  background: var(--color-neutral-200);
  color: var(--color-text);
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;

  :where(button, a, input, select, textarea, summary, [tabindex]):focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }
`;

const Header = styled.header`
  border-bottom: 1px solid var(--color-neutral-400);
  background: var(--color-neutral-100);
`;

const HeaderInner = styled.div`
  width: min(1280px, calc(100% - 48px));
  margin: 0 auto;
  padding: var(--space-6) 0;
  display: grid;
  gap: var(--space-5);

  @media (max-width: 768px) {
    width: calc(100% - 32px);
    padding: var(--space-4) 0;
  }
`;

const BackLink = styled(Link)`
  width: fit-content;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
  text-decoration: none;

  svg { width: 20px; height: 20px; }

  &:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 3px;
  }
`;

const HeaderCopy = styled.div`
  display: grid;
  gap: var(--space-1);
  span { color: var(--color-secondary-900); font-size: var(--font-size-100); font-weight: 700; }
  h1 { font-size: var(--font-size-700); line-height: 1.2; }
  p { color: var(--color-text-muted); font-size: var(--font-size-300); }
`;

const Content = styled.div`
  width: min(1280px, calc(100% - 48px));
  margin: 0 auto;
  padding: var(--space-6) 0 var(--space-12);
  display: grid;
  grid-template-columns: minmax(300px, 340px) minmax(0, 1fr);
  align-items: start;
  gap: var(--space-6);

  @media (max-width: 1240px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 768px) {
    width: calc(100% - 24px);
    padding-top: var(--space-4);
  }
`;

const ConditionPanel = styled.section`
  position: sticky;
  top: var(--space-4);
  display: grid;
  gap: var(--space-5);
  padding: var(--space-5);
  border: 1px solid var(--color-neutral-400);
  border-radius: var(--space-2);
  background: var(--color-surface);

  @media (max-width: 1240px) {
    position: static;
  }

  @media (max-width: 480px) {
    padding: var(--space-4);
  }
`;

const PanelHeading = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  span { color: var(--color-secondary-900); font-size: var(--font-size-100); font-weight: 700; }
  h2 { margin-top: var(--space-1); font-size: var(--font-size-500); }
`;

const ResetButton = styled.button`
  min-height: 44px;
  padding: 0 var(--space-3);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border: 0;
  border-radius: var(--space-1);
  background: var(--color-neutral-200);
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--font-size-100);
  cursor: pointer;
  svg { width: 16px; height: 16px; }

  &:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }
`;

const FieldGroup = styled.fieldset`
  min-width: 0;
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: 0;
`;

const FieldLabel = styled.legend`
  margin-bottom: var(--space-2);
  font-size: var(--font-size-200);
  font-weight: 600;
`;

const SegmentedGrid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, minmax(0, 1fr));
  gap: var(--space-2);
`;

const OptionButton = styled.button<{ $active: boolean }>`
  min-height: 68px;
  padding: var(--space-3) var(--space-2);
  display: grid;
  place-content: center;
  gap: var(--space-1);
  border: 1px solid ${({ $active }) => $active ? "var(--color-secondary-900)" : "var(--color-neutral-800)"};
  border-radius: var(--space-1);
  background: ${({ $active }) => $active ? "var(--color-secondary-200)" : "var(--color-surface)"};
  color: var(--color-text);
  font: inherit;
  text-align: center;
  cursor: pointer;
  strong { font-size: var(--font-size-100); }
  span { color: var(--color-text-muted); font-size: var(--font-size-100); line-height: 1.35; }

  &:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }
`;

const CoordinateGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
`;

const LabeledInput = styled.label`
  min-width: 0;
  display: grid;
  gap: var(--space-2);
  > span { font-size: var(--font-size-200); font-weight: 600; }
  input, select, textarea {
    width: 100%;
    min-height: 46px;
    padding: var(--space-3);
    border: 1px solid var(--color-neutral-800);
    border-radius: var(--space-1);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-200);
  }
  textarea { min-height: 82px; resize: vertical; }

  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }
`;

const ModeNotice = styled.p`
  padding: var(--space-3);
  border-left: 3px solid var(--color-brand-800);
  background: var(--color-neutral-200);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const CompactOptions = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
`;

const OptionalOptions = styled(CompactOptions)`
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

const CompactButton = styled.button<{ $active: boolean }>`
  min-height: 44px;
  padding: var(--space-2);
  border: 1px solid ${({ $active }) => $active ? "var(--color-secondary-900)" : "var(--color-neutral-800)"};
  border-radius: var(--space-1);
  background: ${({ $active }) => $active ? "var(--color-secondary-200)" : "var(--color-surface)"};
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-100);
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }
`;

const RunButton = styled.button`
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 0;
  border-radius: var(--space-1);
  background: var(--color-secondary-800);
  color: var(--color-black);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 180ms ease, transform 180ms ease;
  &:disabled { opacity: 0.55; cursor: wait; }
  &:not(:disabled):active { transform: scale(0.985); }
  svg { width: 18px; height: 18px; fill: currentColor; }

  &:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }
`;

const ErrorNotice = styled.p`
  padding: var(--space-3);
  border-left: 3px solid var(--color-error);
  background: var(--color-neutral-100);
  color: var(--color-error);
  font-size: var(--font-size-100);
`;

const ResultArea = styled.section`
  min-width: 0;
  display: grid;
  gap: var(--space-5);
`;

const ResultAnnouncement = styled.p`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

const EmptyResult = styled.div`
  min-height: 420px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-3);
  padding: var(--space-6);
  border: 1px dashed var(--color-neutral-800);
  border-radius: var(--space-2);
  background: var(--color-surface);
  color: var(--color-text-muted);
  text-align: center;
  svg { width: 44px; height: 44px; color: var(--color-secondary-800); }
  h2 { color: var(--color-text); font-size: var(--font-size-400); }
  p { font-size: var(--font-size-200); }
`;

const ResultHeader = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  > div:first-child { display: grid; gap: var(--space-1); }
  > div:first-child > span { color: var(--color-brand-900); font-size: var(--font-size-100); font-weight: 700; }
  h2 { font-size: var(--font-size-600); }
  p { color: var(--color-text-muted); font-size: var(--font-size-100); }
  @media (max-width: 640px) { align-items: flex-start; flex-direction: column; }
`;

const ScoreGuide = styled.small`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const FeatureSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);

  span {
    padding: var(--space-2) var(--space-3);
    border-left: 3px solid var(--color-secondary-900);
    border-radius: 2px;
    background: var(--color-secondary-100);
    font-size: var(--font-size-100);
    font-weight: 600;
  }
`;

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--color-neutral-400);
  border-radius: var(--space-1);
  background: var(--color-surface);

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const MetricCard = styled.div<{ $accent?: boolean }>`
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
  border-right: 1px solid var(--color-neutral-400);
  background: ${({ $accent }) => $accent ? "var(--color-secondary-100)" : "var(--color-surface)"};
  span { color: var(--color-text-muted); font-size: var(--font-size-100); }
  strong { font-size: var(--font-size-600); }

  &:last-of-type {
    border-right: 0;
  }

  @media (max-width: 640px) {
    &:nth-of-type(2n) {
      border-right: 0;
    }

    &:nth-of-type(-n + 2) {
      border-bottom: 1px solid var(--color-neutral-400);
    }
  }
`;

const RankLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  > span { color: var(--color-text-muted); font-size: var(--font-size-100); }
`;

const StatusPill = styled.span<{ $selected: boolean }>`
  width: fit-content;
  padding: 4px 9px;
  border-radius: 999px;
  background: ${({ $selected }) => $selected ? "var(--color-secondary-400)" : "var(--color-neutral-300)"};
  color: var(--color-text) !important;
  font-size: var(--font-size-100);
  font-weight: 700;
  white-space: nowrap;
`;

const Score = styled.strong`
  flex: none;
  font-size: var(--font-size-500);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  small { margin-left: 2px; color: var(--color-text-muted); font-size: var(--font-size-100); font-weight: 500; }
`;

const CandidateComparison = styled.section`
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-neutral-400);
  border-radius: var(--space-1);
  background: var(--color-surface);
`;

const CandidateComparisonHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-neutral-400);

  h3 {
    font-size: var(--font-size-300);
  }

  p,
  > span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  p {
    margin-top: 2px;
  }

  > span {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }
`;

const CandidateTableViewport = styled.div`
  overflow-x: auto;
  overscroll-behavior-x: contain;

  @media (max-width: 640px) {
    display: none;
  }
`;

const CandidateTable = styled.table`
  width: 100%;
  min-width: 840px;
  border-collapse: collapse;
  font-size: var(--font-size-100);

  caption {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  th,
  td {
    padding: var(--space-3);
    border-bottom: 1px solid var(--color-neutral-400);
    text-align: left;
    vertical-align: top;
  }

  thead th {
    position: sticky;
    z-index: 1;
    top: 0;
    background: var(--color-neutral-200);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    font-weight: 700;
    white-space: nowrap;
  }

  tbody th {
    font-weight: inherit;
  }

  tr > :nth-child(1) {
    width: 56px;
  }

  tr > :nth-child(2) {
    width: 180px;
  }

  tr > :nth-child(3) {
    width: 70px;
  }

  tr > :nth-child(4) {
    width: 80px;
  }

  tr > :nth-child(5) {
    width: 130px;
  }

  tr > :nth-child(6) {
    min-width: 200px;
  }

  tr > :nth-child(7) {
    width: 120px;
  }

  tbody tr:last-of-type > * {
    border-bottom: 0;
  }
`;

const CandidateTableRow = styled.tr<{ $selected: boolean }>`
  background: ${({ $selected }) =>
    $selected ? "var(--color-secondary-100)" : "var(--color-surface)"};

  td:first-of-type {
    box-shadow: ${({ $selected }) =>
      $selected
        ? "inset 3px 0 var(--color-secondary-900)"
        : "none"};
  }

  &:hover {
    background: ${({ $selected }) =>
      $selected ? "var(--color-secondary-100)" : "var(--color-brand-100)"};
  }
`;

const RankCell = styled.div`
  display: grid;
  justify-items: start;
  gap: 1px;
  font-variant-numeric: tabular-nums;

  strong {
    font-size: var(--font-size-500);
    line-height: 1;
  }

  span,
  small {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const TablePlace = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);

  > div:last-of-type {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  strong {
    overflow-wrap: anywhere;
    font-size: var(--font-size-200);
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const CandidateThumbnail = styled.div<{ $image: string }>`
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  border-radius: var(--space-1);
  background: var(--color-neutral-300) url(${({ $image }) => JSON.stringify($image)}) center / cover no-repeat;
`;

const RouteMeta = styled.div`
  display: grid;
  gap: var(--space-1);

  span {
    display: inline-flex;
    align-items: flex-start;
    gap: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: 1.4;
  }

  svg {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    margin-top: 1px;
  }
`;

const ReasonText = styled.div`
  min-width: 0;
  display: grid;
  gap: var(--space-1);

  strong {
    font-size: var(--font-size-100);
    overflow-wrap: anywhere;
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
`;

const ExclusionReason = styled.p`
  margin-top: var(--space-1);
  padding-left: var(--space-2);
  border-left: 2px solid var(--color-neutral-700);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const BreakdownDetails = styled.details`
  min-width: 116px;

  summary {
    width: fit-content;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-neutral-800);
    border-radius: var(--space-1);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: var(--font-size-100);
    font-weight: 700;
    cursor: pointer;
  }

  summary::after {
    margin-left: var(--space-2);
    content: "+";
  }

  &[open] summary::after {
    content: "−";
  }

  summary:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }

  &[open] summary {
    margin-bottom: var(--space-2);
    border-color: var(--color-brand-900);
    background: var(--color-brand-100);
  }
`;

const ScoreDefinitionList = styled.dl`
  min-width: 220px;
  display: grid;
  gap: 0;
  margin: 0;
  border-top: 1px solid var(--color-neutral-400);

  > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--color-neutral-300);
  }

  dt,
  dd {
    margin: 0;
    font-size: var(--font-size-100);
  }

  dt {
    color: var(--color-text-muted);
  }

  dd {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  dd[data-tone="bonus"] {
    color: var(--color-secondary-900);
  }

  dd[data-tone="penalty"] {
    color: var(--color-warning);
  }
`;

const MobileCandidateList = styled.ol`
  display: none;
  margin: 0;
  padding: 0;
  list-style: none;

  @media (max-width: 640px) {
    display: grid;
  }
`;

const MobileCandidateRow = styled.li<{ $selected: boolean }>`
  min-width: 0;
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-neutral-400);
  background: ${({ $selected }) =>
    $selected ? "var(--color-secondary-100)" : "var(--color-surface)"};
  box-shadow: ${({ $selected }) =>
    $selected
      ? "inset 3px 0 var(--color-secondary-900)"
      : "none"};

  &:last-of-type {
    border-bottom: 0;
  }

  dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--space-4);
  }

  > details {
    min-width: 0;
  }
`;

const MobileCandidateHeader = styled.div`
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);

  > div {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
  }

  h4 {
    overflow-wrap: anywhere;
    font-size: var(--font-size-300);
  }

  > div > small {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  [data-mobile-score] {
    font-size: var(--font-size-600);
  }
`;

const RawDetails = styled.details`
  border: 1px solid var(--color-neutral-400);
  border-radius: var(--space-1);
  background: var(--color-neutral-100);
  summary { padding: var(--space-4); font-size: var(--font-size-200); font-weight: 600; cursor: pointer; }
  summary:focus-visible { outline: 3px solid var(--color-brand-900); outline-offset: 2px; }
  pre { max-height: 520px; margin: 0; padding: var(--space-4); overflow: auto; border-top: 1px solid var(--color-neutral-400); font-size: 12px; line-height: 1.5; }
`;

const AccessPage = styled.main`
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--space-5);
  background: var(--color-neutral-200);
`;

const AccessLoading = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
`;

const AccessCard = styled.section`
  width: min(420px, 100%);
  display: grid;
  gap: var(--space-4);
  padding: var(--space-6);
  border: 1px solid var(--color-neutral-400);
  border-radius: var(--space-3);
  background: var(--color-surface);
  box-shadow: 0 12px 36px rgb(var(--color-black-rgb) / 0.08);

  > strong { color: var(--color-brand-900); }
  h1 { font-size: var(--font-size-600); }
  p { color: var(--color-text-muted); }
`;

const PrimaryLink = styled(Link)`
  min-height: 48px;
  display: grid;
  place-items: center;
  border-radius: var(--space-1);
  background: var(--color-secondary-800);
  color: var(--color-black);
  font-weight: 700;
  text-decoration: none;

  &:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }
`;

const TextLink = styled(Link)`
  min-height: 44px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  text-decoration: none;

  &:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }
`;
