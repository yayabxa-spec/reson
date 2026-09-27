import AsyncStorage, { withStorageLock } from "../utils/storage";
import { devWarning } from "../utils/devLog";
import Constants from "expo-constants";
import { atom, useRecoilState } from "recoil";
import {
  seedRoleConversation,
  readConversationsRaw,
} from "./localChat";
import eventBus from "../utils/eventBus";
import type { RoleModelBindings } from "./models";
import type {
  BuiltinRoleData,
  RoleBackgroundItem,
  RoleCallName,
} from "./builtin/types";
import { sqlClearMemories } from "./memoryDb";
import { GENSHIN_AVATARS } from "./roleAvatars";
import { loadBuiltinRoles } from "./roleAssets";
import {
  buildVoiceVariants,
  fetchVoices,
  matchVoice,
  GENSHIN_CN_CV,
} from "../utils/ttson";
import type { TtsonVoice, VoiceMatch } from "../utils/ttson";
import { resolveCallName } from "./profile";
import {
  sqlDeleteConvoMessages,
  sqlReadRoles,
  sqlWriteRoles,
} from "./appDb";

export interface Role {
  id: string;
  name: string;
  avatar: string; // 头像 key，见 ROLE_AVATARS
  persona: string; // 人设
  greeting: string; // 开场白
  callName?: RoleCallName; // 角色对你的称呼（字符串或按性别变体，用于添加好友后的系统提示）
  patReply?: string; // 我拍了拍角色的内容（拍一拍互动）
  remark?: string; // 备注名（朋友资料）
  starred?: boolean; // 设为星标朋友（通讯录置顶）
  pendingGreeting?: string; // 申请添加好友时的打招呼内容
  region: string; // 地区（蒙德/璃月/…）
  voiceRate?: "rare" | "sometimes" | "often"; // 语音频率倾向（角色卡驱动）
  storyState?: string; // 当前剧情状态
  background?: RoleBackgroundItem[]; // 角色详细资料
  bio?: string; // 简介（一句话描述）
  examples?: RoleExample[]; // 示例对话
  temperature?: number; // 温度
  contextRounds?: number; // 上下文轮数
  modelIds?: RoleModelBindings; // 绑定的文本/图像/语音模型
  voice?: RoleVoice; // 海豚 TTS 音色（自动匹配）
  isSystem?: boolean;
  status: "none" | "requesting" | "done";
  addedAt?: number;
}

export interface RoleVoice {
  provider: "ttson";
  voiceId: number;
  voiceName: string;
  variants?: Record<string, number>; // 情绪 -> 音色 id
  dub?: "cn"; // v0.30.38+：标记按中配/平台原神声线重新绑定过
  tier?: number; // 基础声线优先级：1=上新优化自然变体 2=中配命名 3=原神批纯名 4=新批纯名 5=兜底
}

export interface RoleExample {
  role: "user" | "assistant";
  content: string;
}

export const ROLE_AVATARS: Record<string, any> = {
  avatar: require("../../assets/avatar.png"),
  bella: require("../../assets/bella.jpeg"),
  ...GENSHIN_AVATARS,
};

/**
 * 解析角色头像：预设 key 或自定义图片（data URI / 文件 URI）。
 * 内置角色头像由 RoleAvatar 组件渲染占位块。
 */
export function resolveRoleAvatar(avatar: string | undefined): any {
  if (!avatar) return undefined;
  if (
    avatar.startsWith("data:") ||
    avatar.startsWith("file:") ||
    avatar.startsWith("content:")
  ) {
    return { uri: avatar };
  }
  return ROLE_AVATARS[avatar] || undefined;
}

const ROLES_KEY = "wc_local_roles_v2";
const ROLES_PART_COUNT = 12;
const BUILTIN_REFRESH_KEY = "wc_builtin_refresh_v1";

/** 把内容包数据映射为内置角色（空库时种子用） */
function toBuiltinRole(r: BuiltinRoleData, i: number): Role {
  return {
    id: "role-" + i,
    name: r.name,
    avatar: r.name,
    persona: r.persona,
    greeting: r.greeting || "",
    region: r.region || r.work,
    voiceRate: r.voiceRate,
    bio: r.bio,
    callName: r.callName,
    storyState: r.storyState,
    background: r.background,
    isSystem: true,
    status: "none" as const,
  };
}

const rolesState = atom<Role[]>({
  key: "localRoles",
  default: [],
});

