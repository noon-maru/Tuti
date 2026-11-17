"use client";

import type { ReactNode } from "react";
import styled from "@emotion/styled";
import { ChevronDown, Navigation, PenLine } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";
import { DogAccessNotice } from "@/features/tuti/components/DogAccessNotice";
import { createOverviewPreview } from "@/features/tuti/lib/placeOverviewSummary";
import { createVisitInformationFacts } from "@/features/tuti/lib/visitInformation";
import { createDestinationGuidanceUrl } from "@/features/tuti/lib/departureDestination";
import { showToast } from "@/lib/feedback";
import { getCrowdForecastBasisLabel, getCrowdForecastKindLabel, getCrowdForecastLevelLabel, getWeatherForecastLabel, type TutiPlace } from "@/lib/recommendations";
import type { PlaceDetailResponse } from "@/shared/api/placeDetails";

/** Reading content is separate from the existing photo/drag/history presentation. */
export function PlaceDetailBody({ place, response, pending, failed, onRetry, onCreateMadi, photos }: {
  place: TutiPlace; response?: PlaceDetailResponse; pending: boolean; failed: boolean;
  onRetry: () => void; onCreateMadi?: () => void; photos?: ReactNode;
}) {
  const detail = response?.detail ?? null;
  const rawOverview = detail?.overview?.trim();
  const activity = detail?.experienceGuide?.trim() || response?.place.suggestedAction?.trim();
  const summary = createOverviewPreview(detail?.overviewSummary ?? null, rawOverview ?? null, /노출 전 상세 내용을 확인|TourAPI에서 가져온 장소/.test(place.note) ? "자세한 장소 소개는 아직 준비되지 않았어요." : place.note);
  const facts = createVisitInformationFacts(detail);
  const direction = createDestinationGuidanceUrl({ name: place.name, latitude: response?.place.latitude ?? place.latitude, longitude: response?.place.longitude ?? place.longitude });
  const hasOriginal = rawOverview && rawOverview.replace(/\s+/g, " ").trim() !== summary.trim();
  const uncertain = facts.some(fact => fact.needsVerification);
  return <Body>
    {summary && <Introduction aria-label="장소 소개">{summary}</Introduction>}
    {failed && <RequestStatus role="alert"><p>방문 정보를 불러오지 못했어요.</p><Retry type="button" onClick={onRetry}>다시 불러오기</Retry></RequestStatus>}
    {place.dogAccess && <Block><DogAccessNotice access={place.dogAccess} /></Block>}

    {activity && <Activity>
      <h2>{place.dogAccess ? "함께 보낼 시간" : "여기서 보낼 시간"}</h2>
      <p>{activity}</p>
    </Activity>}

    <Block aria-labelledby={`visit-${place.id}`}>
      <h2 id={`visit-${place.id}`}>가기 전에</h2>
      {pending ? <RequestStatus role="status"><p>방문 정보를 확인하고 있어요.</p></RequestStatus> : <>
        <Facts>
          <Fact><dt>주소</dt><dd>{response?.place.address || "주소 정보 확인 필요"}</dd></Fact>
          {facts.map(fact => <Fact key={fact.key}><dt>{fact.label}{fact.needsVerification && <small>확인 필요</small>}</dt><dd>{fact.value}</dd></Fact>)}
          {detail?.reservation && <Fact><dt>예약</dt><dd>{detail.reservation}</dd></Fact>}
          {detail?.phone && <Fact><dt>문의</dt><dd>{detail.phone}</dd></Fact>}
        </Facts>
        {uncertain && <Hint>미기재되었거나 확인이 필요한 항목은 방문 전 운영 안내를 확인해주세요.</Hint>}
      </>}
    </Block>

    {photos && <Block><h2>조금 더 둘러보기</h2>{photos}</Block>}

    {(direction || onCreateMadi) && <NextStep aria-label="장소에서 다음 행동">
      <h2>마음에 남는 곳이라면</h2>
      <p>함께 보낼 하루를 생각해보세요.<br />다녀온 순간은 마디로 남길 수 있어요.</p>
      <Actions>
        {direction && <Directions href={direction} target="_blank" rel="noopener noreferrer" onClick={event => {
          if (!Capacitor.isNativePlatform()) return;
          event.preventDefault();
          void Browser.open({ url: direction }).catch(() => showToast("길찾기를 열지 못했어요. 잠시 후 다시 시도해주세요."));
        }}><Navigation size={18} aria-hidden="true" />길찾기</Directions>}
        {onCreateMadi && <CreateMadi type="button" onClick={onCreateMadi}><PenLine size={18} aria-hidden="true" />마디 남기기</CreateMadi>}
      </Actions>
    </NextStep>}

    <More>
      <summary><span>원문·정보 출처</span><ChevronDown size={17} aria-hidden="true" /></summary>
      <SourceContent>
        {hasOriginal && <section><h3>장소 소개 원문</h3><p>{rawOverview}</p></section>}
        {detail?.homepage && <section><h3>홈페이지 안내</h3><p>{detail.homepage}</p></section>}
        {place.crowdForecast && <section><h3>{getCrowdForecastBasisLabel(place.crowdForecast)}</h3><p>{getCrowdForecastKindLabel(place.crowdForecast)} · {getCrowdForecastLevelLabel(place.crowdForecast)}</p><p>{crowdEvidence(place.crowdForecast)}</p></section>}
        {!place.crowdForecast && place.crowd && place.crowd !== "정보 없음" && <section><h3>혼잡도 참고</h3><p>{place.crowd}</p></section>}
        {place.weatherForecast && <section><h3>기상청 단기예보</h3><p>{getWeatherForecastLabel(place.weatherForecast)}</p><p>실제 날씨는 달라질 수 있어요.</p></section>}
        {detail?.isStale && <p>비용·운영 정보는 최근 저장된 내용이며 지금과 다를 수 있어요.</p>}
        {detail?.syncedAt && <p>장소 정보 수집일 {detail.syncedAt.slice(0, 10)}</p>}
        <p>장소·사진 정보 출처 · ⓒ한국관광공사<br />운영 정보와 현장 상황은 달라질 수 있어요.</p>
      </SourceContent>
    </More>
  </Body>;
}

