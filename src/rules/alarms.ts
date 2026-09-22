import type {
  AckRecord,
  Alarm,
  AlarmEvent,
  AlarmEventType,
  AlarmLevel,
  HandoverCarried,
  HandoverRecord,
} from "../types";
import { watchInfo, type WatchInfo } from "./shifts";

/**
 * 报警状态机规则（纯函数，不触碰 React 与本地存储）：
 * - 参数越限时按“设备 + 参数”生成一条活动报警；未恢复正常前不重复新建；
 * - 轮机员确认只关闭本班提示，报警仍留在看板；
 * - 下一班采样仍越限时自动重新激活并升级为严重；
 * - 升级后须补处理说明和复测值才能消除；一般报警恢复正常即自动消除；
 * - 原记录与级别保持不变（只追加事件，不回改历史级别）。
 */

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface WatchContext {
  baseDate: string;
  watchSeq: number;
}

export interface SampleInput {
  device: string;
  param: string;
  unit: string;
  value: number;
  high: boolean;
  inRange: boolean;
  at: number;
  engineer: string;
}

export interface SampleOutcome {
  alarms: Alarm[];
  result:
    | { kind: "created"; alarmId: string }
    | { kind: "updated"; alarmId: string; reactivated: boolean }
    | { kind: "recovered"; alarmId: string }
    | { kind: "none" };
}

function buildEvent(
  type: AlarmEventType,
  watch: WatchInfo,
  at: number,
  extra?: Partial<AlarmEvent>
): AlarmEvent {
  return {
    id: uid(),
    type,
    at,
    watchSeq: watch.seq,
    watchId: watch.id,
    ...extra,
  };
}

function makeAlarm(input: SampleInput, watch: WatchInfo, level: AlarmLevel): Alarm {
  const created = buildEvent("created", watch, input.at, {
    value: input.value,
    high: input.high,
    inRange: false,
    level,
  });
  return {
    id: uid(),
    device: input.device,
    param: input.param,
    unit: input.unit,
    level,
    status: "active",
    high: input.high,
    createdAt: input.at,
    firstWatchSeq: watch.seq,
    firstWatchId: watch.id,
    activeWatchSeq: watch.seq,
    activeWatchId: watch.id,
    lastValue: input.value,
    lastAt: input.at,
    sampleCount: 1,
    acks: [],
    events: [created],
  };
}

function patchSameWatch(alarm: Alarm, input: SampleInput, watch: WatchInfo): Alarm {
  return {
    ...alarm,
    high: input.high,
    lastValue: input.value,
    lastAt: input.at,
    sampleCount: alarm.sampleCount + 1,
    events: [
      ...alarm.events,
      buildEvent("sample", watch, input.at, {
        value: input.value,
        high: input.high,
        inRange: input.inRange,
        level: alarm.level,
      }),
    ],
  };
}

function patchReactivate(alarm: Alarm, input: SampleInput, watch: WatchInfo): Alarm {
  // 原记录保持不变：一般升级为严重，已为严重的重新激活后级别仍为严重
  const level: AlarmLevel = "severe";
  const escalated = alarm.level !== "severe";
  return {
    ...alarm,
    level,
    status: "active",
    high: input.high,
    activeWatchSeq: watch.seq,
    activeWatchId: watch.id,
    lastValue: input.value,
    lastAt: input.at,
    sampleCount: alarm.sampleCount + 1,
    escalatedAt: escalated ? input.at : alarm.escalatedAt,
    escalatedWatchSeq: escalated ? watch.seq : alarm.escalatedWatchSeq,
    escalatedWatchId: escalated ? watch.id : alarm.escalatedWatchId,
    events: [
      ...alarm.events,
      buildEvent("reactivated", watch, input.at, {
        value: input.value,
        high: input.high,
        inRange: false,
        level,
        note: escalated ? "下一班复测仍越限，自动升级为严重" : "下一班复测仍越限，重新激活",
      }),
    ],
  };
}