export async function readRolesRaw(): Promise<Role[]> {
  // 角色卡已迁移到 SQLite（wc_app.db），按 id 排序保持内置角色顺序
  return (await sqlReadRoles()) as Role[];
}

async function writeRolesRaw(list: Role[]) {
  await sqlWriteRoles(list as any);
  // 清理旧的 AsyncStorage 分片（一次性）
  await AsyncStorage.removeItem(ROLES_KEY);
  await AsyncStorage.removeItem("wc_local_roles_v1");
  for (let i = 0; i < 6; i++) {
    await AsyncStorage.removeItem("wc_local_roles_v1_p" + i);
  }
  for (let i = 0; i < ROLES_PART_COUNT; i++) {
    await AsyncStorage.removeItem(ROLES_KEY + "_p" + i);
  }
  eventBus.emit("roles-updated");
}

/** 首次运行写入内置角色，并补全历史上 "requesting" 状态 */
const OLD_BUILTIN_IDS = [
  "role-linwanwan",
  "role-suxiaonuan",
  "role-moxiansheng",
  "role-lingxing",
];

export async function ensureRolesSeeded(): Promise<Role[]> {
  return withStorageLock(async () => {
    let list = await readRolesRaw();
    let changed = false;
    // 仅保留自定义角色
    const hasOld = list.some((r) => OLD_BUILTIN_IDS.includes(r.id));
    if (hasOld) {
      list = list.filter((r) => !OLD_BUILTIN_IDS.includes(r.id));
      changed = true;
    }
    if (!list.length) {
      const pack = await loadBuiltinRoles();
      list = pack.map((r, i) => toBuiltinRole(r, i));
      changed = true;
    }
    // 自愈：已添加(done)但缺少会话的角色，自动补一个最小会话
    // （历史 bug/并发覆盖/手动删除聊天记录都会造成 done 无会话；
    //  重置回未添加会让"删除聊天记录"误伤好友状态，这里改为补会话）
    const convos = await readConversationsRaw();
    const missingConvos = list.filter(
      (r) =>
        r.status === "done" &&
        !convos.some((c) => c.id === "role-" + r.id)
    );
    if (missingConvos.length) {
      missingConvos.forEach((r) => {
        convos.unshift({
          id: "role-" + r.id,
          title: r.remark || r.name,
          lastMessage: "你们已成为好友，可以开始聊天了",
          updatedAt: Date.now(),
          roleId: r.id,
          roleName: r.name,
          roleCallName:
            typeof r.callName === "string" ? r.callName : undefined,
          roleAvatar: r.avatar,
        });
      });
      await AsyncStorage.setItem(
        "wc_local_conversations",
        JSON.stringify(convos)
      );
      changed = true;
    }
    // 若存在未完成的申请，补一个定时器让它自动通过
    list
      .filter((r) => r.status === "requesting")
      .forEach((r) => {
        setTimeout(() => {
          acceptRoleRequest(r.id);
        }, 2500);
      });
    if (changed) {
      await writeRolesRaw(list);
    }
    // 后台自动为内置角色绑定音色（幂等：已有 voice 的跳过）
    autoBindRoleVoices().catch(() => {});
    return list;
  });
}

/**
 * 从内容包刷新内置角色卡：按名字更新已有 isSystem 角色的人设/背景等字段，
 * 保留 id/头像/状态/备注/星标/模型绑定/音色等用户侧数据；
 * 包里新增的角色自动补进角色库（未添加状态）。
 */
export async function refreshBuiltinRolesFromPack(): Promise<number> {
  return withStorageLock(async () => {
    let updated = 0;
    try {
      const pack = await loadBuiltinRoles();
      const list = await readRolesRaw();
      const byName = new Map<string, Role>();
      let maxId = 0;
      for (const r of list) {
        if (r.isSystem) byName.set(r.name, r);
        const m = /^role-(\d+)$/.exec(r.id);
        if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
      }
      const next = [...list];
      for (const p of pack) {
        const exist = byName.get(p.name);
        if (exist) {
          Object.assign(exist, {
            persona: p.persona,
            region: p.region || p.work,
            bio: p.bio,
            callName: p.callName,
            storyState: p.storyState,
            background: p.background,
            voiceRate: p.voiceRate,
          });
          updated++;
        } else {
          maxId++;
          next.push({
            id: "role-" + maxId,
            name: p.name,
            avatar: p.name,
            persona: p.persona,
            greeting: p.greeting || "",
            region: p.region || p.work,
            bio: p.bio,
            callName: p.callName,
            storyState: p.storyState,
            background: p.background,
            voiceRate: p.voiceRate,
            isSystem: true,
            status: "none",
          });
          updated++;
        }
      }
      if (updated) {
        await writeRolesRaw(next);
        eventBus.emit("roles-updated");
      }
      return updated;
    } catch {
      return 0;
    }
  });
}

