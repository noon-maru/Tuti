"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import styled from "@emotion/styled";
import { BookOpen, Users } from "lucide-react";
import { useSession } from "@/features/tuti/hooks/useSession";
import { PrimaryButton, TextButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { changeTogether } from "@/lib/harumadiTogether";
import { clearHarumadiInvite, pendingHarumadiInvite, rememberHarumadiInviteUrl } from "@/lib/harumadiInviteIntent";
import { harumadiPath } from "@/lib/harumadis";
export function HarumadiInviteFlow() {
  const session = useSession(), router = useRouter(), client = useQueryClient();
  const [token, setToken] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      const saved = await rememberHarumadiInviteUrl(window.location.href) ?? await pendingHarumadiInvite();
      if (active) { setToken(saved); if (!saved) setError("초대 링크를 다시 열어주세요."); }
    })().catch(() => { if (active) setError("초대 링크를 다시 열어주세요."); });
    return () => { active = false; };
  }, []);
  const accept = async () => {
    if (!session || !token || busy) return;
    if (!session.account) { router.push("/login"); return; }
    setBusy(true); setError("");
    try {
      const result = await changeTogether<{ harumadiId: string }>(session.userId, "invitation", "accept", undefined, { token });
      await clearHarumadiInvite();
      client.removeQueries({ queryKey: ["library-harumadis", session.userId] });
      router.replace(harumadiPath(result.harumadiId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "초대를 확인하지 못했어요. 다시 시도해주세요."); }
    finally { setBusy(false); }
  };
  return <Frame><Mark aria-hidden="true"><BookOpen size={50} strokeWidth={1.2} /><Users size={24} /></Mark>
    <h1>같이 채울 하루마디가<br />기다리고 있어요.</h1><p>각자의 순간을 한 권에 담고,<br />함께한 날의 이야기를 나눠보세요.</p>
    <Notice>이 책에 담은 마디는 현재·앞으로 참여하는 사람들에게 보여요. 참여자는 PDF로 저장할 수 있어요. 나가면 내 마디는 이 책에서 빠지고, 내 계정의 원본과 이미 저장한 PDF는 남아요.</Notice>
    {session?.account && <p>{session.account.displayName || "로그인한 계정"}으로 참여해요.</p>}
    {error && <p role="alert">{error}</p>}
    <PrimaryButton disabled={!token || !session || busy} onClick={() => void accept()}>{busy ? "책장에 놓고 있어요…" : session?.account ? "함께 채우기" : "로그인하고 함께 채우기"}</PrimaryButton>
    {!Capacitor.isNativePlatform() && token && <TextButton onClick={() => window.location.assign(`com.noonmaru.tuti://harumadi/invite#${token}`)}>앱에서 열기</TextButton>}
    <TextButton disabled={busy} onClick={() => { void clearHarumadiInvite().then(() => router.replace("/")); }}>지금은 참여하지 않기</TextButton>
  </Frame>;
}
const Frame = styled(ScreenFrame)`justify-content: center; gap: 20px; overflow-y: auto; h1 { font-size: 26px; line-height: 1.45; font-weight: 600; letter-spacing: -.04em; margin: 0; } p { margin: 0; font-size: 15px; line-height: 1.8; color: var(--color-text-muted); } > button, > a { flex-shrink: 0; }`;
const Mark = styled.div`position: relative; width: 76px; padding: 8px 0 18px; color: var(--color-text); > svg:last-child { position: absolute; right: 0; bottom: 8px; padding: 4px; width: 32px; height: 32px; border-radius: 50%; background: var(--color-brand-100); }`;
const Notice = styled.div`font-size: 12px; line-height: 1.9; color: var(--color-text-muted); padding: 16px; border-radius: 12px; background: var(--color-brand-100);`;
