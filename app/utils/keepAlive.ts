import { NativeModules, Platform, DeviceEventEmitter } from "react-native";

const KM = NativeModules.KeepAliveModule as
  | {
      start?: () => void;
      stop?: () => void;
      openAutostartSettings?: () => void;
      openMessageChannelSettings?: () => void;
      requestIgnoreBatteryOptimizations?: () => void;
      openAllFilesAccessSettings?: () => void;
      isIgnoringBatteryOptimizations?: () => Promise<boolean>;
      isAllFilesAccessGranted?: () => Promise<boolean>;
      scheduleWakeAlarm?: () => void;
      getLastWakeTrace?: () => Promise<number>;
    }
  | undefined;

function available() {
  return Platform.OS === "android" && !!KM;
}

/** 启动前台保活服务（退后台时调用，防止进程被杀） */
export function startKeepAlive() {
  if (!available()) return;
  try {
    KM!.start!();
  } catch {}
}

/** 回到前台时停止保活服务，收起常驻通知 */
export function stopKeepAlive() {
  if (!available()) return;
  try {
    KM!.stop!();
  } catch {}
}

/** 打开小米/红米自启动管理页 */
export function openAutostartSettings() {
  if (!available()) return;
  try {
    KM!.openAutostartSettings!();
  } catch {}
}

/** 直接打开「消息」通知渠道设置页（悬浮通知/锁屏开关） */
export function openMessageChannelSettings() {
  if (!available()) return;
  try {
    KM!.openMessageChannelSettings!();
  } catch {}
}

/** 请求电池优化白名单 */
export function requestBatteryExempt() {
  if (!available()) return;
  try {
    KM!.requestIgnoreBatteryOptimizations!();
  } catch {}
}

/** 查询是否已加入电池优化白名单 */
export function isBatteryExempt(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!available() || !KM?.isIgnoringBatteryOptimizations) {
      resolve(false);
      return;
    }
    try {
      KM.isIgnoringBatteryOptimizations!().then(
        (v) => resolve(!!v),
        () => resolve(false)
      );
    } catch {
      resolve(false);
    }
  });
}

/** 打开"所有文件访问"系统设置（Android 11+ 特殊权限） */
export function openAllFilesAccessSettings() {
  if (!available()) return;
  try {
    KM!.openAllFilesAccessSettings!();
  } catch {}
}

/** 检测是否已授予"所有文件访问"权限 */
export function isAllFilesAccessGranted(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!available() || !KM?.isAllFilesAccessGranted) {
      resolve(false);
      return;
    }
    try {
      KM.isAllFilesAccessGranted!().then(
        (v) => resolve(!!v),
        () => resolve(false)
      );
    } catch {
      resolve(false);
    }
  });
}

/** 排程后台唤醒闹钟（每 30 分钟一次；App 启动时调用） */
export function scheduleWakeAlarm() {
  if (!available() || !KM?.scheduleWakeAlarm) return;
  try {
    KM.scheduleWakeAlarm();
  } catch {}
}

/** 读取最近一次被后台闹钟拉起的原生时间戳（0 = 从未被拉起） */
export function getLastWakeTrace(): Promise<number> {
  return new Promise((resolve) => {
    if (!available() || !KM?.getLastWakeTrace) {
      resolve(0);
      return;
    }
    try {
      KM.getLastWakeTrace().then(
        (v) => resolve(Number(v) || 0),
        () => resolve(0)
      );
    } catch {
      resolve(0);
    }
  });
}

/** 订阅后台保活心跳：App 在后台时每 60 秒触发一次，用于到点执行主动消息 */
export function subscribeKeepAliveTick(fn: () => void): () => void {
  const sub = DeviceEventEmitter.addListener("KeepAliveTick", () => {
    try {
      fn();
    } catch {}
  });
  return () => sub.remove();
}
