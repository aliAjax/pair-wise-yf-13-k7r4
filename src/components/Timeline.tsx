import { useMemo } from "react";
import type { AlarmEvent } from "../types";
import { EVENT_LABELS, eventTone, formatDateTime, levelLabel } from "../lib/format";
import { directionText } from "../rules/parameters";
import { useAppState } from "../state/store";

/** 异常时间线：报警事件只追加，按时间倒序；与设备筛选联动 */
export default function Timeline() {
  const { alarms, deviceFilter } = useAppState();

  const events = useMemo(() => {
    const rows: Array<{
      event: AlarmEvent;
      device: string;
      param: string;
      level: string;
      order: number;
    }> = [];
    alarms.forEach((alarm) => {
      alarm.events.forEach((event, order) => {
        rows.push({
          event,
          device: alarm.device,
          param: alarm.param,
          level: alarm.level,
          order,
        });
      });
    });
    return rows
      .filter((row) => deviceFilter === "all" || row.device === deviceFilter)
      .sort((a, b) => b.event.at - a.event.at || b.order - a.order);
  }, [alarms, deviceFilter]);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>异常记录时间线</p>
          <h2>事件追溯</h2>
        </div>
        <span className="count-pill">{events.length} 条事件</span>
      </div>

      {events.length === 0 ? (
        <p className="empty-state">暂无异常事件，采样越限后会在此完整留痕。</p>
      ) : (
        <ol className="timeline">
          {events.map(({ event, device, param }) => (
            <li key={event.id} className="timeline-item">
              <span className={`timeline-dot ${eventTone(event.type)}`} />
              <div className="timeline-body">
                <div className="timeline-head">
                  <span className="device-tag">{device}</span>
                  <strong>{param}</strong>
                  <span className="badge badge-event">{EVENT_LABELS[event.type]}</span>
                  {event.level && (
                    <span className={`badge badge-${event.level}`}>
                      {levelLabel(event.level)}
                    </span>
                  )}
                  <time>{formatDateTime(event.at)}</time>
                </div>
                <p className="timeline-detail">
                  <span>{event.watchId}</span>
                  {typeof event.value === "number" && (
                    <>
                      <span className="dot-sep">·</span>
                      <span>
                        读数 {event.value}
                        {typeof event.high === "boolean" && !event.inRange
                          ? `（${directionText(event.high)}）`
                          : ""}
                      </span>
                    </>
                  )}
                  {event.engineer && (
                    <>
                      <span className="dot-sep">·</span>
                      <span>{event.engineer}</span>
                    </>
                  )}
                  {event.note && (
                    <>
                      <span className="dot-sep">·</span>
                      <span className="timeline-note">{event.note}</span>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
