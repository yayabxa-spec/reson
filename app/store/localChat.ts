import AsyncStorage, { withStorageLock } from "../utils/storage";
import { devWarning } from "../utils/devLog";
import { useCallback } from "react";
import {
  sqlAppendMessage,
  sqlDeleteConvoMessages,
  sqlDeleteMessage,
  sqlReadAllMessagesMap,
  sqlReadRole,
  sqlReadMessages,
  sqlUpdateMessageContent,
  sqlUpdateMessageImages,
  sqlAddRolePhoto,
  sqlReadRoleState,
  sqlWriteRoleState,
} from "./appDb";
import {
  readComfySettings,
  generateComfyImage,
  type ComfySettings,
} from "./comfyui";
import { atom, useRecoilState } from "recoil";
import type { AIConfig } from "../utils/ai";
import {
  chatCompletion,
  chatCompletionWithTools,
  ToolCallInfo,
} from "../utils/ai";
import eventBus from "../utils/eventBus";
import {
  retrieveMemories,
  maybeAutoExtract,
  formatMemoriesBlock,
  getCoreProfile,
  formatCoreBlock,
  appendMemory,
  deleteMemoriesBySourceMsgIds,
} from "./memory";
import { retrieveKnowledgeBlock } from "./knowledge";
import { retrieveRoleBackground } from "./roleKnowledge";
import {
  readWorldlineRaw,
  getRoleStatusFull,
} from "./roleStatus";
import { userStatusPromptLine } from "./userStatus";
import { buildAppTools } from "./tools";
import {
  fillTemplate,
  PROMPT_DEFAULTS,
  resolvePrompt,
} from "./promptEditing";
import {
  proactiveInstruction,
  parseProactiveTag,
  stripProactiveTag,
  scheduleProactive,
  cancelProactive,
  parseUserWait,
} from "./proactive";
import { markUserReplied, scheduleConversationFollowUp } from "./worldline";
import {
  notifyNewMessage,
  requestNotificationPermission,
} from "./notifications";
import { incrementUnread, isConvoActive, clearConversationUnread } from "./unread";
import {
  resolveRoleConfig,
  RoleModelBindings,
} from "./models";
import { cleanChatText } from "../utils/sanitize";
import { readProfile, genderHint } from "./profile";
import type { RoleVoice } from "./roles";
import {
  persistVoiceAudio,
  resolveVoiceForEmotion,
  synthTTS,
} from "../utils/ttson";
import { logEvent } from "../utils/logCollector";
import * as FileSystem from "expo-file-system/legacy";

export interface LocalMsg {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  audio?: string; // 语音消息音频（优先本地文件，兼容旧版远程 URL）
  image?: string; // 图片消息本地 URI（用户发送的图片，旧字段）
  images?: string[]; // 图片消息本地 URI 数组（多图 / AI 生图）
  thinking?: string; // AI 思考链（<think> 或 reasoning_content 捕获，供回看/导出）
  createdAt: number;
  senderName?: string; // 群聊中该条消息的发送角色名
  replyTo?: { content: string; senderName?: string }; // 引用回复的原消息
}

export interface GroupMemberInfo {
  roleId: string;
  name: string;
  avatar?: string;
  persona: string;
  callName?: string;
  modelIds?: RoleModelBindings;
  temperature?: number;
  examples?: { role: "user" | "assistant"; content: string }[];
}

export interface LocalConvo {
  id: string;
  title: string;
  groupName?: string;
  lastMessage: string;
  updatedAt: number;
  pinned?: boolean;
  hidden?: boolean; // 不显示该聊天（首页列表隐藏，聊天记录保留）
  muted?: boolean; // 消息免打扰（不弹通知不响铃，保留红点未读）
  remark?: string; // 备注名（显示名称，角色原名保留在 roleName）
  summary?: string; // 更早对话的自动摘要（中期记忆）
  summaryMsgCount?: number; // 已纳入摘要的消息数
  roleId?: string;
  roleName?: string;
  roleCallName?: string;
  rolePersona?: string;
  roleStoryState?: string; // 角色当前剧情状态
  roleBackground?: import("./builtin/types").RoleBackgroundItem[]; // 角色详细资料
  roleAvatar?: string;
  roleExamples?: { role: "user" | "assistant"; content: string }[];
  roleTemperature?: number;
  roleContextRounds?: number;
  roleModelIds?: { text?: string; image?: string; voice?: string };
  roleVoice?: RoleVoice; // 角色绑定音色
  isGroup?: boolean;
  memberRoleIds?: string[];
  memberNames?: string[];
  memberInfos?: GroupMemberInfo[];
  /** 群聊角色互聊最大轮数（默认 6，0 表示关闭互聊） */
  maxInterChatRounds?: number;
  /** 群名是否为自动拼接（加人时自动更新，用户改过名后不再自动改） */
  autoTitle?: boolean;
}

const CONVO_KEY = "wc_local_conversations";
const RECALL_KEY = "wc_voice_recall_count_v1"; // convoId -> 上次自然回忆时的消息数
// v2：切换为测试用 API（ai.xunlian.co / gpt-5.2）
const CONFIG_KEY = "wc_local_ai_configs_v3";
const ACTIVE_KEY = "wc_local_ai_active_id_v3";
const LEGACY_CONFIG_KEY = "wc_local_ai_config_v2";

// 上下文压缩参数（中期摘要）
const COMPRESS_MIN_MESSAGES = 20; // 至少这么多条消息才考虑压缩
const COMPRESS_TOKEN_THRESHOLD = 4000; // 估算 token 超过该值触发压缩
const COMPRESS_RECENT = 20; // 保留最近的原始消息数（长上下文模型：近层 20 条原文 + 中层滚动摘要）
const RE_SUMMARIZE_GAP = 10; // 距离上次摘要新增至少这么多条才重新摘要

/**
 * 会话索引不再存角色人设副本（避免每个好友一份大字段撑爆 KV 存储），
 * 聊天/世界线需要角色上下文时按 roleId 从角色卡 SQLite 补全。
 * 旧数据（convo 已带 rolePersona）直接使用，新数据走角色卡查询。
 */
export async function resolveConvoRoleContext(
  convo: LocalConvo
): Promise<Partial<LocalConvo> | null> {
  if (convo.rolePersona) {
    return {
      rolePersona: convo.rolePersona,
      roleStoryState: convo.roleStoryState,
      roleBackground: convo.roleBackground,
      roleExamples: convo.roleExamples,
      roleAvatar: convo.roleAvatar,
      roleTemperature: convo.roleTemperature,
      roleContextRounds: convo.roleContextRounds,
      roleModelIds: convo.roleModelIds,
      roleVoice: convo.roleVoice,
    };
  }
  if (!convo.roleId) return null;
  try {
    const r = await sqlReadRole(convo.roleId);
    if (!r) return null;
    return {
      rolePersona: r.persona || undefined,
      roleStoryState: r.storyState || undefined,
      roleBackground: r.background || undefined,
      roleExamples: r.examples || undefined,
      roleAvatar: r.avatar || undefined,
      roleTemperature: r.temperature,
      roleContextRounds: r.contextRounds,
      roleModelIds: r.modelIds || undefined,
      roleVoice: (r as any).voice || undefined,
    };
  } catch {
    return null;
  }
}

/** 粗略估算 token 数：中文按字、英文按 3 字符 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text || "") {
    if (/[\u4e00-\u9fa5]/.test(ch)) cjk++;
    else if (ch.trim()) other++;
  }
  return Math.ceil(cjk + other / 3);
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  apiDomain: "",
  apiKey: "",
  model: "",
  name: "配置 1",
  provider: "custom",
};

export const PROVIDER_PRESETS: {
  id: NonNullable<AIConfig["provider"]>;
  label: string;
  apiDomain: string;
}[] = [
  { id: "deepseek", label: "DeepSeek", apiDomain: "https://api.deepseek.com" },
  {
    id: "siliconflow",
    label: "硅基流动",
    apiDomain: "https://api.siliconflow.cn/v1",
  },
  { id: "custom", label: "自定义", apiDomain: "" },
];

export const DEFAULT_CONVO_TITLE = "AI 助手";

const localConversationsState = atom<LocalConvo[]>({
  key: "localConversations",
  default: [],
});

const localMessagesState = atom<{ [convoId: string]: LocalMsg[] }>({
  key: "localMessages",
  default: {},
});

const aiConfigState = atom<AIConfig[]>({
  key: "aiConfigs",
  default: [DEFAULT_AI_CONFIG],
});

const activeConfigIdState = atom<string>({
  key: "activeConfigId",
  default: "",
});

// ---------------- 模块级存储（每次读写都从 AsyncStorage 取最新，避免闭包脏数据） ----------------

export async function readConversationsRaw(): Promise<LocalConvo[]> {
  try {
    const raw = await AsyncStorage.getItem(CONVO_KEY);
    const list: LocalConvo[] = raw ? JSON.parse(raw) : [];
    // 置顶会话排在最前
    return list.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  } catch {
    return [];
  }
}

export async function writeConversationsRaw(list: LocalConvo[]) {
  await AsyncStorage.setItem(CONVO_KEY, JSON.stringify(list));
}

export async function readMessagesRaw(): Promise<{ [convoId: string]: LocalMsg[] }> {
  // 消息存储已迁移到 SQLite（wc_app.db）
  return (await sqlReadAllMessagesMap()) as { [convoId: string]: LocalMsg[] };
}

export async function readMessages(convoId: string): Promise<LocalMsg[]> {
  return (await sqlReadMessages(convoId)) as LocalMsg[];
}

export async function appendMessageToStorage(convoId: string, msg: LocalMsg) {
  await withStorageLock(async () => {
    msg.content = cleanChatText(msg.content || "");
    await sqlAppendMessage(convoId, msg as any);
    await touchConversationRaw(convoId, msg.content);
  });
}

/** 收到一条来自角色的消息：写入 + （不在当前会话时）计未读 + 弹通知（免打扰会话只计未读不弹通知） */
async function appendIncomingMessage(
  convoId: string,
  msg: LocalMsg,
  title: string
) {
  msg.content = cleanChatText(msg.content || "");
  await appendMessageToStorage(convoId, msg);
  unhideConversation(convoId).catch(() => {}); // 新消息让隐藏会话重新出现
  if (!isConvoActive(convoId)) {
    incrementUnread(convoId).catch(() => {});
    try {
      const convos = await readConversationsRaw();
      const muted = convos.find((c) => c.id === convoId)?.muted;
      if (!muted) {
        notifyNewMessage(
          title,
          (msg.content || "").slice(0, 80),
          convoId,
          msg.id
        ).catch(() => {});
      }
    } catch {
      // 读取免打扰状态失败时按未静音处理，保证通知不丢
      notifyNewMessage(
        title,
        (msg.content || "").slice(0, 80),
        convoId,
        msg.id
      ).catch(() => {});
    }
  }
}

