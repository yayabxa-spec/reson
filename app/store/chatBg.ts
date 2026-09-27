import AsyncStorage from "../utils/storage";
import eventBus from "../utils/eventBus";

/**
 * 自定义聊天背景：
 * - 全局默认一张（浅色/深色各一档），会话可单独覆盖
 * - 类型：图片（相册 URI）/ 纯色 / 渐变
 * - 原图直接铺（不做遮罩），可读性由用户选图决定（需求确认）
 */

export type ChatBg =
  | { type: "image"; uri: string }
  | { type: "color"; value: string }
  | { type: "gradient"; from: string; to: string };

export type ChatBgMode = "light" | "dark";

interface ConvoBgSlot {
  light?: ChatBg | null;
  dark?: ChatBg | null;
}

interface ChatBgMap {
  globalLight?: ChatBg | null;
  globalDark?: ChatBg | null;
  convos?: Record<string, ConvoBgSlot>;
}

const CHAT_BG_KEY = "wc_chat_bg_v1";

function slotFor(map: ChatBgMap, mode: ChatBgMode): ChatBg | null | undefined {
  return mode === "dark" ? map.globalDark : map.globalLight;
}

/** 读取完整配置（低频调用） */
export async function readChatBgMap(): Promise<ChatBgMap> {
  try {
    const raw = await AsyncStorage.getItem(CHAT_BG_KEY);
    return raw ? { ...JSON.parse(raw) } : {};
  } catch {
    return {};
  }
}

async function writeChatBgMap(map: ChatBgMap) {
  await AsyncStorage.setItem(CHAT_BG_KEY, JSON.stringify(map));
}

/**
 * 解析某会话当前应显示的背景：会话覆盖优先，其次全局，都没有返回 null。
 * convoId 为空（全局预览）时只看全局。
 */
export async function resolveChatBg(
  convoId?: string,
  mode: ChatBgMode = "light"
): Promise<ChatBg | null> {
  const map = await readChatBgMap();
  if (convoId && map.convos) {
    const slot = map.convos[convoId]?.[mode];
    if (slot !== undefined) return slot || null;
  }
  return slotFor(map, mode) || null;
}

/** 会话是否单独设置过背景（设置页显示"恢复默认"用） */
export async function hasConvoOverride(
  convoId: string,
  mode: ChatBgMode
): Promise<boolean> {
  const map = await readChatBgMap();
  return !!map.convos && map.convos[convoId]?.[mode] !== undefined;
}

/** 设置全局默认背景；bg 传 null 表示清除 */
export async function setGlobalChatBg(mode: ChatBgMode, bg: ChatBg | null) {
  const map = await readChatBgMap();
  if (mode === "dark") map.globalDark = bg;
  else map.globalLight = bg;
  await writeChatBgMap(map);
  eventBus.emit("chat-bg-updated", { convoId: undefined });
}

/** 设置会话专属背景；bg 传 null 表示清除覆盖（回落到全局） */
export async function setConvoChatBg(
  convoId: string,
  mode: ChatBgMode,
  bg: ChatBg | null
) {
  const map = await readChatBgMap();
  if (!map.convos) map.convos = {};
  const slot: ConvoBgSlot = { ...(map.convos[convoId] || {}) };
  if (mode === "dark") slot.dark = bg;
  else slot.light = bg;
  map.convos[convoId] = slot;
  await writeChatBgMap(map);
  eventBus.emit("chat-bg-updated", { convoId });
}

/** 预设纯色/渐变（设置页直接选用） */
export const CHAT_BG_PRESET_COLORS = [
  "#F7F7F7",
  "#EFEFEF",
  "#E8F3EC",
  "#E7EEF9",
  "#F5EDF7",
  "#FFF6E5",
  "#2B2B2B",
  "#1C2431",
];

export const CHAT_BG_PRESET_GRADIENTS: { from: string; to: string }[] = [
  { from: "#DFF3E9", to: "#F7FBF4" },
  { from: "#DCE9FB", to: "#F6F9FE" },
  { from: "#F6E7F6", to: "#FDF6FD" },
  { from: "#FDEED8", to: "#FFF9EE" },
  { from: "#2C3E50", to: "#4CA1AF" },
  { from: "#1A2980", to: "#26D0CE" },
];
