"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./ops.module.css";

type Snapshot = {
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

type SeriesPoint = {
  date: string;
  profilesCreated: number;
  searchesStarted: number;
  matchesConfirmed: number;
  sessionsCompleted: number;
  errors: number;
};

type ErrorItem = {
  event_name: "client_error" | "server_error";
  request_id?: string | null;
  properties?: { code?: string; errorName?: string; fallback?: string };
  occurred_at: string;
};

type DashboardData = {
  days: number;
  metrics: Snapshot;
  series: SeriesPoint[];
  recentErrors: ErrorItem[];
};

type Health = {
  checkedAt?: string;
  databaseLatencyMs?: number;
  version?: string;
  online?: number;
  matching?: number;
  playing?: number;
  users?: number;
};

const periods = [7, 14, 30, 90];
const number = (value: number | undefined) => new Intl.NumberFormat("zh-CN").format(value || 0);
const percent = (value: number, base: number) => base > 0 ? `${Math.round((value / base) * 100)}%` : "—";
const time = (value?: string) => value
  ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "—";

function TrendChart({ data }: { data: SeriesPoint[] }) {
  const width = 760;
  const height = 230;
  const pad = 26;
  const max = Math.max(1, ...data.flatMap((point) => [point.searchesStarted, point.matchesConfirmed, point.sessionsCompleted]));
  const points = (key: "searchesStarted" | "matchesConfirmed" | "sessionsCompleted") => data.map((point, index) => {
    const x = data.length <= 1 ? width / 2 : pad + (index / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - (point[key] / max) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className={styles.chartWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="摇人、匹配成功和完成游玩趋势">
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line key={ratio} x1={pad} x2={width - pad} y1={height * ratio} y2={height * ratio} className={styles.gridLine} />
        ))}
        <polyline points={points("searchesStarted")} className={`${styles.trendLine} ${styles.searchLine}`} />
        <polyline points={points("matchesConfirmed")} className={`${styles.trendLine} ${styles.matchLine}`} />
        <polyline points={points("sessionsCompleted")} className={`${styles.trendLine} ${styles.completeLine}`} />
      </svg>
      <div className={styles.chartDates}>
        <span>{data[0]?.date.slice(5) || "—"}</span>
        <span>{data[Math.floor(data.length / 2)]?.date.slice(5) || "—"}</span>
        <span>{data.at(-1)?.date.slice(5) || "—"}</span>
      </div>
    </div>
  );
}

export default function OpsPage() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const load = useCallback(async (range = days) => {
    setLoading(true);
    try {
      const [metricsResponse, healthResponse] = await Promise.all([
        fetch(`/api/ops/metrics?days=${range}`, { cache: "no-store" }),
        fetch("/api/health", { cache: "no-store" }),
      ]);
      if (metricsResponse.status === 401) {
        setLocked(true);
        setData(null);
        return;
      }
      if (!metricsResponse.ok) throw new Error("运营数据暂时无法读取");
      setData(await metricsResponse.json());
      if (healthResponse.ok) setHealth(await healthResponse.json());
      setLocked(false);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(days); }, [days, load]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoginError("");
    setLoading(true);
    const response = await fetch("/api/ops/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setLoginError(body?.error?.message || "运营密码不正确");
      setLoading(false);
      return;
    }
    setPassword("");
    await load(days);
  }

  async function logout() {
    await fetch("/api/ops/session", { method: "DELETE" });
    setData(null);
    setLocked(true);
  }

  const funnel = useMemo(() => {
    const m = data?.metrics || {};
    return [
      { label: "开始摇人", value: m.searchesStarted || 0 },
      { label: "看到候选", value: m.candidatesPresented || 0 },
      { label: "确认匹配", value: m.matchesConfirmed || 0 },
      { label: "完成游玩", value: m.sessionsCompleted || 0 },
      { label: "留下评价", value: m.ratingsSubmitted || 0 },
    ];
  }, [data]);

  if (locked) {
    return (
      <main className={styles.lockPage}>
        <div className={styles.lockRail} aria-hidden="true"><span>JIYUAN / OPS / PRIVATE /</span></div>
        <form className={styles.lockCard} onSubmit={login}>
          <img src="/assets/jiyuan-logo.png" alt="机缘" className={styles.lockLogo} />
          <p className={styles.eyebrow}>PRIVATE OPERATIONS</p>
          <h1>看清匹配机器<br />现在怎么转。</h1>
          <label htmlFor="ops-password">运营密码</label>
          <div className={styles.passwordRow}>
            <input id="ops-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" autoFocus />
            <button type="submit" disabled={loading}>{loading ? "验证中" : "进入"}<span>↗</span></button>
          </div>
          {loginError && <p className={styles.loginError}>{loginError}</p>}
          <p className={styles.lockHint}>这个页面不会出现在公开导航里。</p>
        </form>
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.rail}>
        <a href="/index.html#/hero" aria-label="返回机缘首页"><img src="/assets/jiyuan-logo.png" alt="" /></a>
        <div className={styles.railWord}>OPS</div>
        <button type="button" onClick={logout}>退出</button>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>机缘 · 匹配运营台</p>
            <h1>匹配机器，正在怎么转</h1>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.periods} aria-label="统计时间范围">
              {periods.map((period) => <button key={period} className={days === period ? styles.activePeriod : ""} onClick={() => setDays(period)}>{period}天</button>)}
            </div>
            <button className={styles.refresh} onClick={() => void load(days)} disabled={loading}>{loading ? "读取中" : "刷新数据"}</button>
          </div>
        </header>

        <section className={styles.liveBand}>
          <div className={styles.livePrimary}>
            <span className={styles.liveDot} />
            <p>此刻正在摇人</p>
            <strong>{number(health?.matching)}</strong>
            <small>人</small>
          </div>
          <div className={styles.liveStats}>
            <div><span>在线</span><b>{number(health?.online)}</b></div>
            <div><span>游玩中</span><b>{number(health?.playing)}</b></div>
            <div><span>累计玩家</span><b>{number(health?.users)}</b></div>
          </div>
          <div className={styles.systemPulse} aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
        </section>

        <section className={styles.metricGrid} aria-label="核心指标">
          {[
            ["新身份", data?.metrics.profilesCreated, "进入平台的人"],
            ["开始摇人", data?.metrics.searchesStarted, "发起匹配次数"],
            ["匹配成功", data?.metrics.matchesConfirmed, percent(data?.metrics.matchesConfirmed || 0, data?.metrics.searchesStarted || 0)],
            ["完成游玩", data?.metrics.sessionsCompleted, percent(data?.metrics.sessionsCompleted || 0, data?.metrics.matchesConfirmed || 0)],
            ["成为好友", data?.metrics.friendshipsAccepted, "关系沉淀"],
            ["系统错误", (data?.metrics.clientErrors || 0) + (data?.metrics.serverErrors || 0), "前端 + 服务端"],
          ].map(([label, value, note]) => (
            <article className={styles.metricCard} key={String(label)}>
              <span>{label}</span><strong>{number(Number(value))}</strong><small>{note}</small>
            </article>
          ))}
        </section>

        <section className={styles.twoColumn}>
          <article className={styles.panel}>
            <div className={styles.panelTitle}><div><span>完整闭环</span><h2>从摇人到真正玩完</h2></div><small>按所选周期累计</small></div>
            <div className={styles.funnel}>
              {funnel.map((item, index) => {
                const max = Math.max(1, funnel[0].value);
                return (
                  <div className={styles.funnelRow} key={item.label}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><div className={styles.funnelLabel}><b>{item.label}</b><strong>{number(item.value)}</strong></div><i style={{ width: `${Math.max(3, item.value / max * 100)}%` }} /></div>
                    <small>{index === 0 ? "起点" : percent(item.value, funnel[index - 1].value)}</small>
                  </div>
                );
              })}
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelTitle}><div><span>每日趋势</span><h2>有多少人走到了下一步</h2></div></div>
            <TrendChart data={data?.series || []} />
            <div className={styles.legend}><span className={styles.searchLegend}>开始摇人</span><span className={styles.matchLegend}>匹配成功</span><span className={styles.completeLegend}>完成游玩</span></div>
          </article>
        </section>

        <section className={styles.bottomGrid}>
          <article className={styles.panel}>
            <div className={styles.panelTitle}><div><span>异常雷达</span><h2>最近错误</h2></div><small>{(data?.metrics.clientErrors || 0) + (data?.metrics.serverErrors || 0)} 条 / {days}天</small></div>
            <div className={styles.errorList}>
              {data?.recentErrors?.length ? data.recentErrors.map((item, index) => (
                <div className={styles.errorRow} key={`${item.request_id}-${index}`}>
                  <span className={item.event_name === "server_error" ? styles.serverBadge : styles.clientBadge}>{item.event_name === "server_error" ? "服务端" : "浏览器"}</span>
                  <div><b>{item.properties?.code || item.properties?.errorName || "未分类错误"}</b><small>{item.request_id || "无 requestId"}</small></div>
                  <time>{time(item.occurred_at)}</time>
                </div>
              )) : <div className={styles.empty}>这段时间没有记录到错误。</div>}
            </div>
          </article>

          <article className={`${styles.panel} ${styles.systemPanel}`}>
            <div className={styles.panelTitle}><div><span>运行状态</span><h2>正式环境</h2></div><b className={styles.ready}>READY</b></div>
            <dl>
              <div><dt>线上版本</dt><dd>{health?.version || "—"}</dd></div>
              <div><dt>数据库响应</dt><dd>{health?.databaseLatencyMs ?? "—"} ms</dd></div>
              <div><dt>最后检查</dt><dd>{time(health?.checkedAt)}</dd></div>
              <div><dt>统计生成</dt><dd>{time(data?.metrics.generatedAt)}</dd></div>
            </dl>
            <a href="https://jiyuan.online" target="_blank" rel="noreferrer">打开正式网站 <span>↗</span></a>
          </article>
        </section>
      </main>
    </div>
  );
}
