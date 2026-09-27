import AsyncStorage from "../utils/storage";
import { sqlReadRoles } from "./appDb";

// ============================================================
// OOBE（首次引导）：首次进入 App 前引导用户完成关键配置
// AI 模型 + 个人资料。完成状态持久化。
// 权限步骤（通知/自启动/电池）已移出 OOBE，后续单独设计。
// ============================================================

const OOBE_KEY = "wc_oobe_done_v1";

export interface OobeSteps {
  model: boolean;
  profile: boolean;
  // 权限步骤
  notification?: boolean;
  autostart?: boolean;
  battery?: boolean;
  visitedAutostart?: boolean; // 是否已跳转过自启动设置（持久化，防卸载丢失）
  visitedBattery?: boolean; // 是否已跳转过电池设置
}

export async function readOobeSteps(): Promise<OobeSteps> {
  try {
    const raw = await AsyncStorage.getItem(OOBE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as OobeSteps;
      // 权限步骤全部完成 → 等价于 model + profile 完成
      if (s.model == null && s.notification && s.autostart && s.battery) {
        return { ...s, model: true, profile: true };
      }
      return { ...s };
    }
  } catch {}
  return {
    model: false,
    profile: false,
    notification: false,
    autostart: false,
    battery: false,
    visitedAutostart: false,
    visitedBattery: false,
  };
}

export async function saveOobeSteps(s: OobeSteps) {
  await AsyncStorage.setItem(OOBE_KEY, JSON.stringify(s));
}

export async function isOobeDone(): Promise<boolean> {
  const s = await readOobeSteps();
  return !!(s.model && s.profile);
}

/** 完成引导：持久化并返回是否全部完成 */
export async function completeOobe(): Promise<boolean> {
  await AsyncStorage.setItem(
    OOBE_KEY,
    JSON.stringify({ model: true, profile: true })
  );
  return true;
}

/** 跳过引导（记录“已看过”，下次启动不强制，可在设置中重新打开） */
export async function skipOobe() {
  await AsyncStorage.setItem(OOBE_KEY, JSON.stringify({ skipped: true }));
}

export async function isOobeSkipped(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(OOBE_KEY);
    return raw ? !!JSON.parse(raw)?.skipped : false;
  } catch {
    return false;
  }
}

/** 判断是否已有使用数据（老用户升级不强制 OOBE） */
export async function hasExistingData(): Promise<boolean> {
  try {
    const convos = await AsyncStorage.getItem("wc_local_conversations");
    if (convos && convos !== "[]" && convos.length > 4) return true;
    // 只要有任何角色处于"已添加好友"状态，就视为老用户
    try {
      const roles = await sqlReadRoles();
      if (roles.some((r) => r.status === "done")) {
        return true;
      }
    } catch {}
  } catch {}
  return false;
}

/** 重置引导（供设置页重新体验） */
export async function resetOobe() {
  await AsyncStorage.removeItem(OOBE_KEY);
}