/** 把 TTS 临时链接下载到应用本地目录，避免链接过期/流式导致无法播放或拿不到时长 */
/** 清空某个会话的全部消息 */
export async function clearConversationMessages(convoId: string) {
  await withStorageLock(async () => {
    await sqlDeleteConvoMessages(convoId);
    const list = await readConversationsRaw();
    const next = list.map((c) =>
      c.id === convoId
        ? { ...c, lastMessage: "", updatedAt: Date.now() }
        : c
    );
    await writeConversationsRaw(next);
    emitChatUpdate(convoId);
  });
}

/** 拍一拍：双击聊天页角色头像触发。我拍角色 → 角色收到后按性格回复（可拍回来） */
export async function patRole(
  convoId: string,
  roleName: string,
  patReply?: string
) {
  try {
    const content = patReply
      ? `我拍了拍${roleName}的${patReply}`
      : `我拍了拍${roleName}`;
    await appendMessageToStorage(convoId, {
      id: "pat" + Date.now() + Math.floor(Math.random() * 1000),
      role: "system",
      content,
      createdAt: Date.now(),
    });
    emitChatUpdate(convoId);
    const config = await readActiveAIConfig();
    await sendLocalMessage(convoId, content, config, { patEvent: content });
  } catch (e) {
    devWarning("localChat", `patRole ${e}`);
  }
}

/** 置顶 / 取消置顶会话 */
export async function setConversationPinned(
  convoId: string,
  pinned: boolean
) {
  await withStorageLock(async () => {
    const list = await readConversationsRaw();
    const next = list.map((c) =>
      c.id === convoId ? { ...c, pinned } : c
    );
    await writeConversationsRaw(next);
    emitChatUpdate(convoId);
  });
}

/** 消息免打扰开关：开启后不弹通知横幅、不响铃，但保留列表红点未读 */
export async function setConversationMuted(
  convoId: string,
  muted: boolean
) {
  await withStorageLock(async () => {
    const list = await readConversationsRaw();
    const next = list.map((c) =>
      c.id === convoId ? { ...c, muted } : c
    );
    await writeConversationsRaw(next);
    emitChatUpdate(convoId);
  });
}

/** 不显示该聊天：从首页列表移除，保留聊天记录 */
export async function hideConversation(convoId: string) {
  await withStorageLock(async () => {
    const list = await readConversationsRaw();
    const next = list.map((c) =>
      c.id === convoId ? { ...c, hidden: true } : c
    );
    await writeConversationsRaw(next);
    emitChatUpdate(convoId);
  });
}

/** 恢复显示被隐藏的会话（从通讯录进入聊天时自动调用） */
export async function unhideConversation(convoId: string) {
  await withStorageLock(async () => {
    const list = await readConversationsRaw();
    const convo = list.find((c) => c.id === convoId);
    if (!convo || !convo.hidden) return;
    const next = list.map((c) =>
      c.id === convoId ? { ...c, hidden: false } : c
    );
    await writeConversationsRaw(next);
    emitChatUpdate(convoId);
  });
}

/** 删除会话：移除会话与聊天记录（记忆保留） */
export async function deleteConversation(convoId: string) {
  await withStorageLock(async () => {
    const list = await readConversationsRaw();
    const next = list.filter((c) => c.id !== convoId);
    await writeConversationsRaw(next);
    await sqlDeleteConvoMessages(convoId);
    await clearConversationUnread(convoId);
    cancelProactive(convoId).catch(() => {});
    emitChatUpdate(convoId);
  });
}

// ---------------- 消息撤回（仅用户自己的消息，发出 2 分钟内） ----------------

const RECALL_WINDOW_MS = 2 * 60 * 1000;
const RECALL_EDIT_KEY = "wc_recall_edit_v1"; // recallMsgId -> { convoId, content, ts }
const RECALL_EDIT_TTL = 10 * 60 * 1000; // "重新编辑"保留 10 分钟

export interface RecallResult {
  ok: boolean;
  reason?: string;
  /** 撤回的原文（供输入框"重新编辑"取回文字） */
  content?: string;
}

/** 保存撤回后可"重新编辑"的文字（过期自动清理） */
async function saveRecallEdit(
  recallMsgId: string,
  convoId: string,
  content: string
) {
  try {
    const raw = await AsyncStorage.getItem(RECALL_EDIT_KEY);
    const map: Record<
      string,
      { convoId: string; content: string; ts: number }
    > = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    for (const k of Object.keys(map)) {
      if (now - map[k].ts > RECALL_EDIT_TTL) delete map[k];
    }
    map[recallMsgId] = { convoId, content, ts: now };
    await AsyncStorage.setItem(RECALL_EDIT_KEY, JSON.stringify(map));
  } catch { /* non-critical */ }
}

/** 读取某条撤回提示对应的可重编文字（无/过期返回空） */
export async function readRecallEdit(recallMsgId: string): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(RECALL_EDIT_KEY);
    const map: Record<string, { content: string; ts: number }> = raw
      ? JSON.parse(raw)
      : {};
    const e = map[recallMsgId];
    if (!e || Date.now() - e.ts > RECALL_EDIT_TTL) return "";
    return e.content || "";
  } catch {
    return "";
  }
}

/** 判断一条消息当前是否可撤回（自己发的 + 2 分钟内） */
export function canRecallMessage(msg?: LocalMsg | null): boolean {
  if (!msg) return false;
  return (
    msg.role === "user" && Date.now() - msg.createdAt <= RECALL_WINDOW_MS
  );
}

/**
 * 撤回一条自己发出的消息（彻底遗忘）：
 * 1. 从 SQLite 删除原消息，插入"你撤回了一条消息"系统提示
 *    （AI 上下文不含 system 消息，等于 AI 无感知）
 * 2. 删除该角色记忆库中以这条消息为来源的记忆
 * 3. 撤回的是最后一条时，同步会话列表预览
 */
export async function recallLocalMessage(
  convoId: string,
  msgId: string
): Promise<RecallResult> {
  let result: RecallResult = { ok: false, reason: "消息不存在" };
  await withStorageLock(async () => {
    const msgs = (await sqlReadMessages(convoId)) as LocalMsg[];
    const target = msgs.find((m) => m.id === msgId);
    if (!target) return;
    if (target.role !== "user") {
      result = { ok: false, reason: "只能撤回自己发送的消息" };
      return;
    }
    if (Date.now() - target.createdAt > RECALL_WINDOW_MS) {
      result = { ok: false, reason: "发出超过 2 分钟，无法撤回" };
      return;
    }
    const content = target.content || "";
    await sqlDeleteMessage(convoId, msgId);
    const recallMsgId = "recall-" + msgId;
    await sqlAppendMessage(convoId, {
      id: recallMsgId,
      role: "system",
      content: "你撤回了一条消息",
      createdAt: Date.now(),
    } as any);
    // 记忆清理：删除以该消息为来源的记忆（撤回即遗忘）
    try {
      const convos = await readConversationsRaw();
      const roleId = convos.find((c) => c.id === convoId)?.roleId;
      if (roleId) {
        deleteMemoriesBySourceMsgIds(roleId, [msgId]).catch(() => {});
      }
    } catch { /* non-critical */ }
    // 撤回的是最后一条时更新列表预览
    const last = msgs[msgs.length - 1];
    if (last?.id === msgId) {
      await touchConversationRaw(convoId, "你撤回了一条消息");
    }
    if (content.trim()) {
      await saveRecallEdit(recallMsgId, convoId, content);
    }
    emitChatUpdate(convoId);
    result = { ok: true, content };
  });
  return result;
}

/** 保存会话摘要 */
async function updateConversationSummary(
  convoId: string,
  summary: string,
  summaryMsgCount: number
) {
  await withStorageLock(async () => {
    const list = await readConversationsRaw();
    const next = list.map((c) =>
      c.id === convoId
        ? { ...c, summary, summaryMsgCount }
        : c
    );
    await writeConversationsRaw(next);
  });
}

/** 让 AI 把一段对话压缩成简洁摘要 */
async function extractConversationSummary(
  config: AIConfig,
  title: string,
  messages: { role: string; content: string }[],
  roleId?: string
): Promise<string> {
  const text = messages
    .map((m) => `${m.role === "user" ? "用户" : title}：${m.content}`)
    .join("\n")
    .slice(-8000);
  if (!text.trim()) return "";
  const prompt = fillTemplate(await resolvePrompt("summary"), {
    标题: title,
    对话: text,
  });
  const reply = await chatCompletion(
    config,
    [{ role: "user", content: prompt }],
    { temperature: 0.3, maxTokens: 800, roleId, scene: "对话摘要" }
  );
  return reply
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim()
    .slice(0, 1200);
}

/** 增量合并：把新对话合并进已有剧情梗概（避免反复全量总结） */
async function mergeConversationSummary(
  config: AIConfig,
  title: string,
  oldSummary: string,
  messages: { role: string; content: string }[],
  roleId?: string
): Promise<string> {
  const text = messages
    .map((m) => `${m.role === "user" ? "用户" : title}：${m.content}`)
    .join("\n")
    .slice(-6000);
  if (!text.trim()) return "";
  const prompt = fillTemplate(
    await resolvePrompt("summaryMerge", PROMPT_DEFAULTS.summaryMerge),
    {
      角色名: title,
      旧摘要: oldSummary.slice(0, 8000),
      新对话: text,
    }
  );
  try {
    const reply = await chatCompletion(
      config,
      [{ role: "user", content: prompt }],
      { temperature: 0.3, maxTokens: 1200, roleId, scene: "对话摘要" }
    );
    return reply
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim()
      .slice(0, 2000);
  } catch {
    return "";
  }
}

