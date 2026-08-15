"use client";

import styled from "@emotion/styled";
import Link from "next/link";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  adminJsonRequest,
  AdminApiError,
  fetchAdminJson,
} from "@/lib/adminApi";
import type {
  AdminInquiriesResponse,
  AdminInquiryItem,
  AdminLogItem,
  AdminLogsResponse,
  AdminOverview,
  AdminOverviewResponse,
  AdminPlaceItem,
  AdminPlacesMeta,
  AdminPlacesResponse,
  AdminRecommendationFunnelResponse,
  AdminReportItem,
  AdminReportsResponse,
  AdminSettingItem,
  AdminSettingsResponse,
  AdminUserItem,
  AdminUsersResponse,
} from "@/shared/api/admin";

export type AdminTab =
  | "overview"
  | "funnel"
  | "logs"
  | "places"
  | "reports"
  | "inquiries"
  | "users"
  | "settings";

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "대시보드" },
  { id: "funnel", label: "추천 퍼널" },
  { id: "logs", label: "로그" },
  { id: "places", label: "장소" },
  { id: "reports", label: "신고" },
  { id: "inquiries", label: "1:1 문의" },
  { id: "users", label: "권한" },
  { id: "settings", label: "설정" },
];

const mobilePrimaryTabs: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "홈" },
  { id: "inquiries", label: "문의" },
  { id: "reports", label: "신고" },
  { id: "places", label: "장소" },
];

const mobileMoreTabs: Array<{ id: AdminTab; label: string }> = [
  { id: "funnel", label: "추천 행동 퍼널" },
  { id: "users", label: "사용자 및 권한" },
  { id: "logs", label: "시스템 로그" },
  { id: "settings", label: "운영 설정" },
];

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

type PlaceFilterState = {
  candidate: string;
  reviewStatus: string;
  visibility: string;
  source: string;
  contentType: string;
  sido: string;
  sigungu: string;
  sort: string;
};

const defaultPlaceFilters: PlaceFilterState = {
  candidate: "pool",
  reviewStatus: "",
  visibility: "",
  source: "",
  contentType: "",
  sido: "",
  sigungu: "",
  sort: "updated-desc",
};

function AdminSectionIcon({
  section,
}: {
  section: AdminTab | "more";
}) {
  if (section === "overview") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10.5 12 4l8 6.5V20H4v-9.5Z" />
        <path d="M9.5 20v-6h5v6" />
      </svg>
    );
  }

  if (section === "inquiries") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5h16v11H9l-5 3v-14Z" />
        <path d="M8 9h8M8 12.5h5" />
      </svg>
    );
  }

  if (section === "reports") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 21 20H3L12 3Z" />
        <path d="M12 9v5M12 17.5v.1" />
      </svg>
    );
  }

  if (section === "places") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </svg>
  );
}

