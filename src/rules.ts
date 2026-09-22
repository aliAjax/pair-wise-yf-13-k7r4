import type {
  Alarm,
  EventKind,
  Level,
  ParameterRule,
  TimelineEvent,
  WatchState,
} from "./types";

/* ---------------------------------- 常量 ---------------------------------- */

/** 六班循环 */
export const WATCH_NAMES = ["00-04班", "04-08班", "08-12班", "12-16班", "16-20班", "20-24班"];

export const DEVICES = ["主机", "发电机", "泵组", "舱底水"];

export const FILTERS = ["全部", ...DEVICES];

/** 时间线最多保留条数（仍足够追溯，避免本地存储无限膨胀） */
const EVENT_LIMIT = 300;

/** 各设备参数限值规则：闭区间之外即为越限 */
export const PARAMETER_RULES: ParameterRule[] = [
  { device: "主机", param: "主机转速", unit: "rpm", min: 70, max: 95, step: 1, defaultValue: 82, breachValue: 102 },
  { device: "主机", param: "滑油压力", unit: "MPa", min: 0.3, max: 0.55, step: 0.01, defaultValue: 0.42, breachValue: 0.24 },
  { device: "主机", param: "冷却水温", unit: "℃", min: 65, max: 85, step: 1, defaultValue: 76, breachValue: 92 },
  { device: "发电机", param: "冷却水温", unit: "℃", min: 55, max: 80, step: 1, defaultValue: 68, breachValue: 86 },
  { device: "发电机", param: "燃油消耗", unit: "L/h", min: 40, max: 80, step: 1, defaultValue: 58, breachValue: 91 },
  { device: "泵组", param: "滑油压力", unit: "MPa", min: 0.25, max: 0.6, step: 0.01, defaultValue: 0.4, breachValue: 0.18 },
  { device: "舱底水", param: "舱底水位", unit: "%", min: 0, max: 70, step: 1, defaultValue: 35, breachValue: 82 },
];

