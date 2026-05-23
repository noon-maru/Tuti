"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getRecommendations, interpretState, type TutiPlace } from "@/lib/recommendations";
import { useTutiStore, type IntakeAnswers } from "@/store/tuti";
import { Providers } from "./providers";
import styles from "./page.module.css";

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
    <main className={styles.shell}>
      <section className={styles.phone} aria-label="Tuti prototype">
        {screen === "onboarding" && (
          <section className={`${styles.screen} ${styles.onboarding}`}>
            <div className={styles.brandMark}>T</div>
            <div className={styles.brandText}>
              <h1>Tuti</h1>
              <p>조금 다른 공기.</p>
            </div>
            <div className={styles.bottomActions}>
              <button className={styles.primaryButton} onClick={() => setScreen("intake")}>
                시작하기
              </button>
              <button className={styles.textButton} onClick={() => setScreen("intake")}>
                로그인
              </button>
            </div>
          </section>
        )}

        {screen === "intake" && (
          <section className={`${styles.screen} ${styles.intake}`}>
            <div className={styles.softHeader}>
              <span>Tuti</span>
              <button
                className={styles.skipButton}
                onClick={() => {
                  resetAnswers();
                  setStep(0);
                }}
              >
                다시
              </button>
            </div>
            <div className={styles.questionBlock}>
              <p>{step + 1} / {intakeSteps.length}</p>
              <h2>{activeStep.question}</h2>
            </div>
            <div className={styles.optionList}>
              {activeStep.options.map((option) => (
                <button
                  key={option.value}
                  className={styles.optionCard}
                  onClick={() => chooseAnswer(option.value)}
                >
                  <span>{option.label}</span>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </section>
        )}

        {screen === "home" && (
          <section className={`${styles.screen} ${styles.home}`}>
            <AmbientCard place={places[0]} quiet />
            <div className={styles.homeCopy}>
              <p>{feature.energy === "low" ? "멀리 안 가도 괜찮아요." : "반나절 정도면 충분할지도 몰라요."}</p>
              <h2>생각 안 해도 되게 준비했어요.</h2>
            </div>
            <button className={styles.primaryButton} onClick={() => setScreen("swipe")}>
              오늘 가능한 곳 보기
            </button>
          </section>
        )}

        {screen === "swipe" && (
          <section
            className={`${styles.screen} ${styles.swipe}`}
            onPointerDown={(event) => setGestureStart({ x: event.clientX, y: event.clientY })}
            onPointerUp={(event) => finishGesture(event.clientX, event.clientY)}
          >
            <div className={styles.swipeCopy}>
              <p>오늘 가능한 정도</p>
              <h2>{activePlace?.phrase}</h2>
            </div>
            <div className={styles.carousel}>
              {places.map((place, index) => (
                <SwipeCard
                  key={place.id}
                  place={place}
                  offset={getOffset(index, activeIndex, places.length)}
                  active={index === activeIndex}
                  onClick={() => setActiveIndex(index)}
                />
              ))}
            </div>
            <div className={styles.dots}>
              {places.map((place, index) => (
                <button
                  key={place.id}
                  aria-label={`${index + 1}번째 카드`}
                  className={index === activeIndex ? styles.activeDot : ""}
                  onClick={() => setActiveIndex(index)}
                />
              ))}
            </div>
            <div className={styles.gestureHints}>
              <button onClick={() => moveCard(-1)}>이전</button>
              <button onClick={() => setScreen("detail")}>자세히</button>
              <button onClick={() => moveCard(1)}>다음</button>
            </div>
          </section>
        )}

        {screen === "detail" && activePlace && (
          <DetailScreen place={activePlace} onBack={() => setScreen("swipe")} />
        )}

        {screen === "journal" && (
          <JournalScreen places={places.slice(0, 3)} onBack={() => setScreen("swipe")} />
        )}
      </section>
    </main>
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
    <div
      className={`${styles.ambientCard} ${quiet ? styles.quietAmbient : ""}`}
      style={{ backgroundImage: place ? `url(${place.image})` : undefined }}
    >
      <span className={styles.playMark}>▷</span>
    </div>
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
    <button
      className={`${styles.swipeCard} ${active ? styles.currentCard : ""}`}
      style={{
        transform: `translateX(${offset * 78}px) scale(${active ? 1 : 0.88}) rotate(${offset * -4}deg)`,
        opacity: hidden ? 0 : active ? 1 : 0.56,
        zIndex: 10 - Math.abs(offset),
        backgroundImage: `url(${place.image})`,
      }}
      onClick={onClick}
    >
      <span>{place.phrase}</span>
      <small>{place.travelTime}</small>
    </button>
  );
}

function DetailScreen({ place, onBack }: { place: TutiPlace; onBack: () => void }) {
  return (
    <section className={`${styles.screen} ${styles.detail}`}>
      <button className={styles.backButton} onClick={onBack}>돌아가기</button>
      <AmbientCard place={place} />
      <div className={styles.detailCopy}>
        <p>{place.name}</p>
        <h2>{place.phrase}</h2>
        <span>{place.note}</span>
      </div>
      <div className={styles.infoRows}>
        <InfoRow label="이동시간" value={place.travelTime} />
        <InfoRow label="혼잡도" value={place.crowd} />
        <InfoRow label="오늘" value={place.today} />
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function JournalScreen({ places, onBack }: { places: TutiPlace[]; onBack: () => void }) {
  return (
    <section className={`${styles.screen} ${styles.journal}`}>
      <button className={styles.backButton} onClick={onBack}>돌아가기</button>
      <div className={styles.journalHeader}>
        <p>나의 기록</p>
        <h2>지나간 공기</h2>
      </div>
      <div className={styles.memoryList}>
        {places.map((place) => (
          <article key={place.id} className={styles.memoryCard}>
            <div style={{ backgroundImage: `url(${place.image})` }} />
            <p>{place.phrase}</p>
            <span>오늘은 이 정도면 충분했어요.</span>
          </article>
        ))}
      </div>
    </section>
  );
}