export function AdminScreen({
  initialTab = "overview",
}: {
  initialTab?: AdminTab;
}) {
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [funnel, setFunnel] =
    useState<AdminRecommendationFunnelResponse | null>(null);
  const [funnelDays, setFunnelDays] = useState(30);
  const [logs, setLogs] = useState<AdminLogItem[]>([]);
  const [places, setPlaces] = useState<AdminPlaceItem[]>([]);
  const [placesMeta, setPlacesMeta] = useState<AdminPlacesMeta | null>(null);
  const [reports, setReports] = useState<AdminReportItem[]>([]);
  const [inquiries, setInquiries] = useState<AdminInquiryItem[]>([]);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [settings, setSettings] = useState<AdminSettingItem[]>([]);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [placeFilters, setPlaceFilters] = useState<PlaceFilterState>(
    defaultPlaceFilters,
  );
  const [placePage, setPlacePage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [drawerDragOffset, setDrawerDragOffset] = useState(0);
  const [drawerDragging, setDrawerDragging] = useState(false);
  const drawerDragStart = useRef({ y: 0, time: 0 });
  const adminLayoutRef = useRef<HTMLDivElement>(null);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
    setDrawerDragging(false);
    setDrawerDragOffset(0);
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setDrawerDragging(false);
    setDrawerDragOffset(0);
    setMobileMenuOpen((open) => !open);
  }, []);

  const handleDrawerPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    drawerDragStart.current = {
      y: event.clientY,
      time: performance.now(),
    };
    setDrawerDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDrawerPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!drawerDragging) return;
    setDrawerDragOffset(
      Math.max(0, event.clientY - drawerDragStart.current.y),
    );
  };

  const finishDrawerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!drawerDragging) return;

    const distance = Math.max(
      0,
      event.clientY - drawerDragStart.current.y,
    );
    const elapsed = Math.max(
      1,
      performance.now() - drawerDragStart.current.time,
    );
    const velocity = distance / elapsed;

    setDrawerDragging(false);

    if (distance >= 72 || (distance >= 32 && velocity >= 0.5)) {
      closeMobileMenu();
    } else {
      setDrawerDragOffset(0);
    }
  };

  const changeTab = useCallback(
    (nextTab: AdminTab, historyMode: "push" | "none" = "push") => {
      setTab(nextTab);
      setQuery("");
      setAppliedQuery("");
      setFilter("");
      setPlaceFilters(defaultPlaceFilters);
      setPlacePage(1);
      setError(null);
      setNotice(null);
      closeMobileMenu();

      if (historyMode === "push") {
        const url = new URL(window.location.href);

        if (nextTab === "overview") {
          url.searchParams.delete("section");
        } else {
          url.searchParams.set("section", nextTab);
        }

        window.history.pushState({ adminTab: nextTab }, "", url);
      }

      adminLayoutRef.current?.scrollTo({ top: 0, behavior: "auto" });
      window.scrollTo({ top: 0, behavior: "auto" });
    },
    [closeMobileMenu],
  );

  const loadOverview = useCallback(async () => {
    const response =
      await fetchAdminJson<AdminOverviewResponse>("overview");
    setOverview(response.overview);
  }, []);

  const loadTab = useCallback(async () => {
    const searchParams = new URLSearchParams();

    if (appliedQuery) searchParams.set("q", appliedQuery);

    if (tab === "logs" && filter) searchParams.set("level", filter);
    if (tab === "places") {
      searchParams.set("candidate", placeFilters.candidate);
      if (placeFilters.reviewStatus) {
        searchParams.set("reviewStatus", placeFilters.reviewStatus);
      }
      if (placeFilters.visibility) {
        searchParams.set("visibility", placeFilters.visibility);
      }
      if (placeFilters.source) {
        searchParams.set("source", placeFilters.source);
      }
      if (placeFilters.contentType) {
        searchParams.set("contentType", placeFilters.contentType);
      }
      if (placeFilters.sido) {
        searchParams.set("sido", placeFilters.sido);
      }
      if (placeFilters.sigungu) {
        searchParams.set("sigungu", placeFilters.sigungu);
      }
      searchParams.set("sort", placeFilters.sort);
      searchParams.set("page", String(placePage));
    }
    if (tab === "reports" && filter) searchParams.set("status", filter);
    if (tab === "inquiries" && filter) searchParams.set("status", filter);

    const suffix = searchParams.size ? `?${searchParams}` : "";

    if (tab === "funnel") {
      const response =
        await fetchAdminJson<AdminRecommendationFunnelResponse>(
          `recommendation-funnel?days=${funnelDays}`,
        );
      setFunnel(response);
    } else if (tab === "logs") {
      const response = await fetchAdminJson<AdminLogsResponse>(
        `logs${suffix}`,
      );
      setLogs(response.logs);
    } else if (tab === "places") {
      const response = await fetchAdminJson<AdminPlacesResponse>(
        `places${suffix}`,
      );
      setPlaces(response.places);
      setPlacesMeta(response.meta);
    } else if (tab === "reports") {
      const response = await fetchAdminJson<AdminReportsResponse>(
        `reports${suffix}`,
      );
      setReports(response.reports);
    } else if (tab === "inquiries") {
      const response = await fetchAdminJson<AdminInquiriesResponse>(
        `inquiries${suffix}`,
      );
      setInquiries(response.inquiries);
    } else if (tab === "users") {
      const response = await fetchAdminJson<AdminUsersResponse>(
        `users${suffix}`,
      );
      setUsers(response.users);
    } else if (tab === "settings") {
      const response =
        await fetchAdminJson<AdminSettingsResponse>("settings");
      setSettings(response.settings);
    }
  }, [appliedQuery, filter, funnelDays, placeFilters, placePage, tab]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        loadOverview(),
        tab === "overview" ? Promise.resolve() : loadTab(),
      ]);
      setAccessStatus(null);
    } catch (loadError) {
      setError(toErrorMessage(loadError));
      setAccessStatus(
        loadError instanceof AdminApiError ? loadError.status : null,
      );
    } finally {
      setLoading(false);
    }
  }, [loadOverview, loadTab, tab]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [refresh]);

  useEffect(() => {
    const handlePopState = () => {
      const nextTab = normalizeAdminTab(
        new URL(window.location.href).searchParams.get("section"),
      );
      changeTab(nextTab, "none");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [changeTab]);

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileMenu();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeMobileMenu, mobileMenuOpen]);

  const mutate = async (
    resource: "inquiries" | "places" | "reports" | "settings" | "users",
    id: string,
    init: RequestInit,
  ) => {
    setMutatingId(id);
    setError(null);
    setNotice(null);

    try {
      await fetchAdminJson(resource, init);
      await Promise.all([loadOverview(), loadTab()]);
      setNotice("변경사항을 저장했어요.");
    } catch (mutationError) {
      setError(toErrorMessage(mutationError));
    } finally {
      setMutatingId(null);
    }
  };

  const filterOptions = useMemo(() => getFilterOptions(tab), [tab]);
  const updatePlaceFilter = useCallback(
    (key: keyof PlaceFilterState, value: string) => {
      setPlaceFilters((current) => ({
        ...current,
        [key]: value,
        ...(key === "sido" ? { sigungu: "" } : {}),
      }));
      setPlacePage(1);
    },
    [],
  );

  if (accessStatus === 401 || accessStatus === 403) {
    return (
      <AccessPage>
        <AccessCard>
          <Wordmark>Tuti Admin</Wordmark>
          <h1>
            {accessStatus === 401
              ? "관리자 로그인이 필요해요."
              : "관리자 권한이 필요해요."}
          </h1>
          <p>{error}</p>
          <AccessActions>
            <PrimaryLink href="/login">로그인하기</PrimaryLink>
            <SecondaryLink href="/">서비스로 돌아가기</SecondaryLink>
          </AccessActions>
        </AccessCard>
      </AccessPage>
    );
  }

  return (
    <AdminLayout
      ref={adminLayoutRef}
      $drawerOpen={mobileMenuOpen}
    >
      <Sidebar>
        <Brand>
          <Wordmark>Tuti</Wordmark>
          <span>관리자 콘솔</span>
        </Brand>
        <Navigation aria-label="관리자 메뉴">
          {tabs.map((item) => (
            <NavButton
              key={item.id}
              type="button"
              $active={tab === item.id}
              onClick={() => changeTab(item.id)}
            >
              {item.label}
            </NavButton>
          ))}
        </Navigation>
        <TourismDataLink href="/admin/recommendation-simulator">
          추천 시뮬레이터
        </TourismDataLink>
        <TourismDataLink href="/admin/tourism-data">
          관광 데이터 관리
        </TourismDataLink>
        <HomeLink href="/">서비스로 돌아가기</HomeLink>
      </Sidebar>

      <Main>
        <Header>
          <div>
            <Eyebrow>TUTI ADMIN</Eyebrow>
            <h1>{tabs.find((item) => item.id === tab)?.label}</h1>
          </div>
          <RefreshButton type="button" onClick={() => void refresh()}>
            <RefreshIcon viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 7v5h-5" />
              <path d="M18.2 16.8A8 8 0 1 1 19.8 9" />
            </RefreshIcon>
            <RefreshLabel>새로고침</RefreshLabel>
          </RefreshButton>
        </Header>

        {tab === "places" ? (
          <PlacesToolbar
            query={query}
            appliedQuery={appliedQuery}
            filters={placeFilters}
            meta={placesMeta}
            onQueryChange={setQuery}
            onSearch={() => {
              setAppliedQuery(query.trim());
              setPlacePage(1);
            }}
            onFilterChange={updatePlaceFilter}
            onReset={() => {
              setQuery("");
              setAppliedQuery("");
              setPlaceFilters(defaultPlaceFilters);
              setPlacePage(1);
            }}
          />
        ) : tab !== "overview" &&
          tab !== "funnel" &&
          tab !== "settings" ? (
          <Toolbar
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedQuery(query.trim());
            }}
          >
            <SearchInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={getSearchPlaceholder(tab)}
              aria-label="관리 데이터 검색"
            />
            {filterOptions.length > 0 && (
              <Select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label="관리 데이터 필터"
              >
                {filterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
            <SearchButton type="submit">검색</SearchButton>
          </Toolbar>
        ) : null}

        {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
        {notice && <SuccessNotice role="status">{notice}</SuccessNotice>}
        {loading ? (
          <StatePanel>관리 데이터를 불러오고 있어요.</StatePanel>
        ) : tab === "overview" ? (
          <OverviewPanel overview={overview} onNavigate={changeTab} />
        ) : tab === "funnel" ? (
          <RecommendationFunnelPanel
            funnel={funnel}
            days={funnelDays}
            onDaysChange={setFunnelDays}
          />
        ) : tab === "logs" ? (
          <LogsPanel logs={logs} />
        ) : tab === "places" ? (
          <PlacesPanel
            places={places}
            meta={placesMeta}
            mutatingId={mutatingId}
            onPageChange={setPlacePage}
            onChange={(placeId, update) =>
              void mutate(
                "places",
                placeId,
                adminJsonRequest("PATCH", { placeId, ...update }),
              )
            }
          />
        ) : tab === "reports" ? (
          <ReportsPanel
            reports={reports}
            mutatingId={mutatingId}
            onStatusChange={(reportId, status) =>
              void mutate(
                "reports",
                reportId,
                adminJsonRequest("PATCH", { reportId, status }),
              )
            }
            onForceDelete={(report) => {
              if (
                !window.confirm(
                  `"${report.targetTitle}" 기록을 강제로 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
                )
              ) {
                return;
              }

              void mutate(
                "reports",
                report.id,
                adminJsonRequest("DELETE", { reportId: report.id }),
              );
            }}
          />
        ) : tab === "inquiries" ? (
          <InquiriesPanel
            inquiries={inquiries}
            mutatingId={mutatingId}
            onSave={(inquiryId, status, adminResponse) =>
              void mutate(
                "inquiries",
                inquiryId,
                adminJsonRequest("PATCH", {
                  inquiryId,
                  status,
                  adminResponse,
                }),
              )
            }
          />
        ) : tab === "users" ? (
          <UsersPanel
            users={users}
            mutatingId={mutatingId}
            onRoleChange={(userId, role) =>
              void mutate(
                "users",
                userId,
                adminJsonRequest("PATCH", { userId, role }),
              )
            }
            onForceDelete={(user) => {
              if (
                !window.confirm(
                  `"${user.email ?? user.id}" 계정과 모든 기록을 강제로 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
                )
              ) {
                return;
              }

              void mutate(
                "users",
                user.id,
                adminJsonRequest("DELETE", { userId: user.id }),
              );
            }}
          />
        ) : (
          <SettingsPanel
            settings={settings}
            mutatingId={mutatingId}
            onSave={(key, value) =>
              void mutate(
                "settings",
                key,
                adminJsonRequest("PATCH", { key, value }),
              )
            }
          />
        )}
      </Main>

      <MobileNavigation aria-label="모바일 관리자 메뉴">
        {mobilePrimaryTabs.map((item) => (
          <MobileNavButton
            key={item.id}
            type="button"
            $active={tab === item.id}
            onClick={() => changeTab(item.id)}
          >
            <MobileNavIcon $active={tab === item.id}>
              <AdminSectionIcon section={item.id} />
            </MobileNavIcon>
            <MobileNavLabel>{item.label}</MobileNavLabel>
            {item.id === "inquiries" &&
              Boolean(overview?.pendingInquiries) && (
                <MobileNavBadge>{overview?.pendingInquiries}</MobileNavBadge>
              )}
            {item.id === "reports" &&
              Boolean(overview?.pendingReports) && (
                <MobileNavBadge>{overview?.pendingReports}</MobileNavBadge>
              )}
          </MobileNavButton>
        ))}
        <MobileNavButton
          type="button"
          $active={mobileMoreTabs.some((item) => item.id === tab)}
          aria-expanded={mobileMenuOpen}
          onClick={toggleMobileMenu}
        >
          <MobileNavIcon
            $active={mobileMoreTabs.some((item) => item.id === tab)}
          >
            <AdminSectionIcon section="more" />
          </MobileNavIcon>
          <MobileNavLabel>더보기</MobileNavLabel>
        </MobileNavButton>
      </MobileNavigation>

      <MobileMenuBackdrop
        $open={mobileMenuOpen}
        $dragOffset={drawerDragOffset}
        $dragging={drawerDragging}
        aria-hidden={!mobileMenuOpen}
        onClick={closeMobileMenu}
      >
        <MobileMenu
          $open={mobileMenuOpen}
          $dragOffset={drawerDragOffset}
          $dragging={drawerDragging}
          role="dialog"
          aria-modal="true"
          aria-label="관리자 추가 메뉴"
          onClick={(event) => event.stopPropagation()}
        >
          <MobileMenuHandle
            type="button"
            aria-label="아래로 끌어 더보기 메뉴 닫기"
            onPointerDown={handleDrawerPointerDown}
            onPointerMove={handleDrawerPointerMove}
            onPointerUp={finishDrawerDrag}
            onPointerCancel={finishDrawerDrag}
          >
            <span />
          </MobileMenuHandle>
          <MobileMenuHeader>
            <div>
              <span>더보기</span>
              <h2>관리자 메뉴</h2>
            </div>
            <DrawerCloseButton
              type="button"
              aria-label="더보기 메뉴 닫기"
              onClick={closeMobileMenu}
            >
              ×
            </DrawerCloseButton>
          </MobileMenuHeader>
          <MobileMenuList>
            {mobileMoreTabs.map((item) => (
              <MobileMenuButton
                key={item.id}
                type="button"
                $active={tab === item.id}
                onClick={() => changeTab(item.id)}
              >
                <span>{item.label}</span>
                <span aria-hidden="true">›</span>
              </MobileMenuButton>
            ))}
            <MobileServiceLink href="/admin/recommendation-simulator">
              <span>추천 시뮬레이터</span>
              <span aria-hidden="true">›</span>
            </MobileServiceLink>
            <MobileServiceLink href="/admin/tourism-data">
              <span>관광 데이터 관리</span>
              <span aria-hidden="true">›</span>
            </MobileServiceLink>
            <MobileServiceLink href="/">
              <span>Tuti 서비스로 돌아가기</span>
              <span aria-hidden="true">›</span>
            </MobileServiceLink>
          </MobileMenuList>
        </MobileMenu>
      </MobileMenuBackdrop>
    </AdminLayout>
  );
}

function OverviewPanel({
  overview,
  onNavigate,
}: {
  overview: AdminOverview | null;
  onNavigate: (tab: AdminTab) => void;
}) {
  const cards = [
    ["전체 사용자", overview?.users ?? 0],
    ["관리자", overview?.admins ?? 0],
    ["노출 중인 장소", overview?.activePlaces ?? 0],
    ["오늘 로그", overview?.logsToday ?? 0],
  ];

  return (
    <OverviewContent>
      <section>
        <SectionTitle>지금 처리할 일</SectionTitle>
        <QueueGrid>
          <QueueCard type="button" onClick={() => onNavigate("inquiries")}>
            <span>답변을 기다리는 문의</span>
            <strong>{overview?.pendingInquiries ?? 0}</strong>
          </QueueCard>
          <QueueCard type="button" onClick={() => onNavigate("reports")}>
            <span>확인이 필요한 신고</span>
            <strong>{overview?.pendingReports ?? 0}</strong>
          </QueueCard>
          <QueueCard type="button" onClick={() => onNavigate("places")}>
            <span>검토 대기 장소</span>
            <strong>{overview?.pendingPlaces ?? 0}</strong>
          </QueueCard>
        </QueueGrid>
      </section>
      <section>
        <SectionTitle>운영 현황</SectionTitle>
        <MetricGrid>
          {cards.map(([label, value]) => (
            <MetricCard key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </MetricCard>
          ))}
        </MetricGrid>
      </section>
      <section>
        <SectionTitle>위치정보 준수 현황</SectionTitle>
        <MetricGrid>
          <MetricCard>
            <span>현행 약관 동의</span>
            <strong>{overview?.locationCompliance.activeConsents ?? 0}</strong>
          </MetricCard>
          <MetricCard>
            <span>오늘 이용 기록</span>
            <strong>{overview?.locationCompliance.usageLogsToday ?? 0}</strong>
          </MetricCard>
          <MetricCard>
            <span>오늘 외부 전달</span>
            <strong>
              {overview?.locationCompliance.externalTransfersToday ?? 0}
            </strong>
          </MetricCard>
          <MetricCard>
            <span>7일 내 파기 예정</span>
            <strong>
              {overview?.locationCompliance.expiringWithinSevenDays ?? 0}
            </strong>
          </MetricCard>
        </MetricGrid>
        <ComplianceMode>
          외부 좌표 처리 모드: {overview?.locationCompliance.externalProcessingMode ?? "pending"}
        </ComplianceMode>
      </section>
    </OverviewContent>
  );
}

function RecommendationFunnelPanel({
  funnel,
  days,
  onDaysChange,
}: {
  funnel: AdminRecommendationFunnelResponse | null;
  days: number;
  onDaysChange: (days: number) => void;
}) {
  if (!funnel) {
    return <StatePanel>추천 행동 데이터가 아직 없습니다.</StatePanel>;
  }

  return (
    <FunnelContent>
      <FunnelHeader>
        <div>
          <h2>추천 이후 행동 흐름</h2>
          <p>각 단계는 중복 이벤트를 제외한 추천 여정 수로 계산합니다.</p>
        </div>
        <PeriodSelect
          value={days}
          onChange={(event) => onDaysChange(Number(event.target.value))}
          aria-label="추천 퍼널 조회 기간"
        >
          <option value={7}>최근 7일</option>
          <option value={30}>최근 30일</option>
          <option value={90}>최근 90일</option>
        </PeriodSelect>
      </FunnelHeader>

      <FunnelSummary>
        <FunnelSummaryCard>
          <span>추천 실행</span>
          <strong>{funnel.recommendationRuns.toLocaleString("ko-KR")}</strong>
          <small>회</small>
        </FunnelSummaryCard>
        <FunnelSummaryCard>
          <span>위치 기반 추천</span>
          <strong>{formatRate(funnel.locationUsageRate)}</strong>
          <small>전체 추천 중</small>
        </FunnelSummaryCard>
        <FunnelSummaryCard>
          <span>추천 버전</span>
          <strong>{funnel.algorithms.length}</strong>
          <small>개 운영됨</small>
        </FunnelSummaryCard>
      </FunnelSummary>

      <FunnelStageList>
        {funnel.stages.map((stage, index) => (
          <FunnelStageCard key={stage.action}>
            <FunnelStageIndex>{index + 1}</FunnelStageIndex>
            <div>
              <span>{stage.label}</span>
              <strong>{stage.journeys.toLocaleString("ko-KR")}</strong>
            </div>
            <FunnelRates>
              <span>전체 {formatRate(stage.rateFromRuns)}</span>
              {index > 0 && (
                <span>이전 단계 {formatRate(stage.rateFromPrevious)}</span>
              )}
            </FunnelRates>
          </FunnelStageCard>
        ))}
      </FunnelStageList>

      <FunnelBottomGrid>
        <FunnelPanelCard>
          <h3>출발로 이어진 장소</h3>
          {funnel.topPlaces.length === 0 ? (
            <FunnelEmpty>아직 길찾기 기록이 없습니다.</FunnelEmpty>
          ) : (
            <FunnelPlaceList>
              {funnel.topPlaces.map((place, index) => (
                <li key={place.placeId}>
                  <span>{index + 1}</span>
                  <strong>{place.placeName}</strong>
                  <small>
                    길찾기 {place.navigationStarted} · 기록 {place.journalCreated}
                  </small>
                </li>
              ))}
            </FunnelPlaceList>
          )}
        </FunnelPanelCard>
        <FunnelPanelCard>
          <h3>알고리즘 버전</h3>
          <AlgorithmList>
            {funnel.algorithms.map((algorithm) => (
              <li key={algorithm.version}>
                <code>{algorithm.version}</code>
                <strong>{algorithm.runs.toLocaleString("ko-KR")}회</strong>
              </li>
            ))}
          </AlgorithmList>
        </FunnelPanelCard>
      </FunnelBottomGrid>
    </FunnelContent>
  );
}

function LogsPanel({ logs }: { logs: AdminLogItem[] }) {
  if (logs.length === 0) return <StatePanel>조건에 맞는 로그가 없습니다.</StatePanel>;

  return (
    <CardList>
      {logs.map((log) => (
        <DataCard key={log.id}>
          <CardTop>
            <StatusBadge $tone={log.level}>
              {getLogLevelLabel(log.level)}
            </StatusBadge>
            <Time>{formatDate(log.createdAt)}</Time>
          </CardTop>
          <h2>{log.message}</h2>
          <Meta>
            {log.category} · {log.action}
            {log.actorUserId ? ` · 작업자 ${log.actorUserId}` : ""}
          </Meta>
          {Boolean(log.targetId || log.metadata) && (
            <details>
              <summary>상세 정보</summary>
              <Code>
                {JSON.stringify(
                  {
                    targetType: log.targetType,
                    targetId: log.targetId,
                    metadata: log.metadata,
                  },
                  null,
                  2,
                )}
              </Code>
            </details>
          )}
        </DataCard>
      ))}
    </CardList>
  );
}

function PlacesToolbar({
  query,
  appliedQuery,
  filters,
  meta,
  onQueryChange,
  onSearch,
  onFilterChange,
  onReset,
}: {
  query: string;
  appliedQuery: string;
  filters: PlaceFilterState;
  meta: AdminPlacesMeta | null;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onFilterChange: (key: keyof PlaceFilterState, value: string) => void;
  onReset: () => void;
}) {
  const filtersApplied =
    Boolean(query.trim() || appliedQuery) ||
    Object.entries(filters).some(
      ([key, value]) =>
        value !== defaultPlaceFilters[key as keyof PlaceFilterState],
    );

  return (
    <PlaceToolbarCard>
      <PlaceSearchRow
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <SearchInput
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={getSearchPlaceholder("places")}
          aria-label="장소 검색"
        />
        <SearchButton type="submit">검색</SearchButton>
      </PlaceSearchRow>
      <PlaceFilterGrid>
        <FilterField>
          <span>추천 후보</span>
          <Select
            value={filters.candidate}
            onChange={(event) =>
              onFilterChange("candidate", event.target.value)
            }
          >
            <option value="pool">
              추천풀{formatOptionCount(meta?.candidateCounts.pool)}
            </option>
            <option value="all">
              전체 장소{formatOptionCount(meta?.all)}
            </option>
            <option value="selected">
              자동 선정{formatOptionCount(meta?.candidateCounts.selected)}
            </option>
            <option value="enrich">
              정보 보강 필요{formatOptionCount(meta?.candidateCounts.enrich)}
            </option>
            <option value="pending">
              판정 대기{formatOptionCount(meta?.candidateCounts.pending)}
            </option>
            <option value="low_burden_mismatch">
              저부담 부적합
              {formatOptionCount(meta?.candidateCounts.lowBurdenMismatch)}
            </option>
            <option value="invalid">
              데이터 오류{formatOptionCount(meta?.candidateCounts.invalid)}
            </option>
          </Select>
        </FilterField>
        <FilterField>
          <span>검수 상태</span>
          <Select
            value={filters.reviewStatus}
            onChange={(event) =>
              onFilterChange("reviewStatus", event.target.value)
            }
          >
            <option value="">전체 상태</option>
            <option value="pending">
              검토 대기{formatOptionCount(meta?.statusCounts.pending)}
            </option>
            <option value="approved">
              승인{formatOptionCount(meta?.statusCounts.approved)}
            </option>
            <option value="rejected">
              거절{formatOptionCount(meta?.statusCounts.rejected)}
            </option>
          </Select>
        </FilterField>
        <FilterField>
          <span>노출 설정</span>
          <Select
            value={filters.visibility}
            onChange={(event) =>
              onFilterChange("visibility", event.target.value)
            }
          >
            <option value="">전체 노출 설정</option>
            <option value="active">
              노출 허용{formatOptionCount(meta?.visibilityCounts.active)}
            </option>
            <option value="inactive">
              노출 숨김{formatOptionCount(meta?.visibilityCounts.inactive)}
            </option>
          </Select>
        </FilterField>
        <FilterField>
          <span>데이터 출처</span>
          <Select
            value={filters.source}
            onChange={(event) =>
              onFilterChange("source", event.target.value)
            }
          >
            <option value="">전체 출처</option>
            {meta?.filters.sources.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField>
          <span>장소 유형</span>
          <Select
            value={filters.contentType}
            onChange={(event) =>
              onFilterChange("contentType", event.target.value)
            }
          >
            <option value="">전체 유형</option>
            {meta?.filters.contentTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField>
          <span>시도</span>
          <Select
            value={filters.sido}
            onChange={(event) =>
              onFilterChange("sido", event.target.value)
            }
          >
            <option value="">전체 시도</option>
            {meta?.filters.sidos.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField>
          <span>시군구</span>
          <Select
            value={filters.sigungu}
            disabled={!filters.sido}
            onChange={(event) =>
              onFilterChange("sigungu", event.target.value)
            }
          >
            <option value="">
              {filters.sido ? "전체 시군구" : "시도를 먼저 선택"}
            </option>
            {meta?.filters.sigungus.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField>
          <span>정렬</span>
          <Select
            value={filters.sort}
            onChange={(event) =>
              onFilterChange("sort", event.target.value)
            }
          >
            <option value="updated-desc">최근 수정순</option>
            <option value="updated-asc">오래된 수정순</option>
            <option value="synced-desc">최근 동기화순</option>
            <option value="name-asc">이름 가나다순</option>
            <option value="name-desc">이름 역순</option>
            <option value="fatigue-asc">피로도 낮은순</option>
            <option value="fatigue-desc">피로도 높은순</option>
          </Select>
        </FilterField>
        <FilterResetButton
          type="button"
          disabled={!filtersApplied}
          onClick={onReset}
        >
          필터 초기화
        </FilterResetButton>
      </PlaceFilterGrid>
    </PlaceToolbarCard>
  );
}

function PlacesPanel({
  places,
  meta,
  mutatingId,
  onPageChange,
  onChange,
}: {
  places: AdminPlaceItem[];
  meta: AdminPlacesMeta | null;
  mutatingId: string | null;
  onPageChange: (page: number) => void;
  onChange: (
    placeId: string,
    update: { reviewStatus?: string; isActive?: boolean },
  ) => void;
}) {
  return (
    <PlaceResults>
      <PlaceResultHeader>
        <div>
          <strong>{meta?.total.toLocaleString("ko-KR") ?? 0}</strong>
          <span>
            개 검색됨
            {meta ? ` · 전체 ${meta.all.toLocaleString("ko-KR")}개` : ""}
          </span>
        </div>
        {meta && (
          <PlaceStatusSummary>
            <span>추천풀 {meta.candidateCounts.pool}</span>
            <span>대기 {meta.statusCounts.pending}</span>
            <span>승인 {meta.statusCounts.approved}</span>
            <span>노출 허용 {meta.visibilityCounts.active}</span>
          </PlaceStatusSummary>
        )}
      </PlaceResultHeader>

      {places.length === 0 ? (
        <StatePanel>조건에 맞는 장소가 없습니다.</StatePanel>
      ) : (
        <>
          <DesktopOnly>
            <TableCard>
              <Table>
                <thead>
                  <tr>
                    <th>장소</th>
                    <th>지역</th>
                    <th>출처·유형</th>
                    <th>추천 판정</th>
                    <th>검수 상태</th>
                    <th>노출</th>
                    <th>최근 수정</th>
                  </tr>
                </thead>
                <tbody>
                  {places.map((place) => (
                    <tr key={place.id}>
                      <td>
                        <strong>{place.name}</strong>
                        <Small>
                          피로도 {place.fatigue} · {place.movementLevel}
                        </Small>
                        <Small>{place.id}</Small>
                      </td>
                      <td>
                        {formatPlaceRegion(place)}
                        {place.sourceAddress ? (
                          <Small>{place.sourceAddress}</Small>
                        ) : null}
                      </td>
                      <td>
                        {getPlaceSourceLabel(place.source)}
                        {place.sourceContentType ? (
                          <Small>
                            {getTourApiContentTypeLabel(
                              place.sourceContentType,
                            )}
                          </Small>
                        ) : null}
                        {place.sourceId ? (
                          <Small>{place.sourceId}</Small>
                        ) : null}
                      </td>
                      <td>
                        <CandidateBadge $inPool={isCandidatePoolPlace(place)}>
                          {getCandidateStatusLabel(place)}
                        </CandidateBadge>
                        {place.candidateScore !== null ? (
                          <Small>점수 {place.candidateScore}</Small>
                        ) : null}
                        {getCandidateExplanation(place) ? (
                          <Small>{getCandidateExplanation(place)}</Small>
                        ) : null}
                      </td>
                      <td>
                        <InlineSelect
                          value={place.reviewStatus}
                          disabled={mutatingId === place.id}
                          onChange={(event) =>
                            onChange(place.id, {
                              reviewStatus: event.target.value,
                            })
                          }
                        >
                          <option value="pending">검토 대기</option>
                          <option value="approved">승인</option>
                          <option value="rejected">거절</option>
                        </InlineSelect>
                      </td>
                      <td>
                        <ToggleLabel>
                          <input
                            type="checkbox"
                            checked={place.isActive}
                            disabled={mutatingId === place.id}
                            onChange={(event) =>
                              onChange(place.id, {
                                isActive: event.target.checked,
                              })
                            }
                          />
                          {place.isActive ? "허용" : "숨김"}
                        </ToggleLabel>
                      </td>
                      <td>
                        <Time dateTime={place.updatedAt}>
                          {formatDate(place.updatedAt)}
                        </Time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableCard>
          </DesktopOnly>
          <MobileRecordList>
            {places.map((place) => (
              <MobileRecordCard key={place.id}>
                <MobileRecordHeader>
                  <div>
                    <h2>{place.name}</h2>
                    <Meta>
                      {formatPlaceRegion(place)} ·{" "}
                      {getPlaceSourceLabel(place.source)}
                      {place.sourceContentType
                        ? ` · ${getTourApiContentTypeLabel(place.sourceContentType)}`
                        : ""}
                    </Meta>
                    {place.sourceAddress ? (
                      <Meta>{place.sourceAddress}</Meta>
                    ) : null}
                  </div>
                  <PlaceBadgeStack>
                    <CandidateBadge $inPool={isCandidatePoolPlace(place)}>
                      {getCandidateStatusLabel(place)}
                    </CandidateBadge>
                    <StatusBadge $tone={place.reviewStatus}>
                      {getPlaceReviewStatusLabel(place.reviewStatus)}
                    </StatusBadge>
                    <VisibilityBadge $active={place.isActive}>
                      {place.isActive ? "노출 허용" : "노출 숨김"}
                    </VisibilityBadge>
                  </PlaceBadgeStack>
                </MobileRecordHeader>
                <Small>
                  피로도 {place.fatigue} · {place.movementLevel} · 수정{" "}
                  {formatDate(place.updatedAt)}
                </Small>
                {getCandidateExplanation(place) ? (
                  <Small>{getCandidateExplanation(place)}</Small>
                ) : null}
                <Small>{place.sourceId ?? place.id}</Small>
                {place.sourceCopyright ? (
                  <Small>이미지 이용 구분 {place.sourceCopyright}</Small>
                ) : null}
                <MobileRecordActions>
                  <InlineSelect
                    value={place.reviewStatus}
                    disabled={mutatingId === place.id}
                    aria-label={`${place.name} 검수 상태`}
                    onChange={(event) =>
                      onChange(place.id, {
                        reviewStatus: event.target.value,
                      })
                    }
                  >
                    <option value="pending">검토 대기</option>
                    <option value="approved">승인</option>
                    <option value="rejected">거절</option>
                  </InlineSelect>
                  <ToggleControl>
                    <input
                      type="checkbox"
                      checked={place.isActive}
                      disabled={mutatingId === place.id}
                      onChange={(event) =>
                        onChange(place.id, {
                          isActive: event.target.checked,
                        })
                      }
                    />
                    {place.isActive ? "노출 허용" : "노출 숨김"}
                  </ToggleControl>
                </MobileRecordActions>
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}

      {meta && meta.totalPages > 1 && (
        <Pagination aria-label="장소 목록 페이지">
          <PaginationButton
            type="button"
            disabled={meta.page <= 1}
            onClick={() => onPageChange(meta.page - 1)}
          >
            이전
          </PaginationButton>
          <span>
            {meta.page} / {meta.totalPages}
          </span>
          <PaginationButton
            type="button"
            disabled={meta.page >= meta.totalPages}
            onClick={() => onPageChange(meta.page + 1)}
          >
            다음
          </PaginationButton>
        </Pagination>
      )}
    </PlaceResults>
  );
}

function ReportsPanel({
  reports,
  mutatingId,
  onStatusChange,
  onForceDelete,
}: {
  reports: AdminReportItem[];
  mutatingId: string | null;
  onStatusChange: (reportId: string, status: string) => void;
  onForceDelete: (report: AdminReportItem) => void;
}) {
  if (reports.length === 0) return <StatePanel>접수된 신고가 없습니다.</StatePanel>;

  return (
    <CardList>
      {reports.map((report) => (
        <DataCard key={report.id}>
          <CardTop>
            <StatusBadge $tone={report.status}>
              {getReportStatusLabel(report.status)}
            </StatusBadge>
            <Time>{formatDate(report.createdAt)}</Time>
          </CardTop>
          <h2>{report.targetTitle}</h2>
          <Meta>
            사유 {report.reason} · 신고자 {report.reporterUserId}
          </Meta>
          {report.detail && <Description>{report.detail}</Description>}
          <CardActions>
            <InlineSelect
              value={report.status}
              disabled={mutatingId === report.id}
              onChange={(event) =>
                onStatusChange(report.id, event.target.value)
              }
            >
              <option value="pending">접수</option>
              <option value="reviewing">검토 중</option>
              <option value="resolved">처리 완료</option>
              <option value="dismissed">기각</option>
            </InlineSelect>
            <DangerButton
              type="button"
              disabled={mutatingId === report.id || !report.entryId}
              onClick={() => onForceDelete(report)}
            >
              기록 강제 삭제
            </DangerButton>
          </CardActions>
        </DataCard>
      ))}
    </CardList>
  );
}

function InquiriesPanel({
  inquiries,
  mutatingId,
  onSave,
}: {
  inquiries: AdminInquiryItem[];
  mutatingId: string | null;
  onSave: (
    inquiryId: string,
    status: string,
    adminResponse: string,
  ) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (inquiries.length === 0) {
    return <StatePanel>접수된 1:1 문의가 없습니다.</StatePanel>;
  }

  return (
    <CardList>
      {inquiries.map((inquiry) => (
        <InquiryEditor
          key={`${inquiry.id}:${inquiry.updatedAt}`}
          inquiry={inquiry}
          saving={mutatingId === inquiry.id}
          expanded={expandedId === inquiry.id}
          onToggle={() =>
            setExpandedId((current) =>
              current === inquiry.id ? null : inquiry.id,
            )
          }
          onSave={onSave}
        />
      ))}
    </CardList>
  );
}

function InquiryEditor({
  inquiry,
  saving,
  expanded,
  onToggle,
  onSave,
}: {
  inquiry: AdminInquiryItem;
  saving: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSave: (
    inquiryId: string,
    status: string,
    adminResponse: string,
  ) => void;
}) {
  const [status, setStatus] = useState(inquiry.status);
  const [adminResponse, setAdminResponse] = useState(
    inquiry.adminResponse ?? "",
  );
  const changed =
    status !== inquiry.status ||
    adminResponse.trim() !== (inquiry.adminResponse ?? "");

  return (
    <DataCard>
      <InquirySummaryButton
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <CardTop>
          <StatusBadge $tone={inquiry.status}>
            {getInquiryStatusLabel(inquiry.status)}
          </StatusBadge>
          <Time>{formatDate(inquiry.createdAt)}</Time>
        </CardTop>
        <h2>{inquiry.subject}</h2>
        <Meta>
          {getInquiryCategoryLabel(inquiry.category)} ·{" "}
          {inquiry.requesterEmail ??
            inquiry.requesterUserId ??
            "삭제된 사용자"}
        </Meta>
        <InquiryPreview>{inquiry.message}</InquiryPreview>
        <ExpandLabel>{expanded ? "접기" : "문의 확인 및 답변"}</ExpandLabel>
      </InquirySummaryButton>
      {expanded && (
        <InquiryDetail>
          <Description>{inquiry.message}</Description>
          <ResponseArea>
            <InlineSelect
              value={status}
              disabled={saving}
              aria-label="문의 처리 상태"
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
            >
              <option value="pending">접수</option>
              <option value="reviewing">확인 중</option>
              <option value="answered">답변 완료</option>
              <option value="closed">종결</option>
            </InlineSelect>
            <AdminResponseInput
              value={adminResponse}
              disabled={saving}
              maxLength={4000}
              placeholder="사용자에게 보여줄 답변을 작성해주세요."
              onChange={(event) => setAdminResponse(event.target.value)}
            />
            <SearchButton
              type="button"
              disabled={saving || !changed}
              onClick={() =>
                onSave(inquiry.id, status, adminResponse.trim())
              }
            >
              {saving ? "저장 중..." : "답변 저장"}
            </SearchButton>
          </ResponseArea>
        </InquiryDetail>
      )}
    </DataCard>
  );
}

function UsersPanel({
  users,
  mutatingId,
  onRoleChange,
  onForceDelete,
}: {
  users: AdminUserItem[];
  mutatingId: string | null;
  onRoleChange: (userId: string, role: string) => void;
  onForceDelete: (user: AdminUserItem) => void;
}) {
  if (users.length === 0) return <StatePanel>조건에 맞는 사용자가 없습니다.</StatePanel>;

  return (
    <>
      <DesktopOnly>
        <TableCard>
          <Table>
        <thead>
          <tr>
            <th>계정</th>
            <th>공급자</th>
            <th>기록</th>
            <th>가입일</th>
            <th>권한</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                <strong>{user.email ?? "익명 사용자"}</strong>
                <Small>{user.id}</Small>
              </td>
              <td>{user.providers.join(", ") || "-"}</td>
              <td>{user.journalCount}</td>
              <td>{formatDate(user.createdAt)}</td>
              <td>
                <InlineSelect
                  value={user.role}
                  disabled={mutatingId === user.id}
                  onChange={(event) =>
                    onRoleChange(user.id, event.target.value)
                  }
                >
                  <option value="user">사용자</option>
                  <option value="admin">관리자</option>
                </InlineSelect>
              </td>
              <td>
                <DangerButton
                  type="button"
                  disabled={mutatingId === user.id}
                  onClick={() => onForceDelete(user)}
                >
                  계정 강제 삭제
                </DangerButton>
              </td>
            </tr>
          ))}
        </tbody>
          </Table>
        </TableCard>
      </DesktopOnly>
      <MobileRecordList>
        {users.map((user) => (
          <MobileRecordCard key={user.id}>
            <MobileRecordHeader>
              <div>
                <h2>{user.email ?? "익명 사용자"}</h2>
                <Meta>
                  {user.providers.join(", ") || "연결된 공급자 없음"} · 기록{" "}
                  {user.journalCount}개
                </Meta>
              </div>
              <StatusBadge $tone={user.role}>
                {user.role === "admin" ? "관리자" : "사용자"}
              </StatusBadge>
            </MobileRecordHeader>
            <Small>
              {user.id} · {formatDate(user.createdAt)} 가입
            </Small>
            <MobileRecordActions>
              <InlineSelect
                value={user.role}
                disabled={mutatingId === user.id}
                aria-label={`${user.email ?? user.id} 권한`}
                onChange={(event) =>
                  onRoleChange(user.id, event.target.value)
                }
              >
                <option value="user">사용자</option>
                <option value="admin">관리자</option>
              </InlineSelect>
              <DangerButton
                type="button"
                disabled={mutatingId === user.id}
                onClick={() => onForceDelete(user)}
              >
                계정 삭제
              </DangerButton>
            </MobileRecordActions>
          </MobileRecordCard>
        ))}
      </MobileRecordList>
    </>
  );
}

function SettingsPanel({
  settings,
  mutatingId,
  onSave,
}: {
  settings: AdminSettingItem[];
  mutatingId: string | null;
  onSave: (key: string, value: string) => void;
}) {
  return (
    <SettingsGrid>
      {settings.map((setting) => (
        <SettingEditor
          key={`${setting.key}:${setting.value}`}
          setting={setting}
          saving={mutatingId === setting.key}
          onSave={onSave}
        />
      ))}
    </SettingsGrid>
  );
}

function SettingEditor({
  setting,
  saving,
  onSave,
}: {
  setting: AdminSettingItem;
  saving: boolean;
  onSave: (key: string, value: string) => void;
}) {
  const [value, setValue] = useState(setting.value);

  return (
    <SettingCard>
      <div>
        <h2>{setting.label}</h2>
        <Description>{setting.description}</Description>
        <Small>{setting.key}</Small>
      </div>
      {setting.type === "boolean" ? (
        <ToggleLabel>
          <input
            type="checkbox"
            checked={value === "true"}
            disabled={saving}
            onChange={(event) => {
              const nextValue = String(event.target.checked);
              setValue(nextValue);
              onSave(setting.key, nextValue);
            }}
          />
          {value === "true" ? "사용" : "사용 안 함"}
        </ToggleLabel>
      ) : (
        <SettingInputRow>
          <SearchInput
            value={value}
            disabled={saving}
            onChange={(event) => setValue(event.target.value)}
            placeholder="안내 문구를 입력하세요."
          />
          <SearchButton
            type="button"
            disabled={saving || value === setting.value}
            onClick={() => onSave(setting.key, value)}
          >
            저장
          </SearchButton>
        </SettingInputRow>
      )}
    </SettingCard>
  );
}

function getFilterOptions(tab: AdminTab) {
  if (tab === "logs") {
    return [
      { value: "", label: "전체 레벨" },
      { value: "info", label: "정보" },
      { value: "warning", label: "경고" },
      { value: "error", label: "오류" },
    ];
  }

  if (tab === "places") {
    return [
      { value: "", label: "전체 상태" },
      { value: "pending", label: "검토 대기" },
      { value: "approved", label: "승인" },
      { value: "rejected", label: "거절" },
    ];
  }

  if (tab === "reports") {
    return [
      { value: "", label: "전체 상태" },
      { value: "pending", label: "접수" },
      { value: "reviewing", label: "검토 중" },
      { value: "resolved", label: "처리 완료" },
      { value: "dismissed", label: "기각" },
    ];
  }

  if (tab === "inquiries") {
    return [
      { value: "", label: "전체 상태" },
      { value: "pending", label: "접수" },
      { value: "reviewing", label: "확인 중" },
      { value: "answered", label: "답변 완료" },
      { value: "closed", label: "종결" },
    ];
  }

  return [];
}

export function normalizeAdminTab(value: unknown): AdminTab {
  return tabs.some((item) => item.id === value)
    ? (value as AdminTab)
    : "overview";
}

function getSearchPlaceholder(tab: AdminTab) {
  if (tab === "logs") return "메시지, 작업, 사용자 ID 검색";
  if (tab === "places") return "장소명, 장소 ID, 공공데이터 ID 검색";
  if (tab === "reports") return "제목, 신고 내용, 사용자 ID 검색";
  if (tab === "inquiries") {
    return "제목, 문의 내용, 이메일 또는 사용자 ID 검색";
  }
  return "이메일 또는 사용자 ID 검색";
}

function formatRate(value: number) {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

function formatOptionCount(value: number | undefined) {
  return value === undefined ? "" : ` (${value.toLocaleString("ko-KR")})`;
}

function formatPlaceRegion(place: AdminPlaceItem) {
  const region = [
    place.sourceSidoName,
    place.sourceSigunguName,
  ].filter(Boolean);
  return region.length > 0 ? region.join(" ") : "지역 미분류";
}

function getPlaceSourceLabel(source: string) {
  if (source === "tourapi") return "TourAPI";
  if (source === "manual") return "직접 등록";
  return source;
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function getInquiryStatusLabel(status: string) {
  if (status === "pending") return "접수";
  if (status === "reviewing") return "확인 중";
  if (status === "answered") return "답변 완료";
  if (status === "closed") return "종결";
  return status;
}

function getTourApiContentTypeLabel(contentTypeId: string) {
  if (contentTypeId === "12") return "관광지";
  if (contentTypeId === "14") return "문화시설";
  if (contentTypeId === "25") return "여행코스";
  if (contentTypeId === "28") return "레포츠";
  return contentTypeId;
}

function getInquiryCategoryLabel(category: string) {
  if (category === "account") return "계정";
  if (category === "service") return "서비스";
  if (category === "place") return "장소";
  if (category === "privacy") return "개인정보";
  if (category === "other") return "기타";
  return category;
}

function getPlaceReviewStatusLabel(status: string) {
  if (status === "pending") return "검토 대기";
  if (status === "approved") return "승인";
  if (status === "rejected") return "거절";
  return status;
}

function isCandidatePoolPlace(place: AdminPlaceItem) {
  return place.candidateOverride === "include" ||
    (place.candidateOverride === "auto" &&
      place.candidateStatus === "selected");
}

function getCandidateStatusLabel(place: AdminPlaceItem) {
  if (place.candidateOverride === "include") return "수동 추천풀 포함";
  if (place.candidateOverride === "exclude") return "수동 추천풀 제외";
  if (place.candidateStatus === "selected") return "추천풀 선정";
  if (place.candidateStatus === "enrich") return "정보 보강 필요";
  if (place.candidateStatus === "low_burden_mismatch") {
    return "저부담 추천 부적합";
  }
  if (place.candidateStatus === "invalid") return "데이터 오류";
  return "판정 대기";
}

function getCandidateExplanation(place: AdminPlaceItem) {
  return place.candidateExclusions[0] ?? place.candidateReasons[0] ?? null;
}

function getReportStatusLabel(status: string) {
  if (status === "pending") return "접수";
  if (status === "reviewing") return "검토 중";
  if (status === "resolved") return "처리 완료";
  if (status === "dismissed") return "기각";
  return status;
}

function getLogLevelLabel(level: string) {
  if (level === "info") return "정보";
  if (level === "warning") return "경고";
  if (level === "error") return "오류";
  return level;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "관리자 요청을 처리하지 못했습니다.";
}

const AdminLayout = styled.div<{ $drawerOpen: boolean }>`
  height: 100dvh;
  min-height: 0;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: auto;
  background: var(--color-white);
  color: var(--color-text);
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    align-content: start;
    overflow-y: ${({ $drawerOpen }) =>
      $drawerOpen ? "hidden" : "auto"};
    padding-bottom: calc(76px + env(safe-area-inset-bottom));
    background: var(--color-white);
  }
`;

const Sidebar = styled.aside`
  position: sticky;
  top: 0;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  padding: var(--space-8) var(--space-5);
  border-right: 1px solid var(--color-border);
  background: var(--color-white);

  @media (max-width: 768px) {
    display: none;
  }
`;

const Brand = styled.div`
  display: flex;
  align-items: baseline;
  gap: var(--space-2);

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const Wordmark = styled.strong`
  font-size: var(--font-size-600);
  font-weight: 800;
  letter-spacing: var(--letter-spacing-heading);
`;

const Navigation = styled.nav`
  display: grid;
  gap: var(--space-2);

  @media (max-width: 768px) {
    grid-column: 1 / -1;
    display: flex;
    gap: var(--space-2);
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    scroll-snap-type: x proximity;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`;

const NavButton = styled.button<{ $active: boolean }>`
  min-height: var(--space-11);
  padding: 0 var(--space-4);
  border: 0;
  border-radius: var(--space-3);
  background: ${({ $active }) =>
    $active ? "var(--color-secondary-300)" : "transparent"};
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-200);
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  text-align: left;
  cursor: pointer;

  &:hover {
    background: ${({ $active }) =>
      $active
        ? "var(--color-secondary-300)"
        : "var(--color-brand-100)"};
  }

  @media (max-width: 768px) {
    min-width: max-content;
    min-height: 44px;
    flex: 0 0 auto;
    padding: 0 var(--space-4);
    text-align: center;
    scroll-snap-align: start;
    white-space: nowrap;
  }
`;

const HomeLink = styled(Link)`
  margin-top: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  text-decoration: none;

  @media (max-width: 768px) {
    align-self: center;
    margin-top: 0;
    padding: var(--space-2) 0;
  }
`;

const TourismDataLink = styled(Link)`
  min-height: var(--space-11);
  display: flex;
  align-items: center;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-brand-300);
  border-radius: var(--space-3);
  background: var(--color-brand-100);
  color: var(--color-brand-1000);
  font-size: var(--font-size-100);
  font-weight: 700;
  text-decoration: none;
`;

const Main = styled.main`
  min-width: 0;
  min-height: 100dvh;
  width: min(100%, 1440px);
  display: grid;
  align-content: start;
  gap: var(--space-6);
  padding: var(--space-8);
  margin: 0 auto;

  @media (max-width: 768px) {
    min-height: calc(100dvh - 76px - env(safe-area-inset-bottom));
    gap: var(--space-5);
    padding:
      var(--space-5)
      max(var(--space-4), env(safe-area-inset-right))
      max(var(--space-8), env(safe-area-inset-bottom))
      max(var(--space-4), env(safe-area-inset-left));
  }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);

  h1 {
    margin-top: var(--space-1);
    font-size: var(--font-size-700);
    line-height: var(--line-height-heading);
  }

  @media (max-width: 480px) {
    position: sticky;
    z-index: 10;
    top: 0;
    align-items: center;
    padding:
      max(var(--space-3), env(safe-area-inset-top))
      max(var(--space-4), env(safe-area-inset-right))
      var(--space-3);
    padding-left: max(var(--space-4), env(safe-area-inset-left));
    margin: calc(var(--space-5) * -1) calc(var(--space-4) * -1) 0;
    border-bottom: 1px solid var(--color-brand-200);
    background: rgb(var(--color-white-rgb) / 0.88);
    box-shadow: 0 8px 28px rgb(var(--color-black-rgb) / 0.05);
    backdrop-filter: blur(16px);

    h1 {
      margin-top: 0;
      font-size: var(--font-size-500);
    }
  }
`;

const Eyebrow = styled.span`
  color: var(--color-brand-800);
  font-size: var(--font-size-100);
  font-weight: 700;
  letter-spacing: 0.08em;

  @media (max-width: 480px) {
    color: var(--color-brand-800);
    font-size: 10px;
  }
`;

const RefreshButton = styled.button`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-brand-100);
  color: var(--color-brand-1000);
  font: inherit;
  cursor: pointer;

  @media (max-width: 480px) {
    width: 44px;
    padding: 0;
    border-color: var(--color-brand-200);
    background: var(--color-brand-100);
    color: var(--color-brand-900);
  }
`;

const RefreshIcon = styled.svg`
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;

  &::before {
    content: "";
  }
`;

const RefreshLabel = styled.span`
  @media (max-width: 480px) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
`;

const Toolbar = styled.form`
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 180px auto;
  gap: var(--space-3);

  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr) auto;

    > input:first-of-type {
      grid-column: 1 / -1;
    }
  }
`;

const PlaceToolbarCard = styled.section`
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-brand-200);
  border-radius: var(--space-5);
  background: var(--color-brand-100);

  @media (max-width: 768px) {
    gap: var(--space-3);
    padding: var(--space-4);
    border: 0;
    border-radius: var(--space-4);
    background: var(--color-neutral-200);
  }
`;

const PlaceSearchRow = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-3);
`;

const PlaceFilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: end;
  gap: var(--space-3);

  @media (max-width: 1100px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }
`;

const FilterField = styled.label`
  min-width: 0;
  display: grid;
  gap: var(--space-1);

  > span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    font-weight: 600;
  }

  > select {
    width: 100%;
    min-width: 0;
  }
`;

const FilterResetButton = styled.button`
  min-height: var(--space-11);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--space-3);
  background: var(--color-white);
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--font-size-100);
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.42;
  }
`;

const SearchInput = styled.input`
  width: 100%;
  min-height: var(--space-11);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--space-3);
  outline: 0;
  background: rgb(var(--color-white-rgb) / 0.88);
  color: var(--color-text);
  font: inherit;

  &:focus {
    border-color: var(--color-brand-600);
    box-shadow: 0 0 0 3px var(--color-brand-200);
  }
`;

const Select = styled.select`
  min-height: var(--space-11);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--space-3);
  background: rgb(var(--color-white-rgb) / 0.88);
  color: var(--color-text);
  font: inherit;
