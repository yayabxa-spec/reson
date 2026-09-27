package com.reson.chat;

import android.content.res.Resources;
import android.os.Build;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class DynamicColorModule extends ReactContextBaseJavaModule {

  public DynamicColorModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "DynamicColorModule";
  }

  /**
   * 读取 Android 12+ 系统动态取色（Monet / Material You）的 accent1_600 色调。
   * 系统低于 Android 12、设备未启用动态取色或读取失败时返回 null，
   * 由 JS 端回退到内置固定色板。
   */
  @ReactMethod
  public void getSystemAccentColor(Promise promise) {
    try {
      if (Build.VERSION.SDK_INT < 31) {
        promise.resolve(null);
        return;
      }
      String[] tones = {
        "system_accent1_500", "system_accent1_600", "system_accent1_400"
      };
      for (String tone : tones) {
        int id = Resources.getSystem().getIdentifier(tone, "color", "android");
        if (id == 0) {
          id =
              getReactApplicationContext()
                  .getResources()
                  .getIdentifier(tone, "color", "android");
        }
        if (id == 0) continue;
        try {
          int color = Resources.getSystem().getColor(id, null);
          String hex = String.format("#%06X", 0xFFFFFF & color);
          promise.resolve(hex);
          return;
        } catch (Throwable ignored) {
        }
      }
      promise.resolve(null);
    } catch (Throwable ignored) {
      // 取色失败不影响使用，交给 JS 端回退
      promise.resolve(null);
    }
  }
}
