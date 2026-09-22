import { useMemo } from "react";
import type { Alarm, HandoverRecord } from "../types";
import { formatDateTime, levelLabel } from "../lib/format";
import { useAppState } from "../state/store";

function ClosedAlarmRow({ alarm }: { alarm: Alarm }) {
  const recovered = alarm.status === "recovered";
  return (
    <article className="history-item">
      <div className="history-main">
        <div className="history-title">
          <span className="device-tag">{alarm.device}</span>
          <strong>{alarm.param}</strong>
          <span className={`badge badge-${alarm.level}`}>{levelLabel(alarm.level)}</span>
          <span className={`badge ${recovered ? "tone-ok-badge" : "tone-info-badge"}`}>
            {recovered ? "恢复消除" : "补录闭环"}
          </span>
        </div>
        <p className="history-line">
          {alarm.firstWatchId} 首次越限（{alarm.firstWatchId === alarm.activeWatchId
            ? "当班"
            : "跨班"}
          ，共 {alarm.sampleCount} 次越限采样）
        </p>
        {!recovered && (
          <p className="history-line">
            处理说明：{alarm.handlingNote}
            {typeof alarm.retestValue === "number" && (
              <>
                <span className="dot-sep">·</span>复测值 {alarm.retestValue} {alarm.unit}
              </>
            )}
          </p>
        )}
      </div>
      <time className="history-time">
        {formatDateTime(alarm.closedAt ?? alarm.lastAt)}
        <small>{alarm.closedWatchId}</small>
      </time>
    </article>
  );
}

function HandoverRow({ record }: { record: HandoverRecord }) {
  return (
    <article className="history-item">
      <div className="history-main">
        <div className="history-title">
          <span className="device-tag">交接班</span>
          <strong>
            {record.fromWatchId} → {record.toWatchId}
          </strong>
        </div>
        <p className="history-line">
          交班轮机员：{record.engineer}
          <span className="dot-sep">·</span>移交未关闭报警 {record.carried.length} 条
          {record.carried.length > 0 && (
            <span className="carry-summary">
              （{record.carried.map((item) => `${item.device}·${item.param}`).join("，")}）
            </span>
          )}
        </p>
      </div>
      <time className="history-time">
        {formatDateTime(record.at)}
        <small>已完成交接</small>
      </time>
    </article>
  );
}

/** 历史记录：闭环报警 + 交接班摘要，时间倒序，与设备筛选联动 */
export default function History() {
  const { alarms, handovers, deviceFilter } = useAppState();

  const rows = useMemo(() => {
    const closed = alarms
      .filter((alarm) => alarm.status === "recovered" || alarm.status === "closed")
      .filter((alarm) => deviceFilter === "all" || alarm.device === deviceFilter)
      .map((alarm) => ({ at: alarm.closedAt ?? alarm.lastAt, node: <ClosedAlarmRow key={`alarm-${alarm.id}`} alarm={alarm} /> }));
    const records = handovers
      .filter(
        (record) =>
          deviceFilter === "all" ||
          record.carried.some((item) => item.device === deviceFilter)
      )
      .map((record) => ({ at: record.at, node: <HandoverRow key={`handover-${record.id}`} record={record} /> }));
    return [...closed, ...records].sort((a, b) => b.at - a.at);
  }, [alarms, handovers, deviceFilter]);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>历史记录</p>
          <h2>闭环与交接班台账</h2>
        </div>
        <span className="count-pill">{rows.length} 条</span>
      </div>
      {rows.length === 0 ? (
        <p className="empty-state">暂无历史记录。</p>
      ) : (
        <div className="history-list">{rows.map((row) => row.node)}</div>
      )}
    </section>
  );
}