`;

const SearchButton = styled.button`
  min-height: var(--space-11);
  padding: 0 var(--space-5);
  border: 0;
  border-radius: var(--space-3);
  background: var(--color-brand-700);
  color: var(--color-white);
  font: inherit;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

const ErrorNotice = styled.div`
  padding: var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--space-3);
  background: rgb(var(--color-white-rgb) / 0.76);
  color: var(--color-error);
`;

const SuccessNotice = styled.div`
  position: fixed;
  z-index: 60;
  right: var(--space-6);
  bottom: var(--space-6);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-secondary-600);
  border-radius: var(--space-3);
  background: var(--color-secondary-200);
  color: var(--color-text);
  box-shadow: 0 12px 32px rgb(var(--color-black-rgb) / 0.12);
  font-size: var(--font-size-100);
  font-weight: 700;

  @media (max-width: 768px) {
    right: var(--space-4);
    bottom: calc(84px + env(safe-area-inset-bottom));
    left: var(--space-4);
    text-align: center;
  }
`;

const StatePanel = styled.div`
  display: grid;
  min-height: 240px;
  place-items: center;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--space-5);
  background: var(--color-surface);
  color: var(--color-text-muted);
  box-shadow: 0 12px 32px rgb(var(--color-black-rgb) / 0.05);
`;