/** App 启动时调用：版本号变化时自动刷新一次内置角色卡 */
export async function maybeRefreshBuiltinRoles(): Promise<void> {
  try {
    const ver = Constants.expoConfig?.version || "";
    const last = await AsyncStorage.getItem(BUILTIN_REFRESH_KEY);
    if (last === ver) return;
    await refreshBuiltinRolesFromPack();
    await AsyncStorage.setItem(BUILTIN_REFRESH_KEY, ver);
  } catch (e) {
    devWarning("roles", `builtin-refresh-check ${e}`);
  }
}

/** 为没有绑定音色的内置角色自动匹配海豚 TTS 音色 */
let voiceBindRunning = false;
const VOICE_BIND_REFRESH_KEY = "wc_voice_bind_refresh_v1";
const VOICE_REFRESH_INTERVAL = 2 * 24 * 3600 * 1000; // 每 2 天静默刷新，跟随供应商清单更新

/** 内置角色名与平台音色名的别名映射（仅匹配含"原神"的音色，避免串角色） */
const VOICE_NAME_ALIASES: Record<string, string[]> = {
  "迪卢克·莱艮芬德": ["迪卢克"],
  "芙宁娜·德·枫丹": ["芙宁娜"],
};

/** 按优先级挑选角色的最佳基础声线（1 最优） */
function pickBestVoice(
  roleName: string,
  voices: TtsonVoice[]
): { voice: TtsonVoice; tier: number } | null {
  const variants = buildVoiceVariants(roleName, voices);
  // ① "角色-自然"变体（平台"上新优化"声线，质量更新）
  const naturalId = variants["自然"];
  if (naturalId) {
    const v = voices.find((x) => x.voice_id === naturalId);
    if (v) return { voice: v, tier: 1 };
  }
  let best: { voice: TtsonVoice; tier: number } | null = null;
  for (const name of [roleName, ...(VOICE_NAME_ALIASES[roleName] || [])]) {
    const matches = matchVoice(name, voices, 12);
    const cnCv = GENSHIN_CN_CV[roleName] || GENSHIN_CN_CV[name];
    const pick = (m?: VoiceMatch, min = 75): VoiceMatch | undefined =>
      m && m.score >= min ? m : undefined;
    // ② 角色名+中配声优名（官方中配，不串角色）
    const cnMatch = pick(
      matches.find(
        (m) =>
          m.score >= 80 &&
          !!cnCv &&
          m.voice.voice_name.includes(name) &&
          m.voice.voice_name.includes(cnCv)
      )
    );
    // ③ 纯角色名（原始标签"原神"批次）
    const curatedYuan = pick(
      matches.find(
        (m) =>
          m.score >= 90 &&
          m.voice.voice_name.trim() === name &&
          (m.voice.rawTags || m.voice.tags || []).some((t) => t === "原神")
      )
    );
    // ④ 纯角色名（"新原神星铁"批次）
    const curatedNew = pick(
      matches.find(
        (m) =>
          m.score >= 90 &&
          m.voice.voice_name.trim() === name &&
          (m.voice.rawTags || m.voice.tags || []).some(
            (t) => t === "新原神星铁"
          )
      )
    );
    // ⑤ 任意高分行兜底
    const fallback = pick(
      matches.find(
        (m) =>
          m.score >= 80 &&
          /原神/.test(m.voice.voice_name) &&
          !/-[自然|开心|难过|生气|委屈|温柔|旁白|撒娇|冷漠|兴奋|可爱|严肃|疲惫|困倦|惊讶|害羞]/.test(
            m.voice.voice_name
          )
      ) || matches[0]
    );
    const tiered = [
      { m: cnMatch, tier: 2 },
      { m: curatedYuan, tier: 3 },
      { m: curatedNew, tier: 4 },
      { m: fallback, tier: 5 },
    ];
    // 按 tier 优先（不是分数）：中配命名(2) 永远优于纯名(3/4) 与兜底(5)
    const found = tiered.find((t) => t.m);
    if (found && (!best || found.tier < best.tier)) {
      best = { voice: found.m!.voice, tier: found.tier };
    }
  }
  return best;
}

