"use client";
import styled from "@emotion/styled";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { DogAccessInfo } from "@/shared/pets/dogAccess";
import { DogAccessNotice } from "./DogAccessNotice";

/** Keep the limits visible at the decision point; opening maps is not a facility check. */
export function DepartureDogAccessNotice({ access }: { access?: DogAccessInfo }) {
  const [openedAt] = useState(() => Date.now());
  const official = access?.kind === "tourapi";
  const expiry = access ? Date.parse(official ? access.freshUntil : access.validUntil) : NaN;
  const checked = access ? Date.parse(official ? access.collectedAt : access.checkedAt) : NaN;
  const stale = Boolean(access && (!Number.isFinite(expiry) || expiry <= openedAt || !Number.isFinite(checked) || checked > openedAt));
  const denied = access && !official && !access.allowed;
  const requirements = access ? [
    access.leashRequired === true ? "목줄" : "",
    access.carrierRequired === true ? "이동장" : "",
    official && access.conditions?.muzzleRequired ? "입마개" : "",
  ].filter(Boolean) : [];
  const weight = access?.maxWeightKg;
  const weightLabel = weight != null
    ? `${weight}kg ${official && access.weightLimitExclusive ? "미만" : "이하"}`
    : "구역별 몸무게·견종 조건은 전체 안내를 확인해주세요.";
  return <Notice aria-label="출발 전 반려견 동반 확인">
    <h2>반려견과 출발하기 전에</h2>
    <p>{!access ? "동반 조건을 확인하지 못했어요. 방문 전 시설에 직접 확인해주세요."
      : denied ? "동반 불가 안내가 있어요. 방문 전 시설에 직접 확인해주세요."
      : stale ? "정보 확인 기간이 지났어요. 방문 전 최신 조건을 확인해주세요."
      : official ? "동반 등록 정보예요. 방문 전 조건을 확인해주세요."
      : access.requiresOutingConfirmation ? "일부 동반 조건은 확인 전이에요. 방문 전 조건을 확인해주세요."
      : "별도 검토 안내예요. 이용할 구역과 조건을 확인해주세요."}</p>
    {access && <>
      <Facts>
        <div><dt>동반 구역</dt><dd>{access.areas}</dd></div>
        <div><dt>몸무게</dt><dd>{weightLabel}</dd></div>
        {official && access.conditions?.maxDogs && <div><dt>동반 마릿수</dt><dd>최대 {access.conditions.maxDogs}마리</dd></div>}
        <div><dt>준비물</dt><dd>{requirements.length ? `${requirements.join(" · ")} 필수 안내가 있어요.` : "필요한 준비물은 전체 안내를 확인해주세요."}</dd></div>
      </Facts>
      <More><summary><span>동반 조건·출처 보기</span><ChevronDown size={16} aria-hidden="true" /></summary><DogAccessNotice access={access} /></More>
    </>}
  </Notice>;
}
const Notice = styled.section`min-width: 0; margin: 16px 0 20px; padding: 16px 0; border-block: 1px solid var(--color-border); h2 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.6; } > p { margin: 6px 0 12px; font-size: 13px; color: var(--color-text-muted); line-height: 1.7; overflow-wrap: anywhere; }`;
const Facts = styled.dl`display: grid; gap: 8px; margin: 0; font-size: 13px; line-height: 1.7; > div { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; } dt { color: var(--color-text-muted); } dd { margin: 0; overflow-wrap: anywhere; } @container app-viewport (max-width: 340px) { > div { grid-template-columns: 1fr; gap: 2px; } }`;
const More = styled.details`margin-top: 8px; summary { display: flex; align-items: center; justify-content: space-between; min-height: 44px; gap: 12px; font-size: 13px; color: var(--color-brand-1000); cursor: pointer; list-style: none; } summary::-webkit-details-marker { display: none; } summary:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; } &[open] > summary { margin-bottom: 12px; } &[open] > summary svg { transform: rotate(180deg); }`;
