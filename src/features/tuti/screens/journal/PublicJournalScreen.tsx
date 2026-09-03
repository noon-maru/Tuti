"use client";

import styled from "@emotion/styled";
import { useEffect, useState } from "react";

import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";
import { JournalLocationLabel } from "@/features/tuti/components/JournalLocationLabel";
import { fetchWithSession } from "@/lib/auth/session";
import type { PublicJournalEntry } from "@/shared/api/journal";
import { palette } from "@/styles/tokens";

export function PublicJournalScreen({
  entry,
  loading,
  onBlockAuthor,
}: {
  entry: PublicJournalEntry | null;
  loading: boolean;
  onBlockAuthor: () => Promise<void>;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("inappropriate");
  const [reportDetail, setReportDetail] = useState("");
  const [reportStatus, setReportStatus] = useState<
    "idle" | "submitting" | "submitted"
  >("idle");
  const [reportError, setReportError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    if (!reportOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeReport = () => setReportOpen(false);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeReport();
    };
    const closeOnAndroidBack = (event: Event) => {
      event.preventDefault();
      closeReport();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener(ANDROID_BACK_EVENT, closeOnAndroidBack);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener(ANDROID_BACK_EVENT, closeOnAndroidBack);
    };
  }, [reportOpen]);

  if (!entry) {
    return (
      <Page>
        <Shell>
          <Header><Wordmark src="/brand/tuti-wordmark.svg" alt="Tuti" /></Header>
          <Card><Content><h1>{loading ? "공유된 기록을 불러오고 있어요." : "공개된 기록을 찾지 못했어요."}</h1></Content></Card>
        </Shell>
      </Page>
    );
  }

  const submitReport = async () => {
    setReportStatus("submitting");
    setReportError(null);

    try {
      const response = await fetchWithSession("reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          publicId: entry.publicId,
          reason: reportReason,
          detail: reportDetail,
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: unknown };
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "신고를 접수하지 못했습니다.",
        );
      }

      setReportStatus("submitted");
    } catch (error) {
      setReportStatus("idle");
      setReportError(
        error instanceof Error
          ? error.message
          : "신고를 접수하지 못했습니다.",
      );
    }
  };

  return (
    <Page>
      <Shell>
        <Header>
          <Wordmark
            src="/brand/tuti-wordmark.svg"
            alt="Tuti"
          />
          <span>공개된 지난 공간</span>
        </Header>

        <Card>
          <Hero $hasImage={Boolean(entry.image)}>
            {entry.image && (
              <HeroImage
                src={entry.image}
                alt={`${entry.placeName} 기록 이미지`}
              />
            )}
          </Hero>

          <Content>
            <DateText>{formatPublicDate(entry.visitedAt)}</DateText>
            <h1>{entry.title || "남겨둔 공간"}</h1>
            <JournalLocationLabel placeName={entry.placeName} />
            <Tags aria-label="기록 정보">
              <Tag $tone="brand">{entry.crowd}</Tag>
              <Tag $tone="neutral">{entry.theme}</Tag>
              <Tag $tone="secondary">{entry.difficulty}</Tag>
            </Tags>
            <Description>
              {entry.content || "오늘의 공기를 이곳에 남겨두었어요."}
            </Description>
          </Content>
        </Card>

        <Footer>
          <FooterCopy>
            <p>오늘 가능한 만큼만, 잠깐 다른 공기로.</p>
            <FooterLinks>
              <a href="/legal/community-guidelines">기록 공개 운영정책</a>
              <a href="mailto:admin@tuti.today">운영자 문의</a>
            </FooterLinks>
          </FooterCopy>
          <FooterActions>
            <ReportButton
              type="button"
              disabled={blocking}
              onClick={() => {
                if (window.confirm("이 작성자의 공개 기록을 더 이상 보지 않을까요?")) {
                  setBlocking(true);
                  void onBlockAuthor().catch(() => {
                    setBlocking(false);
                    window.alert("작성자를 차단하지 못했어요. 잠시 후 다시 시도해주세요.");
                  });
                }
              }}
            >
              {blocking ? "차단 중" : "작성자 차단"}
            </ReportButton>
            <ReportButton type="button" onClick={() => setReportOpen(true)}>
              신고하기
            </ReportButton>
            <HomeLink href="/">Tuti에서 공간 찾아보기</HomeLink>
          </FooterActions>
        </Footer>
      </Shell>
      {reportOpen && (
        <ReportBackdrop
          role="presentation"
          onClick={() => setReportOpen(false)}
        >
          <ReportDialog
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            onClick={(event) => event.stopPropagation()}
          >
            {reportStatus === "submitted" ? (
              <>
                <h2 id="report-title">신고를 접수했어요.</h2>
                <p>관리자가 내용을 확인한 뒤 필요한 조치를 진행할게요.</p>
                <DialogButton
                  type="button"
                  onClick={() => setReportOpen(false)}
                >
                  확인
                </DialogButton>
              </>
            ) : (
              <>
                <h2 id="report-title">이 기록을 신고할까요?</h2>
                <ReportSelect
                  aria-label="신고 사유"
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value)}
                >
                  <option value="inappropriate">부적절한 콘텐츠</option>
                  <option value="copyright">저작권 침해</option>
                  <option value="privacy">개인정보 노출</option>
                  <option value="spam">스팸 또는 홍보</option>
                  <option value="other">기타</option>
                </ReportSelect>
                <ReportTextArea
                  aria-label="신고 상세 내용"
                  value={reportDetail}
                  maxLength={1000}
                  placeholder="확인에 필요한 내용을 알려주세요. (선택)"
                  onChange={(event) => setReportDetail(event.target.value)}
                />
                {reportError && <ReportError role="alert">{reportError}</ReportError>}
                <DialogActions>
                  <CancelButton
                    type="button"
                    onClick={() => setReportOpen(false)}
                  >
                    취소
                  </CancelButton>
                  <DialogButton
                    type="button"
                    disabled={reportStatus === "submitting"}
                    onClick={() => void submitReport()}
                  >
                    {reportStatus === "submitting" ? "접수 중..." : "신고 접수"}
                  </DialogButton>
                </DialogActions>
              </>
            )}
          </ReportDialog>
        </ReportBackdrop>
      )}
    </Page>
  );
}

function formatPublicDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return `${date.getFullYear()}.${`${date.getMonth() + 1}`.padStart(2, "0")}.${`${date.getDate()}`.padStart(2, "0")}`;
}

const Page = styled.main`
  width: 100%;
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  padding:
    max(20px, env(safe-area-inset-top, 0px))
    max(16px, env(safe-area-inset-right, 0px))
    max(28px, env(safe-area-inset-bottom, 0px))
    max(16px, env(safe-area-inset-left, 0px));
  overflow-x: hidden;
  overflow-y: auto;
  background:
    radial-gradient(
      circle at 92% 4%,
      ${palette.secondary[300]},
      transparent 34%
    ),
    linear-gradient(145deg, ${palette.brand[200]}, ${palette.neutral[200]} 62%);
  overscroll-behavior-y: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
`;

const Shell = styled.div`
  width: min(100%, 640px);
  display: grid;
  gap: clamp(16px, 4vw, 24px);
  margin: 0 auto;
`;

const Header = styled.header`
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 0 8px;
  color: ${palette.neutral[900]};
  font-size: 14px;
`;

const Wordmark = styled.img`
  width: clamp(64px, 14vw, 76px);
  height: auto;
  display: block;
`;

const Card = styled.article`
  overflow: hidden;
  border: 1px solid rgb(0 0 0 / 0.06);
  border-radius: clamp(28px, 6vw, 40px);
  background: ${palette.neutral[100]};
  box-shadow: 0 28px 72px rgb(0 0 0 / 0.16);
`;

const Hero = styled.div<{ $hasImage: boolean }>`
  aspect-ratio: 4 / 3;
  background: ${({ $hasImage }) =>
    $hasImage
      ? palette.neutral[300]
      : `radial-gradient(circle at 20% 18%, ${palette.secondary[500]}, transparent 36%), linear-gradient(145deg, ${palette.brand[500]}, ${palette.brand[700]})`};
`;

