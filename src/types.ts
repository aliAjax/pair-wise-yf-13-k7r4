/**
 * 船舶轮机值班报警闭环领域模型。
 * 状态、规则与页面分开承载：本文件只描述数据结构，不含任何界面逻辑。
 */

/** 报警级别：活动报警默认 normal（一般），跨班复测仍越限后升级为 severe（严重），且不再回落 */
export type AlarmLevel = "normal" | "severe";

/**
 * active       活动且待本班确认（出现在“本班提示”）
 * acknowledged 本班已确认，提示关闭但报警仍留在看板
 * recovered    一般报警采样恢复正常后自动关闭
 * closed       严重报警补录处理说明与复测值后闭环消除
 */
export type AlarmStatus = "active" | "acknowledged" | "recovered" | "closed";

export type AlarmEventType =
  | "created"
  | "sample"
  | "acknowledged"
  | "reactivated"
  | "recovered"
  | "closed";

/** 一次轮机员确认记录，按班次留痕（确认只关闭本班提示） */
export interface AckRecord {
  watchSeq: number;
  watchId: string;
  at: number;
  engineer: string;
}

/** 异常时间线条目：报警生命周期只追加、不改写原记录 */
export interface AlarmEvent {
  id: string;
  type: AlarmEventType;
  at: number;
  watchSeq: number;
  watchId: string;
  value?: number;
  high?: boolean;
  inRange?: boolean;
  level?: AlarmLevel;
  note?: string;
  engineer?: string;
}

export interface Alarm {
  id: string;
  device: string;
  param: string;
  unit: string;
  level: AlarmLevel;
  status: AlarmStatus;
  /** 最近一次越限方向：true 越上限 / false 越下限 */
  high: boolean;
  createdAt: number;
  firstWatchSeq: number;
  firstWatchId: string;
  /** 当前激活所在班次：跨班后由下一班越限采样推动重新激活 */
  activeWatchSeq: number;
  activeWatchId: string;
  lastValue: number;
  lastAt: number;
  sampleCount: number;
  acks: AckRecord[];
  escalatedAt?: number;
  escalatedWatchSeq?: number;
  escalatedWatchId?: string;
  /** 升级严重后补录的处理说明与复测值（闭环前置条件） */
  handlingNote?: string;
  retestValue?: number;
  retestAt?: number;
  closedAt?: number;
  closedWatchSeq?: number;
  closedWatchId?: string;
  events: AlarmEvent[];
}

/** 参数看板上每一项的最近一次采样（含正常与越限） */
export interface Reading {
  value: number;
  at: number;
  watchSeq: number;
  watchId: string;
  inRange: boolean;
  high: boolean;
}

export interface HandoverCarried {
  device: string;
  param: string;
  level: AlarmLevel;
  status: AlarmStatus;
}

/** 交接班记录：完成交接时快照移交的未关闭报警 */
export interface HandoverRecord {
  id: string;
  at: number;
  fromWatchSeq: number;
  fromWatchId: string;
  toWatchSeq: number;
  toWatchId: string;
  engineer: string;
  carried: HandoverCarried[];
}
