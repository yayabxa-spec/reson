import AsyncStorage from "../utils/storage";
import eventBus from "../utils/eventBus";

// ============================================================
// 用户状态：我的页面发一个"状态"（分类 + 文字 + 自定义时长），
// 到期自动消失；有效期内注入角色聊天/主动消息提示词，让角色看到。
// ============================================================

const KEY = "wc_user_status_v1";

export interface UserStatus {
  text: string;
  category: string; // 忙碌 / 放松 / 心情 / 自定义
  expiresAt: number;
}

const subs = new Set<() => void>();

function notify() {
  subs.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export function subscribeUserStatus(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/** 设置/更新状态；durationHours 为时长（小时），到期自动消失 */
export async function setUserStatus(
  text: string,
  category: string,
  durationHours: number
): Promise<void> {
  const hours = Math.min(168, Math.max(1, Math.round(durationHours) || 24));
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      text,
      category,
      expiresAt: Date.now() + hours * 3600 * 1000,
    })
  );
  notify();
}

/** 清除状态 */
export async function clearUserStatus(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
  notify();
}

/** 读取当前状态；已过期返回 null 并自动清除 */
export async function getUserStatus(): Promise<UserStatus | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.text || !s?.expiresAt) return null;
    if (Date.now() >= s.expiresAt) {
      await AsyncStorage.removeItem(KEY);
      return null;
    }
    return {
      text: String(s.text),
      category: String(s.category || "自定义"),
      expiresAt: Number(s.expiresAt),
    };
  } catch {
    return null;
  }
}

/** 剩余小时数（展示用，最少 1） */
export function statusRemainHours(s: UserStatus | null): number {
  if (!s) return 0;
  return Math.max(1, Math.round((s.expiresAt - Date.now()) / 3600000));
}

/** 注入提示词：让角色知道用户此刻的状态（仅未过期时） */
export async function userStatusPromptLine(): Promise<string> {
  const s = await getUserStatus();
  if (!s) return "";
  return `\n\n【用户此刻的状态】${s.text}（这是用户主动发布的状态，自然关注/回应它，不要生硬提及"状态"二字）`;
}
