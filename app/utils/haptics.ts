import * as Haptics from 'expo-haptics';

/**
 * 触觉反馈统一封装：全项目从这里调用，失败静默（部分模拟器/设备不支持）。
 */

/** 轻触觉：tab 切换、菜单弹出、气泡按压等日常反馈 */
export function hapticLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** 中触觉：长按菜单出现、拍一拍等强一点的确认感 */
export function hapticMedium() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** 成功通知触觉：备份完成、发送成功等 */
export function hapticSuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** 失败通知触觉：操作失败提示 */
export function hapticError() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
