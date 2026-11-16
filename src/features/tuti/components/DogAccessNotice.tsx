"use client";
import styled from "@emotion/styled";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { showToast } from "@/lib/feedback";
import type { DogAccess } from "@/shared/pets/dogAccess";
export function DogAccessNotice({ access }: { access: DogAccess }) {
  return <Notice><summary>반려견 동반 조건</summary><div>
    <p>{access.areas} · {access.rules}</p>
    <p>{access.maxWeightKg === null ? "몸무게 제한 없음" : `${access.maxWeightKg}kg 이하`}{access.leashRequired ? " · 목줄 필수" : ""}{access.carrierRequired ? " · 이동장 필수" : ""}</p>
    <p>확인일 {access.checkedAt.slice(0, 10)}</p>
    <a href={access.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={event => {
      if (!Capacitor.isNativePlatform()) return;
      event.preventDefault();
      void Browser.open({ url: access.sourceUrl }).catch(() => showToast("운영 안내를 열지 못했어요. 잠시 후 다시 시도해주세요."));
    }}>운영 안내 확인</a>
  </div></Notice>;
}
const Notice = styled.details`font-size: 13px; line-height: 1.6; text-align: left; summary { cursor: pointer; min-height: 44px; display: list-item; padding: 10px 0; } > div { max-height: 120px; overflow-y: auto; padding: 0 4px 8px; } p { margin: 0 0 6px; overflow-wrap: anywhere; } a { color: var(--color-brand-900); text-decoration: underline; text-underline-offset: 3px; display: inline-flex; align-items: center; min-height: 44px; }`;
