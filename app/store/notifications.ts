import * as Notifications from "expo-notifications";
import { NativeModules, Platform } from "react-native";

let setup = false;

export const MESSAGE_CHANNEL = "messages";

const Poster = NativeModules.NotificationPosterModule as
  | {
      post?: (title: string, body: string, convoId: string, msgId?: string) => void;
      cancel?: (convoId: string) => void;
    }
  | undefined;

export function ensureNotificationSetup() {
  if (setup) return;
  setup = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      // expo-notifications 0.20.1 使用 shouldShowAlert（新版才叫 shouldShowBanner）
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** 启动时静默准备：注册处理器 + 创建通知渠道，不弹权限框 */
export async function prepareNotifications() {
  ensureNotificationSetup();
  await ensureChannel();
}

/**
 * 创建消息通知渠道（幂等）。
 * 参考同类应用的做法：高重要性 + 锁屏公开显示 + 声音震动，
 * 保证横幅弹窗、通知列表、锁屏都能看到。
 */
export async function ensureChannel() {
  // 渠道声音若指向不存在的 "default"，删除重建为系统默认声音
  const existing = await Notifications.getNotificationChannelAsync(
    MESSAGE_CHANNEL
  );
  if (existing && existing.sound === "default") {
    await Notifications.deleteNotificationChannelAsync(MESSAGE_CHANNEL);
  }
  await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL, {
    name: "消息",
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: null,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    showBadge: true,
  });
}

/**
 * 应用启动时调用一次：
 * 1. 注册通知处理器；
 * 2. 先创建渠道（必须先于发通知，否则会落到默认渠道）；
 * 3. 再请求通知权限。
 */
export async function initNotifications(): Promise<boolean> {
  try {
    ensureNotificationSetup();
    await ensureChannel();
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    if (cur.canAskAgain === false) return false;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  return initNotifications();
}

/** 立即弹出一条消息通知 */
export async function notifyNewMessage(
  title: string,
  body: string,
  convoId: string,
  msgId?: string
) {
  try {
    ensureNotificationSetup();
    const ok = await requestNotificationPermission();
    if (!ok) return;
    // 安卓：原生直接弹通知（不走闹钟调度，更及时可靠）
    if (Platform.OS === "android" && Poster?.post) {
      Poster.post(title, body, convoId, msgId);
      return;
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { convoId },
        sound: "default",
      },
      trigger: { channelId: MESSAGE_CHANNEL },
    });
  } catch {}
}

/** 预约一条本地通知（应用被杀也会由系统按时弹出） */
export async function scheduleNotificationAt(
  id: string,
  title: string,
  body: string,
  fireAt: number,
  convoId: string
) {
  try {
    ensureNotificationSetup();
    const ok = await requestNotificationPermission();
    if (!ok) return;
    await ensureChannel();
    const delay = Math.max(1, Math.round((fireAt - Date.now()) / 1000));
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title,
        body,
        data: { convoId },
        sound: "default",
      },
      // 必须显式声明 type:timeInterval：expo-notifications 57 起
      // 不带 type 的 {seconds} 会解析失败并退化为 channel 触发器，
      // 在 Android 上 ChannelAwareTrigger 不可调度，通知会立即弹出
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: delay,
        channelId: MESSAGE_CHANNEL,
      },
    });
  } catch {}
}

export async function cancelScheduledNotification(id: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
}

/** 移除通知栏中已弹出的指定通知（主动消息落库时清理残留） */
export async function dismissNotification(id: string) {
  try {
    await Notifications.dismissNotificationAsync(id);
  } catch {}
}

/** 进入会话已读时调用：移除该会话的通知栏通知 + 未触发的定时通知 */
export async function cancelConvoNotifications(convoId: string) {
  try {
    if (Platform.OS === "android" && Poster?.cancel) {
      Poster.cancel(convoId);
    }
    await cancelScheduledNotification("proactive-" + convoId);
  } catch {}
}
