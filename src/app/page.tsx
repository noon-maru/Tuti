"use client";

import styled from "@emotion/styled";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getRecommendations, interpretState, type TutiPlace } from "@/lib/recommendations";
import { useTutiStore, type IntakeAnswers } from "@/store/tuti";
import { Providers } from "./providers";

type Screen = "onboarding" | "intake" | "home" | "swipe" | "detail" | "journal";

const intakeSteps = [
  {
    key: "movement",
    question: "오늘은 어느 정도 움직일 수 있을까요?",
    options: [
      { value: "near", label: "집 근처", hint: "아주 가까운 바깥" },
      { value: "short", label: "조금만", hint: "짧게 다녀오기" },
      { value: "half", label: "반나절 정도", hint: "조금 더 멀리" },
    ],
  },
  {
    key: "air",
    question: "어떤 공기가 필요할까요?",
    options: [
      { value: "quiet", label: "조용한 곳", hint: "말이 적은 자리" },
      { value: "water", label: "물 근처", hint: "시야가 트이는 곳" },
      { value: "walk", label: "걷기 좋은 곳", hint: "생각이 천천히 흐르는 길" },
    ],
  },
  {
    key: "alone",
    question: "혼자 있고 싶은가요?",
    options: [
      { value: "alone", label: "혼자가 좋아요", hint: "눈치 보지 않아도 되는 곳" },
      { value: "some", label: "조금은 괜찮아요", hint: "사람이 있어도 부담 없는 곳" },
    ],
  },
] as const;

function fetchPlaces(answers: IntakeAnswers) {
  return Promise.resolve(getRecommendations(answers));
}

export default function Home() {
  return (
    <Providers>
      <TutiPrototype />
    </Providers>
  );
}

