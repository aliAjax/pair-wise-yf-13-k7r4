import { useSyncExternalStore } from "react";
import type { Alarm, HandoverRecord, Reading } from "../types";
import { PARAM_RULES, evaluateLimit, getParamRule } from "../rules/parameters";
import { INITIAL_WATCH_SEQ, initialBaseDate, watchInfo } from "../rules/shifts";
import {
  acknowledgeAlarm,
  handoverBlockers,
  ingestSample,
  performHandover,
  resolveSevereAlarm,
  uid,
} from "../rules/alarms";

/**
 * 应用状态：规则层的编排 + localStorage 持久化 + 跨标签页同步。
 * 页面只通过 useStore / dispatch 访问，不直接读写 localStorage。
 */

const STORAGE_KEY = "marine-engine-watch:v1";

export interface AppState {
  baseDate: string;
  watchSeq: number;
  engineer: string;
  deviceFilter: string; // "all" 或具体设备
  alarms: Alarm[];
  readings: Record<string, Reading>;
  handovers: HandoverRecord[];
}

type Action =
  | {
      type: "sample";
      device: string;
      param: string;
      value: number;
      at: number;
    }
  | { type: "acknowledge"; alarmId: string; at: number }
  | {
      type: "resolve";
      alarmId: string;
      note: string;
      retestValue: number;
      at: number;
    }
  | { type: "handover"; at: number }
  | { type: "filter"; device: string }
  | { type: "set-engineer"; engineer: string }
  | { type: "reset" };

function initialState(): AppState {
  return {
    baseDate: initialBaseDate(),
    watchSeq: INITIAL_WATCH_SEQ,
    engineer: "",
    deviceFilter: "all",
    alarms: [],
    readings: {},
    handovers: [],
  };
}

function readingKey(device: string, param: string): string {
  return `${device}::${param}`;
}

function reducer(state: AppState, action: Action): AppState {
  const ctx = { baseDate: state.baseDate, watchSeq: state.watchSeq };
  const watch = watchInfo(state.baseDate, state.watchSeq);

  switch (action.type) {
    case "sample": {
      const rule = getParamRule(action.device, action.param);
      if (!rule) return state;
      const limit = evaluateLimit(rule, action.value);
      const { alarms } = ingestSample(state.alarms, ctx, {
        device: action.device,
        param: action.param,
        unit: rule.unit,
        value: action.value,
        high: limit.high,
        inRange: limit.inRange,
        at: action.at,
        engineer: state.engineer,
      });
      const reading: Reading = {
        value: action.value,
        at: action.at,
        watchSeq: state.watchSeq,
        watchId: watch.id,
        inRange: limit.inRange,
        high: limit.high,
      };
      return {
        ...state,
        alarms,
        readings: { ...state.readings, [readingKey(action.device, action.param)]: reading },
      };
    }

    case "acknowledge": {
      return {
        ...state,
        alarms: acknowledgeAlarm(state.alarms, ctx, {
          alarmId: action.alarmId,
          at: action.at,
          engineer: state.engineer || "未署名轮机员",
        }),
      };
    }

    case "resolve": {
      const { alarms } = resolveSevereAlarm(state.alarms, ctx, {
        alarmId: action.alarmId,
        note: action.note,
        retestValue: action.retestValue,
        at: action.at,
        engineer: state.engineer || "未署名轮机员",
      });
      return { ...state, alarms };
    }

    case "handover": {
      // 门禁在页面按钮层也拦截，这里再做一次防御：有未恢复严重报警时状态不变
      if (handoverBlockers(state.alarms).length > 0) return state;
      const { record, nextSeq } = performHandover(
        state.alarms,
        ctx,
        action.at,
        state.engineer || "未署名轮机员"
      );
      return {
        ...state,
        watchSeq: nextSeq,
        handovers: [record, ...state.handovers],
      };
    }

    case "filter":
      return { ...state, deviceFilter: action.device };

    case "set-engineer":
      return { ...state, engineer: action.engineer };

    case "reset":
      return initialState();

    default:
      return state;
  }
}

/** 最小化结构校验，避免损坏的本地缓存把页面跑挂 */
function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (
      typeof parsed.baseDate !== "string" ||
      typeof parsed.watchSeq !== "number" ||
      !Array.isArray(parsed.alarms) ||
      typeof parsed.readings !== "object" ||
      parsed.readings === null ||
      !Array.isArray(parsed.handovers)
    ) {
      return initialState();
    }
    return {
      baseDate: parsed.baseDate,
      watchSeq: parsed.watchSeq,
      engineer: typeof parsed.engineer === "string" ? parsed.engineer : "",
      deviceFilter:
        typeof parsed.deviceFilter === "string" &&
        (parsed.deviceFilter === "all" ||
          PARAM_RULES.some((rule) => rule.device === parsed.deviceFilter))
          ? parsed.deviceFilter
          : "all",
      alarms: parsed.alarms as Alarm[],
      readings: parsed.readings as Record<string, Reading>,
      handovers: parsed.handovers as HandoverRecord[],
    };
  } catch {
    return initialState();
  }
}

let state: AppState = loadState();
const listeners = new Set<() => void>();

function persist(next: AppState): void {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 存储不可用时退化为内存态，页面功能仍可用（仅刷新不保留）
  }
  listeners.forEach((listener) => listener());
}

export function dispatch(action: Action): void {
  persist(reducer(state, action));
}

export function getState(): AppState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // 跨标签页 / 跨窗口本地存储同步
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY) return;
  state = loadState();
  listeners.forEach((listener) => listener());
}

export function useAppState(): AppState {
  // state 只在 dispatch / storage 事件时更换引用，故直接返回根状态即可，
  // 派生数据（过滤、映射）由页面层用 useMemo 计算，避免每次渲染产生新引用导致死循环。
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export { uid, readingKey };