const OverviewContent = styled.div`
  display: grid;
  gap: var(--space-8);

  section {
    display: grid;
    gap: var(--space-3);
  }
`;

const SectionTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-300);

  &::before {
    width: var(--space-1);
    height: 1em;
    border-radius: 999px;
    background: var(--color-brand-500);
    content: "";
  }

  section:nth-of-type(2) &::before {
    background: var(--color-secondary-600);
  }
`;

const QueueGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: var(--space-2);
  }
`;

const QueueCard = styled.button`
  min-height: 96px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-secondary-500);
  border-radius: var(--space-5);
  background: var(--color-secondary-200);
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 12px 30px rgb(var(--color-black-rgb) / 0.07);

  span {
    font-size: var(--font-size-200);
    font-weight: 600;
  }

  strong {
    font-size: var(--font-size-700);
    line-height: 1;
  }

  &:nth-of-type(1) {
    border-color: var(--color-secondary-400);
    background: var(--color-secondary-200);
  }

  &:nth-of-type(2) {
    border-color: var(--color-brand-300);
    background: var(--color-brand-200);
  }

  &:nth-of-type(3) {
    border-color: var(--color-secondary-300);
    background: var(--color-secondary-100);
  }

  @media (max-width: 640px) {
    min-height: 68px;
    padding: var(--space-4);
    border-color: transparent;
    border-radius: var(--space-4);
    background: var(--color-surface);
    box-shadow: 0 8px 24px rgb(var(--color-black-rgb) / 0.05);

    strong {
      min-width: var(--space-10);
      height: var(--space-10);
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: var(--color-secondary-300);
      font-size: var(--font-size-500);
    }

    &:nth-of-type(1) {
      background: var(--color-secondary-200);

      strong {
        background: var(--color-secondary-500);
      }
    }

    &:nth-of-type(2) {
      background: var(--color-brand-200);

      strong {
        background: var(--color-brand-500);
      }
    }

    &:nth-of-type(3) {
      background: var(--color-secondary-100);

      strong {
        background: var(--color-secondary-400);
      }
    }
  }
`;

const MetricGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 360px) {
    grid-template-columns: 1fr;
  }

  @media (min-width: 361px) and (max-width: 520px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }
`;

const ComplianceMode = styled.p`
  justify-self: start;
  padding: var(--space-2) var(--space-3);
  border-radius: 999px;
  background: var(--color-secondary-200);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const MetricCard = styled.article`
  display: grid;
  gap: var(--space-4);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--space-5);
  background: var(--color-surface);
  box-shadow: 0 14px 32px rgb(var(--color-black-rgb) / 0.05);

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }

  strong {
    font-size: var(--font-size-800);
    line-height: 1;
  }

  &:nth-of-type(4n + 1) {
    border-color: var(--color-brand-200);
    background: var(--color-brand-100);
  }

  &:nth-of-type(4n + 2) {
    border-color: var(--color-secondary-300);
    background: var(--color-secondary-100);
  }

  &:nth-of-type(4n + 3) {
    background: var(--color-neutral-100);
  }

  &:nth-of-type(4n) {
    border-color: var(--color-brand-300);
    background: var(--color-brand-200);
  }

  @media (max-width: 520px) {
    gap: var(--space-3);
    padding: var(--space-4);
    border-color: transparent;
    border-radius: var(--space-4);
    box-shadow: 0 8px 24px rgb(var(--color-black-rgb) / 0.04);

    strong {
      font-size: var(--font-size-700);
    }

    &:nth-of-type(4n + 1) {
      background: var(--color-brand-100);
    }

    &:nth-of-type(4n + 2) {
      background: var(--color-secondary-100);
    }

    &:nth-of-type(4n + 3) {
      background: var(--color-neutral-100);
    }

    &:nth-of-type(4n) {
      background: var(--color-brand-200);
    }
  }
`;

