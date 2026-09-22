/**
 * 班次规则。
 * 六班循环：00-04 / 04-08 / 08-12 / 12-16 / 16-20 / 20-24。
 * watchSeq 是跨天递增的逻辑序号，用于判断“本班 / 下一班”；watchId 用于展示与留痕。
 */

export const SHIFT_LABELS = ["00-04班", "04-08班", "08-12班", "12-16班", "16-20班", "20-24班"] as const;

export const SHIFTS_PER_DAY = SHIFT_LABELS.length;

/** 首班锚点：从系统当天的 08-12班 开始值班 */
export function initialBaseDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

export const INITIAL_WATCH_SEQ = 2; // 08-12班 在循环中的序号

function toDate(baseDate: string): Date {
  const [y, m, d] = baseDate.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export interface WatchInfo {
  seq: number;
  id: string;
  label: string;
  dayOffset: number;
  date: string;
  shiftIndex: number;
}

export function watchInfo(baseDate: string, seq: number): WatchInfo {
  const dayOffset = Math.floor(seq / SHIFTS_PER_DAY);
  const shiftIndex = ((seq % SHIFTS_PER_DAY) + SHIFTS_PER_DAY) % SHIFTS_PER_DAY;
  const date = new Date(toDate(baseDate));
  date.setDate(date.getDate() + dayOffset);
  const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
  return {
    seq,
    id: `${dateText} ${SHIFT_LABELS[shiftIndex]}`,
    label: SHIFT_LABELS[shiftIndex],
    dayOffset,
    date: dateText,
    shiftIndex,
  };
}

export function nextWatch(baseDate: string, seq: number): WatchInfo {
  return watchInfo(baseDate, seq + 1);
}