/* -------------------------------- 通用工具 -------------------------------- */

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${seq}_${rand}`;
}

export const keyOf = (device: string, param: string) => `${device}/${param}`;

export function ruleFor(device: string, param: string): ParameterRule | undefined {
  return PARAMETER_RULES.find((r) => r.device === device && r.param === param);
}

/** 越限方向描述 */
export function breachLabel(rule: ParameterRule, value: number): string {
  return value > rule.max
    ? `过高（> ${rule.max}${rule.unit}）`
    : `过低（< ${rule.min}${rule.unit}）`;
}

export function watchName(watchIndex: number): string {
  const idx = ((watchIndex % WATCH_NAMES.length) + WATCH_NAMES.length) % WATCH_NAMES.length;
  return WATCH_NAMES[idx];
}

export function formatTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* -------------------------------- 事件构造 -------------------------------- */

function makeEvent(
  kind: EventKind,
  watchIndex: number,
  message: string,
  extra?: Partial<TimelineEvent>,
): TimelineEvent {
  return {
    id: nextId("evt"),
    kind,
    t: Date.now(),
    watchIndex,
    message,
    ...extra,
  };
}

function pushEvent(events: TimelineEvent[], event: TimelineEvent): TimelineEvent[] {
  return [event, ...events].slice(0, EVENT_LIMIT);
}

/* -------------------------------- 查询派生 -------------------------------- */

export function activeAlarms(state: WatchState): Alarm[] {
  return state.alarms.filter((a) => a.status === "active");
}

export function activeCriticals(state: WatchState): Alarm[] {
  return activeAlarms(state).filter((a) => a.level === "critical");
}

/** 本班提示：活动报警 且 未在本班确认 */
export function shiftPromptAlarms(state: WatchState): Alarm[] {
  return activeAlarms(state).filter((a) => a.acknowledgedWatchIndex !== state.watchIndex);
}

/** 本班存在未恢复的严重报警时，禁止完成交接班 */
export function handoverBlockers(state: WatchState): Alarm[] {
  return activeCriticals(state);
}

/** 交接班时仍未恢复、需带给下一班的报警（设备与参数） */
export function carriedAlarms(state: WatchState): Alarm[] {
  return activeAlarms(state);
}

/* -------------------------------- 采样流转 -------------------------------- */

export interface SampleInput {
  device: string;
  param: string;
  value: number;
}

export interface SampleResult {
  ok: boolean;
  error?: string;
}

/**
 * 采样入口：
 * - 越限且无活动报警：按设备+参数生成一条一般报警（未恢复前不重复新建）
 * - 越限且已有活动报警：本班已确认则继续静默；跨班首次复测仍越限 → 重新激活并升级严重
 * - 恢复正常：一般报警自动消除；严重报警保留看板，待补处理说明与复测值后人工消除
 */
export function ingestSample(prev: WatchState, input: SampleInput): { state: WatchState; result: SampleResult } {
  const rule = ruleFor(input.device, input.param);
  if (!rule) return { state: prev, result: { ok: false, error: "未找到该设备参数的限值规则" } };
  const value = Number(input.value);
  if (!Number.isFinite(value)) return { state: prev, result: { ok: false, error: "采样读数无效" } };

  const now = Date.now();
  const watchIndex = prev.watchIndex;
  const violated = value < rule.min || value > rule.max;
  const key = keyOf(input.device, input.param);

  let events = prev.events;
  let alarms = prev.alarms;

  const existing = alarms.find(
    (a) => a.device === input.device && a.param === input.param && a.status === "active",
  );

  if (violated) {
    if (!existing) {
      const alarm: Alarm = {
        id: nextId("alm"),
        device: input.device,
        param: input.param,
        level: "warning",
        status: "active",
        firstAt: now,
        firstWatchIndex: watchIndex,
        lastValue: value,
        lastAt: now,
        violationCount: 1,
      };
      alarms = [alarm, ...alarms];
      events = pushEvent(
        events,
        makeEvent("created", watchIndex, `${input.device} · ${input.param} 越限：${breachLabel(rule, value)}`, {
          device: input.device,
          param: input.param,
          unit: rule.unit,
          level: "warning",
          value,
        }),
      );
    } else {
      const sameShiftAcked = existing.acknowledgedWatchIndex === watchIndex;

      alarms = alarms.map((a) =>
        a.id === existing.id
          ? {
              ...a,
              lastValue: value,
              lastAt: now,
              violationCount: a.violationCount + 1,
            }
          : a,
      );

      if (existing.level === "warning" && existing.firstWatchIndex < watchIndex) {
        // 下一班（或更晚班次）复测仍越限：重新激活并升级为严重（原首发记录与级别留在时间线）
        alarms = alarms.map((a) =>
          a.id === existing.id
            ? {
                ...a,
                level: "critical",
                escalatedAt: now,
                escalatedWatchIndex: watchIndex,
                acknowledgedWatchIndex: undefined,
                normalObservedAfterEscalation: false,
              }
            : a,
        );
        events = pushEvent(
          events,
          makeEvent(
            "escalated",
            watchIndex,
            `${input.device} · ${input.param} 跨班复测仍越限（${breachLabel(rule, value)}），自动重新激活并升级为严重`,
            { device: input.device, param: input.param, unit: rule.unit, level: "critical", value },
          ),
        );
      } else if (!sameShiftAcked) {
        // 同一班次内持续越限：不重复新建，仅刷新看板读数
        events = pushEvent(
          events,
          makeEvent("note", watchIndex, `${input.device} · ${input.param} 持续越限，读数 ${value}${rule.unit}`, {
            device: input.device,
            param: input.param,
            unit: rule.unit,
            level: existing.level,
            value,
          }),
        );
      }
    }
  } else {
    // 采样恢复正常
    if (existing && existing.level === "warning") {
      alarms = alarms.map((a) =>
        a.id === existing.id
          ? {
              ...a,
              status: "resolved",
              autoRecovered: true,
              resolvedAt: now,
              resolvedWatchIndex: watchIndex,
              lastValue: value,
              lastAt: now,
            }
          : a,
      );
      events = pushEvent(
        events,
        makeEvent(
          "recovered",
          watchIndex,
          `${input.device} · ${input.param} 复测恢复正常（${value}${rule.unit}），一般报警自动消除`,
          { device: input.device, param: input.param, unit: rule.unit, level: "warning", value },
        ),
      );
    } else if (existing && existing.level === "critical" && !existing.normalObservedAfterEscalation) {
      // 严重报警即使观测到恢复，也必须补处理说明与复测值后才能人工消除
      alarms = alarms.map((a) =>
        a.id === existing.id
          ? { ...a, normalObservedAfterEscalation: true, lastValue: value, lastAt: now }
          : a,
      );
      events = pushEvent(
        events,
        makeEvent(
          "note",
          watchIndex,
          `${input.device} · ${input.param} 采样已恢复正常（${value}${rule.unit}），严重报警须补处理说明与复测值后方可消除`,
          { device: input.device, param: input.param, unit: rule.unit, level: "critical", value },
        ),
      );
    }
  }

  const latest = {
    ...prev.latest,
    [key]: { value, t: now, watchIndex, violated },
  };

  return {
    state: { ...prev, alarms, events, latest },
    result: { ok: true },
  };
}

/* ---------------------------------- 确认 ---------------------------------- */

/**
 * 轮机员确认：只关闭本班提示（记录确认班次）。
 * 报警仍留在看板；下一班采样仍越限时按采样规则重新激活。
 */
export function acknowledgeAlarm(prev: WatchState, alarmId: string): WatchState {
  const alarm = prev.alarms.find((a) => a.id === alarmId && a.status === "active");
  if (!alarm || alarm.acknowledgedWatchIndex === prev.watchIndex) return prev;

  const alarms = prev.alarms.map((a) =>
    a.id === alarmId ? { ...a, acknowledgedWatchIndex: prev.watchIndex } : a,
  );
  const levelText: Level = alarm.level;
  const events = pushEvent(
    prev.events,
    makeEvent(
      "acknowledged",
      prev.watchIndex,
      `${alarm.device} · ${alarm.param} ${levelText === "critical" ? "严重" : "一般"}报警已确认，仅关闭本班提示，报警保留看板`,
      { device: alarm.device, param: alarm.param, level: alarm.level },
    ),
  );
  return { ...prev, alarms, events };
}

/* -------------------------------- 严重消除 -------------------------------- */

export interface ResolveInput {
  handlingNote: string;
  retestValue: number;
}

/** 升级后的严重报警：须补处理说明和复测值（复测值须回到正常区间）才能消除 */
export function resolveCritical(
  prev: WatchState,
  alarmId: string,
  input: ResolveInput,
): { state: WatchState; error?: string } {
  const alarm = prev.alarms.find((a) => a.id === alarmId && a.status === "active");
  if (!alarm) return { state: prev, error: "报警已不存在" };
  if (alarm.level !== "critical") return { state: prev, error: "仅升级后的严重报警需要补单消除" };

  const note = input.handlingNote.trim();
  const retest = Number(input.retestValue);
  if (!note) return { state: prev, error: "请填写处理说明" };
  if (!Number.isFinite(retest)) return { state: prev, error: "复测值无效" };
  const rule = ruleFor(alarm.device, alarm.param);
  if (rule && (retest < rule.min || retest > rule.max)) {
    return { state: prev, error: `复测值 ${retest}${rule.unit} 仍越限（正常区间 ${rule.min}~${rule.max}${rule.unit}），不能消除` };
  }

  const now = Date.now();
  const alarms = prev.alarms.map((a) =>
    a.id === alarmId
      ? {
          ...a,
          status: "resolved" as const,
          handlingNote: note,
          retestValue: retest,
          resolvedAt: now,
          resolvedWatchIndex: prev.watchIndex,
          lastValue: retest,
          lastAt: now,
        }
      : a,
  );
  const events = pushEvent(
    prev.events,
    makeEvent(
      "resolved",
      prev.watchIndex,
      `${alarm.device} · ${alarm.param} 严重报警消除：复测 ${retest}${rule?.unit ?? ""} 恢复正常`,
      {
        device: alarm.device,
        param: alarm.param,
        unit: rule?.unit,
        level: "critical",
        value: retest,
        note: `处理说明：${note}`,
      },
    ),
  );
  return { state: { ...prev, alarms, events } };
}

/* --------------------------------- 交接班 --------------------------------- */

export interface HandoverResult {
  ok: boolean;
  blockers?: Alarm[];
}

/** 完成交接班：本班存在未恢复严重报警时禁止；通过后进入下一班（确认不带班） */
export function completeHandover(prev: WatchState, remark: string): { state: WatchState; result: HandoverResult } {
  const blockers = handoverBlockers(prev);
  if (blockers.length > 0) {
    return { state: prev, result: { ok: false, blockers } };
  }

  const carried = carriedAlarms(prev);
  const nextIndex = prev.watchIndex + 1;
  const list =
    carried.length > 0
      ? carried.map((a) => `${a.device}·${a.param}${a.level === "critical" ? "(严重)" : ""}`).join("、")
      : "无未恢复报警";

  const events = pushEvent(
    prev.events,
    makeEvent(
      "handover",
      prev.watchIndex,
      `${watchName(prev.watchIndex)} 完成交接班 → ${watchName(nextIndex)}；交接摘要（设备与参数）：${list}`,
      { note: remark.trim() ? `交接备注：${remark.trim()}` : undefined },
    ),
  );

  // 进入下一班：清空确认态，使未恢复报警在下一班重新提示；
  // 未确认的一般报警若下一班采样仍越限，由 ingestSample 负责升级。
  const alarms = prev.alarms.map((a) =>
    a.status === "active" ? { ...a, acknowledgedWatchIndex: undefined } : a,
  );

  return {
    state: { ...prev, watchIndex: nextIndex, alarms, events },
    result: { ok: true },
  };
}

/* -------------------------------- 初始数据 -------------------------------- */

/** 首次进入时给出一条当前班次的活动一般报警，便于直接演示闭环 */
export function createInitialState(now = Date.now()): WatchState {
  const breach: ParameterRule = PARAMETER_RULES[2]; // 主机 · 冷却水温 偏高
  const watchIndex = 2; // 08-12班
  const alarm: Alarm = {
    id: nextId("alm"),
    device: breach.device,
    param: breach.param,
    level: "warning",
    status: "active",
    firstAt: now,
    firstWatchIndex: watchIndex,
    lastValue: breach.breachValue,
    lastAt: now,
    violationCount: 1,
  };
  const events = [
    makeEvent(
      "created",
      watchIndex,
      `${breach.device} · ${breach.param} 越限：${breachLabel(breach, breach.breachValue)}`,
      {
        device: breach.device,
        param: breach.param,
        unit: breach.unit,
        level: "warning",
        value: breach.breachValue,
      },
    ),
  ];
  const latest: WatchState["latest"] = {
    [keyOf(breach.device, breach.param)]: {
      value: breach.breachValue,
      t: now,
      watchIndex,
      violated: true,
    },
  };
  return { version: 1, watchIndex, alarms: [alarm], events, latest, filter: "全部" };
}
