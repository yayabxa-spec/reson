import AsyncStorage from "../utils/storage";
import eventBus from "../utils/eventBus";
import { chatCompletion } from "../utils/ai";
import {
  readProfile,
  genderHint,
  isBirthdayToday,
  isLeapYear,
  UserProfile,
} from "./profile";
import { getFriendRoles } from "./worldline";
import { resolveRoleConfig } from "./models";
import {
  fillTemplate,
  PROMPT_DEFAULTS,
  resolvePrompt,
} from "./promptEditing";
import {
  readConversationsRaw,
  writeConversationsRaw,
  appendMessageToStorage,
  unhideConversation,
  LocalConvo,
  LocalMsg,
} from "./localChat";
import { scheduleProactive } from "./proactive";
import { appendMemory } from "./memory";
import { cleanChatText } from "../utils/sanitize";
import { sqlReadMessages } from "./appDb";

// ============================================================
// 生日导演：用户生日当天，AI 导演先告知，然后所有已添加好友
// 按时间表陆续发祝贺（每条约 10 分钟），祝贺写入各角色记忆。
// 仅生日当天触发一次，错过不补发。
// ============================================================

const DONE_KEY = "wc_user_birthday_celebrated"; // 值：yyyy-mm-dd，当天已庆祝则不再重复
const DIRECTOR_ID = "ai-director"; // AI 导演会话（主页聊天列表可见）
const WISH_INTERVAL_MIN = 10; // 每条祝贺间隔
const FIRST_WISH_DELAY_MIN = 2; // 第一条祝贺延迟

let running = false;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 确保 AI 导演会话存在（首次在主页聊天列表出现） */
async function ensureDirectorConvo(): Promise<LocalConvo> {
  const list = await readConversationsRaw();
  const c = list.find((x) => x.id === DIRECTOR_ID);
  if (c) return c;
  const convo: LocalConvo = {
    id: DIRECTOR_ID,
    title: "AI导演",
    lastMessage: "",
    updatedAt: Date.now(),
    roleName: "AI导演",
  };
  list.unshift(convo);
  await writeConversationsRaw(list);
  return convo;
}

/** 导演告知：插入一条 AI 导演消息（不走 AI，省成本） */
async function appendDirectorNotice(content: string) {
  await ensureDirectorConvo();
  const msg: LocalMsg = {
    id: "bd-" + Date.now(),
    role: "assistant",
    content,
    createdAt: Date.now(),
    senderName: "AI导演",
  };
  await appendMessageToStorage(DIRECTOR_ID, msg);
  const list = await readConversationsRaw();
  const next = list.map((c) =>
    c.id === DIRECTOR_ID
      ? { ...c, lastMessage: content.slice(0, 200), updatedAt: Date.now() }
      : c
  );
  await writeConversationsRaw(next);
  await unhideConversation(DIRECTOR_ID).catch(() => {});
  eventBus.emit("local-chat-updated", DIRECTOR_ID);
}