const FunnelContent = styled.section`
  display: grid;
  gap: var(--space-6);
`;

const FunnelHeader = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);

  h2 {
    font-size: var(--font-size-500);
  }

  p {
    margin-top: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const PeriodSelect = styled.select`
  min-height: var(--space-11);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-100);
`;

const FunnelSummary = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: var(--space-2);
  }
`;

const FunnelSummaryCard = styled.article`
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  gap: var(--space-2);
  padding: var(--space-5);
  border: 1px solid var(--color-brand-200);
  border-radius: var(--space-5);
  background: var(--color-brand-100);
  box-shadow: 0 12px 28px rgb(var(--color-black-rgb) / 0.05);

  span {
    grid-column: 1 / -1;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  strong {
    font-size: var(--font-size-700);
    line-height: 1;
  }

  small {
    color: var(--color-text-muted);
    font-size: var(--font-size-000);
  }

  &:nth-of-type(2) {
    border-color: var(--color-secondary-300);
    background: var(--color-secondary-100);
  }

  &:nth-of-type(3) {
    border-color: var(--color-neutral-300);
    background: var(--color-neutral-100);
  }

  @media (max-width: 640px) {
    min-height: 68px;
    grid-template-columns: 1fr auto;
    align-items: center;
    padding: var(--space-4);

    span {
      grid-column: auto;
      font-weight: 600;
    }

    strong {
      font-size: var(--font-size-500);
    }

    small {
      display: none;
    }
  }
`;

const FunnelStageList = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(128px, 1fr));
  gap: var(--space-2);
  overflow-x: auto;
  padding-bottom: var(--space-2);
  scrollbar-width: thin;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    overflow: visible;
    padding-bottom: 0;
  }
`;

const FunnelStageCard = styled.article`
  position: relative;
  min-height: 160px;
  display: grid;
  align-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-secondary-300);
  border-radius: var(--space-4);
  background: linear-gradient(
    155deg,
    var(--color-surface),
    var(--color-secondary-100)
  );

  > div:nth-of-type(1) {
    display: grid;
    gap: var(--space-2);

    span {
      min-height: 2.8em;
      color: var(--color-text-muted);
      font-size: var(--font-size-000);
      font-weight: 600;
    }

    strong {
      font-size: var(--font-size-600);
    }
  }

  @media (max-width: 768px) {
    min-height: auto;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    padding: var(--space-4);

    > div:nth-of-type(1) {
      span {
        min-height: 0;
      }
    }
  }
`;

const FunnelStageIndex = styled.span`
  width: var(--space-7);
  height: var(--space-7);
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--color-secondary-400);
  font-size: var(--font-size-000);
  font-weight: 700;
`;

const FunnelRates = styled.div`
  display: grid;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-000);

  @media (max-width: 768px) {
    justify-items: end;
  }
`;

const FunnelBottomGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.6fr);
  gap: var(--space-4);

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const FunnelPanelCard = styled.section`
  display: grid;
  align-content: start;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--space-5);
  background: var(--color-surface);
  box-shadow: 0 12px 30px rgb(var(--color-black-rgb) / 0.05);

  h3 {
    font-size: var(--font-size-300);
  }
`;

