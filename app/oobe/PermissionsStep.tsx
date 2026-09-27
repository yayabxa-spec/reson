import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Notifications from "expo-notifications";
import { useTheme } from "../../theme/useTheme";
import {
  isBatteryExempt,
  openAutostartSettings,
  requestBatteryExempt,
} from "../utils/keepAlive";
import WeChatDialog from "../component/base/WeChatDialog";

export type PermKey = "notification" | "autostart" | "battery";

export type Status = "granted" | "denied" | "unknown";

export const INITIAL_PERM_STATUSES: Record<PermKey, Status> = {
  notification: "unknown",
  autostart: "unknown",
  battery: "unknown",
};

const PERM_ITEMS: { key: PermKey; title: string; desc: string }[] = [
  {
    key: "notification",
    title: "通知",
    desc: "角色回复你、主动找你时弹出横幅并显示在锁屏",
  },
  {
    key: "autostart",
    title: "自启动",
    desc: "不打开 App 时，角色也能准时主动找你聊天（小米/红米需在系统里允许）",
  },
  {
    key: "battery",
    title: "电池白名单",
    desc: "后台运行不被系统清理，消息稳定送达",
  },
];

async function queryStatus(key: PermKey): Promise<Status> {
  try {
    if (key === "notification") {
      const r = await Notifications.getPermissionsAsync();
      return r.granted ? "granted" : "denied";
    }
    if (key === "battery") {
      return (await isBatteryExempt()) ? "granted" : "denied";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

const PermissionsStep = ({
  statuses,
  onChange,
  onAllGranted,
}: {
  statuses: Record<PermKey, Status>;
  onChange: (next: Record<PermKey, Status>) => void;
  onAllGranted?: (v: boolean) => void;
}) => {
  const { themeColor } = useTheme();
  const [busy, setBusy] = useState<PermKey | null>(null);
  const [confirmKey, setConfirmKey] = useState<"autostart" | null>(null);
  const visitedAutostart = useRef(false);
  const statusesRef = useRef(statuses);
  useEffect(() => {
    statusesRef.current = statuses;
  }, [statuses]);
  useEffect(() => {
    onAllGranted?.(
      statuses.notification === "granted" &&
        statuses.autostart === "granted" &&
        statuses.battery === "granted"
    );
  }, [statuses, onAllGranted]);

  const refresh = async () => {
    const next: Record<PermKey, Status> = { ...statusesRef.current };
    for (const item of PERM_ITEMS) {
      // 自启动无法自动检测：一旦用户手动确认过就保持"已开启"，不随刷新重置
      if (item.key === "autostart") {
        if (next.autostart !== "granted") {
          next.autostart = "unknown";
        }
        continue;
      }
      if (item.key === "battery") {
        // 电池白名单用系统 API 可可靠检测（已修复 Promise 调用），不再需要手动确认
        next.battery = await queryStatus("battery");
        continue;
      }
      next[item.key] = await queryStatus(item.key);
    }
    onChange(next);
  };

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      refresh();
      if (visitedAutostart.current) {
        setConfirmKey("autostart");
      }
    });
    return () => sub.remove();
  }, []);

  const handle = async (key: PermKey) => {
    if (busy) return;
    setBusy(key);
    try {
      if (key === "notification") {
        const cur = await Notifications.getPermissionsAsync();
        if (!cur.granted && cur.canAskAgain) {
          await Notifications.requestPermissionsAsync();
        }
        const after = await Notifications.getPermissionsAsync();
        if (!after.granted && !after.canAskAgain) {
          Linking.openSettings();
        }
      } else if (key === "autostart") {
        visitedAutostart.current = true;
        openAutostartSettings();
      } else if (key === "battery") {
        requestBatteryExempt();
        // 系统授权弹窗不触发 AppState 变化：轮询检测（最多 10 秒），
        // 用户允许后立即识别为已开启，无需再点一次
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 500));
          if (await isBatteryExempt()) break;
        }
      }
      await refresh();
    } catch {}
    setBusy(null);
  };

  const confirmGranted = (key: "autostart") => {
    visitedAutostart.current = false;
    onChange({ ...statuses, [key]: "granted" });
    setConfirmKey(null);
  };

  return (
    <View style={{ marginTop: 20 }}>
      {PERM_ITEMS.map((item, i) => {
        const st = statuses[item.key];
        const granted = st === "granted";
        const isBusy = busy === item.key;
        return (
          <View
            key={item.key}
            style={{
              backgroundColor: "#fff",
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: themeColor.text3,
                    marginRight: 8,
                  }}
                >
                  {i + 1}
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: themeColor.text5,
                  }}
                >
                  {item.title}
                </Text>
              </View>
              <Text
                style={{
                  marginTop: 5,
                  fontSize: 12,
                  color: themeColor.text2,
                  lineHeight: 18,
                }}
              >
                {item.desc}
              </Text>
            </View>

            {granted ? (
              <View
                style={{
                  width: 56,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: themeColor.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 12 }}>已开启</Text>
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handle(item.key)}
                disabled={!!busy}
                style={{
                  borderWidth: 1,
                  borderColor: themeColor.textBlue,
                  borderRadius: 16,
                  paddingHorizontal: 16,
                  height: 32,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isBusy ? (
                  <ActivityIndicator
                    size="small"
                    color={themeColor.textBlue}
                  />
                ) : (
                  <Text style={{ color: themeColor.textBlue, fontSize: 13 }}>
                    去开启
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <WeChatDialog
        visible={!!confirmKey}
        title="自启动"
        message="请确认你已经在系统设置里允许了本应用自启动。开启后角色退到后台也能准时主动找你聊天。"
        confirmText="已开启"
        cancelText="还没有"
        onCancel={() => {
          visitedAutostart.current = false;
          setConfirmKey(null);
        }}
        onConfirm={() => confirmKey && confirmGranted(confirmKey)}
      />
    </View>
  );
};

export default PermissionsStep;
