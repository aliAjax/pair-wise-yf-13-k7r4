/** 报警级别：一般（首发）与严重（跨班复测仍越限后升级） */
export type Level = "warning" | "critical";

/** 设备参数的限值规则 */
export interface ParameterRule {
  device: string;
  param: string;
  unit: string;
  /** 正常区间闭区间 [min, max]，区间外即越限 */
  min: number;
  max: number;
  step: number;
  /** 采样输入框默认正常值 */
  defaultValue: number;
  /** 越限示例值，便于演示闭环 */
  breachValue: number;
}

/** 某设备参数最近一次采样快照 */
export interface SampleSnapshot {
  value: number;
  t: number;
  watchIndex: number;
  violated: boolean;
}

/** 按 设备+参数 唯一对应的活动报警（未恢复前不重复新建） */
export interface Alarm {
  id: string;
  device: string;
  param: string;
  /** 当前级别（可由 warning 升级为 critical；首发记录保留在时间线） */
  level: Level;
  status: "active" | "resolved";
  firstAt: number;
  firstWatchIndex: number;
  escalatedAt?: number;
  escalatedWatchIndex?: number;
  /** 确认只对所在班次生效：等于当前班次才关闭本班提示 */
  acknowledgedWatchIndex?: number;
  /** 一般报警复测恢复正常后自动消除 */
  autoRecovered?: boolean;
  /** 严重报警后是否已观测到恢复正常的采样（仍须人工补单消除） */
  normalObservedAfterEscalation?: boolean;
  /** 严重报警消除前必填的处理说明 */
  handlingNote?: string;
  /** 严重报警消除前必填的复测值 */
  retestValue?: number;
  resolvedAt?: number;
  resolvedWatchIndex?: number;
  lastValue: number;
  lastAt: number;
  violationCount: number;
}

export type EventKind =
  | "created"
  | "escalated"
  | "acknowledged"
  | "recovered"
  | "resolved"
  | "handover"
  | "note";

/** 异常时间线事件：只追加，不改写，保证原记录与级别可追溯 */
export interface TimelineEvent {
  id: string;
  kind: EventKind;
  t: number;
  watchIndex: number;
  device?: string;
  param?: string;
  unit?: string;
  level?: Level;
  value?: number;
  message: string;
  note?: string;
}

export interface WatchState {
  version: 1;
  /** 单调递增的班次序号（跨天连续） */
  watchIndex: number;
  alarms: Alarm[];
  /** 新事件在前 */
  events: TimelineEvent[];
  /** key: 设备/参数 -> 最近采样 */
  latest: Record<string, SampleSnapshot>;
  /** 设备筛选（"全部"或具体设备），随本地存储保留 */
  filter: string;
}
