"use client";

import styled from "@emotion/styled";
import type { PetProfile } from "@/shared/pets/profile";
import { usePetProfiles } from "../hooks/usePetProfiles";
import { PetPhoto } from "./PetPhoto";

/** Only owner-facing surfaces pass pets attached to their own madi. */
export function MadiPetTags({ owner, pets, compact = false }: { owner: string; pets: readonly PetProfile[]; compact?: boolean }) {
  const visible = compact ? pets.slice(0, 2) : pets;
  const { data } = usePetProfiles(owner, visible.some(pet => pet.hasPhoto === undefined));
  return <Tags role="group" aria-label="함께한 반려동물" $compact={compact}>
    {visible.map(pet => {
      const profile = data?.pets.find(current => current.id === pet.id) ?? pet;
      return <Tag key={pet.id}>
        {owner && profile.hasPhoto && <Avatar><PetPhoto owner={owner} pet={profile} decorative /></Avatar>}
        <span>{profile.name}</span>
      </Tag>;
    })}
    {visible.length < pets.length && <Tag>외 {pets.length - visible.length}마리</Tag>}
  </Tags>;
}

const Tags = styled.div<{ $compact: boolean }>`
  display: flex; flex-wrap: wrap; gap: 6px; min-width: 0;
  ${({ $compact }) => $compact ? `--madi-pet-avatar: 7cqw; font-size: 4cqw; gap: 2cqw; flex-wrap: nowrap;
    > span { padding: 0; background: transparent; gap: 1cqw; white-space: nowrap; }
    > span > span:last-child { overflow: hidden; text-overflow: ellipsis; }` : `--madi-pet-avatar: 24px; font-size: 13px;`}
`;
const Tag = styled.span`
  display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%;
  padding: 4px 8px; line-height: 1.45; border-radius: 8px;
  background: var(--color-brand-100); color: var(--color-brand-1000);
  > span:last-child { min-width: 0; overflow-wrap: anywhere; }
`;
const Avatar = styled.span`width: var(--madi-pet-avatar); flex: none;`;
