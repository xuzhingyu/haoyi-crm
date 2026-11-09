import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { CurrentUser, PortalApi } from "./api/types";

export const WorkspaceContext = createContext<{ api: PortalApi; user: CurrentUser; notify: (message: string, error?: boolean) => void } | null>(null);
export function useWorkspace() { const value = useContext(WorkspaceContext); if (!value) throw new Error("工作台尚未初始化"); return value; }
export function useLoad<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) { setLoading(true); setError(""); } });
    loader().then((result) => { if (active) setData(result); }).catch((reason: unknown) => { if (active) setError(errorText(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loader, version]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { data, loading, error, reload };
}
export function errorText(error: unknown) { return error instanceof Error ? error.message : "操作未完成，请稍后重试"; }
export function dateTime(value: string | null | undefined, full = false) {
  if (!value) return "未提供";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未提供";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", ...(full ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(date);
}
export function safeUrl(value: string) { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } }
export function money(value: number | string | null | undefined) { return value == null || !Number.isFinite(Number(value)) ? "—" : `¥${Number(value).toFixed(2)}`; }
export const topics: Record<string, string> = { "新能源售后": "新能源售后", "三电维修": "三电维修", "车险理赔": "车险与理赔", "保险科技": "保险科技", "维修服务网络": "维修服务网络" };
export const stages: Record<string, string> = { none: "未推进", connected: "已沟通", qualified: "有意向", proposal: "方案报价", won: "已成交", lost: "已关闭" };
export const categoryLabels: Record<string, string> = { comprehensive_repair: "综合维修", quick_maintenance: "快修保养", tire_electrical: "轮胎电器", beauty_maintenance: "美容养护" };
export function statusLabel(value: string) { return ({ succeeded: "已完成", settled: "已结算", reserved: "已预留", queued: "排队中", pending: "待确认", not_connected: "待接入", connected: "已连接", not_verified: "待验证", running: "进行中", researching: "研究中", completed: "已完成", done: "已完成", failed: "未完成", cancelled: "已停止", blocked: "等待处理", paused: "已暂停", active: "已启用", error: "连接异常", unavailable: "未接通", configured: "已配置", ready: "已就绪", not_configured: "未配置", confirmed: "已确认", rejected: "已拒绝", in_progress: "进行中", open: "待办", budget_exceeded: "额度不足" } as Record<string, string>)[value] ?? value; }
export function isRunning(status: string) { return ["queued", "pending", "running", "researching", "scheduled"].includes(status); }


export function sourceNatureLabel(nature?:string) { return nature === "official" ? "官方" : nature === "industry" ? "行业" : nature === "media" ? "媒体" : nature === "internal" ? "内部汇总" : "待核对"; }