/** 让角色以本人身份生成一条生日祝福；失败返回空串（跳过该角色） */
async function generateBirthdayWish(
  role: { id: string; name: string; persona?: string; modelIds?: any },
  profile: UserProfile
): Promise<string> {
  let config = await resolveRoleConfig(undefined, "text");
  try {
    const resolved = await resolveRoleConfig(role.modelIds, "text");
    if (resolved) config = resolved;
  } catch {}
  if (!config?.apiKey) return "";
  const gender = genderHint(profile.gender);
  const leapNote =
    profile.birthday === "02-29"
      ? isLeapYear(new Date().getFullYear())
        ? "（用户的生日是 2 月 29 日，今年恰好是闰年，就在今天庆祝。）"
        : "（用户的生日是 2 月 29 日，今年日历上没有这一天，大家按约定提前到 2 月 28 日庆祝。你可以在祝福里自然地提到这一点，别显得奇怪。）"
      : "";
  // 关系深度：取该角色会话最早一条消息的时间，估算认识天数
  let relationHint = "";
  try {
    const msgs = await sqlReadMessages("role-" + role.id);
    if (msgs.length > 0) {
      const firstMsg = msgs[0];
      const days = Math.floor((Date.now() - firstMsg.createdAt) / 86400000);
      if (days >= 90) {
        relationHint = `\n\n你们已经是认识很久的老朋友了（认识约${Math.floor(days / 30)}个月），祝福可以更亲近自然，像老朋友之间的真心话。`;
      } else if (days >= 14) {
        relationHint = `\n\n你们已经认识一段时间了（约${days}天），祝福可以温暖真诚但不用过于亲昵。`;
      } else {
        relationHint = "\n\n你们是刚认识不久的新朋友，祝福保持礼貌友好即可，不要显得太过亲密。";
      }
    }
  } catch { /* non-critical */ }
  const systemPrompt = fillTemplate(
    await resolvePrompt("birthday", PROMPT_DEFAULTS.birthday),
    {
      角色名: role.name,
      角色设定: role.persona || "",
      用户名: profile.name,
      闰年提示: leapNote,
      关系提示: relationHint,
      性别提示: gender ? "\n\n" + gender : "",
    }
  );
  try {
    const reply = await chatCompletion(
      config,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: "（给用户发送生日祝福）" },
      ],
      {
        temperature: 0.9,
        maxTokens: 300,
        noThinking: true,
        roleId: role.id,
        scene: "生日祝福",
      }
    );
    let clean = cleanChatText(reply || "")
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?[a-zA-Z][^>]*>/g, "")
      .trim();
    // 兜底：模型仍输出"任务理解/复述要求"段时，取最后一段对话式内容
    if (
      /^(用户要求|首先|我需要|好的|明白了|让我|作为|请|我们需要|以.+身份)/.test(
        clean
      ) ||
      clean.length > 180
    ) {
      const parts = clean
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
      clean = parts[parts.length - 1] || "";
    }
    // 若取到最后一段仍是任务描述（无实际祝福内容），视为生成失败跳过该角色
    if (
      !clean ||
      /我们需要以|请以.+身份|不超过\s*\d+\s*字|不要输出|不要提及你是|复述要求/.test(
        clean
      )
    ) {
      return "";
    }
    clean = clean.slice(0, 120);
    return clean;
  } catch {
    return "";
  }
}

/**
 * 生日调度：生日当天触发一次。
 * 1) AI 导演先告知；2) 为所有已添加好友生成祝贺；3) 按时间表陆续排程；4) 写入角色记忆。
 * 无好友或已庆祝过则直接返回；当天没打开 App 错过不补发。
 */
export async function dispatchBirthdayCelebration(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const profile = await readProfile();
    if (!isBirthdayToday(profile.birthday)) return;
    const done = await AsyncStorage.getItem(DONE_KEY);
    if (done === todayStr()) return;

    const friends = await getFriendRoles();
    if (!friends.length) {
      await AsyncStorage.setItem(DONE_KEY, todayStr());
      return;
    }

    // 1) 导演告知（闰日生日平年时按约定提前）
    const leapCompensating =
      profile.birthday === "02-29" &&
      !isLeapYear(new Date().getFullYear());
    await appendDirectorNotice(
      leapCompensating
        ? "今天是你的生日！今年没有 2 月 29 日，但朋友们按约定提前一天来送祝福~"
        : "今天是你的生日！你添加的好友们都记得，TA 们会陆续给你送来祝福~"
    );

    // 2) 逐人生成祝贺（串行，避免并发触发限流）
    const wishes: { roleId: string; name: string; content: string }[] = [];
    for (const r of friends) {
      const content = await generateBirthdayWish(r, profile);
      if (content) {
        wishes.push({
          roleId: r.id,
          name: r.remark || r.name,
          content,
        });
      }
    }

    // 3) 按时间表排程（第一条 2 分钟后，之后每条间隔 10 分钟）
    wishes.forEach((w, i) => {
      scheduleProactive(
        "role-" + w.roleId,
        FIRST_WISH_DELAY_MIN + i * WISH_INTERVAL_MIN,
        w.name,
        w.content,
        true
      ).catch(() => {});
    });

    // 4) 祝贺写入各角色记忆（明年角色会记得用户的生日）
    for (const w of wishes) {
      appendMemory(
        w.roleId,
        `${leapCompensating ? "用户的生日是闰日 2 月 29 日，平年按约定提前到 2 月 28 日庆祝。" : ""}今天是${profile.name}的生日，我向 TA 送上了生日祝福：${w.content}`
      ).catch(() => {});
    }

    await AsyncStorage.setItem(DONE_KEY, todayStr());
  } catch {
    // 静默失败：下次触发点再试
  } finally {
    running = false;
  }
}