function TutiPrototype() {
  const answers = useTutiStore((state) => state.answers);
  const setAnswer = useTutiStore((state) => state.setAnswer);
  const resetAnswers = useTutiStore((state) => state.resetAnswers);
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [step, setStep] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [gestureStart, setGestureStart] = useState<{ x: number; y: number } | null>(null);

  const feature = useMemo(() => interpretState(answers), [answers]);
  const { data: places = [] } = useQuery({
    queryKey: ["recommendations", answers],
    queryFn: () => fetchPlaces(answers),
    staleTime: Infinity,
  });

  const activePlace = places[activeIndex] ?? places[0];
  const activeStep = intakeSteps[step];

  const chooseAnswer = (value: string) => {
    setAnswer(activeStep.key, value as never);

    if (step < intakeSteps.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    setScreen("home");
  };

  const moveCard = (direction: number) => {
    if (!places.length) return;
    setActiveIndex((current) => (current + direction + places.length) % places.length);
  };

  const finishGesture = (x: number, y: number) => {
    if (!gestureStart) return;

    const dx = x - gestureStart.x;
    const dy = y - gestureStart.y;
    const horizontal = Math.abs(dx) > Math.abs(dy);

    if (horizontal && Math.abs(dx) > 36) {
      moveCard(dx < 0 ? 1 : -1);
    }

    if (!horizontal && Math.abs(dy) > 48) {
      setScreen(dy < 0 ? "detail" : "journal");
    }

    setGestureStart(null);
  };

  return (
    <Shell>
      <Phone aria-label="Tuti prototype">
        {screen === "onboarding" && (
          <OnboardingScreen>
            <BrandMark>T</BrandMark>
            <BrandText>
              <h1>Tuti</h1>
              <p>조금 다른 공기.</p>
            </BrandText>
            <BottomActions>
              <PrimaryButton onClick={() => setScreen("intake")}>시작하기</PrimaryButton>
              <TextButton onClick={() => setScreen("intake")}>로그인</TextButton>
            </BottomActions>
          </OnboardingScreen>
        )}

        {screen === "intake" && (
          <IntakeScreen>
            <SoftHeader>
              <span>Tuti</span>
              <SkipButton
                onClick={() => {
                  resetAnswers();
                  setStep(0);
                }}
              >
                다시
              </SkipButton>
            </SoftHeader>
            <QuestionBlock>
              <p>
                {step + 1} / {intakeSteps.length}
              </p>
              <h2>{activeStep.question}</h2>
            </QuestionBlock>
            <OptionList>
              {activeStep.options.map((option) => (
                <OptionCard key={option.value} onClick={() => chooseAnswer(option.value)}>
                  <span>{option.label}</span>
                  <small>{option.hint}</small>
                </OptionCard>
              ))}
            </OptionList>
          </IntakeScreen>
        )}

        {screen === "home" && (
          <HomeScreen>
            <AmbientCard place={places[0]} quiet />
            <HomeCopy>
              <p>
                {feature.energy === "low"
                  ? "멀리 안 가도 괜찮아요."
                  : "반나절 정도면 충분할지도 몰라요."}
              </p>
              <h2>생각 안 해도 되게 준비했어요.</h2>
            </HomeCopy>
            <PrimaryButton onClick={() => setScreen("swipe")}>오늘 가능한 곳 보기</PrimaryButton>
          </HomeScreen>
        )}

        {screen === "swipe" && (
          <SwipeScreen
            onPointerDown={(event) => setGestureStart({ x: event.clientX, y: event.clientY })}
            onPointerUp={(event) => finishGesture(event.clientX, event.clientY)}
          >
            <SwipeCopy>
              <p>오늘 가능한 정도</p>
              <h2>{activePlace?.phrase}</h2>
            </SwipeCopy>
            <Carousel>
              {places.map((place, index) => (
                <SwipeCard
                  key={place.id}
                  place={place}
                  offset={getOffset(index, activeIndex, places.length)}
                  active={index === activeIndex}
                  onClick={() => setActiveIndex(index)}
                />
              ))}
            </Carousel>
            <Dots>
              {places.map((place, index) => (
                <Dot
                  key={place.id}
                  aria-label={`${index + 1}번째 카드`}
                  $active={index === activeIndex}
                  onClick={() => setActiveIndex(index)}
                />
              ))}
            </Dots>
            <GestureHints>
              <button onClick={() => moveCard(-1)}>이전</button>
              <button onClick={() => setScreen("detail")}>자세히</button>
              <button onClick={() => moveCard(1)}>다음</button>
            </GestureHints>
          </SwipeScreen>
        )}

        {screen === "detail" && activePlace && (
          <DetailScreen place={activePlace} onBack={() => setScreen("swipe")} />
        )}

        {screen === "journal" && (
          <JournalScreen places={places.slice(0, 3)} onBack={() => setScreen("swipe")} />
        )}
      </Phone>
    </Shell>
  );
}

function getOffset(index: number, active: number, length: number) {
  const raw = index - active;
  if (raw > length / 2) return raw - length;
  if (raw < -length / 2) return raw + length;
  return raw;
}

function AmbientCard({ place, quiet = false }: { place?: TutiPlace; quiet?: boolean }) {
  return (
    <AmbientCardFrame $image={place?.image} $quiet={quiet}>
      <PlayMark>▷</PlayMark>
    </AmbientCardFrame>
  );
}

function SwipeCard({
  place,
  offset,
  active,
  onClick,
}: {
  place: TutiPlace;
  offset: number;
  active: boolean;
  onClick: () => void;
}) {
  const hidden = Math.abs(offset) > 2;

  return (
    <SwipeCardButton
      $image={place.image}
      $active={active}
      style={{
        transform: `translateX(${offset * 78}px) scale(${active ? 1 : 0.88}) rotate(${offset * -4}deg)`,
        opacity: hidden ? 0 : active ? 1 : 0.56,
        zIndex: 10 - Math.abs(offset),
      }}
      onClick={onClick}
    >
      <span>{place.phrase}</span>
      <small>{place.travelTime}</small>
    </SwipeCardButton>
  );
}

function DetailScreen({ place, onBack }: { place: TutiPlace; onBack: () => void }) {
  return (
    <DetailScreenFrame>
      <BackButton onClick={onBack}>돌아가기</BackButton>
      <AmbientCard place={place} />
      <DetailCopy>
        <p>{place.name}</p>
        <h2>{place.phrase}</h2>
        <span>{place.note}</span>
      </DetailCopy>
      <InfoRows>
        <InfoRow label="이동시간" value={place.travelTime} />
        <InfoRow label="혼잡도" value={place.crowd} />
        <InfoRow label="오늘" value={place.today} />
      </InfoRows>
    </DetailScreenFrame>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <InfoRowFrame>
      <span>{label}</span>
      <strong>{value}</strong>
    </InfoRowFrame>
  );
}

function JournalScreen({ places, onBack }: { places: TutiPlace[]; onBack: () => void }) {
  return (
    <JournalScreenFrame>
      <BackButton onClick={onBack}>돌아가기</BackButton>
      <JournalHeader>
        <p>나의 기록</p>
        <h2>지나간 공기</h2>
      </JournalHeader>
      <MemoryList>
        {places.map((place) => (
          <MemoryCard key={place.id}>
            <MemoryImage $image={place.image} />
            <p>{place.phrase}</p>
            <span>오늘은 이 정도면 충분했어요.</span>
          </MemoryCard>
        ))}
      </MemoryList>
    </JournalScreenFrame>
  );
}

const Shell = styled.main`
  min-height: 100svh;
  display: grid;
  place-items: center;
  padding: 28px;
  background:
    radial-gradient(circle at top left, rgba(139, 168, 149, 0.22), transparent 34%),
    linear-gradient(135deg, #f6f4ef 0%, #e8ece4 52%, #dce5e0 100%);

  @media (max-width: 520px) {
    padding: 0;
    background: #fbfaf6;
  }
`;

const Phone = styled.section`
  position: relative;
  width: min(100%, 390px);
  height: min(860px, calc(100svh - 56px));
  min-height: 680px;
  overflow: hidden;
  border: 1px solid rgba(31, 33, 29, 0.18);
  border-radius: 34px;
  background: #fbfaf6;
  box-shadow: 0 24px 80px rgba(31, 33, 29, 0.16);

  @media (max-width: 520px) {
    width: 100%;
    height: 100svh;
    min-height: 620px;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
`;

const ScreenFrame = styled.section`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 44px 24px 28px;
  animation: enter 420ms ease both;

  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(10px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 520px) {
    padding-inline: 20px;
  }
`;

const OnboardingScreen = styled(ScreenFrame)`
  align-items: center;
  justify-content: center;
  gap: 24px;
`;

const IntakeScreen = styled(ScreenFrame)`
  gap: 36px;
`;

const HomeScreen = styled(ScreenFrame)`
  justify-content: flex-end;
  gap: 22px;
`;

const SwipeScreen = styled(ScreenFrame)`
  justify-content: space-between;
  touch-action: none;
`;

const DetailScreenFrame = styled(ScreenFrame)`
  gap: 20px;
`;

const JournalScreenFrame = styled(ScreenFrame)`
  gap: 22px;
`;

const BrandMark = styled.div`
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(31, 33, 29, 0.24);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  font-size: 42px;
  font-weight: 800;
  box-shadow: 0 18px 48px rgba(31, 33, 29, 0.08);
`;

const BrandText = styled.div`
  display: grid;
  gap: 8px;
  text-align: center;

  h1 {
    font-size: 38px;
    line-height: 1.05;
    letter-spacing: 0;
  }

  p {
    color: #777469;
    font-size: 14px;
    line-height: 1.6;
  }
`;

const BottomActions = styled.div`
  position: absolute;
  inset: auto 24px 56px;
  display: grid;
  gap: 16px;
`;

const BaseButton = styled.button`
  border: 0;
  cursor: pointer;
`;

const PrimaryButton = styled(BaseButton)`
  min-height: 54px;
  border-radius: 999px;
  background: #24271f;
  color: #fffdf8;
  font-weight: 700;
  transition: transform 180ms ease, background 180ms ease;

  &:active {
    transform: scale(0.98);
  }
`;

const TextButton = styled(BaseButton)`
  width: fit-content;
  justify-self: center;
  padding: 8px 16px;
  background: transparent;
  color: #68665d;
  font-size: 14px;
`;

const SkipButton = styled(TextButton)`
  justify-self: auto;
  padding: 0;
`;

const BackButton = styled(TextButton)`
  justify-self: auto;
  padding: 0;
`;

const SoftHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;

  span {
    font-size: 22px;
    font-weight: 800;
  }
`;

const QuestionBlock = styled.div`
  display: grid;
  gap: 12px;
  padding-top: 36px;

  p {
    color: #777469;
    font-size: 14px;
    line-height: 1.6;
  }

  h2 {
    max-width: 290px;
    font-size: 28px;
    line-height: 1.24;
    letter-spacing: 0;
  }
`;

const OptionList = styled.div`
  display: grid;
  gap: 14px;
`;

const OptionCard = styled(BaseButton)`
  min-height: 82px;
  display: grid;
  gap: 7px;
  justify-items: start;
  padding: 20px;
  border: 1px solid rgba(31, 33, 29, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.58);
  color: #23251f;
  text-align: left;
  transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;

  &:hover {
    border-color: rgba(31, 33, 29, 0.28);
    background: rgba(255, 255, 255, 0.9);
  }

  &:active {
    transform: scale(0.98);
  }

  span {
    font-size: 18px;
    font-weight: 750;
  }

  small {
    color: #777469;
    font-size: 13px;
  }
`;

const AmbientCardFrame = styled.div<{ $image?: string; $quiet: boolean }>`
  position: relative;
  min-height: ${({ $quiet }) => ($quiet ? "430px" : "360px")};
  overflow: hidden;
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(31, 33, 29, 0.06), rgba(31, 33, 29, 0.28)),
    ${({ $image }) => ($image ? `url(${$image})` : "#d7ddd4")};
  background-position: center;
  background-size: cover;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);

  &::before {
    content: "";
    position: absolute;
    inset: -20%;
    background: linear-gradient(
      110deg,
      transparent 15%,
      rgba(255, 255, 255, 0.2) 45%,
      transparent 70%
    );
    animation: lightPass 5.8s ease-in-out infinite;
  }

  @keyframes lightPass {
    0%,
    42% {
      transform: translateX(-48%);
    }

    76%,
    100% {
      transform: translateX(48%);
    }
  }

  @media (max-width: 520px) {
    min-height: ${({ $quiet }) => ($quiet ? "390px" : "360px")};
  }