/**
 * 批量自动绑定音色（一次读、一次写，秒级完成）：
 * - 未绑定/旧绑定自动重算；
 * - 每周静默刷新一次，跟随供应商清单更新（新声线/新情绪变体自动生效），
 *   但只在"更优声线出现 / 原声线下架 / 情绪变体变化"时才更新，保持稳定。
 */
export async function autoBindRoleVoices(): Promise<number> {
  // 防重入：启动/页面/刷新可能同时触发，只允许一个在跑
  if (voiceBindRunning) return 0;
  voiceBindRunning = true;
  let bound = 0;
  try {
    const list = await readRolesRaw();
    if (!list.length) return 0; // 角色还没初始化，等 seed 后再触发
    let refresh = false;
    try {
      const raw = await AsyncStorage.getItem(VOICE_BIND_REFRESH_KEY);
      refresh = Date.now() - (raw ? Number(raw) : 0) > VOICE_REFRESH_INTERVAL;
    } catch (e) { devWarning("roles", `voice-bind-refresh-read ${e}`); }
    // 全部已绑定且未到刷新周期：直接跳过，不读/解析音色清单（页面聚焦零阻塞）
    if (!refresh && list.every((r) => (r.voice as any)?.dub === "cn")) {
      return 0;
    }
    const voices = await fetchVoices();
    for (const role of list) {
      const cur = (role.voice || null) as
        | (RoleVoice & { tier?: number })
        | null;
      if (cur?.dub === "cn" && !refresh) continue;
      const picked = pickBestVoice(role.name, voices);
      if (!picked) continue;
      const next: RoleVoice = {
        provider: "ttson",
        voiceId: picked.voice.voice_id,
        voiceName: picked.voice.voice_name,
        variants: buildVoiceVariants(role.name, voices),
        dub: "cn",
        tier: picked.tier,
      };
      if (cur?.dub === "cn") {
        const sameBase = picked.voice.voice_id === cur.voiceId;
        const variantsSame =
          JSON.stringify(cur.variants || {}) ===
          JSON.stringify(next.variants || {});
        const betterTier = picked.tier < (cur.tier ?? 9);
        if (sameBase && variantsSame && !betterTier) continue; // 无变化，保持稳定
      }
      role.voice = next;
      bound++;
    }
    if (bound > 0) {
      // 批量：一次写全表（原来 87 次 updateRole 全表重写 → 1 次）
      await writeRolesRaw(list);
    }
    await AsyncStorage.setItem(VOICE_BIND_REFRESH_KEY, String(Date.now()));
  } catch {
  } finally {
    voiceBindRunning = false;
  }
  return bound;
}

// 接受申请的串行队列：多个好友同时通过时依次处理，
// 避免并发生成时间线/开场白触发供应商限流导致添加失败
let acceptChain: Promise<void> = Promise.resolve();
const acceptPending = new Set<string>(); // 已在队列中的角色，防重复入队
const acceptRetryCount: Record<string, number> = {}; // 失败重试次数
const ACCEPT_MAX_RETRY = 3;
const ADD_DEBUG_KEY = "wc_debug_addfriend";

/** 持久化添加好友诊断日志（不依赖 logcat，可直接从数据读取） */
async function logAddDebug(roleId: string, msg: string) {
  try {
    // 只在开发者模式解锁后记录，避免常驻调试数据混入导出
    const unlocked = await AsyncStorage.getItem("wc_prompt_debug_unlocked_v1");
    if (unlocked !== "1") return;
    const raw = await AsyncStorage.getItem(ADD_DEBUG_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.push({ t: Date.now(), roleId, msg });
    if (list.length > 200) list.splice(0, list.length - 200);
    await AsyncStorage.setItem(ADD_DEBUG_KEY, JSON.stringify(list));
  } catch {}
}

/** 超时保护：防止某个环节永久卡住阻塞整个接受队列 */
function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(tag + " timeout")), ms)
    ),
  ]);
}