/** 对话超长时，把早期消息压缩成摘要存进会话（中期记忆） */
async function maybeCompressConversation(
  convoId: string,
  config: AIConfig
) {
  try {
    const messages = await readMessages(convoId);
    if (messages.length < COMPRESS_MIN_MESSAGES) return;
    const convos = await readConversationsRaw();
    const convo = convos.find((c) => c.id === convoId);
    if (!convo) return;
    const tokens = messages.reduce(
      (sum, m) => sum + estimateTokens(m.content || ""),
      0
    );
    if (tokens < COMPRESS_TOKEN_THRESHOLD) return;
    const older = messages.slice(0, messages.length - COMPRESS_RECENT);
    if (!older.length) return;
    const summarizedCount = convo.summaryMsgCount || 0;
    // 只摘要自上次以来新产生的部分，与旧梗概增量合并
    const delta = older.slice(summarizedCount);
    if (delta.length < RE_SUMMARIZE_GAP) return;
    const title = convo.roleName || convo.title || "角色";
    const deltaMsgs = delta.filter((m) => m.role !== "system");
    const summary = convo.summary?.trim()
      ? await mergeConversationSummary(
          config,
          title,
          convo.summary,
          deltaMsgs,
          convo.roleId
        )
      : await extractConversationSummary(
          config,
          title,
          deltaMsgs,
          convo.roleId
        );
    if (!summary) return;
    await updateConversationSummary(convoId, summary, older.length);
    emitChatUpdate(convoId);
  } catch (e) {
    devWarning("localChat", `summarizeOlderMessages ${e}`);
  }
}

async function touchConversationRaw(convoId: string, lastMessage: string) {
  await withStorageLock(async () => {
    const list = await readConversationsRaw();
    const next = list.map((c) =>
      c.id === convoId ? { ...c, lastMessage, updatedAt: Date.now() } : c
    );
    await writeConversationsRaw(next);
  });
}

/** 创建一个新会话（用于角色成为好友时） */
export async function createConversationWithSeed(
  convo: LocalConvo,
  seedContent: string
) {
  await withStorageLock(async () => {
    const list = await readConversationsRaw();
    if (!list.some((c) => c.id === convo.id)) {
      list.unshift(convo);
      await writeConversationsRaw(list);
    }
    const existing = await sqlReadMessages(convo.id);
    if (!existing.length) {
      await sqlAppendMessage(convo.id, {
        id: "seed-" + convo.id,
        role: "assistant",
        content: seedContent,
        createdAt: Date.now(),
      });
    }
  });
}

/** 创建本地群聊会话（成员为通讯录中的角色） */
export async function createGroupConversation(
  members: GroupMemberInfo[]
): Promise<LocalConvo> {
  return withStorageLock(async () => {
    const names = members.map((m) => m.name);
    const title =
      names.slice(0, 4).join("、") +
      (names.length > 4 ? `等${names.length}人` : "");
    const convo: LocalConvo = {
      id: "group-" + Date.now(),
      title,
      groupName: title,
      lastMessage: "群聊已创建，可以开始聊天了",
      updatedAt: Date.now(),
      isGroup: true,
      autoTitle: true,
      maxInterChatRounds: 6,
      memberRoleIds: members.map((m) => m.roleId),
      memberNames: names,
      memberInfos: members,
    };
    const list = await readConversationsRaw();
    list.unshift(convo);
    await writeConversationsRaw(list);
    emitChatUpdate(convo.id);
    return convo;
  });
}

/** 更新群聊信息（名称/互聊轮数等） */
export async function updateGroupInfo(
  convoId: string,
  patch: Partial<LocalConvo>
) {
  await withStorageLock(async () => {
    const list = await readConversationsRaw();
    const idx = list.findIndex((c) => c.id === convoId);
    if (idx < 0) return;
    list[idx] = { ...list[idx], ...patch };
    await writeConversationsRaw(list);
    emitChatUpdate(convoId);
  });
}

/** 向群聊添加成员（自动更新群名与标题） */
export async function addGroupMembers(
  convoId: string,
  members: GroupMemberInfo[]
) {
  await withStorageLock(async () => {
    const list = await readConversationsRaw();
    const idx = list.findIndex((c) => c.id === convoId);
    if (idx < 0 || !members.length) return;
    const c = list[idx];
    const existing = new Set(c.memberRoleIds || []);
    const news = members.filter((m) => !existing.has(m.roleId));
    if (!news.length) return;
    const next: LocalConvo = {
      ...c,
      memberRoleIds: [...(c.memberRoleIds || []), ...news.map((m) => m.roleId)],
      memberNames: [...(c.memberNames || []), ...news.map((m) => m.name)],
      memberInfos: [...(c.memberInfos || []), ...news],
    };
    if (c.autoTitle) {
      const names = next.memberNames || [];
      next.title =
        names.slice(0, 4).join("、") + (names.length > 4 ? `等${names.length}人` : "");
      next.groupName = next.title;
    }
    list[idx] = next;
    await writeConversationsRaw(list);
    emitChatUpdate(convoId);
  });
}

/** 从群聊移除成员（移除后没有成员则解散） */
export async function removeGroupMember(convoId: string, roleId: string) {
  await withStorageLock(async () => {
    const list = await readConversationsRaw();
    const idx = list.findIndex((c) => c.id === convoId);
    if (idx < 0) return;
    const c = list[idx];
    const infos = (c.memberInfos || []).filter((m) => m.roleId !== roleId);
    if (!infos.length) {
      await dissolveGroup(convoId);
      return;
    }
    const next: LocalConvo = {
      ...c,
      memberRoleIds: infos.map((m) => m.roleId),
      memberNames: infos.map((m) => m.name),
      memberInfos: infos,
    };
    if (c.autoTitle) {
      const names = next.memberNames || [];
      next.title =
        names.slice(0, 4).join("、") + (names.length > 4 ? `等${names.length}人` : "");
      next.groupName = next.title;
    }
    list[idx] = next;
    await writeConversationsRaw(list);
    emitChatUpdate(convoId);
  });
}

/** 解散群聊：移除会话与消息 */
export async function dissolveGroup(convoId: string) {
  await withStorageLock(async () => {
    const list = await readConversationsRaw();
    await writeConversationsRaw(list.filter((c) => c.id !== convoId));
    await sqlDeleteConvoMessages(convoId);
    emitChatUpdate(convoId);
  });
}

/** 设置群聊角色互聊轮数 */
export async function setGroupInterChatRounds(convoId: string, rounds: number) {
  await updateGroupInfo(convoId, {
    maxInterChatRounds: Math.max(0, Math.min(12, Math.round(rounds))),
  });
}

/** 读取当前激活的 AI 配置（模块级，不依赖组件） */
async function readActiveAIConfig(): Promise<AIConfig> {
  // 新模型管理（wc_local_providers_v1）优先
  try {
    const resolved = await resolveRoleConfig(undefined, "text");
    if (resolved) return resolved;
  } catch (e) { devWarning("localChat", `resolveRoleConfig ${e}`); }
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length) {
        const activeId = await AsyncStorage.getItem(ACTIVE_KEY);
        return (
          list.find((c) => c.id === activeId) ||
          list[0] ||
          DEFAULT_AI_CONFIG
        );
      }
    }
  } catch (e) { devWarning("localChat", `readActiveAIConfig-fallback ${e}`); }
  return DEFAULT_AI_CONFIG;
}

/**
 * 角色成为好友时建立会话：
 * 1. 写入一条面向用户的系统提示（如"你已添加<角色名>为好友，可以开始聊天了"）
 * 2. 基于角色人设调用 AI 生成第一句回复
 */
export async function seedRoleConversation(
  convo: LocalConvo,
  notice: string,
  aiInstruction?: string
) {
  // 会话不再存角色人设，从角色卡补全（旧数据自带则直接使用）
  try {
    const roleCtx = await resolveConvoRoleContext(convo);
    if (roleCtx) Object.assign(convo, roleCtx);
  } catch (e) { devWarning("localChat", `seed-resolve-context ${e}`); }
  // 落库（会话+系统提示消息）在锁内原子完成，AI 生成第一句在锁外
  const hasMessages = await withStorageLock(async () => {
    const list = await readConversationsRaw();
    if (!list.some((c) => c.id === convo.id)) {
      list.unshift(convo);
      await writeConversationsRaw(list);
    }
    const existing = await sqlReadMessages(convo.id);
    if (existing.length) return true;

    await sqlAppendMessage(convo.id, {
      id: "sys-" + Date.now(),
      role: "system",
      content: notice,
      createdAt: Date.now(),
    });
    emitChatUpdate(convo.id);
    return false;
  });
  if (hasMessages) return;

  // 让 AI 基于人设 + 系统提示生成第一句回复
  pendingMap[convo.id] = true;
  emitChatUpdate(convo.id);
  try {
    let effectiveConfig = await readActiveAIConfig();
    try {
      const resolved = await resolveRoleConfig(convo.roleModelIds, "text");
      if (resolved) effectiveConfig = resolved;
    } catch (e) { devWarning("localChat", `seed2-resolve-config ${e}`); }

    let systemPrompt = `你正在扮演聊天应用中的角色「${
      convo.roleName || "未知角色"
    }」。角色设定：${convo.rolePersona || ""}。请始终保持该角色的人设、语气和身份来回复，不要提及你是 AI 模型或助手。`;
    systemPrompt += `\n\n对于你不了解或没有经历过的事情，自然地表现出不知道/不确定/好奇（可以反问或按角色性格猜测），不要编造具体细节——知道的说，不知道的不装懂。`;
    try {
      const userProfile = await readProfile();
      systemPrompt += "\n\n" + genderHint(userProfile.gender);
    } catch (e) { devWarning("localChat", `seed2-read-profile ${e}`); }
    if (convo.roleStoryState) {
      systemPrompt += `\n\n【当前状态】${convo.roleStoryState}`;
    }
    systemPrompt += `\n\n系统通知：${
      aiInstruction || notice
    }\n下面这条「用户」消息实际上是一条系统通知，并非用户本人发言。请以该角色的身份自然地回应这条通知，作为你们之间的第一句话，不要复述通知内容。
如果这是你们初次见面，请自然地输出 2~3 条连贯的短消息（像真人刚认识时：先打招呼、再自我介绍或分享一件小事、最后抛出一个小话题），每条不超过 30 字，用「|||」分隔（系统会当作连续多条消息发送）。不要输出任何其他格式。
你可以自然地提及自己生活圈里的其他人（家人/同事/朋友），但只能从你自己的视角转述；不要代替他们说话，不要假设用户认识他们，除非用户主动提到。`;

    const history: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];
    if (convo.roleExamples?.length) {
      const fewShot = convo.roleExamples
        .filter((ex) => ex.content && ex.content.trim())
        .slice(0, 8)
        .map((ex) => ({
          role: ex.role === "user" ? ("user" as const) : ("assistant" as const),
          content: ex.content,
        }));
      if (fewShot.length) history.push(...fewShot);
    }
    // 部分接口要求最后一条是 user 消息，必须补一条触发消息
    history.push({
      role: "user",
      content: aiInstruction || notice,
    });

    const reply = await chatCompletion(effectiveConfig, history, {
      temperature: convo.roleTemperature,
      roleId: convo.roleId,
      scene: "开场白",
    });
    // 初次见面微叙事：把「|||」分隔的 2~3 条短消息逐条落库（带 3 秒间隔）
    const parts = String(reply || "")
      .split("|||")
      .map((s) => cleanChatText(s))
      .filter(Boolean)
      .slice(0, 3);
    const title = convo.roleName || convo.title || "角色";
    if (!parts.length) {
      await appendIncomingMessage(
        convo.id,
        {
          id: "a" + Date.now(),
          role: "assistant",
          content: String(reply || "").trim(),
          createdAt: Date.now(),
        },
        title
      );
      return;
    }
    for (let i = 0; i < parts.length; i++) {
      await appendIncomingMessage(
        convo.id,
        {
          id: "a" + Date.now() + "-" + i,
          role: "assistant",
          content: parts[i],
          createdAt: Date.now() + i * 3000,
        },
        title
      );
    }
  } catch (e: any) {
    devWarning("localChat", `SEED-REPLY-FAIL ${e?.message || e}`);
  } finally {
    pendingMap[convo.id] = false;
    emitChatUpdate(convo.id);
  }
}

