"use client";
import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import Link from "next/link";
import { fetchAdminJson } from "@/lib/adminApi";
import type { OutingQuality } from "@/shared/api/outingQuality";
import { MetricsLedger, MetricsPanel, MetricsTable, MetricsValue } from "./AdminMetricsPrimitives";

const typeLabels: Record<string, string> = { cafe: "카페", forest_garden: "공원·숲", waterside: "수변", viewpoint: "전망", neighborhood: "거리·시장", art_exhibition: "전시", museum_story: "박물관", history_heritage: "역사·문화", activity: "활동", other: "기타" };
export function OutingQualityScreen() {
  const [data, setData] = useState<OutingQuality>();
  const [attempt, setAttempt] = useState(0), [error, setError] = useState(false), [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetchAdminJson<OutingQuality>("outing-quality").then(result => { if (active) { setData(result); setLoading(false); } })
      .catch(() => { if (active) { setError(true); setLoading(false); } });
    return () => { active = false; };
  }, [attempt]);
  return <Main>
    <Link href="/admin">운영 홈</Link>
    <Header><h1>나들이 품질</h1><button type="button" disabled={loading} onClick={() => { setError(false); setLoading(true); setAttempt(n => n + 1); }}>다시 확인</button></Header>
    <Nav aria-label="나들이 운영 도구"><Link href="/admin?section=places">장소 검토</Link><Link href="/admin/recommendation-simulator">조건별 추천 시험</Link><Link href="/admin/tourism-data">원천 데이터·수집</Link></Nav>
    {loading && <p role="status">카탈로그와 동반 정보를 확인하고 있어요.</p>}
    {error && <p role="alert">품질 정보를 불러오지 못했어요. 연결과 카탈로그 마이그레이션을 확인한 뒤 다시 확인해주세요.</p>}
    {data && !loading && !error && <>
      <p>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(data.asOf))} 기준</p>
      <MetricsLedger>{[["카탈로그 등록", data.registered], ["기본 후보 준비", data.ready], ["표준 외출 목적지", data.destinations]].map(([label, value]) => <MetricsValue key={label}><dt>{label}</dt><dd>{Number(value).toLocaleString("ko-KR")}곳</dd></MetricsValue>)}</MetricsLedger>
      <p>표준 외출 목적지는 숙박·폐쇄·개별 구매점을 구분한 분류 결과입니다. 거리·몸무게·방문일 등 실제 조건 통과 수는 추천 시험에서 확인하세요. 쇼핑 선택 시 개별 매장은 별도 후보가 될 수 있어요.</p>
      <MetricsPanel><h2>지역별 기본 후보</h2><MetricsTable><table><thead><tr><th>지역</th><th>기본 후보 준비</th><th>표준 외출 목적지</th><th>확인</th></tr></thead><tbody>{data.regions.map(region => <tr key={region.name}><th>{region.name}</th><td>{region.ready}</td><td>{region.destinations}</td><td><Link href={`/admin?section=places&q=${encodeURIComponent(region.name)}`}>장소 보기</Link></td></tr>)}</tbody></table></MetricsTable>{!data.regions.length && <p>준비된 지역 자료가 없어요. 원천 입력과 카탈로그 상태를 확인해주세요.</p>}</MetricsPanel>
      <MetricsPanel><h2>외출 목적지 구성</h2><MetricsTable><table><thead><tr><th>유형</th><th>장소 수</th></tr></thead><tbody>{data.types.map(type => <tr key={type.name}><th>{typeLabels[type.name] ?? type.name}</th><td>{type.count}</td></tr>)}</tbody></table></MetricsTable></MetricsPanel>
      <MetricsPanel><h2>정보 확인·보완</h2><p>집계는 항목별 중복될 수 있습니다. 각 목록은 전체 건수와 ID 순 예시 최대 10곳이며, 공식 등록의 확인 필요 표시는 오류나 동반 불가 판정이 아닙니다.</p>{data.issues.map(issue => <details key={issue.kind}><summary>{issue.kind} · {issue.count}곳</summary><ul>{issue.samples.map(place => <li key={place.id}><Link href={`/admin?section=places&candidate=all&q=${encodeURIComponent(place.id)}`}>{place.name}</Link><span>{place.region}</span></li>)}</ul></details>)}</MetricsPanel>
    </>}
  </Main>;
}
const Main = styled.main`max-width:1280px;margin:auto;padding:32px;display:grid;gap:22px;min-width:0;>p{font-size:13px;color:var(--color-text-muted);line-height:1.8;margin:0;}h2{font-size:18px;}a{color:var(--color-accent-primary);text-underline-offset:4px;}summary{min-height:44px;padding:12px 0;cursor:pointer;font-size:14px;}li{padding:10px 0;}li span{margin-left:12px;color:var(--color-text-muted);font-size:12px;}@media(max-width:540px){padding:20px 16px;}`;
const Header = styled.header`display:flex;justify-content:space-between;align-items:center;gap:16px;h1{font-size:24px;margin:0;}button{min-height:44px;background:white;border:1px solid var(--color-border);border-radius:10px;padding:8px 14px;color:var(--color-text);font:inherit;cursor:pointer;}button:disabled{opacity:.5;cursor:wait;}`;
const Nav = styled.nav`display:flex;gap:20px;flex-wrap:wrap;a{display:inline-flex;align-items:center;min-height:44px;font-size:14px;}`;