function patchRecovered(alarm: Alarm, input: SampleInput, watch: WatchInfo): Alarm {
  // 一般报警恢复正常即自动消除；严重报警必须补处理说明与复测值，此处不关闭
  if (alarm.level === "severe") {
    return {
      ...alarm,
      high: input.high,
      lastValue: input.value,
      lastAt: input.at,
      sampleCount: alarm.sampleCount + 1,
      events: [
        ...alarm.events,
        buildEvent("sample", watch, input.at, {
          value: input.value,
          high: input.high,
          inRange: true,
          level: alarm.level,
          note: "复测已回至正常区间，仍需补处理说明与复测值后闭环",
        }),
      ],
    };
  }
  return {
    ...alarm,
    status: "recovered",
    high: input.high,
    lastValue: input.value,
    lastAt: input.at,
    closedAt: input.at,
    closedWatchSeq: watch.seq,
    closedWatchId: watch.id,
    sampleCount: alarm.sampleCount + 1,
    events: [
      ...alarm.events,
      buildEvent("recovered", watch, input.at, {
        value: input.value,
        high: input.high,
        inRange: true,
        level: alarm.level,
      }),
    ],
  };
}

/**
 * 采样进入报警闭环。
 * @param alarms 当前全部报警（含已关闭，保证原记录留痕）
 * @returns 替换后的报警列表与本次处理结果
 */
export function ingestSample(
  alarms: Alarm[],
  ctx: WatchContext,
  input: SampleInput
): SampleOutcome {
  const watch = watchInfo(ctx.baseDate, ctx.watchSeq);
  const index = alarms.findIndex((a) => a.device === input.device && a.param === input.param);
  const existing = index === -1 ? undefined : alarms[index];

  // 已闭环（恢复 / 补录关闭）后再次越限，视为一条全新的活动报警
  const open = existing && existing.status !== "recovered" && existing.status !== "closed"
    ? existing
    : undefined;

  if (!open) {
    if (input.inRange) {
      return { alarms, result: { kind: "none" } };
    }
    const alarm = makeAlarm(input, watch, "normal");
    return {
      alarms: [alarm, ...alarms],
      result: { kind: "created", alarmId: alarm.id },
    };
  }

  let next: Alarm;
  if (input.inRange) {
    next = patchRecovered(open, input, watch);
    const recovered = next.status === "recovered";
    return {
      alarms: alarms.map((a) => (a.id === open.id ? next : a)),
      result: recovered
        ? { kind: "recovered", alarmId: open.id }
        : { kind: "updated", alarmId: open.id, reactivated: false },
    };
  }

  if (watch.seq <= open.activeWatchSeq) {
    // 同一班内重复越限：刷新读数与时间线，不重复新建
    next = patchSameWatch(open, input, watch);
    return {
      alarms: alarms.map((a) => (a.id === open.id ? next : a)),
      result: { kind: "updated", alarmId: open.id, reactivated: false },
    };
  }

  // 下一班（或更晚班次）采样仍越限：自动重新激活，一般升级为严重
  next = patchReactivate(open, input, watch);
  return {
    alarms: alarms.map((a) => (a.id === open.id ? next : a)),
    result: { kind: "updated", alarmId: open.id, reactivated: true },
  };
}

export interface AckInput {
  alarmId: string;
  at: number;
  engineer: string;
}

/** 轮机员确认：只关闭本班提示，报警仍留在看板；级别与状态主体不变 */
export function acknowledgeAlarm(
  alarms: Alarm[],
  ctx: WatchContext,
  input: AckInput
): Alarm[] {
  const watch = watchInfo(ctx.baseDate, ctx.watchSeq);
  return alarms.map((alarm) => {
    if (alarm.id !== input.alarmId) return alarm;
    if (alarm.status === "recovered" || alarm.status === "closed") return alarm;
    if (alarm.acks.some((ack) => ack.watchSeq === watch.seq)) return alarm;
    const record: AckRecord = {
      watchSeq: watch.seq,
      watchId: watch.id,
      at: input.at,
      engineer: input.engineer,
    };
    return {
      ...alarm,
      status: "acknowledged",
      acks: [...alarm.acks, record],
      events: [
        ...alarm.events,
        buildEvent("acknowledged", watch, input.at, {
          level: alarm.level,
          engineer: input.engineer,
        }),
      ],
    };
  });
}