`;

const PlayMark = styled.span`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.84);
  font-size: 34px;
  text-shadow: 0 6px 22px rgba(0, 0, 0, 0.28);
`;

const HomeCopy = styled.div`
  display: grid;
  gap: 8px;

  p {
    color: #777469;
    font-size: 14px;
    line-height: 1.6;
  }

  h2 {
    max-width: 280px;
    font-size: 29px;
    line-height: 1.24;
    letter-spacing: 0;
  }
`;

const SwipeCopy = styled.div`
  display: grid;
  gap: 8px;

  p {
    color: #777469;
    font-size: 14px;
    line-height: 1.6;
  }

  h2 {
    max-width: 300px;
    min-height: 72px;
    font-size: 27px;
    line-height: 1.28;
    letter-spacing: 0;
  }
`;

const Carousel = styled.div`
  position: relative;
  height: 390px;
  display: grid;
  place-items: center;
  perspective: 900px;

  @media (max-width: 520px) {
    height: 360px;
  }
`;

const SwipeCardButton = styled(BaseButton)<{ $image: string; $active: boolean }>`
  position: absolute;
  width: 210px;
  height: 330px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 10px;
  padding: 18px;
  overflow: hidden;
  border-radius: 8px;
  background-color: #cad4cb;
  background-image: ${({ $image }) => `url(${$image})`};
  background-position: center;
  background-size: cover;
  color: #fffdf8;
  text-align: left;
  box-shadow: ${({ $active }) =>
    $active ? "0 28px 70px rgba(31, 33, 29, 0.28)" : "0 20px 54px rgba(31, 33, 29, 0.22)"};
  transition: transform 360ms ease, opacity 260ms ease;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 28%, rgba(0, 0, 0, 0.62));
  }

  &:active {
    transform: scale(0.98);
  }

  span,
  small {
    position: relative;
    z-index: 1;
  }

  span {
    font-size: 19px;
    font-weight: 800;
    line-height: 1.35;
  }

  small {
    color: rgba(255, 253, 248, 0.8);
  }
