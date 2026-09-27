import AsyncStorage, { withStorageLock } from "../utils/storage";
import { devWarning } from "../utils/devLog";
import { sqlAppendMessage, sqlReadRole } from "./appDb";
import { chatCompletion, AIConfig } from "../utils/ai";
import { resolveRoleConfig } from "./models";
import { readRagSettings } from "./memory";
import {
  notifyNewMessage,
  scheduleNotificationAt,
  cancelScheduledNotification,
  dismissNotification,
  requestNotificationPermission,
} from "./notifications";
import { incrementUnread, isConvoActive } from "./unread";
import eventBus from "../utils/eventBus";
import { cleanChatText } from "../utils/sanitize";
import { readProfile, genderHint } from "./profile";
import {
  persistVoiceAudio,
  resolveVoiceForEmotion,
  synthTTS,
} from "../utils/ttson";
import {
  fillTemplate,
  PROMPT_DEFAULTS,
  resolvePrompt,
} from "./promptEditing";

const TASKS_KEY = "wc_local_proactive_tasks";
const CONVO_KEY = "wc_local_conversations";
const CONFIG_KEY = "wc_local_ai_configs_v3";
const ACTIVE_KEY = "wc_local_ai_active_id_v3";

// 防打扰：每天最多 5 条主动消息；23:00-08:00 不排程
const DAILY_CAP = 5;
const NIGHT_START_HOUR = 23;
const NIGHT_END_HOUR = 8;
const CAP_KEY = "wc_local_proactive_daily";

interface ProactiveTask {
  convoId: string;
  title: string;
  fireAt: number;
  content: string; // 排程时已生成好的主动消息内容
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** 同一会话的主动消息插入互斥，避免并发触发导致同一条消息插入两遍 */
const insertingConvos = new Set<string>();

async function readTasks(): Promise<ProactiveTask[]> {
  try {
    const raw = await AsyncStorage.getItem(TASKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeTasks(list: ProactiveTask[]) {
  await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(list));
}

/** 提示词：让模型在需要时输出 <proactive:延迟分钟数> */
export function proactiveInstruction(): string {
  return `\n\n【主动找用户】你可以在合适的时候主动找用户聊天。如果当前回复后，你预感到用户可能会等待你的后续（例如话题需要过一会儿再跟进、想关心一下对方、或者对话自然停顿了），可以在回复末尾输出 <proactive:分钟数> 指令（例如 <proactive:10>），系统会按指定时间主动帮你发一条消息给用户。没有需要就别输出。`;
}

/** 从回复中提取 <proactive:N> 指令，返回分钟数（无则 -1） */
export function parseProactiveTag(reply: string): number {
  const m = reply.match(/<proactive:(\d+)>/);
  if (!m) return -1;
  const n = parseInt(m[1], 10);
  return n > 0 ? n : -1;
}

export function stripProactiveTag(text: string): string {
  return text.replace(/<proactive:\d+>/g, "").trim();
}

/** 从用户消息中识别"等我 X 分钟"等等待意图（返回分钟数，无则 -1） */
export function parseUserWait(text: string): number {
  const t = (text || "").trim();
  const m = t.match(/等(?:我)?\s*(\d+)\s*分(?:钟)?/);
  if (m) {
    const n = parseInt(m[1], 10);
    return n > 0 ? n : 1;
  }
  if (/等(?:我)?(?:一小会|一会儿|一下|一分钟)/.test(t)) return 1;
  return -1;
}

async function readActiveAIConfig(): Promise<AIConfig> {
  const fallback: AIConfig = {
    apiDomain: "",
    apiKey: "",
    model: "",
  };
  // 新模型管理（wc_local_providers_v1）优先
  try {
    const resolved = await resolveRoleConfig(undefined, "text");
    if (resolved) return resolved;
  } catch {}
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length) {
        const activeId = await AsyncStorage.getItem(ACTIVE_KEY);
        return (
          list.find((c) => c.id === activeId) || list[0] || fallback
        );
      }
    }
  } catch {}
  return fallback;
}

