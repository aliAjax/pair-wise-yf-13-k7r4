import { useState } from "react";
import type { ParamRule } from "../rules/parameters";
import { PARAM_RULES, directionText, formatNumber } from "../rules/parameters";
import { dispatch, readingKey, useAppState } from "../state/store";
import { formatTime } from "../lib/format";

function SampleRow({ rule }: { rule: ParamRule }) {
  const readings = useAppState().readings;
  const [raw, setRaw] = useState("");
  const value = Number(raw);
  const valid = raw.trim() !== "" && Number.isFinite(value);
  const reading = readings[readingKey(rule.device, rule.param)];

  function submit() {
    if (!valid) return;
    dispatch({
      type: "sample",
      device: rule.device,
      param: rule.param,
      value,
      at: Date.now(),
    });
    setRaw("");
  }

  return (
    <article className="sample-row">
      <div className="sample-main">
        <div className="sample-title">
          <span className="device-tag">{rule.device}</span>
          <strong>{rule.param}</strong>
        </div>
        <small className="sample-range">
          正常区间 {rule.min}~{rule.max} {rule.unit}
        </small>
        {reading && (
          <p className={`sample-reading ${reading.inRange ? "is-ok" : "is-bad"}`}>
            最近：{formatNumber(rule, reading.value)} {rule.unit}
            {!reading.inRange && <em>（{directionText(reading.high)}）</em>}
            <span className="sample-meta">
              {reading.watchId} · {formatTime(reading.at)}
            </span>
          </p>
        )}
      </div>
      <div className="sample-entry">
        <div className="sample-input">
          <input
            inputMode="decimal"
            value={raw}
            placeholder={`填${rule.param}`}
            onChange={(event) => setRaw(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          <span className="unit-tag">{rule.unit}</span>
        </div>
        <button className="primary small" disabled={!valid} onClick={submit}>
          采样
        </button>
      </div>
    </article>
  );
}

export default function SamplingPanel() {
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>参数越限判定</p>
          <h2>机舱参数采样</h2>
        </div>
      </div>
      <div className="sample-list">
        {PARAM_RULES.map((rule) => (
          <SampleRow key={`${rule.device}-${rule.param}`} rule={rule} />
        ))}
      </div>
      <p className="panel-hint">
        越限采样按设备与参数生成一条活动报警；本班重复越限只刷新读数，不重复新建。下一班仍越限将自动重新激活并升级为严重。
      </p>
    </section>
  );
}
