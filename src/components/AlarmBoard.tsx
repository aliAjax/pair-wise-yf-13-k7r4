import { useState } from "react";
import type { Alarm } from "../types";
import { breachLabel, formatTime, ruleFor, watchName } from "../rules";
import { store, useWatchState } from "../store";

function AlarmCard({ alarm }: { alarm: Alarm }) {
  const watchIndex = useWatchState((s) => s.watchIndex);
  const [note, setNote] = useState("");
  const [retest, setRetest] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rule = ruleFor(alarm.device, alarm.param);
  const ackedHere = alarm.acknowledgedWatchIndex === watchIndex;
  const critical = alarm.level === "critical";

  const submitResolve = () => {
    const err = store.resolveCritical(alarm.id, {
      handlingNote: note,
      retestValue: Number(retest),
    });
    setError(err ?? null);
  };

  return (
    <article className={`alarm-card ${alarm.level}${ackedHere ? " acked" : ""}`}>
      <header>
        <div className="alarm-title">
          <span className="dot" data-level={alarm.level} />
          <strong>
            {alarm.device} · {alarm.param}
          </strong>
          <span className={`alarm-pill ${alarm.level}`}>{critical ? "严重" : "一般"}</span>
          {ackedHere && <span className="ack-tag">本班已确认（提示已关闭，报警保留）</span>}
        </div>
        <div className="alarm-meta">
          <span>首发 {watchName(alarm.firstWatchIndex)} · {formatTime(alarm.firstAt)}</span>
          {alarm.escalatedAt && (
            <span className="escalated">
              升级 {watchName(alarm.escalatedWatchIndex!)} · {formatTime(alarm.escalatedAt)}
            </span>
          )}
        </div>
      </header>

      <p className="alarm-line">
        当前读数 <b>{alarm.lastValue}{rule?.unit}</b>
        {rule && ` · ${breachLabel(rule, alarm.lastValue)}`}
        {alarm.normalObservedAfterEscalation && (
          <span className="normal-hint">（已观测到复测恢复正常，仍须补单消除）</span>
        )}
      </p>
      <p className="alarm-sub">
        首发级别：一般报警（原记录保留，不改写）
        {critical && " → 当前级别：严重报警"}
        {"　"}累计越限采样 {alarm.violationCount} 次
      </p>

      {critical ? (
        <div className="resolve-form">
          <p className="eyebrow danger">严重报警补单：处理说明 + 复测值均合格后方可消除</p>
          <label>
            <span>处理说明</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="如：清洗冷却器并检查三通阀，温度回落"
            />
          </label>
          <label className="retest">
            <span>复测值{rule ? `（正常 ${rule.min}~${rule.max}${rule.unit}）` : ""}</span>
            <input
              type="number"
              step={rule?.step ?? "any"}
              value={retest}
              onChange={(e) => setRetest(e.target.value)}
              placeholder="输入恢复正常后的复测读数"
            />
          </label>
          <div className="actions">
            {!ackedHere && (
              <button type="button" onClick={() => store.acknowledge(alarm.id)}>
                确认（仅关闭本班提示）
              </button>
            )}
            <button type="button" className="primary" onClick={submitResolve}>
              补单并消除严重报警
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
      ) : (
        <div className="actions">
          {!ackedHere ? (
            <button type="button" className="primary" onClick={() => store.acknowledge(alarm.id)}>
              轮机员确认（仅关闭本班提示）
            </button>
          ) : (
            <button type="button" onClick={() => store.acknowledge(alarm.id)} disabled>
              本班已确认
            </button>
          )}
          <span className="hint-inline">复测恢复正常后自动消除</span>
        </div>
      )}
    </article>
  );
}

export default function AlarmBoard() {
  const filter = useWatchState((s) => s.filter);
  const active = useWatchState((s) => s.alarms.filter((a) => a.status === "active"));
  const resolved = useWatchState((s) => s.alarms.filter((a) => a.status === "resolved"));
  const shown = filter === "全部" ? active : active.filter((a) => a.device === filter);
  const shownResolved = filter === "全部" ? resolved : resolved.filter((a) => a.device === filter);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p className="eyebrow">活动报警看板</p>
          <h2>报警确认闭环</h2>
        </div>
        <span className="subtle">
          活动 {active.length} 条（严重 {active.filter((a) => a.level === "critical").length}）
          {" · "}已消除 {resolved.length} 条
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="empty-inline">当前筛选下无活动报警，各参数运行正常</p>
      ) : (
        <div className="alarm-list">
          {shown.map((alarm) => (
            <AlarmCard key={alarm.id} alarm={alarm} />
          ))}
        </div>
      )}

      {shownResolved.length > 0 && (
        <details className="resolved-box">
          <summary>已消除报警记录（{shownResolved.length} 条，原记录与级别保留）</summary>
          <ul className="resolved-list">
            {shownResolved.map((a) => (
              <li key={a.id}>
                <span className="dot" data-level={a.level} />
                <span>
                  {a.device} · {a.param}
                </span>
                <em>{a.autoRecovered ? "一般 · 复测恢复自动消除" : "严重 · 补单消除"}</em>
                {a.resolvedAt && <time>{formatTime(a.resolvedAt)}</time>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
