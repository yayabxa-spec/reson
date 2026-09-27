package com.reson.chat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.IBinder;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * 后台保活前台服务：
 * 应用退到后台时启动，提升进程优先级，避免被系统/省电策略杀掉，
 * 保证 AI 回复完成后能正常弹出通知。
 */
public class KeepAliveService extends Service {

  public static final String CHANNEL_ID = "keepalive";
  private static final int NOTIFICATION_ID = 1001;
  private static final String TICK_EVENT = "KeepAliveTick";
  private static final long TICK_INTERVAL_MS = 60_000;
  private final Handler mTicker = new Handler(Looper.getMainLooper());
  private boolean mTicking = false;

  private final Runnable mTickRunnable =
      new Runnable() {
        @Override
        public void run() {
          emitTick();
          if (mTicking) {
            mTicker.postDelayed(this, TICK_INTERVAL_MS);
          }
        }
      };

  private void emitTick() {
    try {
      ReactApplicationContext ctx = KeepAliveModule.sReactContext;
      if (ctx != null && ctx.hasActiveReactInstance()) {
        WritableMap params = Arguments.createMap();
        params.putDouble("ts", System.currentTimeMillis());
        ctx
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(TICK_EVENT, params);
      }
    } catch (Exception ignored) {
    }
  }

  @Override
  public void onCreate() {
    super.onCreate();
    NotificationManager nm =
        (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel =
          new NotificationChannel(
              CHANNEL_ID,
              "后台保活",
              NotificationManager.IMPORTANCE_MIN);
      channel.setShowBadge(false);
      nm.createNotificationChannel(channel);
    }

    Intent tap = new Intent(this, MainActivity.class);
    tap.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    int piFlags =
        PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_IMMUTABLE
                : 0);
    PendingIntent contentIntent =
        PendingIntent.getActivity(this, 0, tap, piFlags);

    Notification.Builder builder =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
    Notification notification =
        builder
            .setContentTitle("AI 角色扮演")
            .setContentText("正在后台运行，角色消息会及时提醒你")
            .setSmallIcon(R.drawable.ic_stat_ai)
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .build();

    startForeground(NOTIFICATION_ID, notification);
    startTicking();
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    // 进程被杀后由系统尽量重启，保证保活状态延续
    return START_STICKY;
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  private void startTicking() {
    if (mTicking) return;
    mTicking = true;
    mTicker.postDelayed(mTickRunnable, TICK_INTERVAL_MS);
  }

  @Override
  public void onDestroy() {
    mTicking = false;
    mTicker.removeCallbacksAndMessages(null);
    super.onDestroy();
  }
}
