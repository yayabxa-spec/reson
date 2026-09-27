import AsyncStorage from "../utils/storage";

// ============================================================
// 角色状态：从世界线实时读取"此刻角色在做什么（activity）+ 心情（mood）"，
// 展示在聊天列表 / 聊天页顶栏 / 资料页，并注入聊天提示词。
// ============================================================

const TIMELINE_KEY = "wc_worldline_timeline_v1";
// 会话内内存缓存：世界线被多个页面高频读取（聊天页/资料页/状态页/导演），
// 避免每次都全量 JSON.parse；写入时通过 invalidateWorldlineCache 失效
let wlMemoryCache: any = undefined;

/** 读取今日世界线原始数据 */
export async function readWorldlineRaw(): Promise<any | null> {
  if (wlMemoryCache !== undefined) return wlMemoryCache;
  try {
    const raw = await AsyncStorage.getItem(TIMELINE_KEY);
    wlMemoryCache = raw ? JSON.parse(raw) : null;
  } catch {
    wlMemoryCache = null;
  }
  return wlMemoryCache;
}

/** 世界线被写入后失效缓存（由 worldline.ts 调用） */
export function invalidateWorldlineCache() {
  wlMemoryCache = undefined;
}

/** 找到角色当前时段的 slot */
function findCurrentSlot(wl: any, roleId: string): any | null {
  if (!wl || !roleId) return "";
  const friend = (wl.friends || []).find((f: any) => f.roleId === roleId);
  if (!friend) return null;
  const now = new Date();
  const n = now.getHours() * 60 + now.getMinutes();
  return (
    (friend.slots || []).find((s: any) => {
    const [sh, sm] = String(s.start || "00:00")
      .split(":")
      .map((x) => parseInt(x, 10) || 0);
    const [eh, em] = String(s.end || "00:00")
      .split(":")
      .map((x) => parseInt(x, 10) || 0);
    const st = sh * 60 + sm;
    const en = Math.max(eh * 60 + em, st + 30);
    return n >= st && n < en;
    }) || null
  );
}

/**
 * 聊天页顶栏用（窄空间）：只返回 state 极短短语；
 * 没有 state（旧数据）返回空串，顶栏不显示，绝不切 activity。
 */
export function getRoleStatusShort(wl: any, roleId: string): string {
  const slot = findCurrentSlot(wl, roleId);
  if (!slot) return "";
  if (slot.state) return String(slot.state).trim().slice(0, 12);
  return "";
}

/**
 * 完整状态（状态页 / 资料卡横幅 / 聊天提示词注入用）：
 * 始终返回完整 activity 长句（state 简写只给聊天页顶栏）。
 */
export function getRoleStatusFull(wl: any, roleId: string): string {
  const slot = findCurrentSlot(wl, roleId);
  if (!slot) return "";
  return String(slot.activity || "").trim().slice(0, 80);
}

/** 批量构建 roleId -> 状态 的映射（列表页用） */
export function buildStatusMap(
  wl: any,
  roleIds: string[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const id of roleIds) {
    const s = getRoleStatusFull(wl, id);
    if (s) map[id] = s;
  }
  return map;
}
