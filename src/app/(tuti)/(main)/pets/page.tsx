"use client";
import styled from "@emotion/styled";
import { useRouter } from "next/navigation";
import { PetProfiles } from "@/features/tuti/components/PetProfiles";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { BackButton } from "@/features/tuti/components/buttons";
export default function PetsPage() {
  const router = useRouter();
  return <Frame><header><BackButton aria-label="설정으로 돌아가기" onClick={() => router.replace("/settings")} /><h1>함께하는 반려동물</h1></header><main data-scroll-region><PetProfiles /><p>프로필은 선택이에요. 연결해도 다른 사람에게 기록이 공유되지 않아요.</p></main></Frame>;
}
const Frame = styled(ScreenFrame)`header { display: flex; align-items: center; gap: 12px; flex: none; } h1 { font-size: 20px; margin: 0; } main { overflow-y: auto; min-height: 0; padding: 8px 3px 24px; } main > p { font-size: 13px; line-height: 1.7; margin: 28px 0 0; color: var(--color-text-muted); }`;
