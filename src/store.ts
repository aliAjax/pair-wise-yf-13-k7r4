import { useSyncExternalStore } from "react";
import type { WatchState } from "./types";
import {
  acknowledgeAlarm,
  completeHandover,
  createInitialState,
  ingestSample,
  resolveCritical,
  type HandoverResult,
  type ResolveInput,
  type SampleInput,
} from "./rules";

const STORAGE_KEY = "hxyfront-62001:engine-watch:v1";

/* ----------------------------- 加载与完整性校验 ----------------------------- */

function sanitize(raw: unknown): WatchState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<WatchState>;
  if (s.version !== 1) return null;
  if (typeof s.watchIndex !== "number" || !Array.isArray(s.alarms) || !Array.isArray(s.events)) return null;
  if (typeof s.latest !== "object" || s.latest === null) return null;
  if (typeof s.filter !== "string") return null;
  return s as unknown as WatchState;
}

function load(): WatchState {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) {
      const parsed = sanitize(JSON.parse(text));
      if (parsed) return parsed;
    }
  } catch {
    /* 存储不可用时回退内存态 */
  }
  return createInitialState();
}

function persist(state: WatchState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 忽略写入失败（隐私模式等） */
  }
}

/* ------------------------------- 发布订阅容器 ------------------------------- */

let state: WatchState = load();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

function setState(next: WatchState): void {
  if (next === state) return;
  state = next;
  persist(state);
  emit();
}

export const store = {
  getState(): WatchState {
    return state;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    // 其他标签页写入 storage 时同步本页
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
  setFilter(filter: string): void {
    setState({ ...state, filter });
  },
  sample(input: SampleInput): string | null {
    const { state: next, result } = ingestSample(state, input);
    setState(next);
    return result.ok ? null : result.error ?? "采样失败";
  },
  acknowledge(alarmId: string): void {
    setState(acknowledgeAlarm(state, alarmId));
  },
  resolveCritical(alarmId: string, input: ResolveInput): string | null {
    const { state: next, error } = resolveCritical(state, alarmId, input);
    if (error) return error;
    setState(next);
    return null;
  },
  handover(remark: string): HandoverResult {
    const { state: next, result } = completeHandover(state, remark);
    if (!result.ok) return result;
    setState(next);
    return result;
  },
  reset(): void {
    setState(createInitialState());
  },
};

function onStorage(e: StorageEvent): void {
  if (e.key !== STORAGE_KEY || !e.newValue) return;
  try {
    const parsed = sanitize(JSON.parse(e.newValue));
    if (parsed) {
      state = parsed;
      emit();
    }
  } catch {
    /* 忽略无法解析的外部写入 */
  }
}

/** 状态订阅 hook：报警、时间线、班次与本地存储始终同源 */
export function useWatchState<T>(selector: (s: WatchState) => T): T {
  // getSnapshot 必须返回引用稳定的值（state 仅在真实变更时换引用），
  // selector 的派生结果放在渲染阶段计算，避免新数组触发无限重渲染
  const s = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return selector(s);
}
