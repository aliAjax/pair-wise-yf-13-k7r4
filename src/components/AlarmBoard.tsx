import { useMemo, useState } from "react";
import type { Alarm } from "../types";
import { formatDateTime, levelLabel, statusLabel } from "../lib/format";
import { directionText, formatNumber, getParamRule } from "../rules/parameters";
import { promptsForWatch } from "../rules/alarms";
import { dispatch, useAppState } from "../state/store";

function AlarmCard({ alarm }: { alarm: Alarm }) {
  const watchSeq = useAppState().watchSeq;
  const [note, setNote] = useState("");
  const [retest, setRetest] = useState("");
  const rule = getParamRule(alarm.device, alarm.param);

  const ackedThisWatch = alarm.acks.some((ack) => ack.watchSeq === watchSeq);
  const carriedFromPriorWatch = alarm.activeWatchSeq < watchSeq;
  const retestValue = Number(retest);
  const retestValid = retest.trim() !== "" && Number.isFinite(retestValue);
  const retestInRange = rule
    ? retestValue >= rule.min && retestValue <= rule.max
    : true;

  return (
    <article
      className={`alarm-card level-${alarm.level} ${
        ackedThisWatch ? "is-acknowledged" : "is-active"
      }`}
    >
      <header className="alarm-head">
        <div className="alarm-id">
          <span className="device-tag">{alarm.device}</span>
          <strong>{alarm.param}</strong>
          <span className={`badge badge-${alarm.level}`}>{levelLabel(alarm.level)}</span>
          <span className="badge badge-status">{statusLabel(alarm.status)}</span>
        </div>
        <div className="alarm-value">
          <b>
            {rule ? formatNumber(rule, alarm.lastValue) : alarm.lastValue} {alarm.unit}
          </b>
          <em>{directionText(alarm.high)}</em>
        </div>
      </header>

      <div className="alarm-meta">
        <span>首次越限：{formatDateTime(alarm.createdAt)} · {alarm.firstWatchId}</span>
        <span>当前班次：{alarm.activeWatchId}</span>
        <span>越限采样 {alarm.sampleCount} 次</span>
      </div>

      {alarm.level === "severe" && alarm.escalatedAt && (
        <p className="escalate-note">
          已于 {formatDateTime(alarm.escalatedAt)}（{alarm.escalatedWatchId}
          ）升级为严重报警，须补处理说明与复测值后才能消除，且未恢复期间禁止交接班。
        </p>
      )}

      {alarm.acks.length > 0 && (
        <ul className="ack-list">
          {alarm.acks.map((ack) => (
            <li key={`${ack.watchSeq}-${ack.at}`}>
              {ack.watchId} {formatDateTime(ack.at)} 由 {ack.engineer} 确认（仅关闭该班提示）
            </li>
          ))}
        </ul>
      )}

      <footer className="alarm-actions">
        {!ackedThisWatch && (
          <button
            className="primary small"
            onClick={() =>
              dispatch({ type: "acknowledge", alarmId: alarm.id, at: Date.now() })
            }
          >
            轮机员确认
          </button>
        )}
        {ackedThisWatch && <span className="ack-flag">本班提示已关闭，报警仍在看板</span>}
        {carriedFromPriorWatch && (
          <span className="carry-flag">跨班遗留，待本班采样判定</span>
        )}
      </footer>

      {alarm.level === "severe" && (
        <div className="resolve-box">
          <label className="resolve-field resolve-note">
            <span>处理说明（必填）</span>
            <textarea
              value={note}
              rows={2}
              placeholder="记录处置过程、现场检查与采取的措施"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <label className="resolve-field">
            <span>复测值（必填）{rule ? `，正常 ${rule.min}~${rule.max} ${rule.unit}` : ""}</span>
            <div className="sample-input">
              <input
                inputMode="decimal"
                value={retest}
                placeholder="填写复测读数"
                onChange={(event) => setRetest(event.target.value)}
              />
              <span className="unit-tag">{alarm.unit}</span>
            </div>
          </label>
          <button
            className="danger small"
            disabled={!note.trim() || !retestValid}
            onClick={() => {
              dispatch({
                type: "resolve",
                alarmId: alarm.id,
                note,
                retestValue,
                at: Date.now(),
              });
              setNote("");
              setRetest("");
            }}
          >
            补录并闭环
          </button>
          {retestValid && !retestInRange && (
            <small className="field-error">复测值仍越限，请复测至正常区间后再闭环</small>
          )}
        </div>
      )}
    </article>
  );
}

export default function AlarmBoard() {
  const { alarms, watchSeq, deviceFilter } = useAppState();

  const open = useMemo(
    () =>
      alarms
        .filter((alarm) => alarm.status !== "recovered" && alarm.status !== "closed")
        .filter((alarm) => deviceFilter === "all" || alarm.device === deviceFilter),
    [alarms, deviceFilter]
  );

  const prompts = useMemo(
    () =>
      promptsForWatch(alarms, watchSeq).filter(
        (alarm) => deviceFilter === "all" || alarm.device === deviceFilter
      ),
    [alarms, watchSeq, deviceFilter]
  );

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>活动报警看板</p>
          <h2>报警确认闭环</h2>
        </div>
        <span className="count-pill">
          活动 {open.length} 条 · 本班待确认 {prompts.length} 条
        </span>
      </div>

      {prompts.length > 0 && (
        <div className="prompt-banner">
          <strong>本班提示：</strong>
          {prompts.map((alarm) => (
            <span key={alarm.id} className="prompt-chip">
              {alarm.device} · {alarm.param}
            </span>
          ))}
          <small>确认仅关闭本班提示，报警仍留在看板直至恢复或闭环。</small>
        </div>
      )}

      {open.length === 0 ? (
        <p className="empty-state">当前筛选下没有活动报警，参数处于受控状态。</p>
      ) : (
        <div className="alarm-list">
          {open.map((alarm) => (
            <AlarmCard key={alarm.id} alarm={alarm} />
          ))}
        </div>
      )}
    </section>
  );
}
