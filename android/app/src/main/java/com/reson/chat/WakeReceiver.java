package com.reson.chat;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.content.SharedPreferences;

/**
 * 后台唤醒接收器：
 * 每 30 分钟一次的 AlarmManager 闹钟到点拉起本进程（自启动开着才允许拉起），
 * 启动保活服务让 JS 继续执行"补插到期主动消息 + 打心跳"。
 * 同时作为自启动检测的依据：6~12 小时窗口内完全没有被拉起的痕迹
 * （keepalive 心跳时间戳）即大概率自启动/后台权限被限制。
 */
public class WakeReceiver extends BroadcastReceiver {

  public static final String ACTION_WAKE = "com.reson.chat.action.WAKE";
  private static final long INTERVAL_MS = AlarmManager.INTERVAL_HALF_HOUR;

  public static void schedule(Context context) {
    try {
      AlarmManager am =
          (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
      if (am == null) return;
      Intent intent = new Intent(context, WakeReceiver.class);
      intent.setAction(ACTION_WAKE);
      int flags =
          PendingIntent.FLAG_UPDATE_CURRENT
              | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                  ? PendingIntent.FLAG_IMMUTABLE
                  : 0);
      PendingIntent pi =
          PendingIntent.getBroadcast(context, 0, intent, flags);
      // 非精确重复闹钟：不需要 SCHEDULE_EXACT_ALARM 权限
      long triggerAt = System.currentTimeMillis() + INTERVAL_MS;
      am.setInexactRepeating(
          AlarmManager.RTC_WAKEUP, triggerAt, INTERVAL_MS, pi);
    } catch (Exception ignored) {
    }
  }

  @Override
  public void onReceive(Context context, Intent intent) {
    try {
      String action = intent == null ? "" : intent.getAction();
      if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
        // 重启后闹钟丢失，重新排程
        schedule(context);
        return;
      }
      if (ACTION_WAKE.equals(action)) {
        schedule(context); // 保底重排
        // 原生痕迹：进程被闹钟拉起（自启动开着才会被拉起），供 JS 检测判断
        try {
          SharedPreferences sp =
              context.getSharedPreferences("reson_wake", Context.MODE_PRIVATE);
          sp.edit().putLong("last_wake", System.currentTimeMillis()).apply();
        } catch (Exception ignored) {
        }
        Intent svc = new Intent(context, KeepAliveService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(svc);
        } else {
          context.startService(svc);
        }
      }
    } catch (Exception ignored) {
    }
  }
}