const FunnelPlaceList = styled.ol`
  display: grid;
  gap: var(--space-2);
  padding: 0;
  margin: 0;
  list-style: none;

  li {
    min-width: 0;
    display: grid;
    grid-template-columns: var(--space-7) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--space-3);
    background: var(--color-neutral-100);
  }

  li > span {
    color: var(--color-brand-900);
    font-weight: 700;
    text-align: center;
  }

  strong {
    overflow: hidden;
    font-size: var(--font-size-100);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: var(--color-text-muted);
    font-size: var(--font-size-000);
  }

  @media (max-width: 520px) {
    li {
      grid-template-columns: var(--space-6) minmax(0, 1fr);
    }

    small {
      grid-column: 2;
    }
  }
`;

const AlgorithmList = styled.ul`
  display: grid;
  gap: var(--space-2);
  padding: 0;
  margin: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--space-3);
    background: var(--color-brand-100);
  }

  code {
    overflow-wrap: anywhere;
    font-size: var(--font-size-000);
  }

  strong {
    flex: 0 0 auto;
    font-size: var(--font-size-100);
  }
`;

const FunnelEmpty = styled.p`
  padding: var(--space-5);
  border-radius: var(--space-3);
  background: var(--color-neutral-100);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  text-align: center;
`;

const CardList = styled.section`
  display: grid;
  gap: var(--space-3);
`;

const DataCard = styled.article`
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--space-4);
  background: var(--color-surface);
  box-shadow: 0 12px 30px rgb(var(--color-black-rgb) / 0.06);

  &:nth-of-type(3n + 1) {
    border-color: var(--color-neutral-400);
    background: var(--color-neutral-100);
  }

  &:nth-of-type(3n + 2) {
    border-color: var(--color-brand-200);
    background: var(--color-brand-100);
  }

  &:nth-of-type(3n) {
    border-color: var(--color-secondary-300);
    background: var(--color-secondary-100);
  }

  h2 {
    font-size: var(--font-size-300);
    line-height: var(--line-height-subtitle);
  }

  summary {
    color: var(--color-text-muted);
    cursor: pointer;
  }

  @media (max-width: 480px) {
    padding: var(--space-4);
    border-color: transparent;
    border-radius: var(--space-5);
    box-shadow: 0 8px 24px rgb(var(--color-black-rgb) / 0.05);

    &:nth-of-type(3n + 1) {
      background: var(--color-neutral-100);
    }

    &:nth-of-type(3n + 2) {
      background: var(--color-brand-100);
    }

    &:nth-of-type(3n) {
      background: var(--color-secondary-100);
    }
  }
`;

const InquirySummaryButton = styled.button`
  min-width: 0;
  display: grid;
  gap: var(--space-3);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;

  h2 {
    overflow-wrap: anywhere;
  }
`;

const InquiryPreview = styled.p`
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
`;

const ExpandLabel = styled.span`
  justify-self: end;
  color: var(--color-brand-800);
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const InquiryDetail = styled.div`
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
`;

const CardTop = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
`;

const StatusBadge = styled.span<{ $tone: string }>`
  display: inline-flex;
  min-height: var(--space-7);
  align-items: center;
  padding: 0 var(--space-3);
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "error"
      ? "var(--color-neutral-100)"
      : $tone === "pending"
      ? "var(--color-secondary-200)"
      : $tone === "warning" || $tone === "reviewing"
        ? "var(--color-brand-200)"
        : $tone === "approved" ||
            $tone === "answered" ||
            $tone === "resolved" ||
            $tone === "admin"
          ? "var(--color-secondary-300)"
          : "var(--color-neutral-300)"};
  color: ${({ $tone }) =>
    $tone === "error" ? "var(--color-error)" : "var(--color-text)"};
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const Time = styled.time`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  text-align: right;
`;

const Meta = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  overflow-wrap: anywhere;
`;

const Description = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
  line-height: var(--line-height-body);
  overflow-wrap: anywhere;
`;

const Code = styled.pre`
  max-height: 280px;
  overflow: auto;
  padding: var(--space-3);
  margin-top: var(--space-2);
  border-radius: var(--space-2);
  background: var(--color-neutral-1200);
  color: var(--color-neutral-200);
  font-size: 12px;
  white-space: pre-wrap;
`;

const TableCard = styled.section`
  overflow-x: auto;
  border: 1px solid var(--color-brand-200);
  border-radius: var(--space-4);
  background: rgb(var(--color-white-rgb) / 0.9);
  box-shadow: 0 16px 36px rgb(var(--color-black-rgb) / 0.05);

  @media (max-width: 640px) {
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
`;

const DesktopOnly = styled.div`
  @media (max-width: 768px) {
    display: none;
  }
`;

const MobileRecordList = styled.section`
  display: none;

  @media (max-width: 768px) {
    display: grid;
    gap: var(--space-3);
  }
`;

const MobileRecordCard = styled.article`
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 0;
  border-radius: var(--space-5);
  background: var(--color-surface);
  box-shadow: 0 8px 24px rgb(var(--color-black-rgb) / 0.05);

  &:nth-of-type(odd) {
    background: var(--color-brand-100);
  }

  &:nth-of-type(even) {
    background: var(--color-secondary-100);
  }
`;

const PlaceResults = styled.section`
  display: grid;
  gap: var(--space-4);
`;

const PlaceResultHeader = styled.header`
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);

  > div:first-of-type {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  strong {
    font-size: var(--font-size-500);
    line-height: 1;
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  @media (max-width: 640px) {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-2);
  }
`;

const PlaceStatusSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);

  span {
    min-height: var(--space-7);
    display: inline-flex;
    align-items: center;
    padding: 0 var(--space-3);
    border-radius: 999px;
    background: var(--color-secondary-200);
    color: var(--color-secondary-1000);
    font-weight: 700;
  }

  span:nth-of-type(2) {
    background: var(--color-brand-100);
    color: var(--color-brand-1000);
  }

  span:nth-of-type(3) {
    background: var(--color-secondary-300);
  }

  @media (max-width: 640px) {
    justify-content: flex-start;
  }
`;

const MobileRecordHeader = styled.div`
  min-width: 0;
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-3);

  > div {
    min-width: 0;
  }

  h2 {
    overflow-wrap: anywhere;
    font-size: var(--font-size-300);
    line-height: var(--line-height-subtitle);
  }
`;

const PlaceBadgeStack = styled.div`
  flex: 0 0 auto;
  display: grid;
  justify-items: end;
  gap: var(--space-1);
`;

const CandidateBadge = styled.span<{ $inPool: boolean }>`
  width: fit-content;
  min-height: var(--space-6);
  display: inline-flex;
  align-items: center;
  padding: 0 var(--space-2);
  border-radius: 999px;
  background: ${({ $inPool }) =>
    $inPool ? "var(--color-brand-200)" : "var(--color-neutral-300)"};
  color: var(--color-text);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
`;

const VisibilityBadge = styled.span<{ $active: boolean }>`
  min-height: var(--space-6);
  display: inline-flex;
  align-items: center;
  padding: 0 var(--space-2);
  border-radius: 999px;
  background: ${({ $active }) =>
    $active ? "var(--color-secondary-300)" : "var(--color-neutral-300)"};
  color: var(--color-text);
  font-size: 11px;
  font-weight: 700;
`;

const MobileRecordActions = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-2);

  > * {
    width: 100%;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-100);

  th,
  td {
    padding: var(--space-4);
    border-bottom: 1px solid var(--color-border);
    text-align: left;
    vertical-align: middle;
  }

  th {
    background: var(--color-brand-100);
    color: var(--color-brand-1000);
    font-weight: 600;
  }

  tr:last-of-type td {
    border-bottom: 0;
  }

  tbody tr {
    transition: background-color 160ms ease;
  }

  tbody tr:hover {
    background: var(--color-secondary-100);
  }

  @media (max-width: 640px) {
    display: block;

    thead {
      display: none;
    }

    tbody {
      display: grid;
      gap: var(--space-3);
    }

    tr {
      display: grid;
      gap: 0;
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: var(--space-4);
      background: var(--color-surface);
    }

    td {
      display: grid;
      grid-template-columns: minmax(76px, 30%) minmax(0, 1fr);
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      overflow-wrap: anywhere;

      &::before {
        content: attr(data-label);
        color: var(--color-text-muted);
        font-size: var(--font-size-100);
        font-weight: 600;
      }

      &:last-of-type {
        border-bottom: 0;
      }
    }
  }