async function doAcceptRoleRequest(roleId: string) {
  await logAddDebug(roleId, "accept-start");
  const role = await withStorageLock(async () => {
    const list = await readRolesRaw();
    const idx = list.findIndex((r) => r.id === roleId);
    if (idx < 0 || list[idx].status !== "requesting") {
      await logAddDebug(
        roleId,
        `accept: 状态非requesting(${idx < 0 ? "不存在" : list[idx].status})，跳过`
      );
      return null;
    }
    return list[idx];
  });
  if (!role) return;
  const callName = await resolveCallName(role.callName);
  const notice = `你已添加${role.name}为好友，可以开始聊天了`;
  let aiInstruction = `你已经添加${callName}为好友，可以开始聊天了`;
  if (role.pendingGreeting?.trim()) {
    aiInstruction += `\n对方添加你时打招呼说：“${role.pendingGreeting.trim()}”`;
  }
  try {
    // 顺序：先让 AI 导演为角色生成今日世界线（角色先"入戏"），再进入聊天
    try {
      const { ensureFriendTimeline } = await import("./worldline");
      // 后台串行生成，不阻塞通过（时间线慢不影响添加好友）
      ensureFriendTimeline(role.id).catch(() => {});
      await logAddDebug(roleId, "ensure-queued(时间线后台生成)");
    } catch (e) {
      devWarning("roles", `ACCEPT-ENSURE-FAIL ${roleId} ${(e as any)?.message || e}`);
      await logAddDebug(roleId, `ensure-fail: ${(e as any)?.message || e}`);
    }
    await withTimeout(
      seedRoleConversation(
        {
          id: "role-" + role.id,
          title: role.name,
          lastMessage: notice,
          updatedAt: Date.now(),
          roleId: role.id,
          roleName: role.name,
          roleCallName: callName,
          roleAvatar: role.avatar,
        },
        notice,
        aiInstruction
      ),
      30000,
      "seed-convo"
    );
    await logAddDebug(roleId, "seed-done(开场白成功)");
  } catch (e: any) {
    // 会话创建失败：保持 requesting，下次进入页面时自动重试
    devWarning("roles", `ACCEPT-CONVO-FAIL ${e?.message || e}`);
    await logAddDebug(roleId, `seed-fail: ${e?.message || e}`);
    throw e; // 由外层队列安排延迟重试
  }
  // 重新读最新数据再写 done：锁内执行，防止并发旧快照覆盖
  await withStorageLock(async () => {
    const latest = await readRolesRaw();
    const lIdx = latest.findIndex((r) => r.id === roleId);
    if (lIdx >= 0 && latest[lIdx].status === "requesting") {
      latest[lIdx] = {
        ...latest[lIdx],
        status: "done",
        addedAt: Date.now(),
      };
      await writeRolesRaw(latest);
    }
  });
  await logAddDebug(roleId, "done(status写入成功)");
  eventBus.emit("local-chat-updated", "role-" + role.id);
  eventBus.emit("roles-updated");
  // 通知世界线导演：新好友已加入，需要补生成今日时间线
  eventBus.emit("worldline-updated");
}

function acceptRoleRequest(roleId: string) {
  if (acceptPending.has(roleId)) return; // 已在队列，跳过重复
  acceptPending.add(roleId);
  acceptChain = acceptChain
    .then(async () => {
      try {
        await doAcceptRoleRequest(roleId);
      } finally {
        acceptPending.delete(roleId);
      }
    })
    .catch((e) => {
      acceptPending.delete(roleId);
      const n = (acceptRetryCount[roleId] || 0) + 1;
      // 失败保持 requesting，最多重试 3 次（限流通常是暂时的）
      if (n > ACCEPT_MAX_RETRY) {
        delete acceptRetryCount[roleId];
        return;
      }
      acceptRetryCount[roleId] = n;
        devWarning("roles", `ACCEPT-RETRY ${roleId} ${e?.message || e}`);
      setTimeout(() => acceptRoleRequest(roleId), 8000);
    });
}

// 发送申请串行化：防止快速连续添加时并发读旧快照互相覆盖
let sendChain: Promise<void> = Promise.resolve();

/** 发送好友申请：角色会在约 2.5 秒后自动同意（串行执行） */
export function sendFriendRequest(
  roleId: string,
  greeting?: string
): Promise<void> {
  sendChain = sendChain
    .then(async () => {
      await doSendFriendRequest(roleId, greeting);
    })
    .catch(() => {});
  return sendChain;
}

