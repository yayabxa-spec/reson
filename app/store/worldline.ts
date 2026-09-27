import AsyncStorage, { withStorageLock } from "../utils/storage";
import { devWarning } from "../utils/devLog";
import { chatCompletion, AIConfig } from "../utils/ai";
import { readRolesRaw } from "./roles";
import { sqlReadRole } from "./appDb";
import {
  readConversationsRaw,
  readMessages,
  LocalConvo,
  LocalMsg,
} from "./localChat";
import { readRagSettings } from "./memory";
import { resolveRoleConfig, ensureProvidersSeeded } from "./models";
import { scheduleProactive } from "./proactive";
import { readProfile, genderHint, resolveCallName } from "./profile";
import { invalidateWorldlineCache } from "./roleStatus";
import { fetchWeather, formatWeatherText, WeatherInfo } from "./weather";
import {
  retrieveMemories,
  formatMemoriesBlock,
  getCoreProfile,
  formatCoreBlock,
} from "./memory";
import { userStatusPromptLine } from "./userStatus";
import { appendMemory } from "./memory";
import eventBus from "../utils/eventBus";
import {
  fillTemplate,
  PROMPT_DEFAULTS,
  resolvePrompt,
} from "./promptEditing";

// ============================================================
// 世界线导演：让角色活在自己的世界里
// 每天为「已添加好友」的角色生成当日时间线（作息/日常/趣事/情绪），
// 到时间线里的自然时机点，由角色本人按人设决定是否主动找用户聊天。
// ============================================================

const TIMELINE_KEY = "wc_worldline_timeline_v1";
const GEN_STATE_KEY = "wc_worldline_gen_v1";
const FOLLOW_UP_KEY = "wc_worldline_followup_v1";
const FOLLOW_UP_STATE_KEY = "wc_worldline_followup_state_v1";
const WORLD_EVENTS_KEY = "wc_world_events_v1";

// 派发锁：主动消息派发是「读-改-写」整段流程，App 回前台/保活心跳/定时巡检/
// 启动等多个触发源会并发调用 dispatchWorldline。无锁时同一时间槽会被重复选中、
// dispatched 标记互相覆盖，导致同一条消息反复生成并发送。
let dispatchLock = false;

// 每角色每天跟进主动消息上限
const FOLLOW_UP_DAILY_LIMIT = 3;
// 第二次跟进的等待时间（第一次跟进发出/安排后至少等待这么久）
const FOLLOW_UP_SECOND_DELAY = 60 * 60 * 1000;

export interface TimelineSlot {
  start: string; // "08:00"
  end: string; // "09:00"
  activity: string; // 角色此刻在做什么
  state?: string; // 极简状态短语（8字内，微信状态风格，如"赖床中""在炸鱼"）；展示用
  mood: string; // 情绪状态
  initiative: 0 | 1 | 2; // 主动意愿：0=不想打扰 1=有点想找 2=很想找用户
  reason: string; // initiative>=1 时的自然由头
}

export interface FriendTimeline {
  roleId: string;
  name: string; // 显示名（备注优先）
  persona: string;
  callName: string; // 角色对用户的称呼
  work?: string; // 所属作品（内置角色=原神；自定义角色无作品=独立世界）
  modelIds?: any; // 角色绑定的模型（文本/图像/语音）
  date: string; // yyyy-mm-dd
  slots: TimelineSlot[];
  activityLevel: "low" | "normal" | "high"; // 今日活跃度档位
  dailyBudget: number; // 今日主动预算（条数）
}

export interface WorldlineDay {
  date: string;
  friends: FriendTimeline[];
  /** roleId -> 已处理的 slot start 集合（避免同一时段重复发） */
  dispatched: Record<string, string[]>;
  /** roleId -> 上次主动消息时间戳（冷却） */
  lastProactiveAt: Record<string, number>;
  /** roleId -> 今日已发主动消息数 */
  sentCount: Record<string, number>;
  /** roleId -> 最近 5 次用户响应（1=回复了 0=忽略） */
  feedback: Record<string, number[]>;
}

const genLock: Record<string, boolean> = {};
/** 生成期间又被要求补生成（例如连续加好友）：生成结束后自动再跑一次 */
const genQueued: Record<string, boolean> = {};

const WL_MEMORY_DONE_KEY = "wc_worldline_memory_done"; // { "yyyy-mm-dd": string[] } 已沉淀记忆的角色

/**
 * 世界线沉淀：把当天生成的角色生活（作息/情绪/趣事）写入角色记忆（type=life）。
 * 每天每个角色只沉淀一次，防重复；内容带日期，形成角色自己的时间线。
 */
