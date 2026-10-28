"use client";

import styled from "@emotion/styled";
import { BookOpen, Compass, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { BaseButton } from "@/features/tuti/components/buttons";
import { useSession } from "@/features/tuti/hooks/useSession";
import { useHarumadiLibrary } from "@/features/tuti/hooks/useHarumadiLibrary";

export function MainNavigation({ active }: {
  active: "harumadi" | "explore";
}) {
  const router = useRouter();
  const ownerId = useSession()?.userId;
  const { isFirstMadi } = useHarumadiLibrary(ownerId);
  return <Bar data-main-navigation>
    <Navigation aria-label="주요 화면">
      <Destination type="button" aria-current={active === "harumadi" ? "page" : undefined}
        onClick={() => { if (active !== "harumadi") router.replace("/"); }}>
        <span><BookOpen size={24} strokeWidth={1.7} /></span>하루마디
      </Destination>
      <CreateButton type="button" onClick={() => router.push(`/madi/new?from=${active === "harumadi" ? "library" : "explore"}`)}>
        <Plus size={18} strokeWidth={1.8} />{isFirstMadi ? "첫 마디 남기기" : "마디 남기기"}
      </CreateButton>
      <Destination type="button" aria-current={active === "explore" ? "page" : undefined}
        onClick={() => { if (active !== "explore") router.replace("/explore"); }}>
        <span><Compass size={24} strokeWidth={1.7} /></span>작은 여행
      </Destination>
    </Navigation>
  </Bar>;
}

const Bar = styled.footer`
  --main-navigation-label-size: 12px; --main-navigation-create-size: 14px;
  --main-navigation-item-height: 56px; --main-navigation-create-height: 52px;
  --main-navigation-icon-size: 24px;
  flex: none; border-top: 1px solid var(--color-border); background: var(--color-surface);
  padding: 8px max(16px, var(--app-safe-area-right, 0px)) calc(10px + var(--app-safe-area-bottom, 0px)) max(16px, var(--app-safe-area-left, 0px));
`;
const Navigation = styled.nav`
  display: grid; grid-template-columns: minmax(56px, 1fr) minmax(max-content, 1.65fr) minmax(56px, 1fr);
  gap: 8px; align-items: center; max-width: 480px; margin: 0 auto;
  > button:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 3px; }
`;
const Destination = styled(BaseButton)`
  min-width: 0; min-height: var(--main-navigation-item-height); display: grid; justify-items: center; align-content: center; gap: 3px;
  padding: 0; border-radius: 12px; background: transparent; color: var(--color-text-muted); font-size: var(--main-navigation-label-size); line-height: 1.4;
  > span { width: 40px; height: 27px; border-radius: 12px; display: grid; place-items: center; }
  svg { width: var(--main-navigation-icon-size); height: var(--main-navigation-icon-size); }
  &[aria-current="page"] { color: var(--color-brand-900); font-weight: 600; > span { background: var(--color-brand-100); } }
`;
const CreateButton = styled(BaseButton)`
  min-width: 0; min-height: var(--main-navigation-create-height); display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  padding: 10px 8px; border-radius: 24px; background: var(--color-brand-300); color: var(--color-brand-1000);
  font-size: var(--main-navigation-create-size); font-weight: 600; line-height: 1.5; white-space: nowrap;
  &:hover { background: var(--color-brand-400); }
`;
