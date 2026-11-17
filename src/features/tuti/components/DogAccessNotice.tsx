"use client";
import styled from "@emotion/styled";
import { ChevronDown, ExternalLink, PawPrint } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { showToast } from "@/lib/feedback";
import type { DogAccessInfo } from "@/shared/pets/dogAccess";

export function DogAccessNotice({ access }: { access: DogAccessInfo }) {
  const official = access.kind === "tourapi";
  const needsConfirmation = official || access.requiresOutingConfirmation;
  const rows = official ? [
    { label: "동반 구역", value: access.areas },
    { label: "반려견 조건", value: access.animals || "미기재 · 크기와 견종 제한을 확인해주세요." },
    { label: "준비물", value: access.preparations || "미기재 · 필요한 준비물을 확인해주세요." },
  ] : [
    { label: "동반 구역", value: access.areas },
    { label: "몸무게", value: access.maxWeightKg === null ? "몸무게 제한 없음" : `${access.maxWeightKg}kg 이하` },
    { label: "준비물", value: [access.leashRequired ? "목줄 필수" : "", access.carrierRequired ? "이동장 필수" : ""].filter(Boolean).join(" · ") || "필수 준비물 별도 기재 없음" },
  ];
  return <Notice aria-label="반려견 동반 안내">
    <Heading><PawPrint size={19} aria-hidden="true" /><h2>반려견과 함께 가기</h2></Heading>
    <Status>{needsConfirmation ? "방문 전 조건을 확인해주세요." : "안내된 구역과 준비물을 확인해주세요."}</Status>
    <Facts>{rows.map(row => <Fact key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></Fact>)}</Facts>
    {(access.rules || official && access.facilities) && <More>
      <summary><span>시설·상세 안내</span><ChevronDown size={16} aria-hidden="true" /></summary>
      <RawDetails>{official && access.facilities && <p><strong>등록된 동반 시설</strong>{access.facilities}</p>}{access.rules && <p>{access.rules}</p>}</RawDetails>
    </More>}
    <Source>
      <span>{official ? `한국관광공사 등록 정보 · 수집일 ${access.collectedAt.slice(0, 10)}` : `확인일 ${access.checkedAt.slice(0, 10)}`}</span>
      <a href={access.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={event => {
        if (!Capacitor.isNativePlatform()) return;
        event.preventDefault();
        void Browser.open({ url: access.sourceUrl }).catch(() => showToast("운영 안내를 열지 못했어요. 잠시 후 다시 시도해주세요."));
      }}>{official ? "공식 데이터 출처 보기" : "운영 안내 확인"}<ExternalLink size={13} aria-hidden="true" /></a>
    </Source>
  </Notice>;
}
const Notice = styled.section`min-width: 0; color: var(--color-text); text-align: left;`;
const Heading = styled.div`display: flex; align-items: center; gap: 8px; > svg { color: var(--color-brand-900); flex: none; } h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.6; }`;
const Status = styled.p`margin: 6px 0 18px; color: var(--color-text-muted); font-size: 13px; line-height: 1.7;`;
const Facts = styled.dl`margin: 0; display: grid; gap: 14px;`;
const Fact = styled.div`display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 12px; font-size: 14px; line-height: 1.8; dt { color: var(--color-text-muted); } dd { margin: 0; white-space: pre-line; overflow-wrap: anywhere; } @container app-viewport (max-width: 340px) { grid-template-columns: 1fr; gap: 4px; }`;
const More = styled.details`margin-top: 18px; border-top: 1px solid var(--color-border); summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; padding: 10px 0; font-size: 13px; font-weight: 500; list-style: none; cursor: pointer; } summary::-webkit-details-marker { display: none; } summary > svg { flex: none; color: var(--color-text-muted); transition: transform 180ms ease; } &[open] summary > svg { transform: rotate(180deg); } summary:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: -2px; border-radius: 6px; } @media (prefers-reduced-motion: reduce) { summary > svg { transition: none; } }`;
const RawDetails = styled.div`padding: 0 0 12px; p { margin: 0 0 12px; color: var(--color-text-muted); font-size: 13px; line-height: 1.85; white-space: pre-line; overflow-wrap: anywhere; } strong { display: block; margin-bottom: 4px; color: var(--color-text); font-weight: 500; }`;
const Source = styled.footer`display: flex; flex-wrap: wrap; column-gap: 12px; align-items: center; margin-top: 16px; color: var(--color-text-muted); font-size: 12px; line-height: 1.7; > span { overflow-wrap: anywhere; } a { display: inline-flex; align-items: center; gap: 5px; min-height: 44px; color: var(--color-brand-900); text-decoration: underline; text-underline-offset: 3px; }`;