async function persistWorldlineMemories(
  list: FriendTimeline[],
  date: string
): Promise<void> {
  if (!list.length) return;
  let done: string[] = [];
  try {
    const raw = await AsyncStorage.getItem(WL_MEMORY_DONE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    done = map[date] || [];
  } catch {}
  const toAdd = list.filter((f) => !done.includes(f.roleId));
  if (!toAdd.length) return;
  for (const f of toAdd) {
    const slots = f.slots || [];
    // 优先取有主动意愿的片段，不足则取前两个
    const picked =
      slots.filter((s) => s.initiative >= 1).slice(0, 3).length >= 1
        ? slots.filter((s) => s.initiative >= 1).slice(0, 3)
        : slots.slice(0, 2);
    if (!picked.length) {
      done.push(f.roleId);
      continue;
    }
    const lines = picked.map(
      (s) =>
        `${s.start} ${s.activity}（${s.mood}${s.reason ? "，" + s.reason : ""}）`
    );
    await appendMemory(
      f.roleId,
      `【${date} 我的一天】${lines.join("；")}`,
      "auto",
      { type: "life", occurredAt: Date.now() }
    ).catch(() => {});
    done.push(f.roleId);
  }
  try {
    const raw = await AsyncStorage.getItem(WL_MEMORY_DONE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[date] = done;
    await AsyncStorage.setItem(WL_MEMORY_DONE_KEY, JSON.stringify(map));
  } catch {}
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function toMin(hhmm: string): number {
  const [h, m] = (hhmm || "00:00").split(":").map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

function isSlotNow(slot: TimelineSlot, now: string): boolean {
  const n = toMin(now);
  const s = toMin(slot.start);
  const e = toMin(slot.end);
  return n >= s && n < Math.max(e, s + 30);
}

async function readWorldline(): Promise<WorldlineDay | null> {
  try {
    const raw = await AsyncStorage.getItem(TIMELINE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeWorldline(w: WorldlineDay) {
  await AsyncStorage.setItem(TIMELINE_KEY, JSON.stringify(w));
  invalidateWorldlineCache();
}

async function readGenState(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(GEN_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function readFollowUpCount(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(FOLLOW_UP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeFollowUpCount(map: Record<string, number>) {
  await AsyncStorage.setItem(FOLLOW_UP_KEY, JSON.stringify(map));
}

interface FollowUpState {
  stage: number; // 0=无跟进 1=已跟第一次 2=已跟第二次
  lastAt: number;
}

async function readFollowUpState(): Promise<Record<string, FollowUpState>> {
  try {
    const raw = await AsyncStorage.getItem(FOLLOW_UP_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeFollowUpState(map: Record<string, FollowUpState>) {
  await AsyncStorage.setItem(FOLLOW_UP_STATE_KEY, JSON.stringify(map));
}

/** 获取已添加好友的角色（status done + 有会话） */
export async function getFriendRoles() {
  const roles = await readRolesRaw();
  const convos = await readConversationsRaw();
  const convoIds = new Set(convos.map((c) => c.id));
  return roles.filter(
    (r) =>
      r.status === "done" &&
      convoIds.has("role-" + r.id) &&
      !r.id.startsWith("local-")
  );
}

function displayName(convo: LocalConvo | undefined, roleName: string) {
  return convo?.remark || convo?.roleName || convo?.title || roleName;
}

/**
 * 为单个角色生成今日时间线（添加好友申请通过前调用）：
 * 让角色先"入戏"（有自己的今日生活安排），再进入聊天。
 * 已有今日时间线则跳过；失败静默（不阻塞添加流程）。
 * 内部串行队列：多个好友同时通过时依次生成，避免并发写 AsyncStorage。
 */
let timelineChain: Promise<void> = Promise.resolve();

export function ensureFriendTimeline(roleId: string): Promise<void> {
  timelineChain = timelineChain
    .then(() => doEnsureFriendTimeline(roleId))
    .catch(() => {});
  return timelineChain;
}

async function doEnsureFriendTimeline(roleId: string): Promise<void> {
  try {
    const today = todayStr();
    const roles = await readRolesRaw();
    const role = roles.find((r) => r.id === roleId);
    if (!role) return;
    const wl = await readWorldline();
    if (wl?.date === today && wl.friends.some((f) => f.roleId === roleId)) {
      return; // 今天已有该角色时间线
    }
    await ensureProvidersSeeded();
    const config = await resolveRoleConfig(undefined, "text");
    if (!config) return;
    const convos = await readConversationsRaw();
    const convo = convos.find((c) => c.id === "role-" + roleId);
    const work = inferWork(role);
    const workByRole = new Map(
      roles.map((r: any) => [r.id, inferWork(r)])
    );
    const eventsText = work
      ? await ensureWorldEventsForWork(work, [role.name], config)
      : "";
    const siblingText = work
      ? buildSiblingText(
          wl?.date === today ? wl.friends : [],
          work,
          workByRole
        )
      : "";
    const tl = await generateOneTimeline(
      {
        id: role.id,
        name: role.name,
        persona: role.persona,
        region: role.region,
        work,
      },
      config,
      eventsText,
      siblingText
    );
    if (!tl.slots.length) return;
    const friend: FriendTimeline = {
      roleId: role.id,
      name: displayName(convo, role.name),
      persona: role.persona,
      callName:
        convo?.roleCallName || (await resolveCallName(role.callName)),
      modelIds: convo?.roleModelIds,
      work: work || undefined,
      date: today,
      slots: tl.slots,
      activityLevel: tl.activityLevel,
      dailyBudget: tl.dailyBudget,
    };
    const base: WorldlineDay =
      wl?.date === today
        ? wl
        : {
            date: today,
            friends: [],
            dispatched: {},
            lastProactiveAt: {},
            sentCount: {},
            feedback: {},
          };
    const next: WorldlineDay = {
      ...base,
      friends: [
        ...base.friends.filter((f) => f.roleId !== roleId),
        friend,
      ],
    };
    await writeWorldline(next);
    await persistWorldlineMemories([friend], today);
    eventBus.emit("worldline-updated");
  } catch {
    // 时间线生成失败不阻塞添加好友
  }
}

/** 删除好友时调用：从今日世界线移除该角色（含派发/反馈状态） */
export async function removeFriendFromWorldline(
  roleId: string
): Promise<void> {
  try {
    const wl = await readWorldline();
    if (!wl) return;
    wl.friends = wl.friends.filter((f) => f.roleId !== roleId);
    delete wl.dispatched?.[roleId];
    delete wl.lastProactiveAt?.[roleId];
    delete wl.sentCount?.[roleId];
    delete wl.feedback?.[roleId];
    await writeWorldline(wl);
    eventBus.emit("worldline-updated");
  } catch {}
}

/** 导演决策用：角色的长期档案 + 最近记忆，作为"和用户的关系背景" */
async function buildRelationNote(friend: {
  id: string;
  name: string;
  persona?: string;
  region?: string;
}): Promise<string> {
  try {
    const core = await getCoreProfile(friend.id);
    const recent = await retrieveMemories(friend.id, "最近 我们 之间", {
      topK: 3,
      full: true,
    });
    const lines = [
      ...core.map((m) => "- " + m.content),
      ...recent.map((m) => "- " + m.content),
    ];
    return lines.slice(0, 8).join("\n");
  } catch {
    return "";
  }
}

async function buildTimelinePrompt(
  friend: { id: string; name: string; persona: string; region?: string; work?: string },
  date: string,
  nowHHMM: string,
  relationNote?: string,
  summaryText?: string,
  worldEventsText?: string,
  siblingText?: string
): Promise<string> {
  const persona = friend.persona || "";
  const relationLine = relationNote
    ? `\n\n你和用户的关系背景（用于判断你今天想不想主动找 TA）：\n${relationNote}`
    : "";
  let prompt = fillTemplate(
    await resolvePrompt("worldline", PROMPT_DEFAULTS.worldline),
    {
      日期: date,
      角色名: friend.name,
      角色设定: persona || "（无详细设定）",
      关系背景: relationLine,
      当前时间: nowHHMM,
    }
  );
  if (summaryText) {
    prompt += `\n\n【你们最近的剧情梗概】\n${summaryText}\n请让今天的日程与剧情连贯：进行中的事情/约定可以自然地安排进去，不要与最近聊过的内容矛盾，也不要每天重复同样的活动。`;
  }
  if (worldEventsText) {
    prompt += `\n\n【今天这个世界发生的事】\n${worldEventsText}\n你的日程可以和这些世界事件自然呼应（参与、受影响或避开都可以）。`;
  }
  if (siblingText) {
    prompt += `\n\n【同作品其他角色今天的安排（供呼应，不要生搬硬套）】\n${siblingText}`;
  }
  return prompt;
}

interface WorldEvent {
  start: string;
  end: string;
  title: string;
  desc: string;
}

interface WorldEventsStore {
  date: string;
  works: Record<string, WorldEvent[]>;
}

/** 内置角色归入「原神」共享世界；自定义角色无作品信息，各自独立 */
function inferWork(r: { isSystem?: boolean }): string {
  return r.isSystem ? "原神" : "";
}

async function readWorldEvents(): Promise<WorldEventsStore> {
  try {
    const raw = await AsyncStorage.getItem(WORLD_EVENTS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") {
        return { date: obj.date || "", works: obj.works || {} };
      }
    }
  } catch {}
  return { date: "", works: {} };
}

async function writeWorldEvents(store: WorldEventsStore) {
  await AsyncStorage.setItem(WORLD_EVENTS_KEY, JSON.stringify(store));
}

function formatWorldEvents(events: WorldEvent[]): string {
  return events
    .map((e) => `- ${e.start}~${e.end} ${e.title}：${e.desc}`)
    .join("\n");
}

/** 判断一段文本是否为疑问句（末尾疑问词/问号） */
function isQuestionText(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  return (
    /[\?？]\s*$/.test(t) ||
    /(吗|呢|么|吧|怎么样|如何|什么|哪|谁|几|多[少久])\s*[。！!]?\s*$/.test(t)
  );
}

/** 判断人设是否为话少/偏冷性格（留白策略用） */
function isQuietPersona(persona: string): boolean {
  return /话少|沉默|冷淡|高冷|寡言|惜字如金|不爱说话|少言|冷若冰霜/.test(
    persona || ""
  );
}

/** 汇总同作品已生成角色的日程（供后续角色生成时呼应） */
function buildSiblingText(
  friendList: FriendTimeline[],
  work: string,
  workByRole: Map<string, string>
): string {
  return friendList
    .filter(
      (f) =>
        (f.work || workByRole.get(f.roleId) || "") === work &&
        f.slots.length
    )
    .slice(-6)
    .map(
      (f) =>
        `${f.name}：${f.slots
          .map((s) => `${s.start}-${s.end} ${s.activity}`)
          .join("；")}`
    )
    .join("\n")
    .slice(0, 800);
}

function parseWorldEvents(text: string): WorldEvent[] {
  let t = String(text || "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(t.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x: any) =>
          x &&
          typeof x.start === "string" &&
          typeof x.end === "string" &&
          (x.title || x.desc)
      )
      .map((x: any) => ({
        start: String(x.start).slice(0, 5),
        end: String(x.end).slice(0, 5),
        title: String(x.title || "事件").slice(0, 30),
        desc: String(x.desc || "").slice(0, 100),
      }))
      .slice(0, 4);
  } catch {
    return [];
  }
}

/** 每天为每个作品生成一次共享世界事件；返回格式化文本（失败返回空串） */
async function ensureWorldEventsForWork(
  work: string,
  roleNames: string[],
  config: AIConfig
): Promise<string> {
  try {
    const today = todayStr();
    const store = await readWorldEvents();
    if (store.date === today && store.works[work]?.length) {
      return formatWorldEvents(store.works[work]);
    }
    const prompt = fillTemplate(
      await resolvePrompt("worldEvents", PROMPT_DEFAULTS.worldEvents),
      {
        作品名: work,
        日期: today,
        角色名单: roleNames.join("、") || "（暂无）",
      }
    );
    const reply = await chatCompletion(
      config,
      [{ role: "user", content: prompt }],
      {
        temperature: 0.9,
        maxTokens: 800,
        noThinking: true,
        scene: "世界线生成",
      }
    );
    const events = parseWorldEvents(reply);
    if (!events.length) return "";
    await writeWorldEvents({
      date: today,
      works: { ...store.works, [work]: events },
    });
    return formatWorldEvents(events);
  } catch {
    return "";
  }
}

function parseTimelineJSON(
  text: string
): {
  slots: TimelineSlot[];
  activityLevel: "low" | "normal" | "high";
  dailyBudget: number;
} {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  try {
    const obj = JSON.parse(t);
    const arr = Array.isArray(obj?.slots) ? obj.slots : [];
    const slots = arr
      .filter(
        (x: any) =>
          x &&
          typeof x.start === "string" &&
          typeof x.end === "string" &&
          typeof x.activity === "string" &&
          x.activity.trim()
      )
      .map((x: any) => ({
        start: x.start.slice(0, 5),
        end: x.end.slice(0, 5),
        activity: String(x.activity).trim().slice(0, 200),
        state: x.state ? String(x.state).trim().slice(0, 12) : "",
        mood: String(x.mood || "").trim().slice(0, 60),
        initiative:
          x.initiative === 2 ? 2 : x.initiative === 1 ? 1 : 0,
        reason: String(x.reason || "").trim().slice(0, 120),
      }));
    const lvl = obj?.activity_level === "low" ? "low" : obj?.activity_level === "high" ? "high" : "normal";
    const budget = Math.min(
      10,
      Math.max(1, parseInt(obj?.daily_budget, 10) || 5)
    );
    return { slots, activityLevel: lvl, dailyBudget: budget };
  } catch {
    return { slots: [], activityLevel: "normal", dailyBudget: 5 };
  }
}

async function generateOneTimeline(
  friend: { id: string; name: string; persona: string; region?: string; work?: string },
  config: AIConfig,
  worldEventsText?: string,
  siblingText?: string
): Promise<{
  slots: TimelineSlot[];
  activityLevel: "low" | "normal" | "high";
  dailyBudget: number;
}> {
  const summaryText = await getConvoSummary("role-" + friend.id);
  const reply = await chatCompletion(
    config,
    [
      {
        role: "system",
        content: "你是一个乐于助人的助手。",
      },
      {
        role: "user",
        content:
          "请直接输出 JSON，不要任何解释、不要 markdown 代码块、不要思考过程。\n\n" +
          await buildTimelinePrompt(
            friend,
            todayStr(),
            nowHHMM(),
            await buildRelationNote(friend),
            summaryText,
            worldEventsText,
            siblingText
          ),
      },
    ],
    {
      temperature: 0.9,
      maxTokens: 3000,
      noThinking: true,
      roleId: friend.id,
      scene: "世界线生成",
    }
  );
  return parseTimelineJSON(reply);
}

/**
 * 确保今天的世界线已生成：每天只生成一次，只给已添加好友的角色生成。
 * 返回是否生成了今天的时间线（或已存在）。
 */
export async function ensureWorldlineToday(): Promise<boolean> {
  const today = todayStr();
  if (genLock[today]) {
    genQueued[today] = true;
    return true;
  }
  genLock[today] = true;
  try {
    const state = await readGenState();
    const friends = await getFriendRoles();
    const convos = await readConversationsRaw();
    const wl = await readWorldline();
    if (state[today] && wl && wl.date === today && wl.friends.length) {
      // 时间线缺少 initiative 字段时视为未生成，需要重跑
      const oldFormat = wl.friends.some((f) =>
        f.slots.some((s) => (s as any).initiative === undefined)
      );
      if (oldFormat) {
        // 继续走下方完整重新生成
      } else {
      // 已有今天的记录：检查是否有新添加的好友需要补生成
      const knownIds = new Set(wl.friends.map((f) => f.roleId));
      const newFriends = friends.filter((r) => !knownIds.has(r.id));
        if (!newFriends.length) return true;
        // 只给新好友补生成时间线，保留已有内容
        const settings = await readRagSettings();
        if (!settings.proactiveEnabled || !newFriends.length) return true;
        await ensureProvidersSeeded();
        const config = await resolveRoleConfig(undefined, "text");
        if (!config) return true;
        const convoMap = new Map(convos.map((c) => [c.id, c]));
        const workByRole = new Map(
          friends.map((r: any) => [r.id, inferWork(r)])
        );
        const list = [...wl.friends];
        for (const r of newFriends.slice(0, 20)) {
          const convo = convoMap.get("role-" + r.id);
          const work = inferWork(r);
          const eventsText = work
            ? await ensureWorldEventsForWork(work, [r.name], config)
            : "";
          const siblingText = work
            ? buildSiblingText(wl.friends, work, workByRole)
            : "";
          const tl = await generateOneTimeline(
            {
              id: r.id,
              name: r.name,
              persona: r.persona,
              region: r.region,
              work,
            },
            config,
            eventsText,
            siblingText
          );
          if (tl.slots.length) {
            list.push({
              roleId: r.id,
              name: displayName(convo, r.name),
              persona: r.persona,
              callName:
                convo?.roleCallName ||
                (await resolveCallName(r.callName)),
              modelIds: convo?.roleModelIds,
              work: work || undefined,
              date: today,
              slots: tl.slots,
              activityLevel: tl.activityLevel,
              dailyBudget: tl.dailyBudget,
            });
          }
        }
        await writeWorldline({ ...wl, friends: list });
        await persistWorldlineMemories(list, today);
        eventBus.emit("worldline-updated");
        return true;
      }
    }
    const settings = await readRagSettings();
    if (!settings.proactiveEnabled || !friends.length) {
      await AsyncStorage.setItem(GEN_STATE_KEY, JSON.stringify({ ...state, [today]: "1" }));
      return true;
    }

    await ensureProvidersSeeded();
    const config = await resolveRoleConfig(undefined, "text");
    if (!config) return false;

    const convoMap = new Map(convos.map((c) => [c.id, c]));
    const list: FriendTimeline[] = [];
    const workByRole = new Map(
      friends.map((r: any) => [r.id, inferWork(r)])
    );
    const eventsCache: Record<string, string> = {};
    const generatedByWork: Record<string, string[]> = {};
    // 上限保护：一天最多生成 20 个角色的时间线，防止角色过多时调用爆炸
    for (const r of friends.slice(0, 20)) {
      const work = inferWork(r);
      const groupKey = work || "role-" + r.id;
      if (work && !eventsCache[work]) {
        eventsCache[work] = await ensureWorldEventsForWork(
          work,
          friends
            .filter((f: any) => inferWork(f) === work)
            .map((f: any) => f.name),
          config
        );
      }
      const siblingText = (generatedByWork[groupKey] || []).join("\n");
      const convo = convoMap.get("role-" + r.id);
      const tl = await generateOneTimeline(
        {
          id: r.id,
          name: r.name,
          persona: r.persona,
          region: r.region,
          work,
        },
        config,
        work ? eventsCache[work] : "",
        siblingText
      );
      if (tl.slots.length) {
        const ft: FriendTimeline = {
          roleId: r.id,
          name: displayName(convo, r.name),
          persona: r.persona,
          callName:
            convo?.roleCallName || (await resolveCallName(r.callName)),
          modelIds: convo?.roleModelIds,
          work: work || undefined,
          date: today,
          slots: tl.slots,
          activityLevel: tl.activityLevel,
          dailyBudget: tl.dailyBudget,
        };
        list.push(ft);
        generatedByWork[groupKey] = [
          ...(generatedByWork[groupKey] || []),
          `${ft.name}：${tl.slots
            .map((s) => `${s.start}-${s.end} ${s.activity}`)
            .join("；")}`.slice(0, 300),
        ];
        // 逐角色落库：每入戏一个角色立即写入并通知，导演页可感知进度
        const prev = await readWorldline();
        const partial: WorldlineDay = {
          date: today,
          friends: list,
          dispatched: prev?.date === today ? prev.dispatched || {} : {},
          lastProactiveAt:
            prev?.date === today ? prev.lastProactiveAt || {} : {},
          sentCount: prev?.date === today ? prev.sentCount || {} : {},
          feedback: prev?.date === today ? prev.feedback || {} : {},
        };
        await writeWorldline(partial);
        eventBus.emit("worldline-updated");
      }
    }

    await persistWorldlineMemories(list, today);
    const nextState = await readGenState();
    nextState[today] = "1";
    await AsyncStorage.setItem(GEN_STATE_KEY, JSON.stringify(nextState));
    eventBus.emit("worldline-updated");
    return true;
  } catch (e) {
    devWarning("worldline", `WORLDLINE-GEN-ERR ${e?.message || e}`);
    return false;
  } finally {
    genLock[today] = false;
    if (genQueued[today]) {
      genQueued[today] = false;
      setTimeout(() => {
        ensureWorldlineToday().catch(() => {});
      }, 2000);
    }
  }
}

function formatSlotList(slots: TimelineSlot[]): string {
  return slots
    .map(
      (s, i) =>
        `${i + 1}. ${s.start}-${s.end} ${s.activity}${
          s.mood ? `（心情：${s.mood}）` : ""
        }${
          s.initiative >= 1 && s.reason
            ? `｜主动意愿${s.initiative}：${s.reason}`
            : ""
        }`
    )
    .join("\n");
}

async function buildMessagePrompt(
  friend: FriendTimeline,
  slot: TimelineSlot,
  history: LocalMsg[],
  gender: string,
  weatherText: string,
  memoryText: string,
  coreText?: string,
  userStatusLine?: string,
  summaryText?: string
): Promise<string> {
  const callName = friend.callName || "你";
  const recent = history
    .slice(-10)
    .filter((m) => m.role !== "system")
    .map((m) => {
      const who = m.role === "user" ? callName : friend.name;
      return `${who}：${String(m.content).slice(0, 200)}`;
    })
    .join("\n");
  const now = new Date();
  const week = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  const nowStr = `${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours()}:${String(
    now.getMinutes()
  ).padStart(2, "0")}（周${week}）`;

  const weatherLine = weatherText
    ? `\n\n【用户那边现在的天气】${weatherText}（你可以自然地关心或提及，不要刻意引用）`
    : "";
  const personaLine = friend.persona
    ? `\n\n【你的完整角色设定】\n${friend.persona}`
    : "";
  const memoryLine = memoryText
    ? `\n\n【你们过往的记忆（可自然回忆/延续，不要机械罗列）】\n${memoryText}`
    : "";
  const coreLine = coreText
    ? `\n\n【你对用户的长期了解（始终记得）】\n${coreText}`
    : "";
  const statusLine = userStatusLine || "";
  // 用户间隔感知：最近一条用户消息距今多久（让角色知道对方多久没回）
  let userGapText = "";
  const lastUserMsg = [...history]
    .reverse()
    .find((m) => m.role === "user");
  if (lastUserMsg?.createdAt) {
    const gapMin = Math.round((Date.now() - lastUserMsg.createdAt) / 60000);
    if (gapMin >= 1) {
      userGapText =
        gapMin < 60
          ? `约 ${gapMin} 分钟前`
          : `约 ${Math.round(gapMin / 60)} 小时前`;
    }
  }
  const gapLine = userGapText
    ? `\n\n用户最后一条消息在${userGapText}，还没有新回复。你可以自然地表现出对时间的感觉（比如对方很久没回时可以关心一下），但不要生硬提及具体时间。`
    : "";

  let prompt = fillTemplate(
    await resolvePrompt(
      "worldlineProactive",
      PROMPT_DEFAULTS.worldlineProactive
    ),
    {
      当前时间: nowStr,
      角色名: friend.name,
      今日日程: formatSlotList(friend.slots),
      时段起止: `${slot.start}-${slot.end}`,
      当前活动: slot.activity,
      心情: slot.mood,
      主动意愿:
        slot.initiative === 2
          ? "很想找用户"
          : slot.initiative === 1
          ? "有点想找用户"
          : "不想打扰用户",
      自然由头: slot.reason ? `自然的由头：${slot.reason}` : "",
      称呼: callName,
      性别: gender,
      长期档案: coreLine,
      用户状态: statusLine,
      最近对话:
        (summaryText ? `【更早的对话梗概】\n${summaryText}\n\n` : "") +
        (recent || "（还没有聊过天）"),
      相关记忆: memoryLine,
      天气: weatherLine,
      角色设定: personaLine,
      间隔提示: gapLine,
    }
  );
  // 留白策略：句式感知 + 刚聊过窗口 + 话少性格
  const lastMsg = history[history.length - 1];
  const lastUserQuestion = isQuestionText(lastUserMsg?.content || "");
  const quiet = isQuietPersona(friend.persona);
  const leaveRules: string[] = [];
  if (lastMsg?.role === "assistant" && lastUserQuestion) {
    leaveRules.push(
      "你刚回答完 TA 的问题，TA 还没继续回复：如果没有新的重要内容，先不要追着发（输出 NONE）。"
    );
  }
  if (lastUserMsg?.createdAt && Date.now() - lastUserMsg.createdAt < 30 * 60 * 1000) {
    leaveRules.push(
      "你们 30 分钟内刚聊过：除非此刻有特别想分享或必须告知的事，否则不要主动打扰（输出 NONE）。"
    );
  }
  if (quiet) {
    leaveRules.push(
      "你性格话少/偏冷：除非真的很想说什么，否则宁可保持沉默（输出 NONE）。"
    );
  }
  if (leaveRules.length) {
    prompt += "\n\n【留白规则】\n- " + leaveRules.join("\n- ");
  }
  return prompt;
}

/** 读取会话的剧情梗概（中层记忆，主动/跟进消息用） */
async function getConvoSummary(convoId: string): Promise<string> {
  try {
    const convos = await readConversationsRaw();
    return convos.find((c) => c.id === convoId)?.summary?.trim() || "";
  } catch {
    return "";
  }
}

async function generateProactiveContent(
  friend: FriendTimeline,
  slot: TimelineSlot,
  convoId: string,
  weatherText: string,
  memoryText: string
): Promise<string | null> {
  let config = await resolveRoleConfig(undefined, "text");
  if (!config) return null;
  try {
    const bound = await resolveRoleConfig(friend.modelIds, "text");
    if (bound) config = bound;
  } catch {}

  const history = await readMessages(convoId);
  const summaryText = await getConvoSummary(convoId);
  const profile = await readProfile();
  const gender = genderHint(profile.gender).replace(/【用户性别】|。/g, "");
  let coreText = "";
  try {
    const core = await getCoreProfile(friend.roleId);
    if (core.length) coreText = formatCoreBlock(core);
  } catch {}
  const prompt = await buildMessagePrompt(
    friend,
    slot,
    history,
    gender,
    weatherText,
    memoryText,
    coreText,
    await userStatusPromptLine(),
    summaryText
  );
  const reply = await chatCompletion(
    config,
    [
      {
        role: "system",
        content: "你是一个乐于助人的助手。",
      },
      {
        role: "user",
        content:
          "请以角色身份直接输出一条聊天消息，不要任何解释、不要思考过程、不要标签。\n\n" +
          prompt,
      },
    ],
    {
      temperature: 0.9,
      maxTokens: 200,
      noThinking: true,
      roleId: friend.roleId,
      scene: "主动消息",
    }
  );
  const clean = reply
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<proactive:\d+>/g, "")
    .replace(/<pat-back>[\s\S]*?<\/pat-back>/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .trim()
    .slice(0, 300);
  if (!clean || /^NONE$/i.test(clean)) return null;
  return clean;
}

function convoIdOf(roleId: string): string {
  return "role-" + roleId;
}

/**
 * 导演调度：检查当前时段是否有角色处于自然主动时机。
 * 满足条件 → 由角色本人生成一条主动消息并安排推送。
 */
export async function dispatchWorldline(): Promise<void> {
  if (dispatchLock) return; // 并发派发直接跳过，避免重复选中同一时间槽
  dispatchLock = true;
  try {
    if (genLock[todayStr()]) return; // 世界线生成中：暂停主动消息派发，避免基于半成品时间线发消息
    const settings = await readRagSettings();
    if (!settings.proactiveEnabled) return;
    // 每次都先确保今日世界线完整：新添加的好友会补生成时间线，避免导演里缺角色
    await ensureWorldlineToday();
    await checkSecondFollowUp();
  // 天气信息每个派发周期拉取一次（失败则本次不带天气）
  const weather: WeatherInfo | null = await fetchWeather();
  const weatherText = formatWeatherText(weather);
  const today = todayStr();
  const wl = await readWorldline();
  if (!wl || wl.date !== today || !wl.friends.length) return;

  const now = nowHHMM();
  const dispatched = { ...(wl.dispatched || {}) };
  const lastAt = { ...(wl.lastProactiveAt || {}) };
  const sentCount = { ...(wl.sentCount || {}) };
  const feedback = { ...(wl.feedback || {}) };
  const inFlight: Record<string, boolean> = {};

  // 反馈补漏：已发送的主动消息如果用户超过 2 小时没回，记为忽略（0）
  for (const f of wl.friends) {
    const fb = feedback[f.roleId] || [];
    const sent = sentCount[f.roleId] || 0;
    if (fb.length >= sent) continue;
    try {
      const msgs = await readMessages(convoIdOf(f.roleId));
      const last = msgs[msgs.length - 1];
      if (
        last &&
        last.role === "assistant" &&
        Date.now() - last.createdAt > 2 * 60 * 60 * 1000
      ) {
        feedback[f.roleId] = [...fb, 0].slice(-5);
      }
    } catch {}
  }
  // 冷却时长：按用户选择的主动频率调整
  const cooldownMin =
    settings.proactiveFrequency === "high"
      ? 45
      : settings.proactiveFrequency === "low"
      ? 180
      : 90;
  const markDone = (roleId: string, start: string) => {
    dispatched[roleId] = [...(dispatched[roleId] || []), start];
  };

  // 统计每个角色今日对话轮数（聊多降温用）
  const todayMsgsCount: Record<string, number> = {};
  const lastUserAt: Record<string, number> = {};
  for (const f of wl.friends) {
    try {
      const msgs = await readMessages(convoIdOf(f.roleId));
      todayMsgsCount[f.roleId] = msgs.filter(
        (m) =>
          m.role === "user" &&
          new Date(m.createdAt).toDateString() === new Date().toDateString()
      ).length;
      const lastU = [...msgs].reverse().find((m) => m.role === "user");
      if (lastU?.createdAt) lastUserAt[f.roleId] = lastU.createdAt;
    } catch {}
  }

  // 同一轮里只派发一个角色（避免多个角色同时轰炸），选择到点 slot 中优先级最高的
  const candidates = wl.friends
    .map((f) => {
      const slot = f.slots.find(
        (s) =>
          isSlotNow(s, now) && !(dispatched[f.roleId] || []).includes(s.start)
      );
      if (!slot) return null;
      // 意愿 0：这个时段角色不想打扰用户，跳过
      if (!slot.initiative || slot.initiative <= 0) {
        markDone(f.roleId, slot.start);
        return null;
      }
      const last = lastAt[f.roleId] || 0;
      if (Date.now() - last < cooldownMin * 60 * 1000) {
        markDone(f.roleId, slot.start);
        return null;
      }
      // 留白策略：20 分钟内刚聊过就不主动打扰（刚聊完的场景由跟进机制接管）
      const lastU = lastUserAt[f.roleId] || 0;
      if (lastU && Date.now() - lastU < 20 * 60 * 1000) {
        markDone(f.roleId, slot.start);
        return null;
      }
      // 预算：按反馈自适应调整后的今日可发条数
      const fbs = feedback[f.roleId] || [];
      const replied = fbs.filter((x) => x === 1).length;
      const rate = fbs.length ? replied / fbs.length : 0.5;
      let budget = f.dailyBudget || 5;
      if (fbs.length >= 3) {
        if (rate < 0.3) budget = Math.max(1, budget - 2); // 用户常忽略：降频
        else if (rate > 0.7) budget = Math.min(10, budget + 2); // 用户爱回：加频
      }
      // 聊多降温：今天和角色聊得越多，主动预算越低（避免人聊+主动叠加显啰嗦）
      const todayMsgs = todayMsgsCount[f.roleId] || 0;
      if (todayMsgs >= 10) budget = Math.min(budget, 1);
      else if (todayMsgs >= 6)
        budget = Math.min(budget, Math.max(1, Math.ceil(budget / 2)));
      if ((sentCount[f.roleId] || 0) >= budget) {
        markDone(f.roleId, slot.start);
        return null;
      }
      return { f, slot };
    })
    .filter(Boolean) as { f: FriendTimeline; slot: TimelineSlot }[];
  candidates.sort((a, b) => toMin(a.slot.start) - toMin(b.slot.start));

  let picked = 0;
  for (const { f, slot } of candidates) {
    if (picked >= 1) break;
    inFlight[f.roleId] = true;
    markDone(f.roleId, slot.start);

    try {
      // 记忆注入：检索角色记忆库里与当前情境相关的记忆
      let memoryText = "";
      try {
        const mems = await retrieveMemories(
          f.roleId,
          slot.activity + (slot.reason || ""),
          { topK: 4, threshold: 0.1 }
        );
        if (mems.length) memoryText = formatMemoriesBlock(mems);
      } catch {}
      const content = await generateProactiveContent(
        f,
        slot,
        convoIdOf(f.roleId),
        weatherText,
        memoryText
      );
      if (content) {
        lastAt[f.roleId] = Date.now();
        sentCount[f.roleId] = (sentCount[f.roleId] || 0) + 1;
        await scheduleProactive(
          convoIdOf(f.roleId),
          10 + Math.floor(Math.random() * 21),
          f.name,
          content
        );
        picked++;
      }
    } catch (e) {
      devWarning("worldline", `WORLDLINE-DISPATCH-ERR ${f.roleId} ${e?.message || e}`);
    }
  }

    // 原子写回：与其它写入方合并（dispatched 取并集、计数取最大值、时间取最新），
    // 避免并发写覆盖导致同一时间槽被重复派发
    await withStorageLock(async () => {
      const latest = await readWorldline();
      if (!latest || latest.date !== today) return;
      const mergeDispatched = (
        a: Record<string, string[]> = {},
        b: Record<string, string[]> = {}
      ) => {
        const out: Record<string, string[]> = {};
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
          out[k] = [...new Set([...(a[k] || []), ...(b[k] || [])])];
        }
        return out;
      };
      const mergeMax = (
        a: Record<string, number> = {},
        b: Record<string, number> = {}
      ) => {
        const out: Record<string, number> = { ...a };
        for (const k of Object.keys(b)) {
          out[k] = Math.max(out[k] || 0, b[k] || 0);
        }
        return out;
      };
      const mergeLastAt = (
        a: Record<string, number> = {},
        b: Record<string, number> = {}
      ) => {
        const out: Record<string, number> = { ...a };
        for (const k of Object.keys(b)) {
          if ((b[k] || 0) > (out[k] || 0)) out[k] = b[k];
        }
        return out;
      };
      await writeWorldline({
        ...latest,
        dispatched: mergeDispatched(latest.dispatched, dispatched),
        sentCount: mergeMax(latest.sentCount, sentCount),
        lastProactiveAt: mergeLastAt(latest.lastProactiveAt, lastAt),
        feedback: { ...(latest.feedback || {}), ...feedback },
      });
    });
  } finally {
    dispatchLock = false;
  }
}

/** 第二次跟进：第一次跟进后用户仍没回，过一段时间轻轻再关心一次（或选择不打扰） */
async function checkSecondFollowUp() {
  try {
    const state = await readFollowUpState();
    const now = Date.now();
    for (const [convoId, st] of Object.entries(state)) {
      if (st.stage !== 1) continue;
      if (now - st.lastAt < FOLLOW_UP_SECOND_DELAY) continue;
      // 会话最后一条必须是角色消息（用户确实没回）
      const msgs = await readMessages(convoId);
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant") continue;

      const roleId = convoId.startsWith("role-")
        ? convoId.slice("role-".length)
        : "";
      const convos = await readConversationsRaw();
      const convo = convos.find((c) => c.id === convoId);
      if (!convo) continue;
      // 会话索引不再存角色人设，需要时从角色卡补全
      let persona = convo.rolePersona || "";
      if (!persona && roleId) {
        try {
          persona = (await sqlReadRole(roleId))?.persona || "";
        } catch {}
      }
      const wl = await readWorldline();
      const friend = wl?.friends.find((f) => f.roleId === roleId) || null;
      const friendInfo: FriendTimeline = friend
        ? friend
        : {
            roleId,
            name: convo.roleName || convo.title || "角色",
            persona,
            callName: convo.roleCallName || "你",
            date: todayStr(),
            slots: [],
            activityLevel: "normal",
            dailyBudget: 3,
          };

      // 每日跟进上限（与第一次共享）
      if (roleId) {
        const today = todayStr();
        const raw = await AsyncStorage.getItem(FOLLOW_UP_KEY);
        const map: Record<string, { date: string; count: number }> = raw
          ? JSON.parse(raw)
          : {};
        const cur = map[roleId];
        if (cur && cur.date === today && cur.count >= FOLLOW_UP_DAILY_LIMIT) {
          state[convoId] = { stage: 2, lastAt: now };
          continue;
        }
        map[roleId] = {
          date: today,
          count: (cur && cur.date === today ? cur.count : 0) + 1,
        };
        await AsyncStorage.setItem(FOLLOW_UP_KEY, JSON.stringify(map));
      }

      const content = await generateFollowUpContent(friendInfo, convoId, 2);
      state[convoId] = { stage: 2, lastAt: now };
      if (content) {
        await scheduleProactive(
          convoId,
          5 + Math.floor(Math.random() * 11),
          friendInfo.name,
          content
        );
      }
    }
    await writeFollowUpState(state);
  } catch {}
}

/** 用户回复了某会话：记录该会话最近一条主动消息得到回应（反馈自适应） */
export async function markUserReplied(convoId: string) {
  try {
    const wl = await readWorldline();
    if (!wl || wl.date !== todayStr()) return;
    const roleId = convoId.startsWith("role-")
      ? convoId.slice("role-".length)
      : "";
    if (!roleId || !wl.friends.some((f) => f.roleId === roleId)) return;
    const fb = wl.feedback?.[roleId] || [];
    const next = [...fb, 1].slice(-5);
    await writeWorldline({ ...wl, feedback: { ...(wl.feedback || {}), [roleId]: next } });
  } catch {}
}

/** 主动消息发出后一段时间无人回复：记录忽略（由定时器调用） */
export async function markUserIgnored(convoId: string) {
  try {
    const wl = await readWorldline();
    if (!wl || wl.date !== todayStr()) return;
    const roleId = convoId.startsWith("role-")
      ? convoId.slice("role-".length)
      : "";
    if (!roleId || !wl.friends.some((f) => f.roleId === roleId)) return;
    const fb = wl.feedback?.[roleId] || [];
    const next = [...fb, 0].slice(-5);
    await writeWorldline({ ...wl, feedback: { ...(wl.feedback || {}), [roleId]: next } });
  } catch {}
}

/**
 * 对话跟进：用户发消息→角色回复后，如果用户过一会儿没回，
 * 由角色本人决定要不要再补一句。复用 scheduleProactive 的
 * 通知/插入/取消机制（用户回复时 localChat 会 cancelProactive）。
 */
export async function scheduleConversationFollowUp(
  convoId: string,
  title: string
) {
  try {
    const settings = await readRagSettings();
    if (!settings.proactiveEnabled) return;

    // 用户回复了角色 → 视为新对话，重置跟进状态
    const st = await readFollowUpState();
    st[convoId] = { stage: 1, lastAt: Date.now() };
    await writeFollowUpState(st);

    // 每日跟进次数限制（按角色）
    const roleId = convoId.startsWith("role-")
      ? convoId.slice("role-".length)
      : "";
    if (roleId) {
      const today = todayStr();
      const raw = await AsyncStorage.getItem(FOLLOW_UP_KEY);
      const map: Record<string, { date: string; count: number }> = raw
        ? JSON.parse(raw)
        : {};
      const cur = map[roleId];
      if (cur && cur.date === today && cur.count >= FOLLOW_UP_DAILY_LIMIT) {
        return;
      }
      map[roleId] = { date: today, count: (cur && cur.date === today ? cur.count : 0) + 1 };
      await AsyncStorage.setItem(FOLLOW_UP_KEY, JSON.stringify(map));
    }

    // 找角色信息（世界线里的 FriendTimeline 优先，否则用会话信息）
    const convos = await readConversationsRaw();
    const convo = convos.find((c) => c.id === convoId);
    if (!convo) return;
    // 会话索引不再存角色人设，需要时从角色卡补全
    let persona = convo.rolePersona || "";
    if (!persona && roleId) {
      try {
        persona = (await sqlReadRole(roleId))?.persona || "";
      } catch {}
    }
    const wl = await readWorldline();
    const friend = wl?.friends.find((f) => f.roleId === roleId) || null;
    const friendInfo: FriendTimeline = friend
      ? friend
      : {
          roleId,
          name: convo.roleName || convo.title || title,
          persona,
          callName: convo.roleCallName || "你",
          date: todayStr(),
          slots: [],
          activityLevel: "normal",
          dailyBudget: 3,
        };

    const content = await generateFollowUpContent(friendInfo, convoId);
    if (!content) return;
    await scheduleProactive(
      convoId,
      5 + Math.floor(Math.random() * 11),
      friendInfo.name,
      content
    );
  } catch {}
}

/** 生成跟进消息：由角色本人判断要不要补一句，不想补输出 NONE */
async function generateFollowUpContent(
  friend: FriendTimeline,
  convoId: string,
  stage: number = 1
): Promise<string | null> {
  let config = await resolveRoleConfig(undefined, "text");
  if (!config) return null;
  try {
    const bound = await resolveRoleConfig(friend.modelIds, "text");
    if (bound) config = bound;
  } catch {}

  const history = await readMessages(convoId);
  const summaryText = await getConvoSummary(convoId);
  const recent = history
    .slice(-10)
    .filter((m) => m.role !== "system")
    .map((m) => {
      const who = m.role === "user" ? friend.callName || "你" : friend.name;
      return `${who}：${String(m.content).slice(0, 200)}`;
    })
    .join("\n");
  const now = new Date();
  const week = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  const nowStr = `${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours()}:${String(
    now.getMinutes()
  ).padStart(2, "0")}（周${week}）`;
  const personaLine = friend.persona
    ? `\n\n【你的完整角色设定】\n${friend.persona}`
    : "";

  let prompt = fillTemplate(
    await resolvePrompt(
      stage >= 2 ? "followup2" : "followup1",
      stage >= 2 ? PROMPT_DEFAULTS.followup2 : PROMPT_DEFAULTS.followup1
    ),
    {
      当前时间: nowStr,
      角色名: friend.name,
      称呼: friend.callName || "用户",
      最近对话:
        (summaryText ? `【更早的对话梗概】\n${summaryText}\n\n` : "") +
        (recent || "（还没有聊过天）"),
      角色设定: personaLine ? "\n" + personaLine.trim() : "",
    }
  );
  // 留白策略：句式感知 + 话少性格（跟进场景）
  const lastUserMsg = [...history].reverse().find((m) => m.role === "user");
  const lastUserQuestion = isQuestionText(lastUserMsg?.content || "");
  const quiet = isQuietPersona(friend.persona);
  const leaveRules: string[] = [];
  if (lastUserQuestion) {
    leaveRules.push(
      "用户最后一条消息是疑问句：如果你已经回答过了，没有必须补充的内容就输出 NONE；真有想补充的才发。"
    );
  } else {
    leaveRules.push(
      "用户最后一条消息是陈述句收尾：可以自然补一句，也可以安静结束（按性格判断；不补就输出 NONE）。"
    );
  }
  if (quiet) {
    leaveRules.push(
      "你性格话少/偏冷：除非特别想说什么，否则输出 NONE。"
    );
  }
  if (leaveRules.length) {
    prompt += "\n\n【留白判断】\n- " + leaveRules.join("\n- ");
  }

  const reply = await chatCompletion(
    config,
    [
      { role: "system", content: "你是一个乐于助人的助手。" },
      {
        role: "user",
        content:
          "请以角色身份直接输出一条聊天消息，不要任何解释、不要思考过程、不要标签。\n\n" +
          prompt,
      },
    ],
    {
      temperature: 0.9,
      maxTokens: 200,
      noThinking: true,
      roleId: friend.roleId,
      scene: "主动消息",
    }
  );
  const clean = reply
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<proactive:\d+>/g, "")
    .replace(/<pat-back>[\s\S]*?<\/pat-back>/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .trim()
    .slice(0, 200);
  if (!clean || /^NONE$/i.test(clean)) return null;
  return clean;
}

/** 供调试/设置页查看今天的世界线状态 */
export async function readWorldlineSummary() {
  const wl = await readWorldline();
  if (!wl) return null;
  return {
    date: wl.date,
    friends: wl.friends.map((f) => ({
      name: f.name,
      slots: f.slots.length,
      dispatched: (wl.dispatched[f.roleId] || []).length,
    })),
  };
}

/** AI 导演状态面板数据：总览 + 各角色今日状态 */
export async function getDirectorState() {
  const wl = await readWorldline();
  if (!wl) {
    // 没有任何好友/从未生成世界线：返回空状态而不是 null（null 表示加载中）
    return { date: "", friends: [], totalSent: 0, totalFollowUps: 0 };
  }
  const roleMap = new Map<string, { avatar?: string }>();
  try {
    (await readRolesRaw()).forEach((r) => roleMap.set(r.id, r));
  } catch {}
  const now = nowHHMM();
  const friends = wl.friends.map((f) => {
    const currentSlot = f.slots.find((s) => isSlotNow(s, now));
    const remaining = f.slots.filter(
      (s) =>
        s.initiative >= 1 &&
        toMin(s.start) > toMin(now) &&
        !(wl.dispatched?.[f.roleId] || []).includes(s.start)
    );
    const fbs = wl.feedback?.[f.roleId] || [];
    return {
      roleId: f.roleId,
      name: f.name,
      avatar: roleMap.get(f.roleId)?.avatar || "",
      activityLevel: f.activityLevel || "normal",
      dailyBudget: f.dailyBudget || 5,
      sentCount: wl.sentCount?.[f.roleId] || 0,
      feedback: fbs,
      replyRate: fbs.length
        ? Math.round((fbs.filter((x) => x === 1).length / fbs.length) * 100)
        : null,
      currentSlot: currentSlot
        ? {
            start: currentSlot.start,
            end: currentSlot.end,
            activity: currentSlot.activity,
            mood: currentSlot.mood,
            initiative: currentSlot.initiative,
            reason: currentSlot.reason,
          }
        : null,
      remaining: remaining.slice(0, 6).map((s) => ({
        start: s.start,
        end: s.end,
        reason: s.reason,
        initiative: s.initiative,
      })),
    };
  });
  let totalFollowUps = 0;
  try {
    const raw = await AsyncStorage.getItem(FOLLOW_UP_KEY);
    if (raw) {
      const map = JSON.parse(raw);
      totalFollowUps = Object.values(map).reduce(
        (a: number, b: any) => a + (b && b.date === wl.date ? b.count : 0),
        0
      );
    }
  } catch {}
  return {
    date: wl.date,
    friends,
    totalSent: friends.reduce((a, f) => a + f.sentCount, 0),
    totalFollowUps,
  };
}

/** 手动重置今天的世界线（调试用） */
export async function resetWorldlineToday() {
  const today = todayStr();
  const state = await readGenState();
  delete state[today];
  await AsyncStorage.setItem(GEN_STATE_KEY, JSON.stringify(state));
  const wl = await readWorldline();
  if (wl && wl.date === today) {
    await AsyncStorage.removeItem(TIMELINE_KEY);
  }
}
