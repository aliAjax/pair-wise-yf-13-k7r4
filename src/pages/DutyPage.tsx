import { useMemo } from "react";
import SamplingPanel from "../components/SamplingPanel";
import AlarmBoard from "../components/AlarmBoard";
import Timeline from "../components/Timeline";
import History from "../components/History";
import HandoverPanel from "../components/HandoverPanel";
import { DEVICES } from "../rules/parameters";
import { watchInfo } from "../rules/shifts";
import { openAlarms, promptsForWatch, severeOpenAlarms } from "../rules/alarms";
import { dispatch, useAppState } from "../state/store";

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "danger" | "muted";
}) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

export default function DutyPage() {
  const state = useAppState();
  const watch = watchInfo(state.baseDate, state.watchSeq);

  const stats = useMemo(() => {
    const open = openAlarms(state.alarms);
    const closed = state.alarms.length - open.length;
    return {
      open: open.length,
      prompts: promptsForWatch(state.alarms, state.watchSeq).length,
      severe: severeOpenAlarms(state.alarms).length,
      closed,
    };
  }, [state.alarms, state.watchSeq]);

  return (
    <main className="app">
      <header className="hero duty-hero">
        <div className="hero-row">
          <div>
            <p>船舶轮机值班记录 · 本地闭环</p>
            <h1>机舱值班与报警确认</h1>
          </div>
          <div className="hero-side">
            <div className="watch-pill">
              <small>当前班次</small>
              <strong>
                {watch.date} {watch.label}
              </strong>
            </div>
            <button
              className="ghost small"
              onClick={() => {
                if (window.confirm("确定清空本机所有值班与报警记录？该操作不可恢复。")) {
                  dispatch({ type: "reset" });
                }
              }}
            >
              清空本地数据
            </button>
          </div>
        </div>
        <span>
          参数越限按设备与参数生成活动报警；确认只关闭本班提示，下一班仍越限自动升级严重，补处理说明与复测值后方可闭环。数据仅存浏览器本地，刷新保留。
        </span>
      </header>

      <section className="metrics">
        <StatCard label="活动报警" value={stats.open} tone={stats.open ? "warn" : "ok"} />
        <StatCard label="本班待确认提示" value={stats.prompts} tone={stats.prompts ? "warn" : "muted"} />
        <StatCard label="未恢复严重报警" value={stats.severe} tone={stats.severe ? "danger" : "ok"} />
        <StatCard label="已闭环报警" value={stats.closed} tone="muted" />
      </section>

      <section className="workspace duty-layout">
        <aside className="panel side-panel">
          <div className="heading">
            <div>
              <p>按设备筛选</p>
              <h2>设备</h2>
            </div>
          </div>
          <div className="chips filter-chips">
            <button
              className={state.deviceFilter === "all" ? "selected" : undefined}
              onClick={() => dispatch({ type: "filter", device: "all" })}
            >
              全部
            </button>
            {DEVICES.map((device) => (
              <button
                key={device}
                className={state.deviceFilter === device ? "selected" : undefined}
                onClick={() => dispatch({ type: "filter", device })}
              >
                {device}
              </button>
            ))}
          </div>
          <p className="panel-hint">筛选同步作用于活动看板、异常时间线与历史台账。</p>

          <label className="engineer-field">
            <span>值班轮机员署名</span>
            <input
              value={state.engineer}
              placeholder="如：张轮机"
              onChange={(event) =>
                dispatch({ type: "set-engineer", engineer: event.target.value })
              }
            />
          </label>
        </aside>

        <div className="main-col">
          <SamplingPanel />
          <HandoverPanel />
        </div>

        <AlarmBoard />
      </section>

      <Timeline />
      <History />

      <footer className="page-foot">
        状态（state/）、规则（rules/）与页面（pages/、components/）分开承载 · localStorage 持久化并跨标签页同步 · 不新增依赖或服务
      </footer>
    </main>
  );
}
