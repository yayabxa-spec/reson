package com.reson.chat;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * 创建桌面快捷方式：点击直接打开对应角色的聊天页
 */
public class ShortcutModule extends ReactContextBaseJavaModule {

  public ShortcutModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "ShortcutModule";
  }

  @ReactMethod
  public void createChatShortcut(String roleId, String roleName) {
    try {
      Context ctx = getReactApplicationContext();
      String safeId = roleId == null ? "" : roleId;
      String url =
          "airpchatwc:///pages/chats/msg-chats?chatType=&convoId=role-"
              + Uri.encode(safeId);
      Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
      intent.setPackage(ctx.getPackageName());
      intent.addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ShortcutManager sm = ctx.getSystemService(ShortcutManager.class);
        if (sm != null && sm.isRequestPinShortcutSupported()) {
          ShortcutInfo shortcut =
              new ShortcutInfo.Builder(ctx, "chat-" + safeId)
                  .setShortLabel(roleName == null ? "角色" : roleName)
                  .setLongLabel(roleName == null ? "角色" : roleName)
                  .setIcon(
                      Icon.createWithResource(
                          ctx, R.mipmap.ic_launcher))
                  .setIntent(intent)
                  .build();
          sm.requestPinShortcut(shortcut, null);
        }
      } else {
        Intent add = new Intent("com.android.launcher.action.INSTALL_SHORTCUT");
        add.putExtra(Intent.EXTRA_SHORTCUT_INTENT, intent);
        add.putExtra(Intent.EXTRA_SHORTCUT_NAME, roleName == null ? "角色" : roleName);
        add.putExtra("duplicate", false);
        add.putExtra(
            Intent.EXTRA_SHORTCUT_ICON_RESOURCE,
            Intent.ShortcutIconResource.fromContext(ctx, R.mipmap.ic_launcher));
        ctx.sendBroadcast(add);
      }
    } catch (Exception ignored) {
    }
  }
}