async function generateProactiveContent(
  convo: any,
  title: string
): Promise<string> {
  // 会话索引不再存角色人设，需要时从角色卡补全
  let persona = convo?.rolePersona || "";
  let modelIds = convo?.roleModelIds;
  if (!persona && convo?.roleId) {
    try {
      const r = await sqlReadRole(convo.roleId);
      if (r) {
        persona = r.persona || "";
        if (!modelIds) modelIds = r.modelIds;
      }
    } catch {}
  }
  let config = await readActiveAIConfig();
  try {
    const resolved = await resolveRoleConfig(modelIds, "text");
    if (resolved) config = resolved;
  } catch {}
  const systemPrompt = fillTemplate(
    await resolvePrompt("proactive", PROMPT_DEFAULTS.proactive),
    { 角色名: convo?.roleName || title, 角色设定: persona }
  );
  let finalPrompt = systemPrompt;
  try {
    const userProfile = await readProfile();
    finalPrompt += "\n\n" + genderHint(userProfile.gender);
  } catch {}
  const reply = await chatCompletion(
    config,
    [
      { role: "system", content: finalPrompt },
      { role: "user", content: "（主动找用户聊天）" },
    ],
    {
      temperature: 0.8,
      maxTokens: 300,
      noThinking: true,
      roleId: convo?.roleId,
      scene: "主动消息",
    }
  );
  let clean = (reply || "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<proactive:\d+>/g, "")
    .trim()
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "");
  // 兜底：模型仍输出"任务理解/复述要求"段时，取最后一段对话式内容
  if (
    /^(用户要求|首先|我需要|好的|明白了|让我|作为|请|我们需要|以.+身份)/.test(
      clean
    ) ||
    clean.length > 400
  ) {
    const parts = clean
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    clean = parts[parts.length - 1] || "";
  }
  // 取到最后一段仍是任务描述（无实际消息内容）时，跳过本次主动消息
  if (
    !clean ||
    /我们需要以|请以.+身份|不超过\s*\d+\s*字|不要输出|不要提及你是|复述要求/.test(
      clean
    )
  ) {
    return "";
  }
  return clean.slice(0, 500);
}

/** 注册主动消息任务：排程时生成内容，预约系统通知（后台也能弹） */
export async function scheduleProactive(
  convoId: string,
  minutes: number,
  title: string,
  preContent?: string,
  force = false
) {
  const settings = await readRagSettings();
  if (!force && !settings.proactiveEnabled) return;
  const fireAt = Date.now() + minutes * 60000;
  if (settings.proactiveNightSilence) {
    const fireDate = new Date(fireAt);
    const hour = fireDate.getHours();
    if (hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR) {
      devWarning("proactive", `PROACTIVE-SKIP night silence ${hour}`);
      return;
    }
  }

  // 内容优先使用调用方已生成好的（世界线导演）；否则排程时生成
  let content = preContent || "";
  if (!content) {
    try {
      const convosRaw = await AsyncStorage.getItem(CONVO_KEY);
      const convos = convosRaw ? JSON.parse(convosRaw) : [];
      const convo = convos.find((c: any) => c.id === convoId);
      content = await generateProactiveContent(convo, title);
    } catch {}
  }
  if (!content) return;

  // 原子入队：并发调度同一会话时，任务列表读-改-写不互相覆盖
  const task = await withStorageLock(async () => {
    const tasks = (await readTasks()).filter((t) => t.convoId !== convoId);
    tasks.push({ convoId, title, fireAt, content });
    await writeTasks(tasks);
    return tasks.find((t) => t.convoId === convoId)!;
  });

  await scheduleNotificationAt(
    "proactive-" + convoId,
    title,
    content
      .replace(/<voice:[\s\S]*?<\/voice>|<voice:[^>]+>/g, "")
      .replace(/<voice_emotion:[^>]+>/g, "")
      .trim()
      .slice(0, 80),
    fireAt,
    convoId
  );
  armTimer(task);
}

export async function cancelProactive(convoId: string) {
  const tasks = (await readTasks()).filter((t) => t.convoId !== convoId);
  await writeTasks(tasks);
  const timer = timers.get(convoId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(convoId);
  }
  await cancelScheduledNotification("proactive-" + convoId);
}

function armTimer(task: ProactiveTask) {
  const old = timers.get(task.convoId);
  if (old) clearTimeout(old);
  const wait = Math.max(0, task.fireAt - Date.now());
  timers.set(
    task.convoId,
    setTimeout(() => {
      timers.delete(task.convoId);
      insertProactiveMessage(task).catch(() => {});
    }, wait)
  );
}

