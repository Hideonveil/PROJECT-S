import styles from "./ops.module.css";
import { rankLabel, type ManualCandidate, type SeriesPoint } from "./model";

export function TrendChart({ data }: { data: SeriesPoint[] }) {
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

export function ManualMatchPanel({
  candidates,
  selectedIds,
  reason,
  loading,
  matching,
  message,
  error,
  onReasonChange,
  onSelect,
  onRefresh,
  onMatch,
}: {
  candidates: ManualCandidate[];
  selectedIds: string[];
  reason: string;
  loading: boolean;
  matching: boolean;
  message: string;
  error: string;
  onReasonChange: (value: string) => void;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onMatch: () => void;
}) {
  const selected = selectedIds.map((id) => candidates.find((candidate) => candidate.userId === id)).filter(Boolean) as ManualCandidate[];
  return (
    <section className={styles.manualPage} aria-labelledby="manual-match-title">
      <div className={styles.manualIntro}>
        <div>
          <p className={styles.eyebrow}>OPERATIONS / HUMAN HANDOFF</p>
          <h2 id="manual-match-title">把两条等待线，交到一起。</h2>
          <p>这里只显示仍在有效匹配池、尚未被锁定的玩家。选择两人后，系统会创建候选并让双方在各自页面确认。</p>
        </div>
        <div className={styles.manualSafety}><span>安全边界</span><b>不代替用户确认</b><small>硬性游戏与模式规则仍然生效</small></div>
      </div>

      {(message || error) && <p className={error ? styles.manualError : styles.manualSuccess} role="status">{error || message}</p>}

      <div className={styles.manualActionBar}>
        <div className={styles.manualSelection} aria-live="polite">
          {[0, 1].map((index) => {
            const player = selected[index];
            return <div className={`${styles.manualSlot} ${player ? styles.manualSlotFilled : ""}`} key={index}>
              <span>{String.fromCharCode(65 + index)}</span>
              <b>{player?.nickname || "等待选择"}</b>
              <small>{player ? `${player.mode === "ranked" ? "天梯" : "休闲"} · ${player.gameId}` : "从下方候选中选择"}</small>
            </div>;
          })}
        </div>
        <div className={styles.manualControls}>
          <label htmlFor="manual-match-reason">操作备注<input id="manual-match-reason" value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="例如：算法异常，人工撮合" maxLength={200} /></label>
          <div><button type="button" className={styles.refresh} onClick={onRefresh} disabled={loading}>{loading ? "读取中" : "刷新候选"}</button><button type="button" className={styles.manualMatchButton} onClick={onMatch} disabled={selectedIds.length !== 2 || matching}>{matching ? "正在锁定…" : "锁定这两位"}<span>↗</span></button></div>
        </div>
      </div>

      <div className={styles.manualListHead}><div><span>LIVE POOL / SEARCHING</span><h3>当前等待中的玩家</h3></div><small>{candidates.length} 位候选 · 每 15 秒自动刷新</small></div>
      <div className={styles.manualCandidateGrid}>
        {loading && !candidates.length ? <div className={styles.manualEmpty}>正在读取匹配池…</div> : candidates.length ? candidates.map((candidate) => {
          const index = selectedIds.indexOf(candidate.userId);
          const role = index === 0 ? "A" : index === 1 ? "B" : "";
          return <button type="button" key={candidate.userId} className={`${styles.manualCandidate} ${index >= 0 ? styles.manualCandidateSelected : ""}`} aria-pressed={index >= 0} onClick={() => onSelect(candidate.userId)}>
            <span className={styles.manualAvatar}>{(candidate.nickname || "玩").slice(0, 1)}</span>
            <span className={styles.manualCandidateBody}><b>{candidate.nickname}</b><small>{candidate.mode === "ranked" ? "天梯" : "休闲"} · {candidate.gameId}{candidate.rankCode ? ` · ${rankLabel(candidate.rankCode)}` : ""}</small><i>{candidate.microphonePreference === "on" ? "开麦" : candidate.microphonePreference === "off" ? "不开麦" : "麦克风无所谓"}</i></span>
            <span className={styles.manualCandidateMark}>{role || "选择"}</span>
          </button>;
        }) : <div className={styles.manualEmpty}>当前没有可人工撮合的等待玩家。系统会在他们重新进入匹配池后显示。</div>}
      </div>
    </section>
  );
}

