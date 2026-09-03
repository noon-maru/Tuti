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
import { AdminNotificationsPanel } from "@/features/admin/AdminNotificationsPanel";
import type {
  AdminInquiriesResponse,
  AdminJournalPublicationReviewItem,
  AdminJournalPublicationReviewsResponse,
  AdminInquiryItem,
  AdminLogItem,
  AdminLogsResponse,
  AdminLocationHistoryResponse,
  AdminLocationSecurityEventItem,
  AdminLocationUsageItem,
  AdminOverview,
  AdminOverviewResponse,
  AdminNotificationsResponse,
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
  | "notifications"
  | "funnel"
  | "logs"
  | "location"
  | "places"
  | "reports"
  | "inquiries"
  | "users"
  | "settings";

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "운영 현황" },
  { id: "notifications", label: "알림 전달" },
  { id: "funnel", label: "추천 성과" },
  { id: "logs", label: "시스템 로그" },
  { id: "location", label: "위치정보 감사" },
  { id: "places", label: "장소 운영" },
  { id: "reports", label: "신고" },
  { id: "inquiries", label: "문의" },
  { id: "users", label: "계정·권한" },
  { id: "settings", label: "운영 설정" },
];

const navigationGroups: Array<{
  label: string;
  items: Array<{ id: AdminTab; label: string }>;
}> = [
  {
    label: "운영",
    items: tabs.filter((item) =>
      ["overview", "inquiries", "reports", "places"].includes(item.id),
    ),
  },
  {
    label: "관측",
    items: tabs.filter((item) =>
      ["funnel", "notifications", "logs", "location"].includes(item.id),
    ),
  },
  {
    label: "관리",
    items: tabs.filter((item) => ["users", "settings"].includes(item.id)),
  },
];

const mobilePrimaryTabs: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "홈" },
  { id: "inquiries", label: "문의" },
  { id: "reports", label: "신고" },
  { id: "places", label: "장소" },
];

