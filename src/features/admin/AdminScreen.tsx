"use client";

import styled from "@emotion/styled";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
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
  AdminPlacesResponse,
  AdminReportItem,
  AdminReportsResponse,
  AdminSettingItem,
  AdminSettingsResponse,
  AdminUserItem,
  AdminUsersResponse,
} from "@/shared/api/admin";

type AdminTab =
  | "overview"
  | "logs"
  | "places"
  | "reports"
  | "inquiries"
  | "users"
  | "settings";

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "대시보드" },
  { id: "logs", label: "로그" },
  { id: "places", label: "장소" },
  { id: "reports", label: "신고" },
  { id: "inquiries", label: "1:1 문의" },
  { id: "users", label: "권한" },
  { id: "settings", label: "설정" },
];

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AdminScreen() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [logs, setLogs] = useState<AdminLogItem[]>([]);
  const [places, setPlaces] = useState<AdminPlaceItem[]>([]);
  const [reports, setReports] = useState<AdminReportItem[]>([]);
  const [inquiries, setInquiries] = useState<AdminInquiryItem[]>([]);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [settings, setSettings] = useState<AdminSettingItem[]>([]);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<number | null>(null);

  const loadOverview = useCallback(async () => {
    const response =
      await fetchAdminJson<AdminOverviewResponse>("overview");
    setOverview(response.overview);
  }, []);

  const loadTab = useCallback(async () => {
    const searchParams = new URLSearchParams();

    if (appliedQuery) searchParams.set("q", appliedQuery);

    if (tab === "logs" && filter) searchParams.set("level", filter);
    if (tab === "places" && filter) {
      searchParams.set("reviewStatus", filter);
    }
    if (tab === "reports" && filter) searchParams.set("status", filter);
    if (tab === "inquiries" && filter) searchParams.set("status", filter);

    const suffix = searchParams.size ? `?${searchParams}` : "";

    if (tab === "logs") {
      const response = await fetchAdminJson<AdminLogsResponse>(
        `logs${suffix}`,
      );
      setLogs(response.logs);
    } else if (tab === "places") {
      const response = await fetchAdminJson<AdminPlacesResponse>(
        `places${suffix}`,
      );
      setPlaces(response.places);
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
  }, [appliedQuery, filter, tab]);

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

  const mutate = async (
    resource: "inquiries" | "places" | "reports" | "settings" | "users",
    id: string,
    init: RequestInit,
  ) => {
    setMutatingId(id);
    setError(null);

    try {
      await fetchAdminJson(resource, init);
      await Promise.all([loadOverview(), loadTab()]);
    } catch (mutationError) {
      setError(toErrorMessage(mutationError));
    } finally {
      setMutatingId(null);
    }
  };

  const filterOptions = useMemo(() => getFilterOptions(tab), [tab]);

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
    <AdminLayout>
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
              onClick={() => {
                setTab(item.id);
                setQuery("");
                setAppliedQuery("");
                setFilter("");
              }}
            >
              {item.label}
            </NavButton>
          ))}
        </Navigation>
        <HomeLink href="/">서비스로 돌아가기</HomeLink>
      </Sidebar>

      <Main>
        <Header>
          <div>
            <Eyebrow>ADMINISTRATION</Eyebrow>
            <h1>{tabs.find((item) => item.id === tab)?.label}</h1>
          </div>
          <RefreshButton type="button" onClick={() => void refresh()}>
            새로고침
          </RefreshButton>
        </Header>

        {tab !== "overview" && tab !== "settings" && (
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
        )}

        {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
        {loading ? (
          <StatePanel>관리 데이터를 불러오고 있어요.</StatePanel>
        ) : tab === "overview" ? (
          <OverviewPanel overview={overview} />
        ) : tab === "logs" ? (
          <LogsPanel logs={logs} />
        ) : tab === "places" ? (
          <PlacesPanel
            places={places}
            mutatingId={mutatingId}
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
    </AdminLayout>
  );
}

function OverviewPanel({ overview }: { overview: AdminOverview | null }) {
  const cards = [
    ["전체 사용자", overview?.users ?? 0],
    ["관리자", overview?.admins ?? 0],
    ["노출 중인 장소", overview?.activePlaces ?? 0],
    ["검토 대기 장소", overview?.pendingPlaces ?? 0],
    ["처리할 신고", overview?.pendingReports ?? 0],
    ["처리할 문의", overview?.pendingInquiries ?? 0],
    ["오늘 로그", overview?.logsToday ?? 0],
  ];

  return (
    <MetricGrid>
      {cards.map(([label, value]) => (
        <MetricCard key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </MetricCard>
      ))}
    </MetricGrid>
  );
}

function LogsPanel({ logs }: { logs: AdminLogItem[] }) {
  if (logs.length === 0) return <StatePanel>조건에 맞는 로그가 없습니다.</StatePanel>;

  return (
    <CardList>
      {logs.map((log) => (
        <DataCard key={log.id}>
          <CardTop>
            <StatusBadge $tone={log.level}>{log.level}</StatusBadge>
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

function PlacesPanel({
  places,
  mutatingId,
  onChange,
}: {
  places: AdminPlaceItem[];
  mutatingId: string | null;
  onChange: (
    placeId: string,
    update: { reviewStatus?: string; isActive?: boolean },
  ) => void;
}) {
  if (places.length === 0) return <StatePanel>조건에 맞는 장소가 없습니다.</StatePanel>;

  return (
    <TableCard>
      <Table>
        <thead>
          <tr>
            <th>장소</th>
            <th>출처</th>
            <th>피로도</th>
            <th>검수 상태</th>
            <th>노출</th>
          </tr>
        </thead>
        <tbody>
          {places.map((place) => (
            <tr key={place.id}>
              <td>
                <strong>{place.name}</strong>
                <Small>{place.id}</Small>
              </td>
              <td>
                {place.source}
                {place.sourceId ? <Small>{place.sourceId}</Small> : null}
              </td>
              <td>
                {place.fatigue} · {place.movementLevel}
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
                  {place.isActive ? "노출" : "숨김"}
                </ToggleLabel>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableCard>
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
            <StatusBadge $tone={report.status}>{report.status}</StatusBadge>
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
          onSave={onSave}
        />
      ))}
    </CardList>
  );
}

function InquiryEditor({
  inquiry,
  saving,
  onSave,
}: {
  inquiry: AdminInquiryItem;
  saving: boolean;
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
      <CardTop>
        <StatusBadge $tone={inquiry.status}>
          {inquiry.status}
        </StatusBadge>
        <Time>{formatDate(inquiry.createdAt)}</Time>
      </CardTop>
      <h2>{inquiry.subject}</h2>
      <Meta>
        유형 {inquiry.category} ·{" "}
        {inquiry.requesterEmail ??
          inquiry.requesterUserId ??
          "삭제된 사용자"}
      </Meta>
      <Description>{inquiry.message}</Description>
      <ResponseArea>
        <InlineSelect
          value={status}
          disabled={saving}
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
          placeholder="처리 내용이나 답변 메모를 남겨주세요."
          onChange={(event) => setAdminResponse(event.target.value)}
        />
        <SearchButton
          type="button"
          disabled={saving || !changed}
          onClick={() =>
            onSave(inquiry.id, status, adminResponse.trim())
          }
        >
          {saving ? "저장 중..." : "처리 내용 저장"}
        </SearchButton>
      </ResponseArea>
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

function getSearchPlaceholder(tab: AdminTab) {
  if (tab === "logs") return "메시지, 작업, 사용자 ID 검색";
  if (tab === "places") return "장소명, 장소 ID, 공공데이터 ID 검색";
  if (tab === "reports") return "제목, 신고 내용, 사용자 ID 검색";
  if (tab === "inquiries") {
    return "제목, 문의 내용, 이메일 또는 사용자 ID 검색";
  }
  return "이메일 또는 사용자 ID 검색";
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function toErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "관리자 요청을 처리하지 못했습니다.";
}

const AdminLayout = styled.div`
  min-height: 100dvh;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  background: var(--color-app-background);
  color: var(--color-text);

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
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
  background: var(--color-surface);

  @media (max-width: 768px) {
    position: static;
    height: auto;
    gap: var(--space-4);
    padding: var(--space-5);
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
`;

const NavButton = styled.button<{ $active: boolean }>`
  min-height: var(--space-11);
  padding: 0 var(--space-4);
  border: 0;
  border-radius: var(--space-3);
  background: ${({ $active }) =>
    $active ? "var(--color-secondary-200)" : "transparent"};
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-200);
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  text-align: left;
  cursor: pointer;
`;

const HomeLink = styled(Link)`
  margin-top: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  text-decoration: none;
`;

const Main = styled.main`
  width: min(100%, 1440px);
  display: grid;
  align-content: start;
  gap: var(--space-6);
  padding: var(--space-8);
  margin: 0 auto;

  @media (max-width: 768px) {
    padding: var(--space-5);
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
`;

const Eyebrow = styled.span`
  color: var(--color-brand-800);
  font-size: var(--font-size-100);
  font-weight: 700;
  letter-spacing: 0.08em;
`;

const RefreshButton = styled.button`
  min-height: var(--space-10);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
`;

const Toolbar = styled.form`
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 180px auto;
  gap: var(--space-3);

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const SearchInput = styled.input`
  width: 100%;
  min-height: var(--space-11);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--space-3);
  outline: 0;
  background: var(--color-surface);
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
  background: var(--color-surface);
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

const StatePanel = styled.div`
  display: grid;
  min-height: 240px;
  place-items: center;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--space-5);
  background: var(--color-surface);
  color: var(--color-text-muted);
`;

const MetricGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
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

  h2 {
    font-size: var(--font-size-300);
    line-height: var(--line-height-subtitle);
  }

  summary {
    color: var(--color-text-muted);
    cursor: pointer;
  }
`;

const CardTop = styled.div`
  display: flex;
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
    $tone === "error" || $tone === "pending"
      ? "var(--color-secondary-200)"
      : $tone === "warning" || $tone === "reviewing"
        ? "var(--color-brand-200)"
        : "var(--color-neutral-300)"};
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const Time = styled.time`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const Meta = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const Description = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
  line-height: var(--line-height-body);
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
  border: 1px solid var(--color-border);
  border-radius: var(--space-4);
  background: var(--color-surface);
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
    background: var(--color-neutral-200);
    color: var(--color-text-muted);
    font-weight: 600;
  }

  tr:last-of-type td {
    border-bottom: 0;
  }
`;

const Small = styled.small`
  display: block;
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: 11px;
`;

const InlineSelect = styled.select`
  min-height: var(--space-9);
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--space-2);
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
`;

const ToggleLabel = styled.label`
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

const CardActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding-top: var(--space-2);
`;

const ResponseArea = styled.div`
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--space-3);
  padding-top: var(--space-2);

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
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
  min-height: var(--space-9);
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
  border: 1px solid var(--color-border);
  border-radius: var(--space-4);
  background: var(--color-surface);

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
`;

const AccessPage = styled.main`
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--space-6);
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
