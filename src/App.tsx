import "./styles.css";
import WatchPanel from "./components/WatchPanel";
import SamplingBoard from "./components/SamplingBoard";
import AlarmBoard from "./components/AlarmBoard";
import Timeline from "./components/Timeline";
import { store, useWatchState } from "./store";
import { activeAlarms, activeCriticals, shiftPromptAlarms } from "./rules";

function MetricsStrip() {
  const active = useWatchState(activeAlarms);
  const pending = useWatchState(shiftPromptAlarms);
  const criticals = useWatchState(activeCriticals);
  const watchIndex = useWatchState((s) => s.watchIndex);

  const cards = [
    { label: "活动报警", value: active.length, hint: "未恢复前不重复新建" },
    { label: "本班待确认提示", value: pending.length, hint: "确认只关闭本班提示" },
    { label: "未恢复严重报警", value: criticals.length, hint: "未消除前禁止交接班" },
    { label: "已完成班次数", value: watchIndex, hint: "每完成交接班 +1" },
  ];

  return (
    <section className="metrics">
      {cards.map((c) => (
        <article key={c.label}>
          <small>{c.label}</small>
          <strong className={c.label === "未恢复严重报警" && c.value > 0 ? "metric-danger" : undefined}>
            {c.value}
          </strong>
          <small className="metric-hint">{c.hint}</small>
        </article>
      ))}
    </section>
  );
}

export default function App() {
  const filter = useWatchState((s) => s.filter);

  return (
    <main className="app">
      <header className="hero">
        <p>hxyfront-62001 · Port 62001 · 数据仅存浏览器本地</p>
        <h1>船舶轮机值班 · 报警确认闭环</h1>
        <span>
          参数越限按设备与参数生成唯一活动报警；轮机员确认只关闭本班提示，报警仍留看板；
          下一班复测仍越限自动重新激活并升级为严重，补处理说明与复测值后方可消除；
          本班存在未恢复严重报警时不得完成交接班。
        </span>
        <div className="hero-actions">
          <span className="filter-readout">当前设备筛选：{filter}</span>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (window.confirm("重置为演示初始数据？当前本地记录将被覆盖。")) store.reset();
            }}
          >
            重置本地数据
          </button>
        </div>
      </header>

      <MetricsStrip />

      <div className="layout">
        <WatchPanel />
        <div className="main-col">
          <SamplingBoard />
          <AlarmBoard />
          <Timeline />
        </div>
      </div>
    </main>
  );
}