const mobileMoreTabs: Array<{ id: AdminTab; label: string }> = [
  { id: "funnel", label: "추천 행동 퍼널" },
  { id: "notifications", label: "알림 전달" },
  { id: "users", label: "사용자 및 권한" },
  { id: "logs", label: "시스템 로그" },
  { id: "location", label: "위치정보 확인자료" },
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

  if (section === "notifications") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5 9a5.5 5.5 0 0 1 11 0c0 6 2.5 6.5 2.5 6.5H4S6.5 15 6.5 9Z" />
        <path d="M9.5 18.5a2.8 2.8 0 0 0 5 0" />
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
  const [notifications, setNotifications] =
    useState<AdminNotificationsResponse | null>(null);
  const [funnel, setFunnel] =
    useState<AdminRecommendationFunnelResponse | null>(null);
  const [funnelDays, setFunnelDays] = useState(30);
  const [logs, setLogs] = useState<AdminLogItem[]>([]);
  const [locationLogs, setLocationLogs] = useState<AdminLocationUsageItem[]>([]);
  const [locationLogTotal, setLocationLogTotal] = useState(0);
  const [locationSecurityEvents, setLocationSecurityEvents] = useState<
    AdminLocationSecurityEventItem[]
  >([]);
  const [locationSecurityEventTotal, setLocationSecurityEventTotal] =
    useState(0);
  const [places, setPlaces] = useState<AdminPlaceItem[]>([]);
  const [placesMeta, setPlacesMeta] = useState<AdminPlacesMeta | null>(null);
  const [reports, setReports] = useState<AdminReportItem[]>([]);
  const [publicationReviews, setPublicationReviews] = useState<
    AdminJournalPublicationReviewItem[]
  >([]);
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
  const drawerDragStart = useRef({ x: 0, y: 0, time: 0 });
  const suppressDrawerHandleClick = useRef(false);
  const adminLayoutRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const overviewLoadedRef = useRef(false);
  const notificationsLoadedRef = useRef(false);

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
    suppressDrawerHandleClick.current = false;
    drawerDragStart.current = {
      x: event.clientX,
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
    const pointerMovement = Math.hypot(
      event.clientX - drawerDragStart.current.x,
      event.clientY - drawerDragStart.current.y,
    );
    const elapsed = Math.max(
      1,
      performance.now() - drawerDragStart.current.time,
    );
    const velocity = distance / elapsed;

    if (pointerMovement >= 4) {
      suppressDrawerHandleClick.current = true;
    }

    setDrawerDragging(false);

    if (distance >= 72 || (distance >= 32 && velocity >= 0.5)) {
      closeMobileMenu();
    } else {
      setDrawerDragOffset(0);
    }
  };

  const handleDrawerHandleClick = () => {
    if (suppressDrawerHandleClick.current) {
      suppressDrawerHandleClick.current = false;
      return;
    }

    closeMobileMenu();
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
    const response = await fetchAdminJson<AdminOverviewResponse>("overview");
    setOverview(response.overview);
    overviewLoadedRef.current = true;
  }, []);

  const loadNotifications = useCallback(async () => {
    const notificationResponse =
      await fetchAdminJson<AdminNotificationsResponse>("notifications");
    setNotifications(notificationResponse);
    notificationsLoadedRef.current = true;
  }, []);

  const loadTab = useCallback(async () => {
    const searchParams = new URLSearchParams();

    if (appliedQuery) searchParams.set("q", appliedQuery);

    if (tab === "logs" && filter) searchParams.set("level", filter);
    if (tab === "location" && filter) {
      const [filterType, filterValue] = filter.split(":", 2);
      if (filterType && filterValue) searchParams.set(filterType, filterValue);
    }
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
    if (tab === "notifications" && filter) {
      const [filterType, filterValue] = filter.split(":", 2);
      if (filterType && filterValue) searchParams.set(filterType, filterValue);
    }

    const suffix = searchParams.size ? `?${searchParams}` : "";

    if (tab === "notifications") {
      const response = await fetchAdminJson<AdminNotificationsResponse>(
        `notifications${suffix}`,
      );
      setNotifications(response);
      notificationsLoadedRef.current = true;
    } else if (tab === "funnel") {
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
    } else if (tab === "location") {
      const response = await fetchAdminJson<AdminLocationHistoryResponse>(
        `location-history${suffix}`,
      );
      setLocationLogs(response.logs);
      setLocationLogTotal(response.total);
      setLocationSecurityEvents(response.securityEvents);
      setLocationSecurityEventTotal(response.securityEventTotal);
    } else if (tab === "places") {
      const response = await fetchAdminJson<AdminPlacesResponse>(
        `places${suffix}`,
      );
      setPlaces(response.places);
      setPlacesMeta(response.meta);
    } else if (tab === "reports") {
      const [reportResponse, publicationResponse] = await Promise.all([
        fetchAdminJson<AdminReportsResponse>(`reports${suffix}`),
        fetchAdminJson<AdminJournalPublicationReviewsResponse>(
          "journal-publications",
        ),
      ]);
      setReports(reportResponse.reports);
      setPublicationReviews(publicationResponse.reviews);
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

  const refresh = useCallback(async (forceSignals = false) => {
    setLoading(true);
    setError(null);

    try {
      if (tab === "overview") {
        await Promise.all([loadOverview(), loadNotifications()]);
      } else {
        await Promise.all([
          !forceSignals && overviewLoadedRef.current
            ? Promise.resolve()
            : loadOverview(),
          tab === "notifications" ||
          (!forceSignals && notificationsLoadedRef.current)
            ? Promise.resolve()
            : loadNotifications(),
          loadTab(),
        ]);
      }
      setAccessStatus(null);
    } catch (loadError) {
      setError(toErrorMessage(loadError));
      setAccessStatus(
        loadError instanceof AdminApiError ? loadError.status : null,
      );
    } finally {
      setLoading(false);
    }
  }, [loadNotifications, loadOverview, loadTab, tab]);

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

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMobileMenu();
        return;
      }

      if (event.key !== "Tab" || !mobileMenuRef.current) return;

      const focusable = Array.from(
        mobileMenuRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const frame = window.requestAnimationFrame(() => {
      mobileMenuRef.current
        ?.querySelector<HTMLElement>("[data-mobile-menu-initial]")
        ?.focus();
    });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousBodyOverflow;
      previousFocus?.focus();
    };
  }, [closeMobileMenu, mobileMenuOpen]);

  const mutate = async (
    resource:
      | "inquiries"
      | "journal-publications"
      | "places"
      | "reports"
      | "settings"
      | "users",
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
          {navigationGroups.map((group) => (
            <NavGroup key={group.label}>
              <NavGroupLabel>{group.label}</NavGroupLabel>
              {group.items.map((item) => (
                <NavButton
                  key={item.id}
                  type="button"
                  $active={tab === item.id}
                  aria-current={tab === item.id ? "page" : undefined}
                  onClick={() => changeTab(item.id)}
                >
                  <span>{item.label}</span>
                </NavButton>
              ))}
            </NavGroup>
          ))}
          <NavGroup>
            <NavGroupLabel>도구</NavGroupLabel>
            <NavLink href="/admin/recommendation-simulator">
              추천 시뮬레이터
            </NavLink>
            <NavLink href="/admin/tourism-data">관광 데이터</NavLink>
          </NavGroup>
        </Navigation>
        <HomeLink href="/">서비스로 돌아가기</HomeLink>
      </Sidebar>

      <Main aria-busy={loading}>
        <Header>
          <div>
            <h1>{tabs.find((item) => item.id === tab)?.label}</h1>
            <HeaderContext>{getAdminHeaderContext(tab)}</HeaderContext>
          </div>
          <RefreshButton
            type="button"
            disabled={loading}
            onClick={() => void refresh(true)}
          >
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
          <OverviewPanel
            overview={overview}
            notifications={notifications}
            onNavigate={changeTab}
            onNavigatePendingPlaces={() => {
              changeTab("places");
              setPlaceFilters({
                ...defaultPlaceFilters,
                candidate: "all",
                reviewStatus: "pending",
              });
            }}
          />
        ) : tab === "notifications" ? (
          <AdminNotificationsPanel data={notifications} />
        ) : tab === "funnel" ? (
          <RecommendationFunnelPanel
            funnel={funnel}
            days={funnelDays}
            onDaysChange={setFunnelDays}
          />
        ) : tab === "logs" ? (
          <LogsPanel logs={logs} />
        ) : tab === "location" ? (
          <LocationCompliancePanels>
            <LocationLogsPanel logs={locationLogs} total={locationLogTotal} />
            <LocationSecurityEventsPanel
              events={locationSecurityEvents}
              total={locationSecurityEventTotal}
            />
          </LocationCompliancePanels>
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
            publicationReviews={publicationReviews}
            mutatingId={mutatingId}
            onSave={(reportId, status, resolutionNote) =>
              void mutate(
                "reports",
                reportId,
                adminJsonRequest("PATCH", {
                  reportId,
                  status,
                  resolutionNote,
                }),
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
            onModerate={(report, moderationAction) => {
              const actionLabel =
                moderationAction === "hide" ? "즉시 숨길" : "다시 공개할";
              if (
                !window.confirm(
                  `"${report.targetTitle}" 기록을 ${actionLabel}까요? 조치 내용은 감사 로그에 남습니다.`,
                )
              ) {
                return;
              }

              void mutate(
                "reports",
                report.id,
                adminJsonRequest("PATCH", {
                  reportId: report.id,
                  moderationAction,
                  resolutionNote:
                    moderationAction === "hide"
                      ? "관리자 즉시 숨김"
                      : "관리자 공개 복원",
                }),
              );
            }}
            onReviewPublication={(entryId, action) => {
              if (
                !window.confirm(
                  action === "approve"
                    ? "이 기록을 인터넷에 공개할까요?"
                    : "이 공개 요청을 거절하고 작성자만 볼 수 있도록 숨길까요?",
                )
              ) {
                return;
              }

              void mutate(
                "journal-publications",
                entryId,
                adminJsonRequest("PATCH", { entryId, action }),
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
            aria-current={tab === item.id ? "page" : undefined}
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
          {Boolean(notifications?.summary.failed24h) && (
            <MobileNavBadge>{notifications?.summary.failed24h}</MobileNavBadge>
          )}
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
          ref={mobileMenuRef}
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
            data-mobile-menu-initial
            aria-label="탭하거나 아래로 끌어 더보기 메뉴 닫기"
            onClick={handleDrawerHandleClick}
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
          </MobileMenuHeader>
          <MobileMenuList>
            {mobileMoreTabs.map((item) => (
              <MobileMenuButton
                key={item.id}
                type="button"
                $active={tab === item.id}
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => changeTab(item.id)}
              >
                <span>{item.label}</span>
                <span aria-hidden="true">›</span>
              </MobileMenuButton>
            ))}
            <MobileServiceLink
              href="/admin/recommendation-simulator"
              onClick={closeMobileMenu}
            >
              <span>추천 시뮬레이터</span>
              <span aria-hidden="true">›</span>
            </MobileServiceLink>
            <MobileServiceLink
              href="/admin/tourism-data"
              onClick={closeMobileMenu}
            >
              <span>관광 데이터 관리</span>
              <span aria-hidden="true">›</span>
            </MobileServiceLink>
            <MobileServiceLink href="/" onClick={closeMobileMenu}>
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
  notifications,
  onNavigate,
  onNavigatePendingPlaces,
}: {
  overview: AdminOverview | null;
  notifications: AdminNotificationsResponse | null;
  onNavigate: (tab: AdminTab) => void;
  onNavigatePendingPlaces: () => void;
}) {
  const pendingTotal =
    (overview?.pendingInquiries ?? 0) +
    (overview?.pendingReports ?? 0) +
    (overview?.pendingPlaces ?? 0);
  const failedNotifications = notifications?.summary.failed24h ?? 0;
  const cards = [
    ["전체 사용자", overview?.users ?? 0],
    ["관리자", overview?.admins ?? 0],
    ["노출 중인 장소", overview?.activePlaces ?? 0],
    ["오늘 로그", overview?.logsToday ?? 0],
  ];

  return (
    <OverviewContent>
      <OperationsHero>
        <HeroCopy>
          <StatusKicker>오늘 운영 상태</StatusKicker>
          <h2>
            {failedNotifications > 0
              ? "알림 전달 상태를 먼저 확인해 주세요."
              : pendingTotal > 0
                ? `처리할 일이 ${pendingTotal}건 남아 있어요.`
                : "지금은 조용히 운영되고 있어요."}
          </h2>
          <p>
            문의·신고·장소 검수와 알림 전달 상태를 최근 운영 신호 순서로
            보여드립니다.
          </p>
        </HeroCopy>
        <HeroStatusSummary aria-label="운영 신호 요약">
          <div>
            <span>처리 대기</span>
            <strong>{pendingTotal.toLocaleString("ko-KR")}</strong>
          </div>
          <div>
            <span>알림 실패</span>
            <strong data-alert={failedNotifications > 0 || undefined}>
              {failedNotifications.toLocaleString("ko-KR")}
            </strong>
          </div>
        </HeroStatusSummary>
      </OperationsHero>

      <OverviewSplit>
        <OverviewSection>
          <SectionTitle>지금 처리할 일</SectionTitle>
          <QueueList>
            <QueueRow type="button" onClick={() => onNavigate("inquiries")}>
              <span>답변을 기다리는 문의</span>
              <strong>{overview?.pendingInquiries ?? 0}</strong>
              <i aria-hidden="true">›</i>
            </QueueRow>
            <QueueRow type="button" onClick={() => onNavigate("reports")}>
              <span>확인이 필요한 신고</span>
              <strong>{overview?.pendingReports ?? 0}</strong>
              <i aria-hidden="true">›</i>
            </QueueRow>
            <QueueRow type="button" onClick={onNavigatePendingPlaces}>
              <span>검토 대기 장소</span>
              <strong>{overview?.pendingPlaces ?? 0}</strong>
              <i aria-hidden="true">›</i>
            </QueueRow>
          </QueueList>
        </OverviewSection>
        <OverviewSection>
          <SectionTitle>알림 전달</SectionTitle>
          <NotificationGlance
            type="button"
            onClick={() => onNavigate("notifications")}
          >
            <GlanceHeader>
              <span>최근 24시간</span>
              <strong>
                {notifications?.summary.successRate === null ||
                notifications?.summary.successRate === undefined
                  ? "전송 없음"
                  : `${notifications.summary.successRate}% 성공`}
              </strong>
            </GlanceHeader>
            <GlanceTrack>
              <span
                style={{
                  width: `${notifications?.summary.successRate ?? 0}%`,
                }}
              />
            </GlanceTrack>
            <GlanceMeta>
              활성 기기 {notifications?.summary.activeDevices ?? 0} · 성공{" "}
              {notifications?.summary.sent24h ?? 0} · 실패 {failedNotifications}
            </GlanceMeta>
          </NotificationGlance>
        </OverviewSection>
      </OverviewSplit>
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

      <TableCard>
        <Table>
          <thead>
            <tr>
              <th scope="col">단계</th>
              <th scope="col">행동</th>
              <th scope="col">여정 수</th>
              <th scope="col">전체 대비</th>
              <th scope="col">이전 단계 대비</th>
            </tr>
          </thead>
          <tbody>
            {funnel.stages.map((stage, index) => (
              <tr key={stage.action}>
                <td data-label="단계">
                  <FunnelStageIndex>{index + 1}</FunnelStageIndex>
                </td>
                <td data-label="행동"><strong>{stage.label}</strong></td>
                <td data-label="여정 수">
                  {stage.journeys.toLocaleString("ko-KR")}
                </td>
                <td data-label="전체 대비">{formatRate(stage.rateFromRuns)}</td>
                <td data-label="이전 단계 대비">
                  {index > 0 ? formatRate(stage.rateFromPrevious) : "기준 단계"}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableCard>

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
    <TableCard>
      <Table>
        <thead>
          <tr>
            <th scope="col">수준</th>
            <th scope="col">내용</th>
            <th scope="col">분류·작업</th>
            <th scope="col">작업자·대상</th>
            <th scope="col">발생 시각</th>
            <th scope="col">원문</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td data-label="수준">
                <StatusBadge $tone={log.level}>
                  {getLogLevelLabel(log.level)}
                </StatusBadge>
              </td>
              <td data-label="내용">
                <strong>{log.message}</strong>
              </td>
              <td data-label="분류·작업">
                {log.category}
                <Small>{log.action}</Small>
              </td>
              <td data-label="작업자·대상">
                {log.actorUserId ?? "시스템"}
                <Small>{log.targetId ?? "대상 없음"}</Small>
              </td>
              <td data-label="발생 시각">
                <Time>{formatDate(log.createdAt)}</Time>
              </td>
              <td data-label="원문">
                {Boolean(log.targetId || log.metadata) ? (
                  <CompactDetails>
                    <summary>보기</summary>
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
                  </CompactDetails>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableCard>
  );
}

function LocationLogsPanel({
  logs,
  total,
}: {
  logs: AdminLocationUsageItem[];
  total: number;
}) {
  if (logs.length === 0) {
    return <StatePanel>조건에 맞는 위치정보 확인자료가 없습니다.</StatePanel>;
  }

  return (
    <RecordsSection>
      <LocationLogSummary>
        <strong>{total.toLocaleString("ko-KR")}건</strong>
        <span>최근 기록은 최대 200건까지 표시하며 원본 위도·경도는 기록하지 않습니다.</span>
      </LocationLogSummary>
      <TableCard>
        <Table>
          <thead>
            <tr>
              <th scope="col">구분</th>
              <th scope="col">이용 서비스</th>
              <th scope="col">취득 경로</th>
              <th scope="col">사용자</th>
              <th scope="col">발생 시각</th>
              <th scope="col">확인자료</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td data-label="구분">
                  <StatusBadge
                    $tone={log.kind === "external_transfer" ? "warning" : "info"}
                  >
                    {log.kind === "external_transfer" ? "외부 전달" : "내부 이용"}
                  </StatusBadge>
                </td>
                <td data-label="이용 서비스">
                  {log.kind === "external_transfer"
                    ? log.externalRecipient ?? "외부 서비스"
                    : getLocationServiceLabel(log.service)}
                  <Small>{log.method}</Small>
                </td>
                <td data-label="취득 경로">
                  {log.acquisitionSource === "photo_exif"
                    ? "사진 촬영 위치"
                    : "기기 현재 위치"}
                </td>
                <td data-label="사용자">{log.userId ?? "삭제된 사용자"}</td>
                <td data-label="발생 시각">
                  <Time>{formatDate(log.occurredAt)}</Time>
                </td>
                <td data-label="확인자료">
                  <CompactDetails>
                    <summary>보기</summary>
                    <Code>
                      {JSON.stringify(
                        {
                          처리경로: log.method,
                          외부처리목적: log.externalPurpose,
                          외부처리모드: log.externalMode,
                          보존만료: formatDate(log.retentionUntil),
                        },
                        null,
                        2,
                      )}
                    </Code>
                  </CompactDetails>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableCard>
    </RecordsSection>
  );
}

function getLocationServiceLabel(service: AdminLocationUsageItem["service"]) {
  return {
    recommendation: "장소 추천",
    travel_time: "이동시간 확인",
    departure_plan: "출발 계획",
    photo_nearby: "사진 주변 장소 찾기",
  }[service];
}

function LocationSecurityEventsPanel({
  events,
  total,
}: {
  events: AdminLocationSecurityEventItem[];
  total: number;
}) {
  return (
    <RecordsSection>
      <LocationLogSummary>
        <strong>
          시스템 접근·권한·점검 기록 {total.toLocaleString("ko-KR")}건
        </strong>
        <span>
          상단 검색·필터와 별개로 최근 200건을 표시합니다. 권한 변경·점검
          기록은 5년, 일반 시스템 접근기록은 1년간 보존합니다.
        </span>
      </LocationLogSummary>
      {events.length === 0 ? (
        <StatePanel>아직 위치정보 보안 감사기록이 없습니다.</StatePanel>
      ) : (
        <TableCard>
          <Table>
            <thead>
              <tr>
                <th scope="col">결과</th>
                <th scope="col">기록 유형</th>
                <th scope="col">작업·자원</th>
                <th scope="col">작업자</th>
                <th scope="col">발생 시각</th>
                <th scope="col">감사 원문</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td data-label="결과">
                    <StatusBadge
                      $tone={
                        !event.integrityValid || event.result === "failed"
                          ? "error"
                          : event.result === "denied"
                            ? "warning"
                            : "approved"
                      }
                    >
                      {!event.integrityValid
                        ? "무결성 확인 필요"
                        : getLocationSecurityResultLabel(event.result)}
                    </StatusBadge>
                  </td>
                  <td data-label="기록 유형">
                    {getLocationSecurityCategoryLabel(event.category)}
                  </td>
                  <td data-label="작업·자원">
                    {event.action}
                    <Small>{event.resource}</Small>
                  </td>
                  <td data-label="작업자">
                    {event.actorUserId ?? "시스템/외부 요청"}
                  </td>
                  <td data-label="발생 시각">
                    <Time>{formatDate(event.occurredAt)}</Time>
                  </td>
                  <td data-label="감사 원문">
                    <CompactDetails>
                      <summary>보기</summary>
                      <Code>
                        {JSON.stringify(
                          {
                            결과: getLocationSecurityResultLabel(event.result),
                            서명검증: event.integrityValid ? "정상" : "실패",
                            보존만료: formatDate(event.retentionUntil),
                            세부정보: event.details,
                          },
                          null,
                          2,
                        )}
                      </Code>
                    </CompactDetails>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableCard>
      )}
    </RecordsSection>
  );
}

function getLocationSecurityCategoryLabel(
  category: AdminLocationSecurityEventItem["category"],
) {
  return {
    system_access: "위치정보시스템 접근",
    permission_change: "접근권한 변경",
    maintenance: "보존·파기 작업",
    inspection: "보호조치 자체점검",
    incident: "보안사고 대응",
  }[category];
}

function getLocationSecurityResultLabel(
  result: AdminLocationSecurityEventItem["result"],
) {
  return {
    success: "정상",
    denied: "접근 거부",
    failed: "실패",
  }[result];
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersApplied =
    Boolean(query.trim() || appliedQuery) ||
    Object.entries(filters).some(
      ([key, value]) =>
        value !== defaultPlaceFilters[key as keyof PlaceFilterState],
    );
  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) =>
      value !== defaultPlaceFilters[key as keyof PlaceFilterState],
  ).length + (appliedQuery ? 1 : 0);

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
      <PlaceSavedViews aria-label="장소 저장 보기">
        <PlaceViewButton
          type="button"
          $active={filters.candidate === "pool" && !filters.reviewStatus}
          aria-pressed={filters.candidate === "pool" && !filters.reviewStatus}
          onClick={() => {
            onFilterChange("candidate", "pool");
            onFilterChange("reviewStatus", "");
          }}
        >
          추천풀 <span>{meta?.candidateCounts.pool ?? 0}</span>
        </PlaceViewButton>
        <PlaceViewButton
          type="button"
          $active={
            filters.candidate === "all" && filters.reviewStatus === "pending"
          }
          aria-pressed={
            filters.candidate === "all" && filters.reviewStatus === "pending"
          }
          onClick={() => {
            onFilterChange("candidate", "all");
            onFilterChange("reviewStatus", "pending");
          }}
        >
          검토 대기 <span>{meta?.statusCounts.pending ?? 0}</span>
        </PlaceViewButton>
        <PlaceViewButton
          type="button"
          $active={filters.candidate === "all" && !filters.reviewStatus}
          aria-pressed={filters.candidate === "all" && !filters.reviewStatus}
          onClick={() => {
            onFilterChange("candidate", "all");
            onFilterChange("reviewStatus", "");
          }}
        >
          전체 <span>{meta?.all ?? 0}</span>
        </PlaceViewButton>
      </PlaceSavedViews>
      <PlaceFilterToggle
        type="button"
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((open) => !open)}
      >
        <span>상세 필터</span>
        <strong>
          {activeFilterCount > 0 ? `${activeFilterCount}개 적용 중` : "조건 추가"}
        </strong>
        <i aria-hidden="true">{filtersOpen ? "−" : "+"}</i>
      </PlaceFilterToggle>
      <PlaceFilterGrid $mobileOpen={filtersOpen}>
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
            <PlaceSummaryBadge $tone="brand">
              추천풀 {meta.candidateCounts.pool}
            </PlaceSummaryBadge>
            <PlaceSummaryBadge $tone="pending">
              대기 {meta.statusCounts.pending}
            </PlaceSummaryBadge>
            <PlaceSummaryBadge $tone="success">
              승인 {meta.statusCounts.approved}
            </PlaceSummaryBadge>
            <PlaceSummaryBadge $tone="neutral">
              노출 허용 {meta.visibilityCounts.active}
            </PlaceSummaryBadge>
          </PlaceStatusSummary>
        )}
      </PlaceResultHeader>

      {places.length === 0 ? (
        <StatePanel>조건에 맞는 장소가 없습니다.</StatePanel>
      ) : (
        <>
          <TableCard>
            <Table>
              <thead>
                <tr>
                  <th scope="col">장소</th>
                  <th scope="col">지역</th>
                  <th scope="col">출처·유형</th>
                  <th scope="col">추천 판정</th>
                  <th scope="col">검수 상태</th>
                  <th scope="col">노출</th>
                  <th scope="col">갱신 시각</th>
                </tr>
              </thead>
              <tbody>
                {places.map((place) => (
                  <tr key={place.id}>
                    <td data-label="장소">
                      <strong>{place.name}</strong>
                      <Small>
                        피로도 {place.fatigue} · {place.movementLevel}
                      </Small>
                      <Small>{place.id}</Small>
                    </td>
                    <td data-label="지역">
                      {formatPlaceRegion(place)}
                      {place.sourceAddress ? (
                        <Small>{place.sourceAddress}</Small>
                      ) : null}
                    </td>
                    <td data-label="출처·유형">
                      {getPlaceSourceLabel(place.source)}
                      {place.sourceContentType ? (
                        <Small>
                          {getTourApiContentTypeLabel(place.sourceContentType)}
                        </Small>
                      ) : null}
                      {place.sourceId ? <Small>{place.sourceId}</Small> : null}
                      {place.sourceCopyright ? (
                        <Small>이미지 이용 구분 {place.sourceCopyright}</Small>
                      ) : null}
                    </td>
                    <td data-label="추천 판정">
                      <CandidateBadge $inPool={isCandidatePoolPlace(place)}>
                        {getCandidateStatusLabel(place)}
                      </CandidateBadge>
                      {place.candidateScore !== null ? (
                        <Small>점수 {place.candidateScore}</Small>
                      ) : null}
                      {getCandidateExplanation(place) ? (
                        <Small>{getCandidateExplanation(place)}</Small>
                      ) : null}
                      <Small>
                        판정 {formatOptionalDate(place.candidateEvaluatedAt)}
                      </Small>
                    </td>
                    <td data-label="검수 상태">
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
                    </td>
                    <td data-label="노출">
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
                      <Small>정책 {getVisibilityOverrideLabel(place.visibilityOverride)}</Small>
                    </td>
                    <td data-label="갱신 시각">
                      <Time dateTime={place.updatedAt}>
                        {formatDate(place.updatedAt)}
                      </Time>
                      <Small>원천 {formatOptionalDate(place.sourceSyncedAt)}</Small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableCard>
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
  publicationReviews,
  mutatingId,
  onSave,
  onForceDelete,
  onModerate,
  onReviewPublication,
}: {
  reports: AdminReportItem[];
  publicationReviews: AdminJournalPublicationReviewItem[];
  mutatingId: string | null;
  onSave: (
    reportId: string,
    status: string,
    resolutionNote: string,
  ) => void;
  onForceDelete: (report: AdminReportItem) => void;
  onModerate: (
    report: AdminReportItem,
    action: "hide" | "restore",
  ) => void;
  onReviewPublication: (
    entryId: string,
    action: "approve" | "reject",
  ) => void;
}) {
  if (reports.length === 0 && publicationReviews.length === 0) {
    return <StatePanel>검토할 공개 요청이나 신고가 없습니다.</StatePanel>;
  }

  return (
    <ReportSections>
      {publicationReviews.length > 0 && (
        <TableCard>
          <SectionHeading>공개 전 안전 검토</SectionHeading>
          <Table>
            <thead>
              <tr>
                <th scope="col">기록</th>
                <th scope="col">내용</th>
                <th scope="col">검토 사유</th>
                <th scope="col">요청 시각</th>
                <th scope="col">조치</th>
              </tr>
            </thead>
            <tbody>
              {publicationReviews.map((review) => (
                <tr key={review.id}>
                  <td data-label="기록">
                    {review.image && (
                      <ReviewThumbnail src={review.image} alt="" />
                    )}
                    <strong>{review.title || review.placeName}</strong>
                    <Small>{review.placeName}</Small>
                  </td>
                  <td data-label="내용">{review.content}</td>
                  <td data-label="검토 사유">
                    {review.reasons.map(getPublicationReviewReasonLabel).join(", ")}
                  </td>
                  <td data-label="요청 시각">{formatDate(review.requestedAt)}</td>
                  <td data-label="조치">
                    <TableActions>
                      <CompactActionButton
                        type="button"
                        disabled={mutatingId === review.id}
                        onClick={() => onReviewPublication(review.id, "approve")}
                      >
                        공개 승인
                      </CompactActionButton>
                      <DangerButton
                        type="button"
                        disabled={mutatingId === review.id}
                        onClick={() => onReviewPublication(review.id, "reject")}
                      >
                        공개 거절
                      </DangerButton>
                    </TableActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableCard>
      )}
      {reports.length > 0 && <TableCard>
      <Table>
        <thead>
          <tr>
            <th scope="col">상태</th>
            <th scope="col">신고 대상</th>
            <th scope="col">사유·상세</th>
            <th scope="col">신고자</th>
            <th scope="col">처리 이력</th>
            <th scope="col">접수 시각</th>
            <th scope="col">조치</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id}>
              <td data-label="상태">
                <StatusBadge $tone={report.status}>
                  {getReportStatusLabel(report.status)}
                </StatusBadge>
              </td>
              <td data-label="신고 대상">
                <strong>{report.targetTitle}</strong>
                <Small>{report.targetPublicId ?? report.entryId ?? "삭제됨"}</Small>
              </td>
              <td data-label="사유·상세">
                {report.reason}
                {report.detail ? <Small>{report.detail}</Small> : null}
              </td>
              <td data-label="신고자">{report.reporterUserId}</td>
              <td data-label="처리 이력">
                {report.reviewerUserId ?? "미지정"}
                <Small>
                  {report.reviewedAt ? formatDate(report.reviewedAt) : "처리 전"}
                </Small>
                {report.resolutionNote ? <Small>{report.resolutionNote}</Small> : null}
              </td>
              <td data-label="접수 시각">
                <Time>{formatDate(report.createdAt)}</Time>
              </td>
              <td data-label="조치">
                <ReportActionEditor
                  key={`${report.id}:${report.status}:${report.resolutionNote ?? ""}`}
                  report={report}
                  saving={mutatingId === report.id}
                  onSave={onSave}
                  onForceDelete={onForceDelete}
                  onModerate={onModerate}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      </TableCard>}
    </ReportSections>
  );
}

function ReportActionEditor({
  report,
  saving,
  onSave,
  onForceDelete,
  onModerate,
}: {
  report: AdminReportItem;
  saving: boolean;
  onSave: (
    reportId: string,
    status: string,
    resolutionNote: string,
  ) => void;
  onForceDelete: (report: AdminReportItem) => void;
  onModerate: (
    report: AdminReportItem,
    action: "hide" | "restore",
  ) => void;
}) {
  const [status, setStatus] = useState(report.status);
  const [resolutionNote, setResolutionNote] = useState(
    report.resolutionNote ?? "",
  );
  const changed =
    status !== report.status ||
    resolutionNote.trim() !== (report.resolutionNote ?? "");

  return (
    <TableActions>
      <InlineSelect
        value={status}
        disabled={saving}
        aria-label={`${report.targetTitle} 신고 상태`}
        onChange={(event) => setStatus(event.target.value as typeof status)}
      >
        <option value="pending">접수</option>
        <option value="reviewing">검토 중</option>
        <option value="resolved">처리 완료</option>
        <option value="dismissed">기각</option>
      </InlineSelect>
      <ReportNoteInput
        value={resolutionNote}
        disabled={saving}
        maxLength={1000}
        aria-label={`${report.targetTitle} 신고 처리 메모`}
        placeholder="처리 메모"
        onChange={(event) => setResolutionNote(event.target.value)}
      />
      <CompactActionButton
        type="button"
        disabled={saving || !changed}
        onClick={() => onSave(report.id, status, resolutionNote.trim())}
      >
        저장
      </CompactActionButton>
      {report.targetPublicationStatus === "published" ? (
        <DangerButton
          type="button"
          disabled={saving}
          onClick={() => onModerate(report, "hide")}
        >
          즉시 숨김
        </DangerButton>
      ) : report.targetPublicationStatus === "hidden" ? (
        <CompactActionButton
          type="button"
          disabled={saving}
          onClick={() => onModerate(report, "restore")}
        >
          공개 복원
        </CompactActionButton>
      ) : null}
      <DangerButton
        type="button"
        disabled={saving || !report.entryId}
        onClick={() => onForceDelete(report)}
      >
        기록 삭제
      </DangerButton>
    </TableActions>
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
    <InquiryTable>
      <InquiryTableHead aria-hidden="true">
        <span>상태·문의</span>
        <span>요청자·처리자</span>
        <span>접수 시각</span>
        <span>열기</span>
      </InquiryTableHead>
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
    </InquiryTable>
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
    <InquiryRecord>
      <InquirySummaryButton
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <InquirySubject>
          <StatusBadge $tone={inquiry.status}>
            {getInquiryStatusLabel(inquiry.status)}
          </StatusBadge>
          <div>
            <h2>{inquiry.subject}</h2>
            <InquiryPreview>{inquiry.message}</InquiryPreview>
          </div>
        </InquirySubject>
        <InquiryRequester>
          {inquiry.requesterEmail ??
            inquiry.requesterUserId ??
            "삭제된 사용자"}
          <Small>{getInquiryCategoryLabel(inquiry.category)}</Small>
          <Small>
            처리 {inquiry.handledByUserId ?? "담당자 미지정"}
            {inquiry.handledAt ? ` · ${formatDate(inquiry.handledAt)}` : ""}
          </Small>
        </InquiryRequester>
        <Time>{formatDate(inquiry.createdAt)}</Time>
        <ExpandLabel>{expanded ? "접기" : "확인"}</ExpandLabel>
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
              onChange={(event) => {
                const nextResponse = event.target.value;
                setAdminResponse(nextResponse);
                setStatus((current) => {
                  if (nextResponse.trim()) {
                    return current === "closed" ? current : "answered";
                  }

                  return current === "answered" ? "reviewing" : current;
                });
              }}
            />
            <SearchButton
              type="button"
              disabled={
                saving ||
                !changed ||
                (status === "answered" && !adminResponse.trim())
              }
              onClick={() =>
                onSave(inquiry.id, status, adminResponse.trim())
              }
            >
              {saving ? "저장 중..." : "답변 저장"}
            </SearchButton>
          </ResponseArea>
        </InquiryDetail>
      )}
    </InquiryRecord>
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
    <TableCard>
      <Table>
        <thead>
          <tr>
            <th scope="col">계정</th>
            <th scope="col">공급자</th>
            <th scope="col">기록</th>
            <th scope="col">최종 접속</th>
            <th scope="col">가입일</th>
            <th scope="col">권한</th>
            <th scope="col">관리</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td data-label="계정">
                <strong>{user.displayName ?? "이름 미등록"}</strong>
                <Small>{user.email ?? "익명 사용자"}</Small>
                <Small>{user.id}</Small>
              </td>
              <td data-label="공급자">{user.providers.join(", ") || "-"}</td>
              <td data-label="기록">{user.journalCount}</td>
              <td data-label="최종 접속">{formatDate(user.lastAccessedAt)}</td>
              <td data-label="가입일">{formatDate(user.createdAt)}</td>
              <td data-label="권한">
                <UserRoleEditor
                  key={`${user.id}:${user.role}`}
                  user={user}
                  saving={mutatingId === user.id}
                  onSave={onRoleChange}
                />
              </td>
              <td data-label="관리">
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
  );
}

function UserRoleEditor({
  user,
  saving,
  onSave,
}: {
  user: AdminUserItem;
  saving: boolean;
  onSave: (userId: string, role: string) => void;
}) {
  const [role, setRole] = useState(user.role);

  return (
    <InlineActionGroup>
      <InlineSelect
        value={role}
        disabled={saving}
        aria-label={`${user.email ?? user.id} 권한`}
        onChange={(event) => setRole(event.target.value as typeof role)}
      >
        <option value="user">사용자</option>
        <option value="admin">관리자</option>
      </InlineSelect>
      <CompactActionButton
        type="button"
        disabled={saving || role === user.role}
        onClick={() => onSave(user.id, role)}
      >
        적용
      </CompactActionButton>
    </InlineActionGroup>
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
        <Small>최근 변경 {formatOptionalDate(setting.updatedAt)}</Small>
      </div>
      {setting.type === "boolean" ? (
        <InlineActionGroup>
          <ToggleLabel>
            <input
              type="checkbox"
              checked={value === "true"}
              disabled={saving}
              onChange={(event) => setValue(String(event.target.checked))}
            />
            {value === "true" ? "사용" : "사용 안 함"}
          </ToggleLabel>
          <CompactActionButton
            type="button"
            disabled={saving || value === setting.value}
            onClick={() => onSave(setting.key, value)}
          >
            적용
          </CompactActionButton>
        </InlineActionGroup>
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
  if (tab === "notifications") {
    return [
      { value: "", label: "전체 알림" },
      { value: "platform:android", label: "Android" },
      { value: "platform:ios", label: "iOS" },
      { value: "status:sent", label: "전달 성공" },
      { value: "status:failed", label: "전달 실패" },
      { value: "status:invalidated", label: "토큰 무효" },
    ];
  }

  if (tab === "logs") {
    return [
      { value: "", label: "전체 레벨" },
      { value: "info", label: "정보" },
      { value: "warning", label: "경고" },
      { value: "error", label: "오류" },
    ];
  }

  if (tab === "location") {
    return [
      { value: "", label: "전체 기록" },
      { value: "kind:internal_use", label: "내부 이용" },
      { value: "kind:external_transfer", label: "외부 전달" },
      { value: "service:recommendation", label: "장소 추천" },
      { value: "service:travel_time", label: "이동시간" },
      { value: "service:departure_plan", label: "출발 계획" },
      { value: "service:photo_nearby", label: "사진 위치" },
      { value: "days:7", label: "최근 7일" },
      { value: "days:30", label: "최근 30일" },
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
  if (tab === "notifications") {
    return "이메일, 사용자 ID, 알림 유형 또는 오류 코드 검색";
  }
  if (tab === "logs") return "메시지, 작업, 사용자 ID 검색";
  if (tab === "location") return "사용자 ID, 외부 제공자 또는 처리 경로 검색";
  if (tab === "places") return "장소명, 장소 ID, 공공데이터 ID 검색";
  if (tab === "reports") return "제목, 신고 내용, 사용자 ID 검색";
  if (tab === "inquiries") {
    return "제목, 문의 내용, 이메일 또는 사용자 ID 검색";
  }
  return "이메일 또는 사용자 ID 검색";
}

function getAdminHeaderContext(tab: AdminTab) {
  if (tab === "overview") return "지금 확인할 운영 신호";
  if (tab === "notifications") return "앱 알림 전달과 기기 상태";
  if (tab === "funnel") return "추천 이후 행동 흐름";
  if (tab === "location") return "위치정보 이용·제공 확인";
  if (tab === "places") return "추천 장소 검수와 노출";
  if (tab === "reports") return "신고 검토와 조치";
  if (tab === "inquiries") return "사용자 문의와 답변";
  if (tab === "users") return "계정과 관리자 권한";
  if (tab === "settings") return "서비스 운영 기준";
  return "서비스 기록과 이상 징후";
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

function formatOptionalDate(value: string | null) {
  return value ? formatDate(value) : "기록 없음";
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

function getVisibilityOverrideLabel(value: AdminPlaceItem["visibilityOverride"]) {
  if (value === "show") return "수동 노출";
  if (value === "hide") return "수동 숨김";
  return "자동";
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

function getPublicationReviewReasonLabel(reason: string) {
  if (reason === "image_review_required") return "이미지 확인";
  if (reason === "contact_information") return "연락처 노출 가능성";
  if (reason === "external_link") return "외부 링크";
  if (reason === "unsafe_language") return "위험 표현";
  if (reason === "spam_pattern") return "반복·홍보 패턴";
  if (reason === "content_changed_after_publication") return "공개 후 내용 변경";
  return reason;
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
  grid-template-columns: 216px minmax(0, 1fr);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: auto;
  background: var(--color-neutral-200);
  color: var(--color-text);
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;

  :where(button, a, input, select, textarea, summary, [tabindex]):focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }

  @media (max-width: 1024px) {
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
  gap: var(--space-5);
  padding: var(--space-6) var(--space-4);
  overflow-y: auto;
  border-right: 1px solid var(--color-border);
  background: var(--color-white);

  @media (max-width: 1024px) {
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
  gap: var(--space-5);
`;

const NavGroup = styled.div`
  display: grid;
  gap: 2px;
`;

const NavGroupLabel = styled.span`
  padding: 0 var(--space-3) var(--space-1);
  color: var(--color-neutral-800);
  font-size: 11px;
  font-weight: 700;
`;

const NavButton = styled.button<{ $active: boolean }>`
  position: relative;
  min-height: 38px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: 6px;
  background: ${({ $active }) =>
    $active ? "var(--color-brand-100)" : "transparent"};
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-100);
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  text-align: left;
  cursor: pointer;

  &::before {
    position: absolute;
    top: 50%;
    left: 0;
    width: 3px;
    height: ${({ $active }) => ($active ? "22px" : "0")};
    border-radius: 999px;
    background: var(--color-brand-700);
    transform: translateY(-50%);
    transition: height 180ms ease;
    content: "";
  }

  &:hover {
    background: ${({ $active }) =>
      $active
        ? "var(--color-brand-100)"
        : "var(--color-neutral-200)"};
  }

  &:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    &::before {
      transition: none;
    }
  }

`;

const NavLink = styled(Link)`
  min-height: 38px;
  display: flex;
  align-items: center;
  padding: 0 var(--space-3);
  border-radius: 6px;
  color: var(--color-text);
  font-size: var(--font-size-100);
  font-weight: 500;
  text-decoration: none;

  &:hover {
    background: var(--color-neutral-200);
  }

  &:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
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

const Main = styled.main`
  min-width: 0;
  min-height: 100dvh;
  width: min(100%, 1600px);
  display: grid;
  align-content: start;
  gap: var(--space-5);
  padding: var(--space-6);
  margin: 0 auto;

  @media (max-width: 1024px) {
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
  min-height: 64px;
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);

  h1 {
    font-size: var(--font-size-600);
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
      font-size: var(--font-size-500);
    }
  }
`;

const HeaderContext = styled.span`
  display: block;
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  font-weight: 600;

  @media (max-width: 480px) {
    color: var(--color-text-muted);
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
  border-radius: 6px;
  background: var(--color-white);
  color: var(--color-brand-1000);
  font: inherit;
  cursor: pointer;

  &:disabled {
    cursor: wait;
    opacity: 0.55;
  }

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
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  background: var(--color-white);

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
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);

  @media (max-width: 768px) {
    gap: var(--space-3);
    padding: var(--space-4);
    border: 0;
    border-radius: 6px;
    background: var(--color-white);
  }
`;

const PlaceSearchRow = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-3);
`;

const PlaceSavedViews = styled.div`
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const PlaceViewButton = styled.button<{ $active: boolean }>`
  min-height: 38px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  border: 1px solid
    ${({ $active }) =>
      $active ? "var(--color-brand-800)" : "var(--color-border)"};
  border-radius: 6px;
  background: ${({ $active }) =>
    $active ? "var(--color-brand-100)" : "var(--color-white)"};
  color: ${({ $active }) =>
    $active ? "var(--color-brand-1000)" : "var(--color-text-muted)"};
  font: inherit;
  font-size: var(--font-size-100);
  font-weight: 700;
  cursor: pointer;

  span {
    min-width: 20px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
`;

const PlaceFilterToggle = styled.button`
  display: none;

  @media (max-width: 640px) {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-white);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-100);
    font-weight: 700;
    cursor: pointer;

    strong {
      margin-left: auto;
      color: var(--color-text-muted);
      font-size: 11px;
    }

    i {
      color: var(--color-brand-900);
      font-style: normal;
      font-size: var(--font-size-300);
    }
  }
`;

const PlaceFilterGrid = styled.div<{ $mobileOpen: boolean }>`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: end;
  gap: var(--space-3);

  @media (max-width: 1100px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    display: ${({ $mobileOpen }) => ($mobileOpen ? "grid" : "none")};
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);

    > button:last-child {
      grid-column: 1 / -1;
    }
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
  border-radius: 6px;
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
  border-radius: 6px;
  outline: 0;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;

  &:focus {
    border-color: var(--color-brand-800);
    box-shadow: 0 0 0 2px var(--color-brand-200);
  }
`;

const Select = styled.select`
  min-height: var(--space-11);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
`;

const SearchButton = styled.button`
  min-height: var(--space-11);
  padding: 0 var(--space-5);
  border: 0;
  border: 1px solid var(--color-brand-800);
  border-radius: 6px;
  background: var(--color-brand-800);
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
  border-radius: 8px;
  background: var(--color-white);
  color: var(--color-text-muted);
  box-shadow: none;
`;

const OverviewContent = styled.div`
  display: grid;
  gap: var(--space-6);

  section {
    display: grid;
    gap: var(--space-3);
  }
`;

const OperationsHero = styled.section`
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(260px, 0.8fr) minmax(420px, 1.2fr);
  align-items: end;
  gap: var(--space-6);
  padding: var(--space-5);
  border: 1px solid var(--color-brand-200);
  border-radius: 8px;
  background: var(--color-white);
  box-shadow: none;

  &::before {
    position: absolute;
    inset: 0 0 auto;
    height: 3px;
    background: linear-gradient(
      90deg,
      var(--color-brand-500),
      var(--color-accent-bridge) 52%,
      var(--color-secondary-500)
    );
    content: "";
  }

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  @media (max-width: 520px) {
    gap: var(--space-5);
    padding: var(--space-4);
    border-radius: 8px;
  }
`;

const HeroCopy = styled.div`
  h2 {
    max-width: 18ch;
    margin-top: var(--space-2);
    font-size: clamp(var(--font-size-500), 2.5vw, var(--font-size-700));
    line-height: 1.3;
    letter-spacing: var(--letter-spacing-heading);
  }

  p {
    max-width: 48ch;
    margin-top: var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: 1.65;
  }
`;

const StatusKicker = styled.span`
  color: var(--color-brand-800);
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const HeroStatusSummary = styled.div`
  align-self: stretch;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-white);

  > div {
    display: grid;
    align-content: center;
    gap: var(--space-2);
    padding: var(--space-5);
    border-right: 1px solid var(--color-border);
  }

  > div:last-child {
    border-right: 0;
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    font-weight: 600;
  }

  strong {
    font-size: var(--font-size-700);
    font-variant-numeric: tabular-nums;
    line-height: 1;

    &[data-alert="true"] {
      color: var(--color-error);
    }
  }
`;

const OverviewSplit = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-5);

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const OverviewSection = styled.section`
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--space-3);
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

const QueueList = styled.div`
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
  box-shadow: none;
`;

const QueueRow = styled.button`
  width: 100%;
  min-height: 66px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:last-child {
    border-bottom: 0;
  }

  span {
    font-size: var(--font-size-100);
    font-weight: 600;
  }

  strong {
    min-width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: var(--color-secondary-200);
    font-size: var(--font-size-200);
  }

  i {
    color: var(--color-text-muted);
    font-style: normal;
    font-size: var(--font-size-400);
  }

  &:hover {
    background: var(--color-neutral-100);
  }

  &:focus-visible {
    position: relative;
    outline: 3px solid var(--color-brand-900);
    outline-offset: -3px;
  }
`;

const NotificationGlance = styled.button`
  min-height: 198px;
  display: grid;
  align-content: center;
  gap: var(--space-5);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: none;

  &:hover {
    border-color: var(--color-brand-300);
  }

  &:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }
`;

const GlanceHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  strong {
    font-size: var(--font-size-400);
  }
`;

const GlanceTrack = styled.div`
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-neutral-300);

  span {
    height: 100%;
    display: block;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      var(--color-brand-500),
      var(--color-accent-bridge),
      var(--color-secondary-500)
    );
  }
`;

const GlanceMeta = styled.p`
  color: var(--color-text-muted);
  font-size: 12px;
`;

const MetricGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);

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
  gap: var(--space-3);
  padding: var(--space-4);
  border: 0;
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;
  background: var(--color-white);
  box-shadow: none;

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }

  strong {
    font-size: var(--font-size-600);
    line-height: 1;
  }

  @media (max-width: 520px) {
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: 0;
    box-shadow: none;

    strong {
      font-size: var(--font-size-700);
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
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const FunnelSummaryCard = styled.article`
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 0;
  border-right: 1px solid var(--color-border);
  border-radius: 0;
  background: var(--color-white);
  box-shadow: none;

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
    font-size: 11px;
  }

  &:last-child {
    border-right: 0;
  }

  @media (max-width: 640px) {
    min-height: 68px;
    grid-template-columns: 1fr auto;
    align-items: center;
    padding: var(--space-4);
    border-right: 0;
    border-bottom: 1px solid var(--color-border);

    &:last-child {
      border-bottom: 0;
    }

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

const FunnelStageIndex = styled.span`
  width: var(--space-7);
  height: var(--space-7);
  display: grid;
  place-items: center;
  border-radius: 4px;
  background: var(--color-brand-100);
  color: var(--color-brand-900);
  font-size: 11px;
  font-weight: 700;
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
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  box-shadow: none;

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
    border-bottom: 1px solid var(--color-border);
    border-radius: 0;
    background: var(--color-white);
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
    font-size: 11px;
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
  gap: 0;
  padding: 0;
  margin: 0;
  border-top: 1px solid var(--color-border);
  list-style: none;

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--color-border);
    background: transparent;
  }

  code {
    overflow-wrap: anywhere;
    font-size: 11px;
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

const LocationCompliancePanels = styled.div`
  display: grid;
  gap: var(--space-6);
`;

const RecordsSection = styled.div`
  display: grid;
  gap: var(--space-3);
`;

const LocationLogSummary = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-white);

  strong {
    font-size: var(--font-size-300);
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  @media (max-width: 480px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const InquirySummaryButton = styled.button`
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: var(--inquiry-table-columns);
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;

  h2 {
    overflow-wrap: anywhere;
    font-size: var(--font-size-100);
  }

  &:hover {
    background: var(--color-neutral-200);
  }

  @media (max-width: 768px) {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;

    > time {
      grid-column: 1;
      text-align: left;
    }
  }
`;

const InquiryTable = styled.div`
  --inquiry-table-columns: minmax(280px, 1.5fr) minmax(160px, 0.8fr) 130px 52px;

  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
`;

const InquiryTableHead = styled.div`
  display: grid;
  grid-template-columns: var(--inquiry-table-columns);
  gap: var(--space-4);
  padding: 10px var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-neutral-200);
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 700;

  span:nth-of-type(n + 3) {
    text-align: right;
  }

  @media (max-width: 768px) {
    display: none;
  }
`;

const InquiryRecord = styled.article`
  border-bottom: 1px solid var(--color-border);

  &:last-child {
    border-bottom: 0;
  }
`;

const InquirySubject = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-3);

  > div {
    min-width: 0;
  }

  @media (max-width: 768px) {
    grid-column: 1 / -1;
  }
`;

const InquiryRequester = styled.div`
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--font-size-100);
`;

const InquiryPreview = styled.p`
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
`;

const ExpandLabel = styled.span`
  justify-self: end;
  color: var(--color-brand-900);
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const InquiryDetail = styled.div`
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border-top: 1px solid var(--color-border);
  background: var(--color-neutral-200);
`;

const StatusBadge = styled.span<{ $tone: string }>`
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 0 var(--space-2);
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "error"
      ? "color-mix(in srgb, var(--color-error) 9%, var(--color-white))"
      : $tone === "pending"
      ? "var(--color-neutral-300)"
      : $tone === "warning" || $tone === "reviewing"
        ? "color-mix(in srgb, var(--color-warning) 12%, var(--color-white))"
        : $tone === "approved" ||
            $tone === "answered" ||
            $tone === "resolved" ||
            $tone === "admin"
          ? "var(--color-secondary-200)"
          : "var(--color-neutral-300)"};
  color: ${({ $tone }) =>
    $tone === "error"
      ? "var(--color-error)"
      : $tone === "warning" || $tone === "reviewing"
        ? "var(--color-warning)"
        : "var(--color-text)"};
  font-size: 11px;
  font-weight: 700;
`;

const Time = styled.time`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  text-align: right;
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

const CompactDetails = styled.details`
  position: relative;

  summary {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    color: var(--color-brand-900);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  &[open] pre {
    min-width: min(520px, 70vw);
  }

  @media (max-width: 768px) {
    &[open] pre {
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }
  }
`;

const TableCard = styled.div`
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
  box-shadow: none;

  @media (max-width: 768px) {
    overflow: hidden;
  }
`;

const ReportSections = styled.div`
  display: grid;
  gap: var(--space-5);
`;

const SectionHeading = styled.h2`
  margin: 0;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-300);
`;

const ReviewThumbnail = styled.img`
  width: 64px;
  height: 64px;
  display: block;
  margin-bottom: var(--space-2);
  border-radius: 6px;
  object-fit: cover;
`;

const PlaceResults = styled.div`
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

  @media (max-width: 640px) {
    justify-content: flex-start;
  }
`;

const PlaceSummaryBadge = styled.span<{
  $tone: "brand" | "pending" | "success" | "neutral";
}>`
  min-height: var(--space-7);
  display: inline-flex;
  align-items: center;
  padding: 0 var(--space-3);
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "brand"
      ? "var(--color-brand-100)"
      : $tone === "success"
        ? "var(--color-secondary-200)"
        : $tone === "pending"
          ? "color-mix(in srgb, var(--color-warning) 9%, var(--color-white))"
          : "var(--color-neutral-200)"};
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 700;
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

const Table = styled.table`
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-size: var(--font-size-100);
  font-variant-numeric: tabular-nums;

  th,
  td {
    padding: 12px var(--space-4);
    border-bottom: 1px solid var(--color-border);
    text-align: left;
    vertical-align: middle;
  }

  th {
    background: var(--color-neutral-200);
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 700;
  }

  tr:last-of-type td {
    border-bottom: 0;
  }

  tbody tr {
    transition: background-color 160ms ease;
  }

  tbody tr:hover {
    background: var(--color-brand-100);
  }

  @media (max-width: 768px) {
    min-width: 0;
    display: block;

    thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    tbody {
      display: grid;
      gap: 0;
    }

    tr {
      display: grid;
      gap: 0;
      overflow: hidden;
      border-bottom: 1px solid var(--color-border);
      border-radius: 0;
      background: var(--color-white);
    }

    tr:last-child {
      border-bottom: 0;
    }

    td {
      display: grid;
      grid-template-columns: minmax(76px, 30%) minmax(0, 1fr);
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--color-neutral-300);
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

      > * {
        grid-column: 2;
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
  border-radius: 6px;
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

const TableActions = styled.div`
  min-width: 520px;
  display: grid;
  grid-template-columns: 128px minmax(160px, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);

  select,
  button {
    min-height: 36px;
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    min-width: 0;
    display: grid;
    grid-template-columns: 1fr;

    > * {
      width: 100%;
    }
  }
`;

const ReportNoteInput = styled.input`
  min-width: 0;
  min-height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  outline: 0;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-100);

  &:focus {
    border-color: var(--color-brand-800);
    box-shadow: 0 0 0 2px var(--color-brand-200);
  }
`;

const CompactActionButton = styled(SearchButton)`
  min-height: 36px;
  padding: 0 var(--space-3);
`;

const InlineActionGroup = styled.div`
  display: inline-grid;
  grid-template-columns: minmax(112px, 1fr) auto;
  align-items: center;
  gap: var(--space-2);

  select,
  button {
    min-height: 36px;
  }

  @media (max-width: 768px) {
    width: 100%;

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
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
`;

const SettingCard = styled.article`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 0.7fr);
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-4);
  border: 0;
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;
  background: var(--color-white);
  box-shadow: none;

  &:last-child {
    border-bottom: 0;
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
  background: var(--color-brand-800);
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

  @media (max-width: 1024px) {
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

  @media (max-width: 1024px) {
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
  max-height: min(86dvh, 720px);
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: var(--space-4);
  padding:
    var(--space-3)
    max(var(--space-5), env(safe-area-inset-right))
    max(var(--space-6), env(safe-area-inset-bottom))
    max(var(--space-5), env(safe-area-inset-left));
  border-radius: 12px 12px 0 0;
  background: var(--color-white);
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

const MobileMenuList = styled.div`
  display: grid;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--color-border);
  border-radius: 8px;
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