// ---------------- AI 回复引擎（模块级，不依赖组件生命周期） ----------------

const pendingMap: { [convoId: string]: boolean } = {};
// 会话回复进行中用户又发了消息：先记下来，当前回复结束后补一轮回复
const queuedReply: { [convoId: string]: string | undefined } = {};

export const isPendingReply = (convoId: string): boolean =>
  !!pendingMap[convoId];

function emitChatUpdate(convoId: string) {
  eventBus.emit("local-chat-updated", convoId);
}

/** 处理模型输出的 <search:关键词> 指令：检索记忆并让 AI 基于结果续答 */
async function resolveSearchTags(
  reply: string,
  roleId: string | undefined,
  config: AIConfig,
  history: { role: string; content: string }[],
  temperature?: number
): Promise<string> {
  const searchTags = reply.match(/<search:[^>]+>/g) || [];
  if (!searchTags.length || !roleId) return reply;
  const keywords = searchTags
    .map((t) => t.replace(/^<search:/, "").replace(/>$/, "").trim())
    .filter(Boolean);
  const found: {
    id: string;
    content: string;
    createdAt: number;
    pinned?: boolean;
  }[] = [];
  try {
    for (const kw of keywords) {
      const hits = await retrieveMemories(roleId, kw, {
        topK: 5,
        full: true,
      });
      for (const h of hits) {
        if (!found.some((x) => x.id === h.id)) found.push(h);
      }
    }
  } catch (e) { devWarning("localChat", `memory-retrieve ${e}`); }
  const clean = reply.replace(/<search:[^>]+>/g, "").trim();
  if (!found.length) return clean;
  const block = formatMemoriesBlock(found);
  const followUp = [
    ...history,
    {
      role: "assistant" as const,
      content: clean || "（思考中…）",
    },
    {
      role: "user" as const,
      content: `（系统）根据 <search> 指令检索到以下记忆：\n${block}\n请基于这些记忆，以角色身份完整回答用户刚才的问题，直接给出最终回答，不要再输出 <search> 指令。`,
    },
  ];
  try {
    return await chatCompletion(config, followUp, {
      temperature,
      roleId,
      scene: "聊天",
    });
  } catch {
    return clean;
  }
}

