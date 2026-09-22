import type { AlarmLevel } from "../types";

/** 监测参数规则：阈值与计量单位。规则与页面、状态分开承载，新增参数只改这里 */
export interface ParamRule {
  device: string;
  param: string;
  unit: string;
  min: number;
  max: number;
  decimals: number;
  hint: string;
}

/** 设备筛选：与看板 / 异常时间线 / 历史记录共用 */
export const DEVICES = ["主机", "发电机", "泵组", "舱底水"] as const;

export const PARAM_RULES: ParamRule[] = [
  {
    device: "主机",
    param: "主机转速",
    unit: "rpm",
    min: 70,
    max: 100,
    decimals: 0,
    hint: "越限生成一般报警，下一班仍越限升级为严重",
  },
  {
    device: "主机",
    param: "滑油压力",
    unit: "MPa",
    min: 0.35,
    max: 0.6,
    decimals: 2,
    hint: "低压报警需优先排查油泵与管路",
  },
  {
    device: "主机",
    param: "冷却水温",
    unit: "℃",
    min: 65,
    max: 85,
    decimals: 0,
    hint: "超温报警需检查冷却系统",
  },
  {
    device: "发电机",
    param: "发电机冷却水温",
    unit: "℃",
    min: 60,
    max: 90,
    decimals: 0,
    hint: "",
  },
  {
    device: "发电机",
    param: "发电机滑油压力",
    unit: "MPa",
    min: 0.3,
    max: 0.55,
    decimals: 2,
    hint: "",
  },
  {
    device: "泵组",
    param: "泵组出口压力",
    unit: "MPa",
    min: 0.25,
    max: 0.6,
    decimals: 2,
    hint: "",
  },
  {
    device: "舱底水",
    param: "舱底水液位",
    unit: "%",
    min: 0,
    max: 70,
    decimals: 0,
    hint: "液位越上限需安排排水",
  },
];

export function getParamRule(device: string, param: string): ParamRule | undefined {
  return PARAM_RULES.find((rule) => rule.device === device && rule.param === param);
}

export type LimitResult =
  | { inRange: true; high: false; level: null }
  | { inRange: false; high: boolean; level: AlarmLevel };

/**
 * 评估采样值是否越限。
 * 阈值本身只负责“一般”判定；跨班升级由报警规则层处理。
 */
export function evaluateLimit(rule: ParamRule, value: number): LimitResult {
  if (value < rule.min) {
    return { inRange: false, high: false, level: "normal" };
  }
  if (value > rule.max) {
    return { inRange: false, high: true, level: "normal" };
  }
  return { inRange: true, high: false, level: null };
}

export function formatNumber(rule: ParamRule, value: number): string {
  return value.toFixed(rule.decimals);
}

/** 越限方向文案 */
export function directionText(high: boolean): string {
  return high ? "高于上限" : "低于下限";
}
