import AsyncStorage from "../utils/storage";

export interface FavoriteMsg {
  id: string;
  convoId: string;
  roleName: string;
  msgId: string;
  content: string;
  audio?: string; // 语音消息的本地音频（收藏时保留，播放不重新合成）
  createdAt: number;
}

const KEY = "wc_local_favorites_v1";

export async function readFavorites(): Promise<FavoriteMsg[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeFavorites(list: FavoriteMsg[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

/** 收藏一条消息（同一会话同一消息只收藏一次） */
export async function addFavorite(
  f: Omit<FavoriteMsg, "id" | "createdAt">
): Promise<boolean> {
  const list = await readFavorites();
  if (list.some((x) => x.convoId === f.convoId && x.msgId === f.msgId)) {
    return false;
  }
  list.unshift({
    ...f,
    id: "fav-" + Date.now() + Math.floor(Math.random() * 1000),
    createdAt: Date.now(),
  });
  await writeFavorites(list);
  return true;
}

/** 旧收藏语音回填：从原消息找回本地音频引用 */
export async function updateFavoriteAudio(id: string, audio: string) {
  const list = await readFavorites();
  const next = list.map((f) =>
    f.id === id && !f.audio ? { ...f, audio } : f
  );
  if (next.some((f, i) => f !== list[i])) {
    await writeFavorites(next);
  }
}

export async function removeFavorite(id: string) {
  const list = await readFavorites();
  await writeFavorites(list.filter((x) => x.id !== id));
}

export async function clearFavorites() {
  await AsyncStorage.removeItem(KEY);
}