export interface ResolveInput {
  alarmId: string;
  note: string;
  retestValue: number;
  at: number;
  engineer: string;
}

export type ResolveError =
  | "not-found"
  | "not-open"
  | "not-severe"
  | "note-required"
  | "retest-required";

/** 严重报警闭环：必须补处理说明 + 复测值。原级别保持 severe 不变，仅状态转 closed */
export function resolveSevereAlarm(
  alarms: Alarm[],
  ctx: WatchContext,
  input: ResolveInput
): { alarms: Alarm[]; error?: ResolveError } {
  const alarm = alarms.find((a) => a.id === input.alarmId);
  if (!alarm) return { alarms, error: "not-found" };
  if (alarm.status === "recovered" || alarm.status === "closed") {
    return { alarms, error: "not-open" };
  }
  if (alarm.level !== "severe") return { alarms, error: "not-severe" };
  if (!input.note.trim()) return { alarms, error: "note-required" };
  if (!Number.isFinite(input.retestValue)) return { alarms, error: "retest-required" };

  const watch = watchInfo(ctx.baseDate, ctx.watchSeq);
  const next: Alarm = {
    ...alarm,
    status: "closed",
    handlingNote: input.note.trim(),
    retestValue: input.retestValue,
    retestAt: input.at,
    closedAt: input.at,
    closedWatchSeq: watch.seq,
    closedWatchId: watch.id,
    events: [
      ...alarm.events,
      buildEvent("closed", watch, input.at, {
        value: input.retestValue,
        high: false,
        inRange: true,
        level: "severe",
        note: input.note.trim(),
        engineer: input.engineer,
      }),
    ],
  };
  return { alarms: alarms.map((a) => (a.id === alarm.id ? next : a)) };
}

export function isOpen(alarm: Alarm): boolean {
  return alarm.status !== "recovered" && alarm.status !== "closed";
}

export function openAlarms(alarms: Alarm[]): Alarm[] {
  return alarms.filter(isOpen);
}

export function severeOpenAlarms(alarms: Alarm[]): Alarm[] {
  return openAlarms(alarms).filter((alarm) => alarm.level === "severe");
}

/** 本班提示：活动且本班尚未确认。跨班后旧确认不再压制新班提示 */
export function promptsForWatch(alarms: Alarm[], watchSeq: number): Alarm[] {
  return openAlarms(alarms).filter(
    (alarm) =>
      alarm.activeWatchSeq === watchSeq &&
      !alarm.acks.some((ack) => ack.watchSeq === watchSeq)
  );
}

/** 交接班门禁：本班存在未恢复的严重报警时不得完成交接班 */
export function handoverBlockers(alarms: Alarm[]): Alarm[] {
  return severeOpenAlarms(alarms);
}

export function carriedSnapshot(alarms: Alarm[]): HandoverCarried[] {
  return openAlarms(alarms).map((alarm) => ({
    device: alarm.device,
    param: alarm.param,
    level: alarm.level,
    status: alarm.status,
  }));
}

export function performHandover(
  alarms: Alarm[],
  ctx: WatchContext,
  at: number,
  engineer: string
): { record: HandoverRecord; nextSeq: number } {
  const from = watchInfo(ctx.baseDate, ctx.watchSeq);
  const to = watchInfo(ctx.baseDate, ctx.watchSeq + 1);
  const record: HandoverRecord = {
    id: uid(),
    at,
    fromWatchSeq: from.seq,
    fromWatchId: from.id,
    toWatchSeq: to.seq,
    toWatchId: to.id,
    engineer,
    carried: carriedSnapshot(alarms),
  };
  return { record, nextSeq: to.seq };
}