async function doSendFriendRequest(
  roleId: string,
  greeting?: string
): Promise<void> {
  await withStorageLock(async () => {
    const list = await readRolesRaw();
    const idx = list.findIndex((r) => r.id === roleId);
    if (idx < 0) {
      await logAddDebug(roleId, "send-request: 角色不存在");
      return;
    }
    if (list[idx].status !== "none") {
      await logAddDebug(
        roleId,
        `send-request: 状态非none(${list[idx].status})，跳过`
      );
      return;
    }
    list[idx] = {
      ...list[idx],
      status: "requesting",
      pendingGreeting: greeting?.trim() || list[idx].pendingGreeting,
    };
    await writeRolesRaw(list);
  });
  await logAddDebug(roleId, "request-sent(写requesting成功)");
  setTimeout(() => {
    logAddDebug(roleId, "timeout-fired(2.5s触发accept)");
    acceptRoleRequest(roleId);
  }, 2500);
}

/** 创建自定义角色 */
export async function createRole(
  data: Omit<Role, "id" | "status" | "isSystem">
): Promise<Role> {
  return withStorageLock(async () => {
    const list = await readRolesRaw();
    const role: Role = {
      ...data,
      id: "role-" + Date.now(),
      status: "none",
    };
    list.push(role);
    await writeRolesRaw(list);
    return role;
  });
}

/** 更新角色（内置角色仅允许改名字以外的展示信息） */
export async function updateRole(
  roleId: string,
  patch: Partial<
    Pick<
      Role,
      | "name"
      | "avatar"
      | "persona"
      | "callName"
      | "greeting"
      | "region"
      | "bio"
      | "storyState"
      | "background"
      | "examples"
      | "temperature"
      | "contextRounds"
      | "modelIds"
      | "voice"
      | "patReply"
      | "remark"
    >
  >
) {
  await withStorageLock(async () => {
    const list = await readRolesRaw();
    const idx = list.findIndex((r) => r.id === roleId);
    if (idx < 0) return;
    list[idx] = { ...list[idx], ...patch };
    await writeRolesRaw(list);
    // 同步已存在会话的角色信息
    const convos = await readConversationsRaw();
    const convo = convos.find((c) => c.id === "role-" + roleId);
    if (convo) {
      convo.title = patch.name ?? convo.title;
      if (patch.remark != null) {
        convo.remark = patch.remark;
        convo.title = patch.remark || convo.roleName || convo.title;
      }
      convo.roleName = patch.name ?? convo.roleName;
      convo.roleAvatar = patch.avatar ?? convo.roleAvatar;
      await AsyncStorage.setItem(
        "wc_local_conversations",
        JSON.stringify(convos)
      );
      eventBus.emit("local-chat-updated", "role-" + roleId);
    }
  });
}

/** 删除自定义角色（及其会话） */
export async function deleteRole(roleId: string) {
  await withStorageLock(async () => {
    const list = await readRolesRaw();
    const next = list.filter((r) => r.id !== roleId);
    await writeRolesRaw(next);
    const convos = await readConversationsRaw();
    const after = convos.filter((c) => c.id !== "role-" + roleId);
    await AsyncStorage.setItem(
      "wc_local_conversations",
      JSON.stringify(after)
    );
    eventBus.emit("local-chat-updated", "role-" + roleId);
  });
}

/** 删除好友：仅从通讯录移除并清除记忆/聊天记录，保留角色资料卡（可重新添加） */
export async function removeFriend(roleId: string) {
  await withStorageLock(async () => {
    const list = await readRolesRaw();
    const next = list.map((r) =>
      r.id === roleId ? { ...r, status: "none" as const } : r
    );
    await writeRolesRaw(next);

    const convos = await readConversationsRaw();
    const after = convos.filter((c) => c.id !== "role-" + roleId);
    await AsyncStorage.setItem(
      "wc_local_conversations",
      JSON.stringify(after)
    );

    await sqlDeleteConvoMessages("role-" + roleId);
  });

  try {
    await sqlClearMemories(roleId);
  } catch {}

  // 从今日世界线移除该角色（资料卡状态/主动消息立即失效）
  try {
    const { removeFriendFromWorldline } = await import("./worldline");
    await removeFriendFromWorldline(roleId);
  } catch {}

  eventBus.emit("local-chat-updated", "role-" + roleId);
  eventBus.emit("roles-updated");
}

export const useRoles = () => {
  const [roles, setRoles] = useRecoilState(rolesState);

  const loadRoles = async (): Promise<Role[]> => {
    const list = await readRolesRaw();
    setRoles(list);
    return list;
  };

  const refresh = () => loadRoles();

  return {
    roles,
    setRoles,
    loadRoles,
    refresh,
  };
};
