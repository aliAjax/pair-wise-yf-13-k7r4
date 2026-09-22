import { useMemo, useState } from "react";
import { PARAMETER_RULES, activeAlarms, keyOf } from "../rules";
import { store, useWatchState } from "../store";
import type { ParameterRule } from "../types";

function SampleRow({ rule }: { rule: ParameterRule }) {
  const key = keyOf(rule.device, rule.param);
  const latest = useWatchState((s) => s.latest[key]);
  const active = useWatchState((s) =>
    activeAlarms(s).find((a) => a.device === rule.device && a.param === rule.param),
  );
  const watchIndex = useWatchState((s) => s.watchIndex);
  const [value, setValue] = useState<string>(String(rule.defaultValue));
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<"" | "ok" | "bad">("");

  const displayValue = latest ? latest.value : rule.defaultValue;
  const violated = latest ? latest.violated : false;
  const ackedHere = active?.acknowledgedWatchIndex === watchIndex;

  const submit = () => {
    const err = store.sample({ device: rule.device, param: rule.param, value: Number(value) });
    if (err) {
      setError(err);
      setFlash("");
    } else {
      setError(null);
      const v = Number(value);
      setFlash(v < rule.min || v > rule.max ? "bad" : "ok");
      window.setTimeout(() => setFlash(""), 1600);
    }
  };

  return (
    <article className={`sample-row${violated ? " violated" : ""}${flash ? ` flash-${flash}` : ""}`}>
      <div className="sample-head">
        <span className="device-tag">{rule.device}</span>
        <span className="param-name">{rule.param}</span>
        {active && (
          <span className={`alarm-pill ${active.level}`}>
            {active.level === "critical" ? "严重报警" : "一般报警"}
            {ackedHere ? " · 本班已确认" : ""}
          </span>
        )}
      </div>
      <div className="sample-body">
        <div className="range">
          正常区间 <b>{rule.min}~{rule.max}</b> {rule.unit}
        </div>
        <div className="latest">
          最近采样
          <b className={violated ? "value-bad" : "value-ok"}>
            {displayValue}
            {rule.unit}
          </b>
          {latest && <small>{latest.violated ? "越限" : "正常"}</small>}
        </div>
        <div className="sample-input">
          <input
            type="number"
            step={rule.step}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={`${rule.device} ${rule.param}采样读数`}
          />
          <button type="button" className="primary" onClick={submit}>
            采样
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setValue(String(rule.breachValue))}
            title="填入越限示例值，便于演示报警闭环"
          >
            越限示例
          </button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
    </article>
  );
}

export default function SamplingBoard() {
  const filter = useWatchState((s) => s.filter);
  // 输入行用设备选择来支持设备名自由录入（规则内设备固定，此处仅做组内定位）
  const [device, setDevice] = useState<string>(PARAMETER_RULES[0].device);
  const [param, setParam] = useState<string>(PARAMETER_RULES[0].param);
  const [value, setValue] = useState<string>(String(PARAMETER_RULES[0].defaultValue));
  const [manualError, setManualError] = useState<string | null>(null);

  const rows = useMemo(
    () => (filter === "全部" ? PARAMETER_RULES : PARAMETER_RULES.filter((r) => r.device === filter)),
    [filter],
  );

  const deviceParams = PARAMETER_RULES.filter((r) => r.device === device);

  const submitManual = () => {
    const err = store.sample({ device, param, value: Number(value) });
    setManualError(err ?? null);
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p className="eyebrow">机舱参数看板</p>
          <h2>采样录入与越限监测</h2>
        </div>
        <span className="subtle">同一设备+参数未恢复前不重复新建报警</span>
      </div>

      <div className="manual-sample">
        <label>
          <span>设备名称</span>
          <select
            value={device}
            onChange={(e) => {
              const d = e.target.value;
              setDevice(d);
              const first = PARAMETER_RULES.find((r) => r.device === d)!;
              setParam(first.param);
              setValue(String(first.defaultValue));
            }}
          >
            {Array.from(new Set(PARAMETER_RULES.map((r) => r.device))).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>参数</span>
          <select value={param} onChange={(e) => setParam(e.target.value)}>
            {deviceParams.map((r) => (
              <option key={r.param} value={r.param}>
                {r.param}（{r.min}~{r.max}{r.unit}）
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>参数读数</span>
          <input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <button type="button" className="primary manual-btn" onClick={submitManual}>
          提交采样
        </button>
      </div>
      {manualError && <p className="form-error">{manualError}</p>}

      <div className="sample-grid">
        {rows.map((rule) => (
          <SampleRow key={keyOf(rule.device, rule.param)} rule={rule} />
        ))}
      </div>
      {rows.length === 0 && <p className="empty-inline">该设备暂无监测参数</p>}
    </section>
  );
}
