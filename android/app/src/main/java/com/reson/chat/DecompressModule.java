package com.reson.chat;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import org.tukaani.xz.XZInputStream;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;

public class DecompressModule extends ReactContextBaseJavaModule {

  public DecompressModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "DecompressModule";
  }

  @ReactMethod
  public void decompressXz(String srcPath, String destPath, Promise promise) {
    new Thread(() -> {
      try {
        File src = new File(srcPath);
        File dest = new File(destPath);
        if (dest.exists() && dest.length() > 0) {
          promise.resolve(dest.getAbsolutePath());
          return;
        }
        File parent = dest.getParentFile();
        if (parent != null && !parent.exists()) {
          parent.mkdirs();
        }
        try (XZInputStream in = new XZInputStream(new FileInputStream(src));
             FileOutputStream out = new FileOutputStream(dest)) {
          byte[] buf = new byte[1 << 20];
          int n;
          while ((n = in.read(buf)) != -1) {
            out.write(buf, 0, n);
          }
        }
        promise.resolve(dest.getAbsolutePath());
      } catch (Throwable e) {
        promise.reject("DECOMPRESS_XZ_FAILED", e.getMessage(), e);
      }
    }).start();
  }
}