import AsyncStorage from "../utils/storage";

// ============================================================
// 动态未读通知：角色对用户的互动（评论/回复/点赞）产生未读，
// 显示在主页 dock 探索红点、探索页好友动态红点、动态页未读按钮。
// ============================================================

export interface MomentUnread {
  id: string;
  type: "comment" | "reply" | "like";
  roleName: string;
  content: string;
  momentId: string;
  createdAt: number;
}

const UNREAD_KEY = "wc_moments_unread_v1";

export async function getMomentsUnread(): Promise<MomentUnread[]> {
  try {
    const raw = await AsyncStorage.getItem(UNREAD_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addMomentsUnread(item: MomentUnread): Promise<void> {
  const list = await getMomentsUnread();
  list.unshift(item);
  await AsyncStorage.setItem(UNREAD_KEY, JSON.stringify(list.slice(0, 100)));
  emitUnread();
}

/** 标记单条已读 */
export async function markMomentUnreadRead(id: string): Promise<void> {
  const list = await getMomentsUnread();
  await AsyncStorage.setItem(
    UNREAD_KEY,
    JSON.stringify(list.filter((x) => x.id !== id))
  );
  emitUnread();
}

/** 全部已读 */
export async function clearMomentsUnread(): Promise<void> {
  await AsyncStorage.setItem(UNREAD_KEY, JSON.stringify([]));
  emitUnread();
}

export async function getMomentsUnreadCount(): Promise<number> {
  const list = await getMomentsUnread();
  return list.length;
}

function emitUnread() {
  try {
    const eventBus = require("../utils/eventBus").default;
    eventBus.emit("moments-unread-updated");
  } catch {}
}
