import AsyncStorage from "../utils/storage";
import { getLastWakeTrace } from "../utils/keepAlive";

// ============================================================
// 后台保活健康检查：
// 保活服务每 60 秒发一次心跳，这里记录最后心跳时间；
// App 回到前台时对比：如果退后台较久却没有任何心跳，
// 说明后台执行被系统限制（常见于小米/红米未开自启动），
// 此时引导用户去开启自启动权限。
// ============================================================

const LAST_TICK_KEY = "wc_keepalive_last_tick_v1";
const LAST_ASK_KEY = "wc_keepalive_last_ask_v1";

/** 心跳回调里调用：更新最后心跳时间 */
export async function markKeepAliveTick() {
  try {
    await AsyncStorage.setItem(LAST_TICK_KEY, String(Date.now()));
  } catch {}
}

/** App 回到前台时调用：判断是否需要引导开启自启动 */
export async function shouldAskAutostart(): Promise<boolean> {
  try {
    const rawTick = await AsyncStorage.getItem(LAST_TICK_KEY);
    if (!rawTick) return false; // 从未有过心跳记录（首次安装），不打扰
    const lastTick = parseInt(rawTick, 10) || 0;
    const now = Date.now();
    const gap = now - lastTick;
    // 2 小时窗口：自启动开着时，30 分钟一次的唤醒闹钟会拉起进程续心跳；
    // 超过 2 小时仍无心跳 → 大概率后台/自启动被限制
    if (gap < 2 * 60 * 60 * 1000) return false;

    // 若进程被后台闹钟拉起过（自启动开着才会拉起），说明未被限制
    const lastWake = await getLastWakeTrace();
    if (lastWake && now - lastWake < 2 * 60 * 60 * 1000) return false;

    // 每天最多提醒一次
    const rawAsk = await AsyncStorage.getItem(LAST_ASK_KEY);
    const lastAsk = rawAsk ? parseInt(rawAsk, 10) : 0;
    const today = new Date().toDateString();
    if (lastAsk && new Date(lastAsk).toDateString() === today) return false;
    return true;
  } catch {
    return false;
  }
}

/** 记录本次提醒时间（避免当天重复打扰） */
export async function markAutostartAsked() {
  try {
    await AsyncStorage.setItem(LAST_ASK_KEY, String(Date.now()));
  } catch {}
}
