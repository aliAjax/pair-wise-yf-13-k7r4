import type { AlarmEventType, AlarmLevel, AlarmStatus } from "../types";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 时间线与看板用：MM-DD HH:mm */
export function formatDateTime(at: number): string {
  const date = new Date(at);
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

export function formatTime(at: number): string {
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function levelLabel(level: AlarmLevel): string {
  return level === "severe" ? "严重" : "一般";
}

export function statusLabel(status: AlarmStatus): string {
  switch (status) {
    case "active":
      return "待确认";
    case "acknowledged":
      return "本班已确认";
    case "recovered":
      return "已恢复";
    case "closed":
      return "已闭环";
  }
}

export const EVENT_LABELS: Record<AlarmEventType, string> = {
  created: "生成报警",
  sample: "越限复测",
  acknowledged: "轮机员确认",
  reactivated: "重新激活",
  recovered: "恢复正常",
  closed: "补录闭环",
};

export function eventTone(type: AlarmEventType): string {
  switch (type) {
    case "created":
      return "tone-warn";
    case "reactivated":
      return "tone-danger";
    case "acknowledged":
      return "tone-info";
    case "recovered":
      return "tone-ok";
    case "closed":
      return "tone-ok";
    case "sample":
      return "tone-warn";
  }
}
