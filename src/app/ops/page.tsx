"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./ops.module.css";
import { ManualMatchPanel, TrendChart } from "./components";
import {
  dateInputValue,
  number,
  percent,
  periods,
  time,
  type DashboardData,
  type Health,
  type ManualCandidate,
} from "./model";


export default function OpsPage() {
  const [view, setView] = useState<"dashboard" | "manual">("dashboard");
  const [days, setDays] = useState(14);
  const [data, setData] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [resettingMetrics, setResettingMetrics] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const [baselineDate, setBaselineDate] = useState(() => dateInputValue());
  const [manualCandidates, setManualCandidates] = useState<ManualCandidate[]>([]);
  const [manualSelectedIds, setManualSelectedIds] = useState<string[]>([]);
  const [manualReason, setManualReason] = useState("算法异常，人工撮合");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualMatching, setManualMatching] = useState(false);
  const [manualMessage, setManualMessage] = useState("");
  const [manualError, setManualError] = useState("");

  const load = useCallback(async (range: number, silent = false) => {
    if (!silent) setLoading(true);
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
      const metricsBody = await metricsResponse.json();
      setData(metricsBody);
      if (metricsBody.baselineResetAt) setBaselineDate(dateInputValue(metricsBody.baselineResetAt));
      if (healthResponse.ok) setHealth(await healthResponse.json());
      setLocked(false);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadManualCandidates = useCallback(async (silent = false) => {
    if (!silent) setManualLoading(true);
    try {
      const response = await fetch("/api/ops/manual-match", { cache: "no-store" });
      if (response.status === 401) {
        setLocked(true);
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "人工匹配候选暂时无法读取");
      setManualCandidates(Array.isArray(body.candidates) ? body.candidates : []);
      setManualSelectedIds((current) => current.filter((id) => body.candidates?.some((candidate: ManualCandidate) => candidate.userId === id)));
      setManualError("");
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "人工匹配候选暂时无法读取");
    } finally {
      if (!silent) setManualLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "manual" || locked) return;
    void loadManualCandidates();
    const refresh = window.setInterval(() => { void loadManualCandidates(true); }, 15_000);
    return () => window.clearInterval(refresh);
  }, [view, locked, loadManualCandidates]);

  useEffect(() => {
    void load(days);
    const refresh = window.setInterval(() => { void load(days, true); }, 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load(days, true);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [days, load]);

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

  async function resetMetrics() {
    if (!baselineDate) {
      setResetError("请选择统计起始日期");
      return;
    }
    if (!window.confirm(`将统计起点设置为 ${baselineDate}。该日期之前的数据会隐藏，但不会删除。继续吗？`)) return;
    setResettingMetrics(true);
    setResetMessage("");
    setResetError("");
    try {
      const response = await fetch("/api/ops/metrics/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricsSince: baselineDate }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "统计基线重置失败");
      setResetMessage(`统计已从 ${baselineDate} 重新开始，之前的数据未删除。`);
      await load(days);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : "统计基线重置失败");
    } finally {
      setResettingMetrics(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordSaving(true);
    setPasswordError("");
    setPasswordMessage("");
    try {
      const response = await fetch("/api/ops/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "密码修改失败");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("密码已更新，其他设备上的运营会话已经退出。");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "密码修改失败");
    } finally {
      setPasswordSaving(false);
    }
  }

  function selectManualCandidate(userId: string) {
    setManualMessage("");
    setManualError("");
    setManualSelectedIds((current) => {
      if (current.includes(userId)) return current.filter((id) => id !== userId);
      return current.length >= 2 ? [current[1], userId] : [...current, userId];
    });
  }

  async function createManualMatch() {
    if (manualSelectedIds.length !== 2 || manualMatching) return;
    const selected = manualSelectedIds.map((id) => manualCandidates.find((candidate) => candidate.userId === id)).filter(Boolean) as ManualCandidate[];
    if (!window.confirm(`将 ${selected[0]?.nickname || "玩家 A"} 与 ${selected[1]?.nickname || "玩家 B"} 锁定为同一位候选。双方仍需在自己的页面确认，继续吗？`)) return;
    setManualMatching(true);
    setManualMessage("");
    setManualError("");
    try {
      const response = await fetch("/api/ops/manual-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userA: manualSelectedIds[0], userB: manualSelectedIds[1], reason: manualReason }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "人工匹配失败，请刷新候选后重试");
      setManualMessage("候选已锁定。两位玩家会在各自页面看到确认卡片，确认后进入房间。");
      setManualSelectedIds([]);
      await loadManualCandidates(true);
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "人工匹配失败，请刷新候选后重试");
    } finally {
      setManualMatching(false);
    }
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
          <img src="/assets/jiyuan-logo-v5.png" alt="“机”缘" className={styles.lockLogo} />
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
        <a href="/index.html#/hero" aria-label="返回“机”缘首页"><img src="/assets/jiyuan-logo-v5.png" alt="" /></a>
        <nav className={styles.railNav} aria-label="运营页面">
          <button type="button" className={view === "dashboard" ? styles.railNavActive : ""} onClick={() => setView("dashboard")}>监控</button>
          <button type="button" className={view === "manual" ? styles.railNavActive : ""} onClick={() => setView("manual")}>人工匹配</button>
        </nav>
        <div className={styles.railWord}>OPS</div>
        <button type="button" onClick={logout}>退出</button>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{view === "manual" ? "“机”缘 · 人工匹配" : "“机”缘 · 匹配运营台"}</p>
            <h1>{view === "manual" ? "人工匹配界面" : "匹配机器，正在怎么转"}</h1>
          </div>
          {view === "manual" ? <div className={styles.headerActions}><div className={styles.refreshGroup}><button className={styles.refresh} onClick={() => void loadManualCandidates()} disabled={manualLoading}>{manualLoading ? "读取中" : "刷新候选"}</button><small>每 15 秒自动更新</small></div></div> : <div className={styles.headerActions}>
            <div className={styles.periods} aria-label="统计时间范围">
              {periods.map((period) => <button key={period} className={days === period ? styles.activePeriod : ""} onClick={() => setDays(period)}>{period}天</button>)}
            </div>
            <div className={styles.refreshGroup}>
              <button className={styles.refresh} onClick={() => void load(days)} disabled={loading}>{loading ? "读取中" : "刷新数据"}</button>
              <small>{data?.metricsSince ? `统计起点 ${time(data.metricsSince)}` : "每 30 秒自动更新"}</small>
            </div>
            <div className={styles.baselineGroup}>
              <label htmlFor="ops-baseline-date">统计起点</label>
              <input id="ops-baseline-date" type="date" value={baselineDate} onChange={(event) => setBaselineDate(event.target.value)} />
              <button type="button" className={styles.baselineButton} onClick={() => void resetMetrics()} disabled={resettingMetrics}>{resettingMetrics ? "应用中…" : "应用起点"}</button>
            </div>
          </div>}
        </header>

        {view === "manual" ? <ManualMatchPanel
          candidates={manualCandidates}
          selectedIds={manualSelectedIds}
          reason={manualReason}
          loading={manualLoading}
          matching={manualMatching}
          message={manualMessage}
          error={manualError}
          onReasonChange={setManualReason}
          onSelect={selectManualCandidate}
          onRefresh={() => void loadManualCandidates()}
          onMatch={() => void createManualMatch()}
        /> : <>
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

        {(resetMessage || resetError) && <p className={resetError ? styles.baselineError : styles.baselineSuccess}>{resetError || resetMessage}</p>}

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

        <section className={`${styles.panel} ${styles.feedbackPanel}`}>
          <div className={styles.panelTitle}>
            <div><span>用户来信</span><h2>联系我们收件箱</h2></div>
            <small>{data?.recentFeedback?.length || 0} 条 / {days}天 · 自动刷新</small>
          </div>
          <div className={styles.feedbackList}>
            {data?.recentFeedback?.length ? data.recentFeedback.map((item) => (
              <article className={styles.feedbackRow} key={item.id}>
                <div className={styles.feedbackMeta}>
                  <span className={styles.feedbackType}>{item.feedback_type === "bug" ? "发现问题" : item.feedback_type === "suggestion" ? "功能建议" : "其他"}</span>
                  <b>{item.username || "注册玩家"}</b>
                  <time>{time(item.created_at)}</time>
                </div>
                <p className={styles.feedbackContent}>{item.content}</p>
                <div className={styles.feedbackContext}>
                  {item.contact_email && <span>联系方式 <b>{item.contact_email}</b></span>}
                </div>
              </article>
            )) : <div className={styles.empty}>这段时间还没有用户提交问题。</div>}
          </div>
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
            <button
              type="button"
              className={styles.passwordToggle}
              aria-expanded={passwordFormOpen}
              onClick={() => {
                setPasswordFormOpen((open) => !open);
                setPasswordError("");
                setPasswordMessage("");
              }}
            >
              <span>修改运营密码</span><b>{passwordFormOpen ? "收起 −" : "打开 +"}</b>
            </button>
            {passwordFormOpen && (
              <form className={styles.changePassword} onSubmit={changePassword}>
                <label>当前密码<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
                <label>新密码<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={12} required /></label>
                <label>再次输入<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} required /></label>
                <button type="submit" disabled={passwordSaving}>{passwordSaving ? "正在保存…" : "确认修改"}</button>
                {passwordError && <p className={styles.passwordError}>{passwordError}</p>}
                {passwordMessage && <p className={styles.passwordSuccess}>{passwordMessage}</p>}
                <small>至少 12 位。修改后当前设备保持登录，其他设备需要使用新密码重新进入。</small>
              </form>
            )}
          </article>
        </section>
        </>}
      </main>
    </div>
  );
}
