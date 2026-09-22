import { useMemo } from "react";
import { watchInfo } from "../rules/shifts";
import { handoverBlockers, openAlarms } from "../rules/alarms";
import { levelLabel } from "../lib/format";
import { dispatch, useAppState } from "../state/store";

export default function HandoverPanel() {
  const { alarms, baseDate, watchSeq, engineer } = useAppState();
  const current = watchInfo(baseDate, watchSeq);
  const next = watchInfo(baseDate, watchSeq + 1);

  const blockers = useMemo(() => handoverBlockers(alarms), [alarms]);
  const carried = useMemo(() => openAlarms(alarms), [alarms]);
  const canHandover = blockers.length === 0;

  return (
    <section className="panel handover-panel">
      <div className="heading">
        <div>
          <p>交接班摘要</p>
          <h2>本班交接</h2>
        </div>
      </div>

      <div className="watch-flow">
        <div className="watch-box">
          <small>当前班次</small>
          <strong>{current.label}</strong>
          <span>{current.date}</span>
        </div>
        <span className="watch-arrow">→</span>
        <div className="watch-box">
          <small>下一班次</small>
          <strong>{next.label}</strong>
          <span>{next.date}</span>
        </div>
      </div>

      <div className="handover-summary">
        <h3>未关闭报警移交清单（{carried.length}）</h3>
        {carried.length === 0 ? (
          <p className="empty-state tight">无遗留报警，可以交接。</p>
        ) : (
          <ul className="carry-list">
            {carried.map((alarm) => (
              <li
                key={alarm.id}
                className={alarm.level === "severe" ? "is-blocked" : undefined}
              >
                <span className="device-tag">{alarm.device}</span>
                <strong>{alarm.param}</strong>
                <span className={`badge badge-${alarm.level}`}>{levelLabel(alarm.level)}</span>
                <em>最近读数 {alarm.lastValue} {alarm.unit}</em>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!canHandover && (
        <div className="block-banner">
          <strong>禁止交接：</strong>本班存在 {blockers.length} 条未恢复的严重报警，
          请按设备与参数补处理说明及复测值后闭环：
          <ul>
            {blockers.map((alarm) => (
              <li key={alarm.id}>
                {alarm.device} · {alarm.param}（最近 {alarm.lastValue} {alarm.unit}）
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        className="primary handover-btn"
        disabled={!canHandover}
        onClick={() => dispatch({ type: "handover", at: Date.now() })}
      >
        {canHandover ? `完成交接班，移交 ${next.label}` : "存在严重报警，无法交接班"}
      </button>
      <p className="panel-hint">
        交接后未关闭的一般报警由下一班继续跟踪：下一班采样仍越限将自动重新激活并升级为严重。当前值班轮机员：
        {engineer || "未署名"}
      </p>
    </section>
  );
}
