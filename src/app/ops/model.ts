export type Snapshot = {
  generatedAt?: string;
  profilesCreated?: number;
  searchesStarted?: number;
  candidatesPresented?: number;
  matchesConfirmed?: number;
  sessionsCompleted?: number;
  ratingsSubmitted?: number;
  friendshipsAccepted?: number;
  feedbackSubmitted?: number;
  clientErrors?: number;
  serverErrors?: number;
};

export type SeriesPoint = {
  date: string;
  profilesCreated: number;
  searchesStarted: number;
  matchesConfirmed: number;
  sessionsCompleted: number;
  errors: number;
};

export type ErrorItem = {
  event_name: "client_error" | "server_error";
  request_id?: string | null;
  properties?: { code?: string; errorName?: string; fallback?: string };
  occurred_at: string;
};

export type FeedbackItem = {
  id: string;
  username?: string | null;
  feedback_type: string;
  content: string;
  contact_email?: string | null;
  created_at: string;
};

export type DashboardData = {
  days: number;
  metricsSince?: string;
  baselineResetAt?: string | null;
  metrics: Snapshot;
  series: SeriesPoint[];
  recentErrors: ErrorItem[];
  recentFeedback: FeedbackItem[];
};

export type Health = {
  checkedAt?: string;
  databaseLatencyMs?: number;
  version?: string;
  online?: number;
  matching?: number;
  playing?: number;
  users?: number;
};

export type ManualCandidate = {
  userId: string;
  ticketId: string;
  nickname: string;
  handle?: string;
  online?: boolean;
  gameId: string;
  mode: "ranked" | "casual";
  rankCode?: string | null;
  desiredRoles?: number[];
  microphonePreference?: string;
  searchStartedAt?: string;
  expiresAt?: string;
};

export const periods = [7, 14, 30, 90];

const rankLabels: Record<string, string> = {
  initiate: "新人（砖石）",
  seeker: "行者（岩砾）",
  alchemist: "侍从（镔铁）",
  arcanist: "近卫（青铜）",
  ritualist: "秘士（白银）",
  emissary: "侍祭（黄金）",
  archon: "蜜使（铂金）",
  oracle: "神谕者（钻石）",
  phantom: "幽虚影",
  ascendant: "凌世君",
  eternus: "不朽之星",
};

export const rankLabel = (value?: string | null) => value ? rankLabels[value] || value : "";
export const number = (value: number | undefined) => new Intl.NumberFormat("zh-CN").format(value || 0);
export const percent = (value: number, base: number) => base > 0 ? `${Math.round((value / base) * 100)}%` : "—";
export const dateInputValue = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};
export const time = (value?: string) => value
  ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "—";