`;

const Dots = styled.div`
  display: flex;
  justify-content: center;
  gap: 10px;
`;

const Dot = styled(BaseButton)<{ $active: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: ${({ $active }) => ($active ? "#24271f" : "rgba(31, 33, 29, 0.22)")};
`;

const GestureHints = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;

  button {
    min-height: 42px;
    border: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.5);
    color: #68665d;
    cursor: pointer;
  }
`;

const DetailCopy = styled.div`
  display: grid;
  gap: 8px;

  p {
    color: #777469;
    font-size: 14px;
    line-height: 1.6;
  }

  h2 {
    font-size: 28px;
    line-height: 1.25;
    letter-spacing: 0;
  }

  span {
    color: #68665d;
    font-size: 15px;
    line-height: 1.7;
  }
`;

const InfoRows = styled.div`
  display: grid;
  gap: 1px;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(31, 33, 29, 0.08);
`;

const InfoRowFrame = styled.div`
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.64);

  span {
    color: #777469;
    font-size: 14px;
  }

  strong {
    font-size: 15px;
  }
`;

const JournalHeader = styled.div`
  display: grid;
  gap: 8px;

  p {
    color: #777469;
    font-size: 14px;
    line-height: 1.6;
  }

  h2 {
    font-size: 30px;
    letter-spacing: 0;
  }
`;

const MemoryList = styled.div`
  display: grid;
  gap: 14px;
  overflow-y: auto;
  padding-right: 2px;
`;

const MemoryCard = styled.article`
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 14px;
  align-items: center;
  min-height: 116px;
  padding: 10px;
  border: 1px solid rgba(31, 33, 29, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.56);

  p {
    font-weight: 800;
    line-height: 1.45;
  }

  span {
    grid-column: 2;
    color: #777469;
    font-size: 13px;
    line-height: 1.5;
  }
`;

const MemoryImage = styled.div<{ $image: string }>`
  width: 96px;
  height: 96px;
  border-radius: 7px;
  background-image: ${({ $image }) => `url(${$image})`};
  background-position: center;
  background-size: cover;
`;