/** 发送一条用户消息并触发 AI 回复；同一会话同一时间只允许一个进行中的回复 */
export async function sendLocalMessage(
  convoId: string,
  text: string,
  config: AIConfig,
  opts?: {
    patEvent?: string;
    replyTo?: { content: string; senderName?: string };
    /** 图片消息：用户选择的本地图片 URI（支持多张） */
    images?: string[];
    /** 内部：仅触发回复（消息已在回复期间存过，不再重复存储） */
    __replyOnly?: boolean;
  }
): Promise<void> {
  const startTime = Date.now();
  const trimmed = (text || "").trim();
  const isPat = !!opts?.patEvent;
  const replyOnly = !!opts?.__replyOnly;
  if ((!trimmed && !isPat) || !convoId) return;
  requestNotificationPermission().catch(() => {});
  logEvent("CHAT", `开始回复 ${convoId}${isPat ? "（拍一拍）" : ""}`);

  const userMsg: LocalMsg | null =
    !isPat && !replyOnly
      ? {
          id: "m" + Date.now() + Math.floor(Math.random() * 1000),
          role: "user",
          content: trimmed,
          ...(opts?.images?.length ? { images: opts.images } : {}),
          createdAt: Date.now(),
          ...(opts?.replyTo
            ? {
                replyTo: {
                  content: opts.replyTo.content,
                  senderName: opts.replyTo.senderName,
                },
              }
            : {}),
        }
      : null;

  // 会话正在回复中：先把用户消息存下来避免丢失，回复结束后自动补一轮
  if (pendingMap[convoId]) {
    if (userMsg) {
      await appendMessageToStorage(convoId, userMsg);
      emitChatUpdate(convoId);
      markUserReplied(convoId).catch(() => {});
    }
    queuedReply[convoId] = trimmed;
    cancelProactive(convoId).catch(() => {});
    return;
  }

  pendingMap[convoId] = true;
  emitChatUpdate(convoId);
  try {
    if (userMsg) {
      await appendMessageToStorage(convoId, userMsg);
      emitChatUpdate(convoId);
      // 反馈自适应：用户回复消息，记录对角色主动消息的回应
      markUserReplied(convoId).catch(() => {});
    }
    cancelProactive(convoId).catch(() => {});
    const query = opts?.patEvent || trimmed;
    // ComfyUI 设置（回复阶段读取一次；关闭时全程无感）
    let comfySettings: ComfySettings | null = null;

    // 图片消息：把用户选择的图片转成 base64 data URL，用 vision content 数组格式
    let imageUrls: string[] = [];
    if (opts?.images?.length) {
      for (const uri of opts.images.slice(0, 9)) {
        try {
          const b64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
          const mime = ext === "png" ? "image/png" : "image/jpeg";
          imageUrls.push(`data:${mime};base64,${b64}`);
        } catch (e) { devWarning("localChat", `image-read ${e}`); }
      }
    }

    const rawMsgs = await readMessages(convoId);
    const history: import("../utils/ai").ChatMessage[] = rawMsgs
      .filter((m) => m.role !== "system")
      .slice(-20)
      .map((m) => {
        const textContent =
          m.role === "user" && m.replyTo
            ? `（用户引用了「${m.replyTo.senderName ? m.replyTo.senderName + "：" : ""}${m.replyTo.content}」进行回复）\n${m.content}`
            : m.content;
        // 最新一条带图片的用户消息 → vision 格式（多张图全部注入）
        if (m.role === "user" && m.images?.length && imageUrls.length && m.id === rawMsgs[rawMsgs.length - 1]?.id) {
          return {
            role: "user" as const,
            content: [
              ...imageUrls.map(url => ({ type: "image_url" as const, image_url: { url } })),
              { type: "text" as const, text: textContent || "（发了一张图片）" },
            ],
          };
        }
        return {
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: textContent,
        };
      });
    if (isPat) {
      history.push({
        role: "user",
        content: `（系统事件）${opts!.patEvent}。请以角色的身份自然地回应这次互动：可以调侃、害羞、关心，也可以拍一拍对方。如果你决定拍回去，请在回复末尾单独输出一行 <pat-back>（不要带任何内容）</pat-back>，系统会显示「角色拍了拍我」并晃动我的头像。即使你只在文字里说「拍了拍你」而忘了输出标签，系统也会自动识别为拍回去。`,
      });
    }
    const convos = await readConversationsRaw();
    let curConvo = convos.find((c) => c.id === convoId);
    // 会话索引不存角色人设副本，需要时从角色卡补全
    if (curConvo && !curConvo.rolePersona) {
      try {
        const ctx = await resolveConvoRoleContext(curConvo);
        if (ctx) curConvo = { ...curConvo, ...ctx };
      } catch (e) { devWarning("localChat", `send-resolve-context ${e}`); }
    }
    // 始终从角色卡刷新音色绑定（会话里可能已有 persona，但 voice 是后加的字段）
    if (curConvo?.roleId && !curConvo.roleVoice) {
      try {
        const r = await sqlReadRole(curConvo.roleId);
        if (r && (r as any).voice) {
          curConvo = { ...curConvo, roleVoice: (r as any).voice };
        }
      } catch (e) { devWarning("localChat", `send-read-role-voice ${e}`); }
    }
    // 内置 AI 使用助手：注入软件使用教程提示词
    if (
      curConvo &&
      (curConvo.id === "local-ai-1" ||
        curConvo.title === DEFAULT_CONVO_TITLE)
    ) {
      history.unshift({
        role: "system",
        content: await resolvePrompt("aiHelper", PROMPT_DEFAULTS.aiHelper),
      });
    }
    // 群聊：让群内每个角色依次以各自人设回复
    if (curConvo?.isGroup && curConvo.memberInfos?.length) {
      await replyAllGroupMembers(convoId, curConvo);
      return;
    }
    // 角色绑定的文本模型优先；否则用传入的默认配置
    let effectiveConfig = config;
    let roleModelMissing = false;
    try {
      const resolved = await resolveRoleConfig(
        curConvo?.roleModelIds,
        "text"
      );
      if (resolved) effectiveConfig = resolved;
      else if (curConvo?.roleModelIds?.text) roleModelMissing = true;
    } catch (e) { devWarning("localChat", `send-resolve-config ${e}`); }
    if (curConvo?.rolePersona) {
      const promptVars: Record<string, string> = {
        角色名: curConvo.roleName || "未知角色",
        角色设定: curConvo.rolePersona,
        性别提示: "",
        当前剧情状态: "",
        长期档案: "",
        相关记忆: "",
        当前时间: "",
        此刻状态: "",
        语音条: "",
        用户状态: "",
        知识库: "",
        背景资料: "",
        回忆提示: "",
        示例说明:
          "\n\n（本提示词之后若给出示例对话，仅用于参考说话风格，并非真实发生的对话。）",
      };
      try {
        const userProfile = await readProfile();
        promptVars.性别提示 = "\n\n" + genderHint(userProfile.gender);
      } catch { /* non-critical */ }
      // 当前剧情状态
      if (curConvo?.roleStoryState) {
        promptVars.当前剧情状态 = `\n\n【当前状态】${curConvo.roleStoryState}`;
      }

      // 记忆检索注入
      if (curConvo.roleId) {
        try {
          // L2 长期档案常驻注入（用户偏好/关键关系，始终记得）
          const core = await getCoreProfile(curConvo.roleId);
          if (core.length) {
            promptVars.长期档案 = formatCoreBlock(core);
          }
          const mems = await retrieveMemories(curConvo.roleId, query);
          if (mems.length) {
            promptVars.相关记忆 =
              formatMemoriesBlock(mems) +
              "\n（这些是你们的过往记忆，请像真人回忆一样自然地使用相关的内容，不要机械罗列，也不要说“根据记忆”。）";
          }
          // 记忆搜索交给 function calling 工具（search_memory）处理；
          // 若模型仍输出 <search> 标签，下方 resolveSearchTags 会兜底。
          // 主动消息由世界线统一调度（时间表+跟进），不向模型注入 <proactive:N> 标签指令
        } catch { /* non-critical */ }
      }
      // 时间与间隔感知：让角色有真实的时间感和作息
      if (curConvo?.rolePersona) {
        try {
          const now = new Date();
          const week = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
          const nowStr = `${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours()}:${String(
            now.getMinutes()
          ).padStart(2, "0")}（周${week}）`;
          const prev = rawMsgs[rawMsgs.length - 2];
          let gapText = "";
          if (prev?.createdAt) {
            const gapMin = Math.round((Date.now() - prev.createdAt) / 60000);
            if (gapMin >= 1) {
              gapText =
                gapMin < 60
                  ? `约 ${gapMin} 分钟前`
                  : `约 ${Math.round(gapMin / 60)} 小时前`;
            }
          }
          promptVars.当前时间 = `\n\n【当前时间】现在是 ${nowStr}${
            gapText ? "，用户上次发言在" + gapText : ""
          }。请表现出真实的时间感和作息习惯（例如深夜会提醒对方早点休息），但不要生硬提及具体时间。`;
        } catch { /* non-critical */ }
      }
      // 角色此刻的状态（世界线当前时段）
      if (curConvo?.roleId) {
        try {
          const wl = await readWorldlineRaw();
          const st = getRoleStatusFull(wl, curConvo.roleId);
          if (st) {
            promptVars.此刻状态 = `\n\n【你此刻的状态】${st}（自然地按这个状态说话，比如正在忙、正在开心，不要生硬提及"状态"二字。）`;
          }
        } catch { /* non-critical */ }
      }
      // 自然回忆：约每 6~10 条消息一次低概率触发，让角色随口提起一件往事
      if (curConvo?.roleId) {
        try {
          const msgs = rawMsgs.filter((m: any) => m.role !== "system");
          if (msgs.length >= 6) {
            const raw = await AsyncStorage.getItem(RECALL_KEY);
            const map: Record<string, number> = raw ? JSON.parse(raw) : {};
            const lastRecall = map[convoId] || 0;
            if (msgs.length - lastRecall >= 6 && Math.random() < 0.5) {
              map[convoId] = msgs.length;
              await AsyncStorage.setItem(RECALL_KEY, JSON.stringify(map));
              promptVars.回忆提示 =
                "\n\n（自然回忆机会：这条回复可以自然地提起一件你们过去的往事——从记忆或剧情梗概里选一件具体的（带时间/场景细节），随口带出，让对话有延续感；如果想不到合适的往事，就正常回复，不要硬回忆。）";
            }
          }
        } catch { /* non-critical */ }
      }
      // 记忆记录：角色可用 <add:> 内联记录重要信息（爱语式自主记忆），固定块在默认模板里
      if (curConvo?.roleVoice) {
        // 情绪列表按角色实际拥有的变体动态生成：只给 LLM 能命中的选项，
        // 避免选了不存在的情绪又回退到基础声线
        const emoKeys = Object.keys(curConvo.roleVoice.variants || {});
        const emotionHint = emoKeys.length
          ? `本角色可用的情绪变体：${emoKeys.join("/")}。如需指定语气，可在 <voice:X> 之后追加 <voice_emotion:${emoKeys.join("/")}>（可选，不加则用默认音色；只有这句话有明显的对应情绪时才加，不要每次都加）。`
          : "本角色暂无情绪变体，不要输出 <voice_emotion> 标签。";
        // 性格频率：角色卡 voiceRate 驱动
        let voiceRateHint = "偶尔用语音，看场合";
        try {
          const roleRow = curConvo.roleId
            ? await sqlReadRole(curConvo.roleId)
            : null;
          const vr = roleRow?.voiceRate || "sometimes";
          voiceRateHint =
            vr === "often"
              ? "很喜欢用语音表达，情绪上来时经常发语音"
              : vr === "rare"
              ? "很少发语音，只在特别想表达的时候才用"
              : "偶尔用语音，看场合";
        } catch { /* non-critical */ }
        // 统计兜底：最近 10 条里语音数量 / 上一条是否语音（防连发、保证存在感）
        let statsHint = "";
        try {
          const recent = rawMsgs
            .filter((m: any) => m.role !== "system")
            .slice(-10);
          const voiceCount = recent.filter((m: any) => !!m.audio).length;
          const lastIsVoice = !!recent[recent.length - 1]?.audio;
          if (lastIsVoice) statsHint = "\n- 上一条你发了语音，这条用文字回复。";
          else if (voiceCount >= 3)
            statsHint = "\n- 最近语音发得有点多，这条用文字。";
          else if (voiceCount === 0 && recent.length >= 6)
            statsHint =
              "\n- 你们已经聊了不少句都没有语音，如果这句话适合，请用 <voice> 发一条。";
        } catch { /* non-critical */ }
        // 场景硬偏好：早安 / 晚安 / 生日当天
        let sceneHint = "";
        try {
          const now = new Date();
          const h = now.getHours();
          if (h >= 5 && h <= 10)
            sceneHint = "\n- 现在是早上，很适合用语音道早安。";
          else if (h >= 22 || h <= 4)
            sceneHint = "\n- 现在是晚上，很适合用语音道晚安。";
          const prof = await readProfile();
          if (prof?.birthday) {
            const today = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(
              now.getDate()
            ).padStart(2, "0")}`;
            if (prof.birthday === today)
              sceneHint += "\n- 今天是用户的生日，这条回复很适合用语音。";
          }
        } catch { /* non-critical */ }
        promptVars.语音条 = `\n\n【语音条】你${voiceRateHint}。用语音的规则：
- 适合语音的场景：简短问候、早安/晚安、撒娇、情绪化短句、感叹、道别、重要时刻；日常陈述和长句一律用文字。
- 大约每 5~8 条消息用一次语音；不要连续两条都用语音；拿不准就用文字，语音少而精。
- 想发语音时，整条消息只能输出 <voice:你想说的话>（文字段会被系统丢弃），<voice:X> 要独立完整地表达你想说的话，绝不文字和语音混用；每次不超过 30 字。
- 用户明确说想听你的声音、让你发语音（如"我想听听你的声音""发个语音"）时，优先整条用 <voice:X> 回复。${statsHint}${sceneHint}
${emotionHint}`;
      }
      // 用户此刻的状态（主动发布，角色会看到并自然回应）
      try {
        const statusLine = await userStatusPromptLine();
        if (statusLine) promptVars.用户状态 = statusLine;
      } catch { /* non-critical */ }
      // 知识库检索注入（独立 [Knowledge] 区域）
      if (curConvo.roleId) {
        try {
          const kbBlock = await retrieveKnowledgeBlock(
            curConvo.roleId,
            query
          );
          if (kbBlock) promptVars.知识库 = kbBlock;
        } catch { /* non-critical */ }
      }
      // 角色详细资料检索（只查该角色自己的 background）
      if (curConvo?.roleId && curConvo?.roleBackground?.length) {
        try {
          const bgBlock = await retrieveRoleBackground(
            curConvo.roleId,
            curConvo.roleBackground,
            query
          );
          if (bgBlock) promptVars.背景资料 = bgBlock;
        } catch { /* non-critical */ }
      }
      // 好感度/情绪注入：关系状态影响语气，模型可用标签更新
      try {
        if (curConvo.roleId) {
          const st = await sqlReadRoleState(curConvo.roleId);
          // 邻舍规则：连续 24h 未互动，好感度 -1（冷却衰减，最低到 0）
          if (st.updatedAt && Date.now() - st.updatedAt > 24 * 3600 * 1000 && st.affection > 0) {
            const decayed = st.affection - 1;
            await sqlWriteRoleState(curConvo.roleId, decayed, st.mood);
            st.affection = decayed;
          }
          const level =
            st.affection >= 80
              ? "亲密无间"
              : st.affection >= 60
              ? "亲近"
              : st.affection >= 40
              ? "友好"
              : st.affection >= 20
              ? "熟悉"
              : "刚认识不久";
          promptVars.当前剧情状态 +=
            `\n\n【你与用户的关系】好感度 ${st.affection}/100（${level}）${
              st.mood ? "，你当前的情绪：" + st.mood : ""
            }。语气与亲密程度要符合这个关系。` +
            `每次回复末尾可以（可选）追加状态标签更新自己：<mood:情绪词> 或 <affection:+1~3 或 -1~-3>（不是每条都要，情绪明显变化时才加）。`;
        }
      } catch { /* non-critical */ }
      // ComfyUI 生图开关：开启时才给模型配图能力说明
      try {
        if (curConvo?.roleId) {
          comfySettings = await readComfySettings();
        }
      } catch { comfySettings = null; }
      let systemPrompt = fillTemplate(
        await resolvePrompt("chat", PROMPT_DEFAULTS.chat),
        promptVars
      );
      if (comfySettings?.enabled) {
        systemPrompt +=
          "\n\n【配图】你可以发图片：当对话出现强画面感（见面、去了什么地方、做了某件事、对方想看你/看风景）时，在回复末尾单独一行输出 <image:中文画面描述>（描述此刻的场景和你的样子，20~60 字）。普通闲聊不要加；一条回复最多一张。";
      }
      history.unshift({
        role: "system",
        content: systemPrompt,
      });
      // 中期摘要：更早对话的压缩摘要注入（如有）
      if (curConvo?.summary) {
        history.splice(1, 0, {
          role: "system",
          content: `（更早对话的摘要，请视为真实发生过的事情）\n${curConvo.summary}`,
        });
      }
    }
    // 示例对话 few-shot
    if (curConvo?.roleExamples?.length) {
      const fewShot: { role: "user" | "assistant"; content: string }[] =
        curConvo.roleExamples
          .filter((ex) => ex.content && ex.content.trim())
          .slice(0, 8)
          .map((ex) => ({
            role: ex.role === "user" ? "user" : "assistant",
            content: ex.content,
          }));
      if (fewShot.length) {
        // 示例对话放在 system/摘要之后、真实历史之前
        const insertAt = history.findIndex((m) => m.role !== "system");
        if (insertAt < 0) history.push(...fewShot);
        else history.splice(insertAt, 0, ...fewShot);
      }
    }

    try {
      let finalReply = "";
      // 思考链捕获：本回合所有 <think>/reasoning_content 汇总，随消息落库
      let thinkingText = "";
      const onThinking = (t: string) => {
        if (!t) return;
        thinkingText = thinkingText
          ? thinkingText + "\n---\n" + t
          : t;
      };
      // 工具（Function Calling）优先
      const { tools, executors } = await buildAppTools(
        curConvo?.roleId,
        convoId
      );
      if (tools.length) {
        const messages: any[] = [...history];
        let guard = 0;
        let toolCalls: ToolCallInfo[] = [];
        const first = await chatCompletionWithTools(
          effectiveConfig,
          messages,
          tools,
          {
            temperature: curConvo?.roleTemperature,
            roleId: curConvo?.roleId,
            scene: "聊天",
            onThinking,
          }
        );
        finalReply = first.content;
        toolCalls = first.toolCalls;
        while (toolCalls.length && guard < 3) {
          guard++;
          messages.push({
            role: "assistant",
            content: finalReply,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: tc.arguments },
            })),
          });
          for (const tc of toolCalls) {
            let result = "";
            try {
              const fn = executors.get(tc.name);
              if (fn) result = await fn(JSON.parse(tc.arguments || "{}"));
              else result = "工具不存在：" + tc.name;
            } catch (e: any) {
              result = "工具执行失败：" + (e?.message || "");
            }
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: result,
            });
          }
          const next = await chatCompletionWithTools(
            effectiveConfig,
            messages,
            tools,
            {
              temperature: curConvo?.roleTemperature,
              roleId: curConvo?.roleId,
              scene: "聊天",
              onThinking,
            }
          );
          finalReply = next.content;
          toolCalls = next.toolCalls;
        }
        // 多轮工具调用后模型仍未给出正文时，基于工具结果补一轮最终回复
        if (!finalReply.trim()) {
          const finish = await chatCompletion(effectiveConfig, messages, {
            temperature: curConvo?.roleTemperature,
            roleId: curConvo?.roleId,
            scene: "聊天",
            onThinking,
          });
          finalReply = finish;
        }
        // 工具路径兜底：模型若仍输出 <search> 标签，同样检索记忆并清理
        finalReply = await resolveSearchTags(
          finalReply,
          curConvo?.roleId,
          effectiveConfig,
          history,
          curConvo?.roleTemperature
        );
      } else {
        const reply = await chatCompletion(effectiveConfig, history, {
          temperature: curConvo?.roleTemperature,
          roleId: curConvo?.roleId,
          scene: isPat ? "拍一拍" : "聊天",
          onThinking,
        });
        finalReply = await resolveSearchTags(
          reply,
          curConvo?.roleId,
          effectiveConfig,
          history,
          curConvo?.roleTemperature
        );
      }
      // 主动消息：解析 <proactive:N> 并安排定时主动联系
      const proactiveMin = parseProactiveTag(finalReply);
      finalReply = stripProactiveTag(finalReply);
      // 清理模型常见结尾标记（</s>、<|eot_id|> 等），避免残留在正文或语音标签后
      finalReply = finalReply
        .replace(/<\/?s>/gi, "")
        .replace(
          /<\|eot_id\|>|<\|endoftext\|>|<\|im_end\|>|<\|end_of_turn\|>/g,
          ""
        )
        .trim();
      // 记忆记录：解析角色内联 <add:内容>，落库并从回复中移除（角色主动记=重要）
      if (curConvo?.roleId) {
        const adds = extractInlineAdds(finalReply);
        if (adds.adds.length) {
          finalReply = adds.clean;
          const srcIds = rawMsgs
            .filter((m) => m.role === "user")
            .slice(-3)
            .map((m) => m.id);
          for (const a of adds.adds) {
            appendMemory(curConvo.roleId, a, "auto", {
              type: "fact",
              importance: 4,
              sourceMsgIds: srcIds,
            }).catch(() => {});
          }
        }
      }
      // 好感度/情绪标签：<mood:情绪词> <affection:±N>（从正文剥离后落 role_state）
      let moodTag: string | null = null;
      let affectionDelta = 0;
      const moodMatch = /<mood:([^>]+)>/.exec(finalReply);
      if (moodMatch) {
        moodTag = moodMatch[1].trim().slice(0, 12);
        finalReply = finalReply.replace(/<mood:[^>]+>/g, "").trim();
      }
      const affMatch = /<affection:([+\-]?\d+)/.exec(finalReply);
      if (affMatch) {
        affectionDelta = parseInt(affMatch[1], 10) || 0;
        finalReply = finalReply.replace(/<affection:[^>]+>/g, "").trim();
      }
      // ComfyUI 生图标签：<image:画面描述>（仅在设置开启时模型被允许输出）
      let imageDesc: string | null = null;
      if (comfySettings?.enabled) {
        const imageMatch = /<image:([^>]+)>/.exec(finalReply);
        if (imageMatch) {
          imageDesc = imageMatch[1].trim().slice(0, 120);
          finalReply = finalReply.replace(/<image:[^>]+>/g, "").trim();
        }
      }
      // 兜底：模型没输出标记时，从用户消息识别"等我 X 分钟"
      const fallbackMin =
        proactiveMin > 0 ? -1 : isPat ? -1 : parseUserWait(trimmed);
      const scheduleMin = proactiveMin > 0 ? proactiveMin : fallbackMin;
      if (scheduleMin > 0 && curConvo?.roleId) {
        scheduleProactive(
          convoId,
          scheduleMin,
          curConvo.roleName || curConvo.title || "角色"
        ).catch(() => {});
      }
      // 拍一拍：模型输出 <pat-back> 或文字里说"拍了拍你"都视为拍回去
      const patBackTag = /<pat-back>[\s\S]*?<\/pat-back>/;
      const patBackText = /(?:拍(?:拍|了拍|一拍)?|敲了敲|戳了戳)你/;
      let patBack = false;
      if (patBackTag.test(finalReply)) {
        patBack = true;
        finalReply = finalReply.replace(patBackTag, "").trim();
      } else if (patBackText.test(finalReply)) {
        patBack = true;
        // 去掉包含"拍你"的那句话，动作由系统提示行展示
        finalReply = finalReply
          .replace(
            /[^。！？!?\n]*(?:拍(?:拍|了拍|一拍)?|敲了敲|戳了戳)你[^。！？!?\n]*[。！？!?\n]?/g,
            ""
          )
          .trim();
      }
      let patBackContent: string | null = null;
      if (patBack && curConvo) {
        try {
          const profile = await readProfile();
          const roleName = curConvo.roleName || "角色";
          patBackContent = profile.patContent
            ? `${roleName}拍了拍我的${profile.patContent}`
            : `${roleName}拍了拍我`;
        } catch { /* non-critical */ }
      }
      // 输入节奏：回复过快时补一点自然的延迟
      const elapsed = Date.now() - startTime;
      if (elapsed < 1200) {
        await new Promise((r) => setTimeout(r, 1200 - elapsed));
      }
      // 角色绑定的模型已失效：给出可见提示，避免用户无感知地用错模型
      if (roleModelMissing) {
        await appendMessageToStorage(convoId, {
          id: "sys-model-" + Date.now(),
          role: "system",
          content: "（提示：角色绑定的模型已不可用，本次使用默认 AI 配置回复）",
          createdAt: Date.now(),
        });
      }
      if (finalReply.trim()) {
        const title = curConvo?.roleName || curConvo?.title || "角色";
        // 兼容 <voice:X> 与 <voice:X</voice> 两种模型输出格式
        const voiceTag = /<voice:([^>]+?)(?:<\/voice>)?>/.exec(finalReply);
        const voiceText = voiceTag
          ? (voiceTag[1] || "").replace(/<\/?[a-z]*$/i, "").trim()
          : "";
        if (voiceTag && voiceText) {
          const emotionTag = /<voice_emotion:([^>]+)>/.exec(finalReply);
          const emotion = emotionTag ? emotionTag[1].trim() : undefined;
          const voiceMsgId = "a" + Date.now() + "v";
          let audioUrl: string | null = null;
          const canSpeak = !!curConvo?.roleVoice && !!voiceText;
          if (canSpeak) {
            eventBus.emit("ai-speaking", { convoId });
          }
          try {
            if (canSpeak) {
              try {
                const remote = await synthTTS(
                  resolveVoiceForEmotion(curConvo!.roleVoice!, emotion),
                  voiceText.slice(0, 100)
                );
                if (remote) {
                  // 下载到本地：临时链接会过期且流式拿不到时长，本地文件稳定可播
                  const local = await persistVoiceAudio(remote, voiceMsgId);
                  audioUrl = local || remote;
                }
              } catch (e: any) {
                logEvent("TTS", `语音合成失败 ${convoId}: ${e?.message || e}`);
              }
            }
            // 混用强拦截：模型同时输出文字+语音时只保留语音（语音更稀缺）。
            // 语音内容即这条消息的完整表达，文字段直接丢弃。
            // （voiceText 为空时才在下面走文字兜底）
            if (voiceText) {
              await appendIncomingMessage(
                convoId,
                {
                  id: voiceMsgId,
                  role: "assistant",
                  content: voiceText,
                  // 合成失败或角色未绑音色时降级为文字气泡，内容不丢失
                  audio: audioUrl || undefined,
                  thinking: thinkingText || undefined,
                  createdAt: Date.now(),
                },
                title
              );
            }
          } finally {
            if (canSpeak) {
              eventBus.emit("ai-speaking-end", { convoId });
            }
          }
        } else {
          // 兜底：模型输出被截断成半截 <voice:xxx（缺 >）时剥掉残留，避免明文漏出；
          // 剥完为空则保留 <voice: 之后的内容，仍为空才丢弃（避免空白气泡）
          let plain = finalReply.replace(/<voice[^>]*$/i, "").trim();
          if (!plain) plain = finalReply.replace(/^<voice:\s*/i, "").trim();
          if (plain) {
            await appendIncomingMessage(
              convoId,
              {
                id: "a" + Date.now(),
                role: "assistant",
                content: plain,
                thinking: thinkingText || undefined,
                createdAt: Date.now(),
              },
              title
            );
          }
        }
      }
      // 好感度/情绪落库（回复已发出后更新，供下轮注入与资料页展示）
      if ((moodTag || affectionDelta !== 0) && curConvo?.roleId) {
        try {
          const cur = await sqlReadRoleState(curConvo.roleId);
          // 邻舍规则·非对称演化：单轮 -3~+6（易暖不易伤）；
          // 高区（80+）增长减半、低区（<20）下跌减半，避免数值贴边
          let delta = Math.max(-3, Math.min(6, affectionDelta));
          if (delta > 0 && cur.affection >= 80) delta = Math.ceil(delta / 2);
          if (delta < 0 && cur.affection < 20) delta = Math.ceil(delta / 2);
          const next = cur.affection + delta;
          await sqlWriteRoleState(curConvo.roleId, next, moodTag || cur.mood);
          eventBus.emit("role-state-updated", curConvo.roleId);
        } catch { /* non-critical */ }
      }
      // ComfyUI 生图：占位消息先发出，生成完成后回填图片（自动同步入角色相册）
      if (imageDesc && comfySettings?.enabled) {
        const imgMsgId = "a" + Date.now() + "img";
        await appendMessageToStorage(convoId, {
          id: imgMsgId,
          role: "assistant",
          content: "（正在给你画一张图…）",
          createdAt: Date.now() + 1,
        });
        emitChatUpdate(convoId);
        const roleSnapshot = curConvo;
        const finalPromptParts: string[] = [];
        // 服务端拼角色一致性条件：名字 + 外貌（bio 优先，退回人设片段）——LLM 只负责语义
        if (roleSnapshot?.roleName) finalPromptParts.push(roleSnapshot.roleName);
        try {
          if (roleSnapshot?.roleId) {
            const roleRow = await sqlReadRole(roleSnapshot.roleId);
            const appearance =
              (roleRow as any)?.bio || (roleRow as any)?.persona || "";
            if (appearance) finalPromptParts.push(String(appearance).slice(0, 120));
          }
        } catch { /* non-critical */ }
        finalPromptParts.push(imageDesc);
        if (comfySettings.qualitySuffix) finalPromptParts.push(comfySettings.qualitySuffix);
        const finalPrompt = finalPromptParts.join("，");
        void (async () => {
          try {
            const result = await generateComfyImage(comfySettings!, finalPrompt);
            if (result.ok && result.uri) {
              await sqlUpdateMessageImages(convoId, imgMsgId, [result.uri]);
              await sqlUpdateMessageContent(convoId, imgMsgId, "");
              if (comfySettings!.autoAlbum && roleSnapshot?.roleId) {
                await sqlAddRolePhoto(roleSnapshot.roleId, result.uri, imageDesc!).catch(() => {});
              }
              logEvent("COMFY", `生图成功 ${convoId}`);
            } else {
              await sqlUpdateMessageContent(
                convoId,
                imgMsgId,
                "（这张图没画好：" + (result.error || "未知原因") + "）"
              );
              logEvent("COMFY", `生图失败 ${convoId}: ${result.error}`);
            }
          } catch (e: any) {
            await sqlUpdateMessageContent(
              convoId,
              imgMsgId,
              "（这张图没画好：" + (e?.message || "未知错误") + "）"
            ).catch(() => {});
          } finally {
            emitChatUpdate(convoId);
          }
        })();
      }
      // 拍回提示行放在角色回复之后
      if (patBackContent) {
        await appendMessageToStorage(convoId, {
          id: "patb" + Date.now() + Math.floor(Math.random() * 1000),
          role: "system",
          content: patBackContent,
          createdAt: Date.now(),
        });
        eventBus.emit("pat-back", convoId);
      }
      // 对话跟进：用户发消息→角色回复后，安排一次"过会儿再补一句"的机会
      if (!isPat && finalReply.trim()) {
        scheduleConversationFollowUp(
          convoId,
          curConvo?.roleName || curConvo?.title || "角色"
        ).catch(() => {});
      }
      // 每 8 轮自动提取记忆（后台执行，不阻塞回复）
      if (curConvo?.roleId) {
        maybeAutoExtract(
          curConvo.roleId,
          curConvo.roleName || "角色",
          effectiveConfig,
          rawMsgs,
          rawMsgs.filter((m) => m.role !== "system").length
        ).catch(() => {});
      }
      // 中期摘要：对话超长时后台压缩早期消息
      maybeCompressConversation(convoId, effectiveConfig).catch(() => {});
    } catch (e: any) {
      logEvent("CHAT", `回复失败 ${convoId}: ${e?.message || e}`);
      await appendMessageToStorage(convoId, {
        id: "e" + Date.now(),
        role: "system",
        content: (e?.message || "请求失败").slice(0, 500),
        createdAt: Date.now(),
      });
    }
  } finally {
    pendingMap[convoId] = false;
    const pendingText = queuedReply[convoId];
    if (pendingText !== undefined) {
      queuedReply[convoId] = undefined;
      // 补一轮回复：消息已存过，只跑回复引擎
      void sendLocalMessage(convoId, pendingText, config, {
        __replyOnly: true,
      });
    }
    emitChatUpdate(convoId);
  }
}

/** 群聊回复：按成员顺序，每个角色基于自己的设定回复同一轮对话 */
/** 群聊"正在输入"事件：一次一个角色（依次回复） */
function emitGroupTyping(convoId: string, name: string, active: boolean) {
  eventBus.emit("group-typing", { convoId, name, active });
}

/** 提取消息里的 @角色名 */
function extractAtNames(text: string): string[] {
  const names: string[] = [];
  const re = /@([\u4e00-\u9fa5A-Za-z0-9_\-]{1,24})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ""))) names.push(m[1]);
  return names;
}

interface GroupReplyOpts {
  at?: boolean;
  atNames?: string[];
  interChatRound?: number;
  interChatMax?: number;
  lastSpeaker?: string;
  lastContent?: string;
}

/** 让群聊里单个角色回复一轮（含正在输入、记忆归档） */
async function replyOneGroupMember(
  convoId: string,
  member: GroupMemberInfo,
  fallbackConfig: AIConfig,
  opts: GroupReplyOpts = {}
): Promise<boolean> {
  try {
    let cfg = fallbackConfig;
    try {
      const resolved = await resolveRoleConfig(member.modelIds, "text");
      if (resolved) cfg = resolved;
    } catch { /* non-critical */ }
    const history: { role: string; content: string }[] = (
      await readMessages(convoId)
    )
      .filter((m) => m.role !== "system")
      .slice(-20)
      .map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content:
          m.senderName && m.role === "assistant"
            ? `${m.senderName}：${m.content}`
            : m.content,
      }));
    let systemPrompt = fillTemplate(
      await resolvePrompt("groupChat", PROMPT_DEFAULTS.groupChat),
      { 角色名: member.name, 角色设定: member.persona || "" }
    );
    // 群聊注入剧情梗概（中层记忆），长群聊不丢前情
    try {
      const convos = await readConversationsRaw();
      const summaryText = convos.find((c) => c.id === convoId)?.summary;
      if (summaryText?.trim()) {
        systemPrompt += `\n\n（更早的群聊剧情梗概，请视为真实发生过的事情）\n${summaryText}`;
      }
    } catch (e) { devWarning("localChat", `seed-resolve-config ${e}`); }
    try {
      const userProfile = await readProfile();
      systemPrompt += "\n\n" + genderHint(userProfile.gender);
    } catch (e) { devWarning("localChat", `seed-read-profile ${e}`); }
    try {
      const core = await getCoreProfile(member.roleId || "");
      if (core.length) systemPrompt += formatCoreBlock(core);
    } catch { /* non-critical */ }
    if (opts.interChatRound != null) {
      systemPrompt += `\n\n（现在是群聊角色互聊阶段，上一条消息是${
        opts.lastSpeaker ? opts.lastSpeaker + " 说的：" + (opts.lastContent || "") : "大家刚聊完一轮"
      }。这是互聊第 ${opts.interChatRound} 轮，总共最多 ${opts.interChatMax} 轮。请自然地接话推进话题；${
        opts.interChatRound >= (opts.interChatMax || 1)
          ? "这是最后一轮，请给这一轮话题一个自然的收尾（总结或道别），不要显得聊到一半就停了。"
          : "不要主动结束话题。"
      }请针对上一条消息的具体内容回应，不要重复自我介绍或之前说过的话；如果话题确实已经聊完，可在回复末尾单独输出（结束本轮）。）`;
    } else if (opts.at) {
      systemPrompt += `\n\n（用户本条消息 @ 了你，请重点回应。）`;
    } else if (opts.atNames?.length) {
      systemPrompt += `\n\n（用户本条消息 @ 了：${opts.atNames.join(
        "、"
      )}。你可以简单回应或不回应。）`;
    }
    systemPrompt +=
      "\n\n（本提示词之后若给出示例对话，仅用于参考说话风格，并非真实发生的对话。）";
    history.unshift({ role: "system", content: systemPrompt });
    if (member.examples?.length) {
      const fewShot = member.examples
        .filter((ex) => ex.content && ex.content.trim())
        .slice(0, 8)
        .map((ex) => ({
          role: ex.role === "user" ? ("user" as const) : ("assistant" as const),
          content: ex.content,
        }));
      if (fewShot.length) history.splice(1, 0, ...fewShot);
    }
    emitGroupTyping(convoId, member.name, true);
    const reply = await chatCompletion(cfg, history, {
      temperature: member.temperature,
      roleId: member.roleId,
      scene: "群聊",
    });
    // 去掉 AI 偶发的"角色名："前缀，避免界面重复显示发送者名
    let cleanReply = (reply || "").trim();
    for (const prefix of [member.name + "：", member.name + ":"]) {
      if (cleanReply.startsWith(prefix)) {
        cleanReply = cleanReply.slice(prefix.length).trim();
        break;
      }
    }
    const ended = /（结束本轮）\s*$/.test(cleanReply);
    cleanReply = cleanReply.replace(/（结束本轮）\s*$/, "").trim();
    if (!cleanReply) {
      emitGroupTyping(convoId, member.name, false);
      return false;
    }
    await appendIncomingMessage(
      convoId,
      {
        id: "a" + Date.now() + Math.floor(Math.random() * 1000),
        role: "assistant",
        content: cleanReply,
        senderName: member.name,
        createdAt: Date.now(),
      },
      member.name
    );
    emitChatUpdate(convoId);
    emitGroupTyping(convoId, member.name, false);
    // 记忆打通：每个成员把这一轮归档到自己的记忆库
    if (member.roleId) {
      const all = await readMessages(convoId);
      maybeAutoExtract(
        member.roleId,
        member.name,
        cfg,
        all,
        all.filter((m) => m.role !== "system").length
      ).catch(() => {});
    }
    return !ended;
  } catch (e: any) {
    emitGroupTyping(convoId, member.name, false);
    devWarning("localChat", `GROUP-REPLY-FAIL ${member.name} ${e?.message || e}`);
    return false;
  }
}

/** 群聊回复：@ 成员优先；随后角色互聊最多 N 轮（默认 6） */
async function replyAllGroupMembers(convoId: string, convo: LocalConvo) {
  let fallbackConfig = await readActiveAIConfig();
  const members = convo.memberInfos || [];
  if (!members.length) return;

  const rawMsgs = await readMessages(convoId);
  const lastUserMsg = [...rawMsgs].reverse().find((m) => m.role === "user");
  const atNames = extractAtNames(lastUserMsg?.content || "");

  // @ 的成员排前面优先回复
  const ordered = [...members].sort((a, b) => {
    const ia = atNames.includes(a.name) ? 0 : 1;
    const ib = atNames.includes(b.name) ? 0 : 1;
    return ia - ib;
  });

  // 第一轮：每个成员依次回复用户（一次一个）
  for (const member of ordered) {
    const ok = await replyOneGroupMember(convoId, member, fallbackConfig, {
      at: atNames.includes(member.name),
      atNames,
    });
    if (!ok) continue;
  }

  // 角色互聊：成员之间互相接话，最多 maxRounds 轮
  const maxRounds = Math.max(0, convo.maxInterChatRounds ?? 6);
  if (maxRounds > 0 && members.length >= 2) {
    let lastSpeaker: string | undefined;
    for (let r = 1; r <= maxRounds; r++) {
      const pool = members.filter((m) => m.name !== lastSpeaker);
      const member =
        pool.length > 0
          ? pool[(r - 1) % pool.length]
          : members[(r - 1) % members.length];
      const latest = (await readMessages(convoId)).slice(-1)[0];
      const ok = await replyOneGroupMember(convoId, member, fallbackConfig, {
        interChatRound: r,
        interChatMax: maxRounds,
        lastSpeaker,
        lastContent: latest?.senderName
          ? `${latest.senderName}：${latest.content}`
          : latest?.content,
      });
      if (!ok) break;
      lastSpeaker = member.name;
    }
  }
}

// ---------------- React hooks ----------------

export const useLocalChat = () => {
  const [conversations, setConversations] =
    useRecoilState(localConversationsState);
  const [messagesMap, setMessagesMap] = useRecoilState(localMessagesState);
  const [aiConfigs, setAiConfigs] = useRecoilState(aiConfigState);
  const [activeConfigId, setActiveConfigId] =
    useRecoilState(activeConfigIdState);

  /** 迁移单配置存储格式 */
  const migrateLegacyConfig = useCallback(async () => {
    try {
      const legacy = await AsyncStorage.getItem(LEGACY_CONFIG_KEY);
      if (legacy) {
        const cfg = JSON.parse(legacy);
        if (!cfg.name) cfg.name = "配置 1";
        if (!cfg.provider) cfg.provider = "custom";
        await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify([cfg]));
        await AsyncStorage.removeItem(LEGACY_CONFIG_KEY);
      }
    } catch { /* non-critical */ }
  }, []);

  const getAIConfigs = useCallback(async (): Promise<AIConfig[]> => {
    await migrateLegacyConfig();
    try {
      const raw = await AsyncStorage.getItem(CONFIG_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length) {
          setAiConfigs(list);
          return list;
        }
      }
    } catch { /* non-critical */ }
    setAiConfigs([DEFAULT_AI_CONFIG]);
    return [DEFAULT_AI_CONFIG];
  }, [migrateLegacyConfig]);

  const getAIConfig = useCallback(async (): Promise<AIConfig> => {
    const list = await getAIConfigs();
    const activeId = await AsyncStorage.getItem(ACTIVE_KEY);
    const active =
      list.find((c) => c.id === activeId) || list[0] || DEFAULT_AI_CONFIG;
    setActiveConfigId(active.id || "");
    return active;
  }, [getAIConfigs]);

  const saveAIConfigs = useCallback(async (list: AIConfig[]) => {
    setAiConfigs(list);
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(list));
  }, []);

  const setActiveConfig = useCallback(async (id: string) => {
    setActiveConfigId(id);
    await AsyncStorage.setItem(ACTIVE_KEY, id);
  }, []);

  const addConfig = useCallback(async (cfg: AIConfig): Promise<AIConfig> => {
    const list = await getAIConfigs();
    const item = { ...cfg, id: cfg.id || "cfg-" + Date.now() };
    list.push(item);
    await saveAIConfigs(list);
    await setActiveConfig(item.id);
    return item;
  }, [getAIConfigs, saveAIConfigs, setActiveConfig]);

  // 保存当前配置：按 id 更新或新增
  const saveAIConfig = useCallback(async (cfg: AIConfig) => {
    const list = await getAIConfigs();
    if (cfg.id && list.some((c) => c.id === cfg.id)) {
      const next = list.map((c) => (c.id === cfg.id ? cfg : c));
      await saveAIConfigs(next);
    } else {
      await addConfig(cfg);
    }
  }, [getAIConfigs, saveAIConfigs, addConfig]);

  const loadConversations = useCallback(async (): Promise<LocalConvo[]> => {
    const list = await readConversationsRaw();
    const visible = list.filter((c) => !c.hidden);
    setConversations(visible);
    return visible;
  }, []);

  const loadMessages = useCallback(async (convoId: string): Promise<LocalMsg[]> => {
    const list = await readMessages(convoId);
    setMessagesMap((pre) => ({ ...pre, [convoId]: list }));
    return list;
  }, []);

  const ensureSeeded = useCallback(async () => {
    requestNotificationPermission().catch(() => {});
    const list = await readConversationsRaw();
    if (list.length) {
      setConversations(list.filter((c) => !c.hidden));
      return;
    }
    const convo: LocalConvo = {
      id: "local-ai-1",
      title: DEFAULT_CONVO_TITLE,
      lastMessage: "TA 会记住你们的对话、有自己的日程，还会主动来找你聊天。去吧，TA 等你好久了～",
      updatedAt: Date.now(),
    };
    await writeConversationsRaw([convo]);
    // 叙事化引导开场：无好友时先把用户带入"这个世界"，再引导去添加第一个角色
    const WELCOME_LINES = [
      "欢迎来到 RE:SON！这里有一群有自己生活的角色——可莉正在蒙德等她最好的朋友，甘雨在璃月忙着工作，钟离在茶馆听书……",
      "去右上角的 + → 添加朋友，挑一个你喜欢的角色吧，TA 正等着你说第一句话。",
      "TA 会记住你们的对话、有自己的日程，还会主动来找你聊天。去吧，TA 等你好久了～",
    ];
    const seedMsgs: LocalMsg[] = WELCOME_LINES.map((c, i) => ({
      id: "seed-" + (i + 1),
      role: "assistant",
      content: c,
      createdAt: Date.now() + i * 2000,
    }));
    for (const m of seedMsgs) await sqlAppendMessage(convo.id, m);
    setConversations([convo]);
    setMessagesMap((pre) => ({ ...pre, [convo.id]: seedMsgs }));
    // 开场白默认未读，让新用户打开首页就能看到红点
    await incrementUnread(convo.id);
  }, []);

  return {
    conversations,
    messagesMap,
    aiConfigs,
    activeConfigId,
    aiConfig: aiConfigs.find((c) => c.id === activeConfigId) || aiConfigs[0],
    loadConversations,
    loadMessages,
    ensureSeeded,
    getAIConfigs,
    getAIConfig,
    saveAIConfigs,
    saveAIConfig,
    setActiveConfig,
    addConfig,
  };
};

/** 提取角色回复中内联的记忆指令 <add:内容>，从正文移除并返回列表 */
function extractInlineAdds(text: string): { clean: string; adds: string[] } {
  const adds: string[] = [];
  const clean = text.replace(/<add:([^>]+)>/g, (_m, content) => {
    const c = String(content || "").trim();
    if (c) adds.push(c);
    return "";
  });
  return { clean, adds };
}
