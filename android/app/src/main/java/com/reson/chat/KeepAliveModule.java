package com.reson.chat;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.Settings;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import android.content.SharedPreferences;

public class KeepAliveModule extends ReactContextBaseJavaModule {

  /** 供 KeepAliveService 发送心跳事件（后台运行时每 60 秒一次） */
  public static ReactApplicationContext sReactContext;

  public KeepAliveModule(ReactApplicationContext reactContext) {
    super(reactContext);
    sReactContext = reactContext;
  }

  @Override
  public String getName() {
    return "KeepAliveModule";
  }

  @ReactMethod
  public void start() {
    try {
      Intent intent = new Intent(getReactApplicationContext(), KeepAliveService.class);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        getReactApplicationContext().startForegroundService(intent);
      } else {
        getReactApplicationContext().startService(intent);
      }
    } catch (Exception ignored) {
    }
  }

  @ReactMethod
  public void stop() {
    try {
      getReactApplicationContext()
          .stopService(new Intent(getReactApplicationContext(), KeepAliveService.class));
    } catch (Exception ignored) {
    }
  }

  /** 打开小米/红米的自启动管理页（MIUI/HyperOS） */
  @ReactMethod
  public void openAutostartSettings() {
    try {
      // MIUI/HyperOS: app details page has a direct "Autostart" switch
      Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
      details.setData(
          Uri.parse("package:" + getReactApplicationContext().getPackageName()));
      details.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getReactApplicationContext().startActivity(details);
    } catch (Exception ignored) {
      try {
        Intent intent = new Intent();
        intent.setComponent(
            new ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getReactApplicationContext().startActivity(intent);
      } catch (Exception ignored2) {
      }
    }
  }

  /** 直接打开「消息」通知渠道设置页（悬浮通知/锁屏显示开关在这里） */
  @ReactMethod
  public void openMessageChannelSettings() {
    try {
      Intent intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS);
      intent.putExtra(
          Settings.EXTRA_APP_PACKAGE,
          getReactApplicationContext().getPackageName());
      intent.putExtra(Settings.EXTRA_CHANNEL_ID, "messages");
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getReactApplicationContext().startActivity(intent);
    } catch (Exception ignored) {
    }
  }

  /** 请求加入电池优化白名单（后台不被系统杀掉） */
  @ReactMethod
  public void requestIgnoreBatteryOptimizations() {
    try {
      Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
      intent.setData(
          Uri.parse("package:" + getReactApplicationContext().getPackageName()));
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getReactApplicationContext().startActivity(intent);
    } catch (Exception ignored) {
    }
  }

  /** 查询电池优化白名单状态（Android 系统 API，可靠） */
  @ReactMethod
  public void isIgnoringBatteryOptimizations(Promise promise) {
    try {
      PowerManager pm =
          (PowerManager)
              getReactApplicationContext()
                  .getSystemService(android.content.Context.POWER_SERVICE);
      boolean ignoring = pm.isIgnoringBatteryOptimizations(
          getReactApplicationContext().getPackageName());
      promise.resolve(ignoring);
    } catch (Exception e) {
      promise.reject("ERR", e.getMessage());
    }
  }

  /** Check whether "All files access" is granted (Android 11+ special permission) */
  @ReactMethod
  public void isAllFilesAccessGranted(Promise promise) {
    try {
      boolean granted;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        granted = Environment.isExternalStorageManager();
      } else {
        granted =
            getReactApplicationContext()
                    .checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED;
      }
      promise.resolve(granted);
    } catch (Exception e) {
      promise.reject("ERR", e.getMessage());
    }
  }

  /** Open "All files access" system settings page (falls back to app details) */
  @ReactMethod
  public void openAllFilesAccessSettings() {
    try {
      Intent intent;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
        intent.setData(
            Uri.parse("package:" + getReactApplicationContext().getPackageName()));
      } else {
        intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getReactApplicationContext().startActivity(intent);
    } catch (Exception ignored) {
      try {
        Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        fallback.setData(
            Uri.parse("package:" + getReactApplicationContext().getPackageName()));
        fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getReactApplicationContext().startActivity(fallback);
      } catch (Exception ignored2) {
      }
    }
  }

  /** 排程后台唤醒闹钟（每 30 分钟一次，用于自启动检测与主动消息补发） */
  @ReactMethod
  public void scheduleWakeAlarm() {
    try {
      WakeReceiver.schedule(getReactApplicationContext());
    } catch (Exception ignored) {
    }
  }

  /** 读取最近一次被后台闹钟拉起的时间戳（0 = 从未被拉起） */
  @ReactMethod
  public void getLastWakeTrace(Promise promise) {
    try {
      SharedPreferences sp =
          getReactApplicationContext()
              .getSharedPreferences("reson_wake", Context.MODE_PRIVATE);
      promise.resolve(sp.getLong("last_wake", 0L));
    } catch (Exception e) {
      promise.reject("ERR", e.getMessage());
    }
  }
}
