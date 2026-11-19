"use client";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import styled from "@emotion/styled";
import { Camera, Cat, Dog } from "lucide-react";
import { notificationRequest } from "@/lib/notificationSettings";
import type { PetProfile } from "@/shared/pets/profile";

export const petPhotoKey = (owner: string, pet: PetProfile) => ["pet-photo", owner, pet.id, pet.revision ?? 0] as const;
export function PetPhoto({ owner, pet, preview }: { owner: string; pet: PetProfile; preview?: string | null }) {
  const query = useQuery({ queryKey: petPhotoKey(owner, pet),
    queryFn: ({ signal }) => notificationRequest<{ photo: string | null }>(`pets/${encodeURIComponent(pet.id)}/photo`, { signal }, owner),
    enabled: Boolean(pet.hasPhoto && preview === undefined), staleTime: 5 * 60_000, retry: false });
  const photo = preview !== undefined ? preview : query.data?.photo;
  const Icon = pet.species === "cat" ? Cat : Dog;
  return <Portrait data-pet-photo>
    {photo ? <Image src={photo} alt={`${pet.name || "반려동물"} 프로필 사진`} fill sizes="160px" unoptimized /> : <Icon aria-hidden="true" />}
    {query.isError && preview === undefined && <button type="button" aria-label="사진 다시 불러오기" onClick={() => void query.refetch()}><Camera size={16} /></button>}
  </Portrait>;
}
const Portrait = styled.span`
  display: grid; place-items: center; position: relative; width: 100%; aspect-ratio: 1;
  overflow: hidden; border-radius: 24px; background: var(--color-brand-100); color: var(--color-brand-900);
  > svg { width: 36%; height: 36%; stroke-width: 1.4; }
  img { width: 100%; height: 100%; object-fit: cover; }
  button { position: absolute; right: 0; bottom: 0; width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--color-surface); color: var(--color-text); cursor: pointer; }
  button:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: -3px; }
`;