`;

const Small = styled.small`
  display: block;
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: 11px;
  overflow-wrap: anywhere;
`;

const InlineSelect = styled.select`
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--space-2);
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
`;

const ToggleLabel = styled.label`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  cursor: pointer;

  input {
    width: var(--space-5);
    height: var(--space-5);
    accent-color: var(--color-brand-700);
  }
`;

const ToggleControl = styled(ToggleLabel)`
  justify-content: center;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--space-2);
  background: var(--color-white);
`;

const Pagination = styled.nav`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding-top: var(--space-2);

  span {
    min-width: 72px;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    text-align: center;
  }
`;

const PaginationButton = styled.button`
  min-width: 88px;
  min-height: var(--space-11);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-brand-300);
  border-radius: var(--space-3);
  background: var(--color-brand-100);
  color: var(--color-brand-1000);
  font: inherit;
  font-size: var(--font-size-100);
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    border-color: var(--color-border);
    background: var(--color-neutral-200);
    color: var(--color-text-muted);
    cursor: default;
    opacity: 0.6;
  }
`;

const CardActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding-top: var(--space-2);

  @media (max-width: 480px) {
    display: grid;
    grid-template-columns: 1fr;

    > * {
      width: 100%;
    }
  }
`;

const ResponseArea = styled.div`
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--space-3);
  padding-top: var(--space-2);

  @media (max-width: 760px) {
    grid-template-columns: 1fr;

    > * {
      width: 100%;
    }
  }
`;

const AdminResponseInput = styled.textarea`
  min-height: 88px;
  resize: vertical;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--space-2);
  outline: 0;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);

  &:focus {
    border-color: var(--color-brand-600);
    box-shadow: 0 0 0 3px var(--color-brand-200);
  }
`;

const DangerButton = styled.button`
  min-height: 44px;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--space-2);
  background: transparent;
  color: var(--color-error);
  font: inherit;
  font-size: var(--font-size-100);
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.4;
  }
`;

const SettingsGrid = styled.section`
  display: grid;
  gap: var(--space-4);
`;

const SettingCard = styled.article`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 0.7fr);
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-5);
  border: 1px solid var(--color-brand-200);
  border-radius: var(--space-4);
  background: var(--color-brand-100);
  box-shadow: 0 12px 30px rgb(var(--color-black-rgb) / 0.06);

  &:nth-of-type(even) {
    border-color: var(--color-secondary-300);
    background: var(--color-secondary-100);
  }

  h2 {
    margin-bottom: var(--space-2);
    font-size: var(--font-size-300);
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const SettingInputRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-2);

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const AccessPage = styled.main`
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding:
    max(var(--space-6), env(safe-area-inset-top))
    max(var(--space-4), env(safe-area-inset-right))
    max(var(--space-6), env(safe-area-inset-bottom))
    max(var(--space-4), env(safe-area-inset-left));
  background: var(--color-app-background);
`;

const AccessCard = styled.section`
  width: min(100%, 480px);
  display: grid;
  gap: var(--space-5);
  padding: var(--space-8);
  border: 1px solid var(--color-border);
  border-radius: var(--space-7);
  background: var(--color-surface);
  box-shadow: 0 24px 64px rgb(var(--color-black-rgb) / 0.08);

  h1 {
    font-size: var(--font-size-600);
  }

  p {
    color: var(--color-text-muted);
  }

  @media (max-width: 480px) {
    padding: var(--space-6) var(--space-5);
  }
`;

const AccessActions = styled.div`
  display: grid;
  gap: var(--space-2);
`;

const PrimaryLink = styled(Link)`
  display: grid;
  min-height: var(--space-11);
  place-items: center;
  border-radius: var(--space-3);
  background: var(--color-brand-700);
  color: var(--color-white);
  font-weight: 700;
  text-decoration: none;
`;

const SecondaryLink = styled(Link)`
  display: grid;
  min-height: var(--space-11);
  place-items: center;
  color: var(--color-text-muted);
  text-decoration: none;
`;

const MobileNavigation = styled.nav`
  display: none;

  @media (max-width: 768px) {
    position: fixed;
    z-index: 40;
    right: 0;
    bottom: 0;
    left: 0;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    min-height: calc(64px + env(safe-area-inset-bottom));
    padding:
      var(--space-2)
      max(var(--space-2), env(safe-area-inset-right))
      max(var(--space-2), env(safe-area-inset-bottom))
      max(var(--space-2), env(safe-area-inset-left));
    border-top: 1px solid var(--color-border);
    background: rgb(var(--color-white-rgb) / 0.94);
    box-shadow: 0 -8px 28px rgb(var(--color-black-rgb) / 0.06);
    backdrop-filter: blur(18px);
  }
`;

const MobileNavButton = styled.button<{ $active: boolean }>`
  position: relative;
  min-width: 0;
  min-height: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 0;
  background: transparent;
  color: ${({ $active }) =>
    $active ? "var(--color-secondary-1000)" : "var(--color-text-muted)"};
  font: inherit;
  cursor: pointer;
`;

const MobileNavIcon = styled.span<{ $active: boolean }>`
  width: 36px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: ${({ $active }) =>
    $active ? "var(--color-secondary-400)" : "transparent"};
  transition:
    background-color 180ms ease,
    transform 180ms ease;

  svg {
    width: 19px;
    height: 19px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }
`;

const MobileNavLabel = styled.span`
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
`;

const MobileNavBadge = styled.span`
  position: absolute;
  top: 0;
  right: calc(50% - 28px);
  min-width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--color-error);
  color: var(--color-white);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
`;

const MobileMenuBackdrop = styled.div<{
  $open: boolean;
  $dragOffset: number;
  $dragging: boolean;
}>`
  display: none;

  @media (max-width: 768px) {
    position: fixed;
    z-index: 50;
    inset: 0;
    display: grid;
    align-items: end;
    background: rgb(var(--color-black-rgb) / 0.28);
    opacity: ${({ $open, $dragOffset }) =>
      $open ? Math.max(0.18, 1 - $dragOffset / 320) : 0};
    visibility: ${({ $open }) => ($open ? "visible" : "hidden")};
    pointer-events: ${({ $open }) => ($open ? "auto" : "none")};
    overscroll-behavior: contain;
    transition: ${({ $open, $dragging }) =>
      $dragging
        ? "none"
        : `opacity 260ms ease, visibility 0s linear ${
            $open ? "0s" : "260ms"
          }`};
  }
`;

const MobileMenu = styled.section<{
  $open: boolean;
  $dragOffset: number;
  $dragging: boolean;
}>`
  display: grid;
  gap: var(--space-4);
  padding:
    var(--space-3)
    max(var(--space-5), env(safe-area-inset-right))
    max(var(--space-6), env(safe-area-inset-bottom))
    max(var(--space-5), env(safe-area-inset-left));
  border-radius: var(--space-7) var(--space-7) 0 0;
  background: var(--color-brand-100);
  box-shadow: 0 -20px 56px rgb(var(--color-black-rgb) / 0.16);
  transform: translateY(
    ${({ $open, $dragOffset }) =>
      $open ? `${$dragOffset}px` : "100%"}
  );
  transition: ${({ $dragging }) =>
    $dragging
      ? "none"
      : "transform 360ms cubic-bezier(0.22, 1, 0.36, 1)"};
  will-change: transform;
`;

const MobileMenuHandle = styled.button`
  width: 64px;
  height: 28px;
  display: grid;
  place-items: center;
  justify-self: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: grab;
  touch-action: none;

  &:active {
    cursor: grabbing;
  }

  span {
    width: var(--space-10);
    height: var(--space-1);
    border-radius: 999px;
    background: var(--color-brand-500);
  }
`;

const MobileMenuHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);

  span {
    color: var(--color-brand-800);
    font-size: var(--font-size-100);
  }

  h2 {
    margin-top: var(--space-1);
    font-size: var(--font-size-400);
  }
`;

const DrawerCloseButton = styled.button`
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: var(--color-brand-200);
  color: var(--color-brand-1000);
  font: inherit;
  font-size: var(--font-size-500);
  cursor: pointer;
`;

const MobileMenuList = styled.div`
  display: grid;
  overflow: hidden;
  border-radius: var(--space-4);
  background: var(--color-surface);
`;

const MobileMenuButton = styled.button<{ $active: boolean }>`
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 0 var(--space-4);
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: ${({ $active }) =>
    $active ? "var(--color-secondary-200)" : "transparent"};
  color: var(--color-text);
  font: inherit;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  text-align: left;
  cursor: pointer;
`;

const MobileServiceLink = styled(Link)`
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 0 var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
`;
