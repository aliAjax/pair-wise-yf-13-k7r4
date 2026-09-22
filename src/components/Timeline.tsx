import type { EventKind, TimelineEvent } from "../types";
import { formatTime, watchName } from "../rules";
import { useWatchState } from "../store";

const KIND_LABEL: Record<EventKind, string> = {
  created: "越限建警",
  escalated: "重新激活·升级严重",
  acknowledged: "轮机员确认",
  recovered: "复测恢复·自动消除",
  resolved: "补单消除",
  handover: "交接班",
  note: "持续监测",
};

function TimelineItem({ event }: { event: TimelineEvent }) {
  return (
    <li className={`timeline-item kind-${event.kind}`}>
      <span className="timeline-dot" />
      <div className="timeline-content">
        <div className="timeline-head">
          <span className="timeline-kind">{KIND_LABEL[event.kind]}</span>
          <span className="timeline-watch">{watchName(event.watchIndex)}</span>
          <time>{formatTime(event.t)}</time>
        </div>
        <p>{event.message}</p>
        {event.note && <p className="timeline-note">{event.note}</p>}
      </div>
    </li>
  );
}

export default function Timeline() {
  const filter = useWatchState((s) => s.filter);
  const events = useWatchState((s) => s.events);

  // 交接班事件始终展示；参数相关事件跟随设备筛选
  const shown =
    filter === "全部"
      ? events
      : events.filter((e) => e.kind === "handover" || e.device === filter);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p className="eyebrow">异常记录时间线</p>
          <h2>只追加、不改写的完整追溯</h2>
        </div>
        <span className="subtle">{shown.length} 条记录 · 刷新页面后保留</span>
      </div>

      {shown.length === 0 ? (
        <p className="empty-inline">该设备暂无异常记录</p>
      ) : (
        <ol className="timeline">
          {shown.map((event) => (
            <TimelineItem key={event.id} event={event} />
          ))}
        </ol>
      )}
    </section>
  );
}
