import { useState } from "react";
import type { Alarm } from "../types";
import { FILTERS, carriedAlarms, handoverBlockers, watchName } from "../rules";
import { store, useWatchState } from "../store";

function HandoverSummaryItem({ alarm }: { alarm: Alarm }) {
  const blocked = alarm.level === "critical";
  return (
    <li className={blocked ? "blocker" : undefined}>
      <span className="dot" data-level={alarm.level} />
      <span>
        {alarm.device} · {alarm.param}
      </span>
      <em>{blocked ? "严重 · 禁止交接" : "一般"}</em>
    </li>
  );
}

export default function WatchPanel() {
  const watchIndex = useWatchState((s) => s.watchIndex);
  const filter = useWatchState((s) => s.filter);
  const carried = useWatchState(carriedAlarms);
  const blockers = useWatchState(handoverBlockers);
  const [remark, setRemark] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleHandover = () => {
    const result = store.handover(remark);
    if (result.ok) {
      setError(null);
      setRemark("");
      setDone(true);
      window.setTimeout(() => setDone(false), 2500);
    } else {
      setError("本班仍有未恢复的严重报警，不得完成交接班");
    }
  };

  return (
    <div className="sidebar">
      <section className="panel watch-card">
        <p className="eyebrow">当前值班班次</p>
        <h2>
          {watchName(watchIndex)} <small>第 {watchIndex + 1} 班</small>
        </h2>
        <p className="watch-hint">确认只关闭本班提示；进入下一班后未恢复报警自动重新提示。</p>

        <div className="handover">
          <p className="eyebrow">交接班摘要（设备与参数）</p>
          {carried.length === 0 ? (
            <p className="empty-inline">无未恢复报警，可正常交接</p>
          ) : (
            <ul className="summary-list">
              {carried.map((a) => (
                <HandoverSummaryItem key={a.id} alarm={a} />
              ))}
            </ul>
          )}

          <label className="remark">
            <span>交接备注</span>
            <input
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="可选：本班运行与遗留事项"
            />
          </label>

          <button
            type="button"
            className="primary wide"
            onClick={handleHandover}
            disabled={blockers.length > 0}
            title={blockers.length > 0 ? "存在未恢复的严重报警" : "完成交接班并进入下一班"}
          >
            完成交接班
          </button>

          {blockers.length > 0 && (
            <p className="form-error">
              未恢复严重报警 {blockers.length} 条，须补处理说明与复测值消除后方可交接
            </p>
          )}
          {error && <p className="form-error">{error}</p>}
          {done && <p className="form-ok">交接班完成，已进入下一班</p>}
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">设备筛选</p>
        <h2>看板与时间线联动</h2>
        <div className="chips">
          {FILTERS.map((name) => (
            <button
              key={name}
              type="button"
              className={filter === name ? "chip active" : "chip"}
              onClick={() => store.setFilter(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