/** 到点把已生成的内容插入会话（App 存活时）；系统通知由 OS 处理 */
async function insertProactiveMessage(task: ProactiveTask) {
  if (insertingConvos.has(task.convoId)) return;
  insertingConvos.add(task.convoId);
  try {
    // 原子取出并删除任务：计时器/启动巡检等并发触发时只有一个能拿到，
    // 拿到才继续，避免同一条任务被插入多遍
    const removed = await withStorageLock(async () => {
      const tasks = await readTasks();
      if (!tasks.some((t) => t.convoId === task.convoId)) return false;
      await writeTasks(tasks.filter((t) => t.convoId !== task.convoId));
      return true;
    });
    if (!removed) return;
    await cancelScheduledNotification("proactive-" + task.convoId);
    await dismissNotification("proactive-" + task.convoId);

    const voiceTag = /<voice:([^>]+?)(?:<\/voice>)?>/.exec(task.content);
    const cleanContent = cleanChatText(
      task.content
        .replace(/<voice:[\s\S]*?<\/voice>|<voice:[^>]+>/g, "")
        .replace(/<voice_emotion:[^>]+>/g, "")
    ).trim();
    const voiceText = voiceTag
      ? (voiceTag[1] || "").replace(/<\/?[a-z]*$/i, "").trim()
      : "";
    const finalContent = voiceTag
      ? voiceText || cleanContent
      : cleanContent;

    // 内容级去重：5 分钟内同会话已插入过相同内容则放弃（兜住调度竞争产生的重复排程）
    try {
      const { readMessages } = await import("./localChat");
      const msgs = await readMessages(task.convoId);
      const last = msgs[msgs.length - 1];
      if (
        last &&
        last.role === "assistant" &&
        last.content === finalContent &&
        Date.now() - last.createdAt < 5 * 60 * 1000
      ) {
        return;
      }
    } catch {}

    // 主动消息/生日祝福语音：带 <voice:X> 时按角色音色合成（合成失败降级文字，内容不丢）
    // 放在去重之后，避免重复消息浪费 TTS 额度
    let audioUrl: string | null = null;
    if (voiceTag) {
      try {
        const roleId = task.convoId.replace(/^role-/, "");
        const role = roleId ? await sqlReadRole(roleId) : null;
        if (role?.voice && voiceText) {
          const remote = await synthTTS(
            resolveVoiceForEmotion(role.voice, undefined),
            voiceText.slice(0, 100)
          );
          if (remote) {
            const local = await persistVoiceAudio(remote, "pv" + Date.now());
            audioUrl = local || remote;
          }
        }
      } catch {}
    }
    const preview = (voiceTag ? voiceText : cleanContent).slice(0, 80);
    const msgId = "p" + Date.now() + Math.floor(Math.random() * 1000);
    await withStorageLock(async () => {
      const convosRaw = await AsyncStorage.getItem(CONVO_KEY);
      const convos = convosRaw ? JSON.parse(convosRaw) : [];
      const nextConvos = convos.map((c: any) =>
        c.id === task.convoId
          ? { ...c, lastMessage: finalContent.slice(0, 200), updatedAt: Date.now() }
          : c
      );
      await AsyncStorage.setItem(CONVO_KEY, JSON.stringify(nextConvos));

      await sqlAppendMessage(task.convoId, {
        id: msgId,
        role: "assistant",
        content: finalContent,
        audio: audioUrl || undefined,
        createdAt: Date.now(),
      });
    });

    if (isConvoActive(task.convoId)) {
      eventBus.emit("local-chat-updated", task.convoId);
    } else {
      await incrementUnread(task.convoId);
      await notifyNewMessage(
        task.title,
        preview,
        task.convoId,
        msgId
      );
      // 主动消息落库后也要刷新主页列表（新消息预览 + 排序）
      eventBus.emit("local-chat-updated", task.convoId);
    }
  } catch {
  } finally {
    insertingConvos.delete(task.convoId);
  }
}

/** 检查并触发到期的主动消息（应用启动 / 进入会话时调用） */
export async function checkDueProactiveTasks() {
  const tasks = await readTasks();
  const now = Date.now();
  for (const t of tasks) {
    if (t.fireAt <= now) {
      insertProactiveMessage(t).catch(() => {});
    } else {
      armTimer(t);
    }
  }
}

/** 应用启动时请求通知权限 */
export function requestProactivePermission() {
  requestNotificationPermission().catch(() => {});
}
