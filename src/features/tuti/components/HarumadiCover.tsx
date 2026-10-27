"use client";

import Image from "next/image";
import styled from "@emotion/styled";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLibraryCover } from "@/lib/harumadiPdfLibrary";
import type { StoredHarumadiPdf } from "@/shared/api/harumadiPdf";

export function HarumadiCover({ harumadiPdf, ownerId, kind = "pdf" }: { harumadiPdf: StoredHarumadiPdf; ownerId: string; kind?: "pdf" | "harumadi" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    if (!("IntersectionObserver" in window)) {
      // 구형 WebView에는 관찰 API가 없어 마운트 뒤 일반 로딩으로 전환한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true); return;
    }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "120px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const query = useQuery({ queryKey: ["library-cover", ownerId, harumadiPdf.id, kind], queryFn: () => fetchLibraryCover(ownerId, harumadiPdf.id, kind),
    enabled: Boolean(harumadiPdf.hasCover && visible), retry: false, staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  useEffect(() => {
    if (!query.data) return;
    const url = URL.createObjectURL(query.data);
    // Blob URL은 브라우저 자원이므로 effect에서 생성하고 반드시 해제한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImage(url);
    return () => URL.revokeObjectURL(url);
  }, [query.data]);
  const harumadiPhoto = kind === "harumadi" && Boolean(harumadiPdf.coverStyle?.endsWith("-image"));
  return <Cover ref={ref} $green={harumadiPdf.coverStyle?.startsWith("green") ?? false} $photo={harumadiPhoto}>
    {image && kind === "pdf" ? <Image src={image} alt="" fill unoptimized sizes="160px" /> : <>
      <span className="cover-brand">Tuti / 하루마디</span>
      <strong>{harumadiPdf.title}</strong>
      {image && harumadiPhoto && <span className="cover-photo"><Image src={image} alt="" fill unoptimized sizes="160px" /></span>}
      <span className="cover-date">{new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(harumadiPdf.createdAt))}</span>
    </>}
    <span className="binding" aria-hidden="true" />
  </Cover>;
}
const Cover = styled.span<{ $green: boolean; $photo: boolean }>`
  position: relative; display: flex; flex-direction: column; justify-content: center; align-items: flex-start;
  width: 100%; aspect-ratio: 148 / 210; padding: 21px 16px 19px 20px; overflow: hidden;
  background: ${({ $green }) => $green ? "#EBF5D5" : "#FFFFFF"}; color: var(--color-text);
  border: 1px solid rgb(27 34 42 / 0.08); border-radius: 2px 5px 5px 2px;
  box-shadow: 2px 4px 0 #e3e8de, 4px 10px 16px rgb(27 34 42 / 0.12), inset 5px 0 8px rgb(27 34 42 / 0.025);
  strong { font-size: var(--harumadi-shelf-title-size, clamp(16px, 4.8cqw, 20px)); line-height: var(--harumadi-shelf-title-leading, 1.6); font-weight: 600; overflow-wrap: anywhere; white-space: pre-wrap;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: var(--harumadi-shelf-title-lines, 4); overflow: hidden; }
  .cover-brand { position: absolute; top: 16px; left: 20px; font-size: var(--harumadi-shelf-brand-size, 9px); color: var(--color-text-muted); letter-spacing: 0.03em; }
  .cover-date { position: absolute; bottom: 16px; left: 20px; font-size: var(--harumadi-shelf-date-size, 10px); font-variant-numeric: tabular-nums; color: var(--color-text-muted); }
  .cover-photo { position: absolute; bottom: 34px; left: 20px; right: 16px; height: var(--harumadi-shelf-photo-height, 40%); }
  ${({ $photo }) => $photo && "strong { position: absolute; top: 36px; left: 20px; right: 16px; font-size: var(--harumadi-shelf-title-size, 16px); line-height: 1.4; -webkit-line-clamp: 2; }"}
  .binding { position: absolute; inset: 0 auto 0 5px; width: 1px; background: rgb(27 34 42 / 0.055); pointer-events: none; }
  img { object-fit: contain; }
`;
