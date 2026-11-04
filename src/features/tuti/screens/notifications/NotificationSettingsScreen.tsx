"use client";
import styled from "@emotion/styled";
import { Clock3, MessageCircle, PencilLine } from "lucide-react";
import { BackButton } from "@/features/tuti/components/buttons";
import { Button } from "@/shared/ui/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { nativeDateInputStyles, screenTitleStyles } from "@/shared/ui/typography";
import type { NotificationSettings } from "@/shared/notifications/preferences";
import type { PushNotificationStatus } from "../../notifications/pushNotifications";
export function NotificationSettingsScreen({ settings, supported, status, busy, message, onBack, onChange }: {
  settings: NotificationSettings; supported: boolean; status: PushNotificationStatus | null;
  busy: boolean; message: string | null; onBack: () => void; onChange: (patch: Partial<NotificationSettings>) => Promise<void>;
}) {
  return <Frame>
    <Header><BackButton aria-label="이전 화면으로" onClick={onBack} /><h1>알림</h1><span /></Header>
    <Content data-scroll-region>
      {!supported && <Notice>알림은 iPhone·Android에 설치한 Tuti 앱에서 받을 수 있어요.</Notice>}
      <Card><Row><Icon><MessageCircle size={21} /></Icon><Copy><h2>함께 채우기·서비스 소식</h2><p>새 마디, 초대 수락, 내 댓글의 답글과 문의 답변</p></Copy>
        <Toggle label="함께 채우기·서비스 소식" checked={settings.newsEnabled} disabled={busy || !supported} onChange={value => void onChange({ newsEnabled: value })} /></Row></Card>
      <Card><Row><Icon><PencilLine size={21} /></Icon><Copy><h2>마디 기록 알림</h2><p>잊기 전에 오늘의 한 장면을 남겨보세요.</p></Copy>
        <Toggle label="마디 기록 알림" checked={settings.reminderEnabled} disabled={busy || !supported} onChange={value => void onChange({ reminderEnabled: value })} /></Row>
        <Time><Clock3 size={18} /><label htmlFor="madi-reminder-time">알림 시간</label><input id="madi-reminder-time" type="time" value={settings.reminderTime} disabled={busy || !supported}
          onChange={event => { if (event.target.value) void onChange({ reminderTime: event.target.value }); }} /></Time>
        <Hint>오늘 마디를 남겼다면 알려드리지 않아요.</Hint>
      </Card>
      {status?.permission === "denied" && <Notice role="alert">기기에서 알림이 꺼져 있어요. 기기 설정에서 Tuti 알림을 허용해주세요.</Notice>}
      {supported && (settings.newsEnabled || settings.reminderEnabled) && status && !status.registered &&
        <Button type="button" $tone="neutral" disabled={busy} onClick={() => void onChange({ newsEnabled: settings.newsEnabled, reminderEnabled: settings.reminderEnabled })}>이 기기에서도 알림 받기</Button>}
      {message && <Notice role="status">{message}</Notice>}
      <Hint>함께 채우는 하루마디별로도 알림을 끌 수 있어요.<br />사진과 글은 알림에 표시하지 않아요.</Hint>
    </Content>
  </Frame>;
}
function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <Switch><input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span /></Switch>;
}
const Frame = styled(ScreenFrame)`padding-inline: 0; background: var(--color-surface);`;
const Header = styled.header`display: grid; grid-template-columns: 48px 1fr 48px; align-items: center; padding-inline: 20px; h1 { ${screenTitleStyles} text-align: center; }`;
const Content = styled.div`overflow-y: auto; min-height: 0; padding: 30px 20px calc(28px + var(--app-safe-area-bottom, 0px)); display: grid; align-content: start; gap: 16px;`;
const Card = styled.section`padding: 22px 18px; border: 1px solid var(--color-neutral-300); border-radius: 20px; display: grid; gap: 20px;`;
const Row = styled.div`display: flex; align-items: center; gap: 12px; @media(max-width: 350px) { gap: 8px; }`;
const Icon = styled.span`color: var(--color-text-muted); flex: none; @media(max-width: 350px) { display: none; }`;
const Copy = styled.div`flex: 1; min-width: 0; h2 { font-size: 15px; line-height: 1.5; font-weight: 600; } p { font-size: 12px; color: var(--color-text-muted); line-height: 1.65; margin-top: 5px; }`;
const Time = styled.div`display: flex; align-items: center; gap: 10px; border-radius: 12px; background: var(--color-secondary-100); padding: 12px; label { flex: 1; min-width: 0; font-size: 13px; } input { ${nativeDateInputStyles} font: inherit; font-size: 16px; max-width: 120px; border: 0; background: transparent; color: inherit; min-height: 44px; &:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; border-radius: 4px; } }`;
const Hint = styled.p`font-size: 12px; line-height: 1.8; color: var(--color-text-muted); margin: 0;`;
const Notice = styled.p`font-size: 13px; line-height: 1.7; padding: 14px 16px; border-radius: 12px; background: var(--color-neutral-200); margin: 0;`;
const Switch = styled.label`position: relative; flex: none; width: 46px; height: 44px;
  input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; }
  span { pointer-events: none; position: absolute; inset: 8px 0; border-radius: 20px; background: var(--color-neutral-400); transition: background 180ms; }
  span::after { content: ''; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: white; transition: transform 180ms; }
  input:checked + span { background: var(--color-secondary-600); } input:checked + span::after { transform: translateX(18px); }
  input:focus-visible + span { outline: 2px solid var(--color-focus-ring); outline-offset: 3px; } input:disabled + span { opacity: .5; }
  @media(prefers-reduced-motion: reduce) { span, span::after { transition: none; } }
`;
