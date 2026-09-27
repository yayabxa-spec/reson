package com.reson.chat;

import android.os.Build;
import android.os.Environment;
import android.net.Uri;
import android.util.Base64;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.io.File;
import java.io.FileOutputStream;

/**
 * 公共目录导出（.reson）。
 * expo-file-system 对不存在的路径用 File.canWrite() 判权限，导致
 * /storage/emulated/0/RESON_Export 即使已授予「所有文件访问」也会报
 * "Location ... isn't writable"。这里用 java.io 直接写，绕过该检查。
 */
public class ExportModule extends ReactContextBaseJavaModule {

  private static final String EXPORT_DIR_NAME = "RESON_Export";

  public ExportModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "ResonExportModule";
  }

  /** 把 base64 内容写入公共导出目录，返回绝对路径 */
  @ReactMethod
  public void writePublicExportFile(String fileName, String base64, Promise promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R
          || !Environment.isExternalStorageManager()) {
        promise.reject("NO_PERMISSION", "all files access not granted");
        return;
      }
      File dir = new File(Environment.getExternalStorageDirectory(), EXPORT_DIR_NAME);
      if (!dir.exists() && !dir.mkdirs()) {
        promise.reject("MKDIR_FAILED", "cannot create " + dir.getAbsolutePath());
        return;
      }
      File out = new File(dir, fileName);
      byte[] data = Base64.decode(base64, Base64.DEFAULT);
      try (FileOutputStream fos = new FileOutputStream(out)) {
        fos.write(data);
      }
      promise.resolve(Uri.fromFile(out).toString());
    } catch (Exception e) {
      promise.reject("WRITE_FAILED", e.getMessage());
    }
  }
}
