import AsyncStorage from "../utils/storage";
import eventBus from "../utils/eventBus";

const UNREAD_KEY = "wc_local_unread_v1";

let activeConvo: string | null = null;
let appInForeground = true;

export function setActiveConvo(id: string | null) {
  activeConvo = id;
}

export function setAppForeground(inForeground: boolean) {
  appInForeground = inForeground;
}

export function isConvoActive(id: string): boolean {
  // 只有「正在看这个会话且 App 在前台」才算活跃；
  // 退到后台后一律视为不在会话中，回复落地才能弹通知
  return activeConvo === id && appInForeground;
}

export async function readUnreadMap(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(UNREAD_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeUnreadMap(map: Record<string, number>) {
  await AsyncStorage.setItem(UNREAD_KEY, JSON.stringify(map));
}

export async function incrementUnread(convoId: string) {
  const map = await readUnreadMap();
  map[convoId] = (map[convoId] || 0) + 1;
  await writeUnreadMap(map);
  eventBus.emit("unread-updated");
}

export async function markConversationRead(convoId: string) {
  const map = await readUnreadMap();
  if (map[convoId]) {
    delete map[convoId];
    await writeUnreadMap(map);
    eventBus.emit("unread-updated");
  }
}

/** 标为未读：首页列表显示未读状态 */
export async function markConversationUnread(convoId: string) {
  const map = await readUnreadMap();
  map[convoId] = Math.max(map[convoId] || 0, 1);
  await writeUnreadMap(map);
  eventBus.emit("unread-updated");
}

/** 删除会话时清除未读 */
export async function clearConversationUnread(convoId: string) {
  const map = await readUnreadMap();
  if (map[convoId] != null) {
    delete map[convoId];
    await writeUnreadMap(map);
    eventBus.emit("unread-updated");
  }
}

export async function totalUnread(): Promise<number> {
  const map = await readUnreadMap();
  return Object.values(map).reduce((a, b) => a + b, 0);
}
