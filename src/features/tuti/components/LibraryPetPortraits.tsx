"use client";

import { useQueries } from "@tanstack/react-query";
import Image from "next/image";
import styled from "@emotion/styled";
import { MoreVertical } from "lucide-react";
import { usePetProfiles } from "../hooks/usePetProfiles";
import { petPhotoQuery } from "../hooks/petPhotoQuery";

/** Decorative menu content only: no nested buttons and no effect on book filtering. */
export function LibraryPetPortraits({ ownerId }: { ownerId: string }) {
  const profiles = usePetProfiles(ownerId);
  const pets = profiles.data?.pets.filter(pet => pet.hasPhoto).slice(0, 3) ?? [];
  const photos = useQueries({ queries: pets.map(pet => petPhotoQuery(ownerId, pet)) });
  const ready = photos.flatMap((query, index) => query.data?.photo ? [{ id: pets[index].id, photo: query.data.photo }] : []);
  if (!ready.length) return <MoreVertical size={22} aria-hidden="true" />;
  return <Portraits data-pet-portraits={ready.length} aria-hidden="true">
    {ready.map(pet => <span key={pet.id}><Image src={pet.photo} alt="" fill sizes="32px" unoptimized /></span>)}
  </Portraits>;
}

const Portraits = styled.span`
  display: flex; align-items: center; justify-content: center; width: 44px; height: 44px;
  --pet-thumb-size: 32px; --pet-thumb-overlap: 0px;
  &[data-pet-portraits="2"] { --pet-thumb-size: 28px; --pet-thumb-overlap: -12px; }
  &[data-pet-portraits="3"] { --pet-thumb-size: 24px; --pet-thumb-overlap: -14px; }
  > span { position: relative; flex: none; width: var(--pet-thumb-size); height: var(--pet-thumb-size);
    border: 2px solid var(--library-background, var(--color-surface)); border-radius: 50%; overflow: hidden; box-sizing: border-box; }
  > span + span { margin-inline-start: var(--pet-thumb-overlap); }
  img { object-fit: cover; }
`;