function crowdEvidence(forecast: NonNullable<TutiPlace["crowdForecast"]>) {
  if (forecast.provider === "seoul_citydata") return "서울시 실시간 인구 추정치이며 실제 현장과 다를 수 있어요.";
  if (forecast.provider === "regional_visitors") return "지역 방문 패턴을 바탕으로 한 평시 예상값이에요.";
  if (forecast.provider === "tuti_estimate") return "지역 방문량과 장소 수요를 살핀 예상값이며 실제 현장과 다를 수 있어요.";
  return "한국관광공사의 방문 패턴을 바탕으로 한 예상값이며 실제 현장과 다를 수 있어요.";
}

const Body = styled.div`min-width: 0; color: var(--color-text); > * { min-width: 0; } h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.6; letter-spacing: -.02em; }`;
const Introduction = styled.p`margin: 0; padding: 8px 0 28px; font-size: 15px; line-height: 1.9; color: var(--color-text); white-space: pre-line; overflow-wrap: anywhere;`;
const Block = styled.section`display: grid; gap: 18px; padding: 28px 0; border-top: 1px solid var(--color-border);`;
const Activity = styled.section`display: grid; gap: 12px; margin: 0 0 28px; padding: 20px; border-radius: 16px; background: var(--color-secondary-100); color: var(--color-secondary-1000); p { margin: 0; font-size: 14px; line-height: 1.85; white-space: pre-line; overflow-wrap: anywhere; }`;
const Facts = styled.dl`display: grid; gap: 18px; margin: 0;`;
const Fact = styled.div`display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 12px; font-size: 14px; line-height: 1.85; dt { color: var(--color-text-muted); } dd { margin: 0; white-space: pre-line; overflow-wrap: anywhere; } small { display: block; color: var(--color-brand-900); font-size: 12px; line-height: 1.6; } @container app-viewport (max-width: 340px) { grid-template-columns: 1fr; gap: 4px; }`;
const Hint = styled.p`margin: 2px 0 0; color: var(--color-text-muted); font-size: 13px; line-height: 1.8;`;
const RequestStatus = styled.div`display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 8px 0 20px; p { margin: 0; font-size: 14px; line-height: 1.7; color: var(--color-text-muted); }`;
const Retry = styled(BaseButton)`min-height: 44px; padding: 8px 0; background: transparent; color: var(--color-brand-900); font-size: 14px; text-decoration: underline; text-underline-offset: 3px;`;
const NextStep = styled.section`padding: 28px 0; border-top: 1px solid var(--color-border); p { margin: 10px 0 20px; color: var(--color-text-muted); font-size: 14px; line-height: 1.85; }`;
const Actions = styled.div`display: flex; flex-wrap: wrap; gap: 10px; > * { flex: 1; min-width: 120px; }`;
const Directions = styled.a`display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 50px; padding: 12px 16px; border: 1px solid var(--color-brand-300); border-radius: 999px; background: var(--color-brand-100); color: var(--color-brand-1000); text-decoration: none; font-size: 14px; font-weight: 500; &:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }`;
const CreateMadi = styled(PrimaryButton)`display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 50px; padding: 12px 16px; font-size: 14px; font-weight: 500;`;
const More = styled.details`border-top: 1px solid var(--color-border); summary { display: flex; justify-content: space-between; align-items: center; gap: 16px; min-height: 54px; padding: 12px 0; list-style: none; cursor: pointer; color: var(--color-text-muted); font-size: 13px; } summary::-webkit-details-marker { display: none; } summary > svg { transition: transform 180ms ease; } &[open] summary > svg { transform: rotate(180deg); } summary:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: -2px; border-radius: 6px; } @media (prefers-reduced-motion: reduce) { summary > svg { transition: none; } }`;
const SourceContent = styled.div`display: grid; gap: 20px; padding: 8px 0 20px; h3 { margin: 0 0 6px; font-size: 13px; font-weight: 500; line-height: 1.7; } p { margin: 0; font-size: 13px; line-height: 1.85; color: var(--color-text-muted); white-space: pre-line; overflow-wrap: anywhere; }`;
