import AsyncStorage from "../utils/storage";
import type { RoleCallName } from "./builtin/types";

export interface UserProfile {
  name: string;
  gender: "male" | "female";
  wechatId: string;
  avatar: string;
  patContent: string;
  /** 生日，格式 "MM-DD"（两位补零）；空表示未设置。生日当天 AI 导演会安排好友祝贺 */
  birthday?: string;
}

const KEY = "wc_user_profile_v1";

export const DEFAULT_PROFILE: UserProfile = {
  name: "用户",
  gender: "female",
  wechatId: "",
  avatar: "",
  patContent: "",
};

const subs = new Set<() => void>();

function notify() {
  subs.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export function subscribeProfile(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/** 注入提示词的性别说明：让角色按用户性别选择称呼（如哥哥/姐姐） */
export function genderHint(gender: UserProfile["gender"]): string {
  if (gender === "male") {
    return "【用户性别】用户为男性。如果角色设定里有按性别区分的称呼（如“哥哥/姐姐”“先生/女士”），请使用男性对应的称呼。";
  }
  return "【用户性别】用户为女性。如果角色设定里有按性别区分的称呼（如“哥哥/姐姐”“先生/女士”），请使用女性对应的称呼。";
}

/**
 * 解析角色对你的称呼：
 * - 旧数据为普通字符串，原样返回；
 * - 角色卡新格式为 { male, female, neutral }，按用户性别取对应变体，
 *   缺省时回退 neutral → 另一性别变体 → "你"。
 */
export function pickCallName(
  callName: RoleCallName | undefined,
  gender: UserProfile["gender"]
): string {
  if (!callName) return "你";
  if (typeof callName === "string") {
    const t = callName.trim();
    if (!t) return "你";
    return t;
  }
  const v = callName;
  if (gender === "male") {
    return v.male?.trim() || v.neutral?.trim() || v.female?.trim() || "你";
  }
  return v.female?.trim() || v.neutral?.trim() || v.male?.trim() || "你";
}

/** 异步版：读取用户资料后解析称呼（添加好友/群聊建组时用） */
export async function resolveCallName(
  callName: RoleCallName | undefined
): Promise<string> {
  const p = await readProfile();
  return pickCallName(callName, p.gender);
}

export async function readProfile(): Promise<UserProfile> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 兼容旧数据：早期版本存在"保密"选项，存档里可能是 unknown，一律归一为默认（女）
      const gender: UserProfile["gender"] =
        parsed.gender === "male" ? "male" : "female";
      return { ...DEFAULT_PROFILE, ...parsed, gender };
    }
  } catch {}
  return { ...DEFAULT_PROFILE };
}

export async function saveProfile(p: UserProfile) {
  await AsyncStorage.setItem(KEY, JSON.stringify(p));
  notify();
}

/** 展示用：把 "MM-DD" 格式化为 "8月16日"；未设置返回 "未设置" */
export function formatBirthday(birthday: string | undefined): string {
  if (!birthday) return "未设置";
  const [m, d] = birthday.split("-").map((x) => parseInt(x, 10));
  if (!m || !d) return "未设置";
  return `${m}月${d}日`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * 判断今天是否用户的生日
 * 特例：2 月 29 日（闰日）生日——闰年当天庆祝；平年提前到 2 月 28 日庆祝。
 */
export function isBirthdayToday(birthday: string | undefined): boolean {
  if (!birthday) return false;
  const d = new Date();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const today = `${String(m).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
  if (today === birthday) return true;
  if (
    birthday === "02-29" &&
    m === 2 &&
    day === 28 &&
    !isLeapYear(d.getFullYear())
  ) {
    return true; // 平年代偿日：提前到 2 月 28 日
  }
  return false;
}
