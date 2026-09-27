import { NativeModules, Platform } from "react-native";

const SM = NativeModules.ShortcutModule as
  | { createChatShortcut?: (roleId: string, roleName: string) => void }
  | undefined;

/** 创建桌面快捷方式：点击直接打开角色聊天 */
export function createChatShortcut(roleId: string, roleName: string) {
  if (Platform.OS !== "android" || !SM?.createChatShortcut) return;
  try {
    SM.createChatShortcut(roleId, roleName);
  } catch {}
}
