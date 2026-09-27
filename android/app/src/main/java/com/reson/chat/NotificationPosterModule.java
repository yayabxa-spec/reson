package com.reson.chat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * 原生直接弹通知（参考爱语等原生 App 的做法）：
 * 不经过闹钟调度，直接 NotificationManager.notify()，
 * 高重要性渠道 + 消息分类 + 独立通知 ID + 点击跳转会话。
 */
public class NotificationPosterModule extends ReactContextBaseJavaModule {

  private static final String CHANNEL_ID = "messages";
  private static final AtomicInteger sId = new AtomicInteger(2001);

  public NotificationPosterModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "NotificationPosterModule";
  }

  @ReactMethod
  public void post(String title, String body, String convoId, String msgId) {
    try {
      ReactApplicationContext ctx = getReactApplicationContext();
      NotificationManager nm =
          (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
      ensureChannel(nm);

      String safeConvo = convoId == null ? "" : convoId;
      String safeMsg = msgId == null ? "" : msgId;
      // 通知 ID 按会话稳定派生，方便按会话取消（进入会话时清掉该会话通知）
      int id = 2001 + Math.abs(safeConvo.hashCode() % 100000);

      Uri uri =
          Uri.parse(
              "airpchatwc:///pages/chats/msg-chats?convoId="
                  + Uri.encode(safeConvo)
                  + (safeMsg.isEmpty()
                      ? ""
                      : "&msgId=" + Uri.encode(safeMsg)));
      Intent intent = new Intent(Intent.ACTION_VIEW, uri);
      intent.setPackage(ctx.getPackageName());
      intent.addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK
              | Intent.FLAG_ACTIVITY_CLEAR_TOP
              | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      int piFlags =
          PendingIntent.FLAG_UPDATE_CURRENT
              | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                  ? PendingIntent.FLAG_IMMUTABLE
                  : 0);
      PendingIntent contentIntent = PendingIntent.getActivity(ctx, id, intent, piFlags);

      String safeTitle = title == null ? "" : title;
      String safeBody = body == null ? "" : body;
      Notification.Builder builder =
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
              ? new Notification.Builder(ctx, CHANNEL_ID)
              : new Notification.Builder(ctx);
      Notification notification =
          builder
              .setSmallIcon(R.drawable.ic_stat_ai)
              .setContentTitle(safeTitle)
              .setContentText(safeBody)
              .setStyle(new Notification.BigTextStyle().bigText(safeBody))
              .setPriority(Notification.PRIORITY_HIGH)
              .setCategory(Notification.CATEGORY_MESSAGE)
              .setVisibility(Notification.VISIBILITY_PUBLIC)
              .setAutoCancel(true)
              .setContentIntent(contentIntent)
              .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
              .setVibrate(new long[] {0, 250, 250, 250})
              .build();
      nm.notify(id, notification);
    } catch (Exception ignored) {
    }
  }

  /** 取消某个会话的通知（已读后移除通知栏） */
  @ReactMethod
  public void cancel(String convoId) {
    try {
      ReactApplicationContext ctx = getReactApplicationContext();
      NotificationManager nm =
          (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
      String safe = convoId == null ? "" : convoId;
      int id = 2001 + Math.abs(safe.hashCode() % 100000);
      nm.cancel(id);
    } catch (Exception ignored) {
    }
  }

  private void ensureChannel(NotificationManager nm) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return;
    }
    if (nm.getNotificationChannel(CHANNEL_ID) != null) {
      return;
    }
    NotificationChannel channel =
        new NotificationChannel(CHANNEL_ID, "消息", NotificationManager.IMPORTANCE_HIGH);
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    channel.setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), null);
    channel.enableVibration(true);
    channel.setVibrationPattern(new long[] {0, 250, 250, 250});
    channel.enableLights(true);
    nm.createNotificationChannel(channel);
  }
}