const HeroImage = styled.img`
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
`;

const Content = styled.div`
  display: grid;
  gap: clamp(14px, 4vw, 20px);
  padding: clamp(24px, 6vw, 40px);

  h1 {
    font-size: clamp(26px, 6vw, 38px);
    font-weight: 700;
  }
`;

const DateText = styled.time`
  color: ${palette.neutral[900]};
  font-size: 14px;
`;

const Tags = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
`;

const Tag = styled.span<{
  $tone: "brand" | "neutral" | "secondary";
}>`
  min-width: 0;
  min-height: 32px;
  display: grid;
  place-items: center;
  padding: 4px 10px;
  overflow: hidden;
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "brand"
      ? palette.brand[500]
      : $tone === "secondary"
        ? palette.secondary[500]
        : palette.neutral[500]};
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Description = styled.p`
  color: ${palette.neutral[1100]};
  font-size: clamp(15px, 3.6vw, 18px);
  line-height: 1.65;
  letter-spacing: -0.015em;
  white-space: pre-line;
`;

const Footer = styled.footer`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 8px;
  color: ${palette.neutral[900]};
  font-size: 13px;

  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column;
    padding-bottom: 4px;
    text-align: center;
  }
`;

const FooterCopy = styled.div`
  display: grid;
  gap: 4px;

  @media (max-width: 520px) {
    justify-items: center;
  }
`;

const FooterLinks = styled.span`
  display: flex;
  gap: 10px;

  a {
    width: fit-content;
    color: inherit;
    font-size: 12px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`;

const FooterActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column-reverse;

    > * {
      width: 100%;
    }
  }
`;

const ReportButton = styled.button`
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid ${palette.neutral[500]};
  border-radius: 999px;
  background: ${palette.neutral[100]};
  color: ${palette.neutral[900]};
  font: inherit;
  cursor: pointer;
`;

const HomeLink = styled.a`
  min-height: 44px;
  display: inline-grid;
  place-items: center;
  padding: 0 20px;
  border-radius: 999px;
  background: ${palette.brand[700]};
  color: ${palette.neutral[100]};
  font-weight: 600;
`;

const ReportBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(
    in srgb,
    ${palette.neutral[1300]} 40%,
    transparent
  );
`;

const ReportDialog = styled.section`
  width: min(100%, 440px);
  max-height: calc(100dvh - 40px);
  display: grid;
  gap: 16px;
  padding: 28px;
  overflow-y: auto;
  border-radius: 28px;
  background: ${palette.neutral[100]};
  box-shadow: 0 24px 72px
    color-mix(in srgb, ${palette.neutral[1300]} 22%, transparent);

  h2 {
    font-size: 22px;
  }

  p {
    color: ${palette.neutral[900]};
    line-height: 1.5;
  }
`;

const ReportSelect = styled.select`
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid ${palette.neutral[500]};
  border-radius: 12px;
  background: ${palette.neutral[100]};
  color: ${palette.neutral[1300]};
  font: inherit;
`;

const ReportTextArea = styled.textarea`
  min-height: 120px;
  resize: vertical;
  padding: 14px;
  border: 1px solid ${palette.neutral[500]};
  border-radius: 12px;
  outline: 0;
  color: ${palette.neutral[1300]};
  font: inherit;
  line-height: 1.5;
`;

const ReportError = styled.p`
  color: ${palette.status.error} !important;
  font-size: 13px;
`;

const DialogActions = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;

const CancelButton = styled.button`
  min-height: 44px;
  border: 1px solid ${palette.neutral[500]};
  border-radius: 12px;
  background: ${palette.neutral[100]};
  color: ${palette.neutral[900]};
  font: inherit;
  cursor: pointer;
`;

const DialogButton = styled.button`
  min-height: 44px;
  border: 0;
  border-radius: 12px;
  background: ${palette.brand[700]};
  color: ${palette.neutral[100]};
  font: inherit;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.55;
  }
`;
