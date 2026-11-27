"use client";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import styled from "@emotion/styled";
import { Camera, Cat, Dog } from "lucide-react";
import type { PetProfile } from "@/shared/pets/profile";
import { petPhotoQuery } from "../hooks/petPhotoQuery";

export function PetPhoto({ owner, pet, preview, decorative = false }: { owner: string; pet: PetProfile; preview?: string | null; decorative?: boolean }) {
  const options = petPhotoQuery(owner, pet);
  const query = useQuery({ ...options, enabled: options.enabled && preview === undefined });
  const photo = preview !== undefined ? preview : query.data?.photo;
  const Icon = pet.species === "cat" ? Cat : Dog;
  return <Portrait data-pet-photo aria-hidden={decorative || undefined}>
    {photo ? <Image src={photo} alt={decorative ? "" : `${pet.name || "반려동물"} 프로필 사진`} fill sizes={decorative ? "32px" : "160px"} unoptimized /> : <Icon aria-hidden="true" />}
    {!decorative && query.isError && preview === undefined && <button type="button" aria-label="사진 다시 불러오기" onClick={() => void query.refetch()}><Camera size={16} /></button>}
  </Portrait>;
}
const Portrait = styled.span`
  display: grid; place-items: center; position: relative; width: 100%; aspect-ratio: 1;
  border-radius: 50%; background: var(--color-brand-100); color: var(--color-brand-900);
  > svg { width: 36%; height: 36%; stroke-width: 1.4; }
  img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }
  button { position: absolute; right: 0; bottom: 0; width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--color-surface); color: var(--color-text); cursor: pointer; }
  button:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: -3px; }
`;
