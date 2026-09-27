import { useLayoutEffect } from "react";
import { Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "expo-router";
import { Fontisto } from "@expo/vector-icons";
import { useTheme } from "../../../../../theme/useTheme";
import ArrowRightIcon from "../../../../../assets/icon/common/arrow-right.svg";
import {
  openAutostartSettings,
  openMessageChannelSettings,
  requestBatteryExempt,
} from "../../../../utils/keepAlive";

const PERMISSIONS = [
  { key: "notification", name: "通知（消息横幅 / 锁屏）", icon: "bell" },
  { key: "storage", name: "存储（本地备份）", icon: "folder" },
] as const;

const Permission = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "系统权限",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, []);

  return (
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <View style={{ backgroundColor: "#fff", marginTop: 12 }}>
        {PERMISSIONS.map((p, i) => (
          <TouchableOpacity
            key={p.key}
            onPress={() => Linking.openSettings()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              height: 55,
              paddingHorizontal: 16,
              backgroundColor: "#fff",
            }}
          >
            <Fontisto
              name={p.icon}
              size={20}
              color={themeColor.iconBlue}
              style={{ marginRight: 14 }}
            />
            <Text style={{ flex: 1, fontSize: 16, color: "#1A1A1A" }}>
              {p.name}
            </Text>
            <ArrowRightIcon fill={themeColor.text3} width={14} height={14} />
            {i !== PERMISSIONS.length - 1 && (
              <View
                style={{
                  position: "absolute",
                  left: 50,
                  right: 0,
                  bottom: 0,
                  height: 0.5,
                  backgroundColor: "#E5E6EB",
                }}
              />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View
        style={{ backgroundColor: "#fff", marginTop: 12, paddingVertical: 4 }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => openMessageChannelSettings()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            height: 55,
            paddingHorizontal: 16,
            backgroundColor: "#fff",
          }}
        >
          <Fontisto
            name="bell"
            size={20}
            color={themeColor.iconBlue}
            style={{ marginRight: 14 }}
          />
          <Text style={{ flex: 1, fontSize: 16, color: "#1A1A1A" }}>
            消息通知渠道设置
          </Text>
          <ArrowRightIcon fill={themeColor.text3} width={14} height={14} />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => openAutostartSettings()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            height: 55,
            paddingHorizontal: 16,
            backgroundColor: "#fff",
          }}
        >
          <Fontisto
            name="power"
            size={20}
            color={themeColor.iconBlue}
            style={{ marginRight: 14 }}
          />
          <Text style={{ flex: 1, fontSize: 16, color: "#1A1A1A" }}>
            自启动（后台主动消息）
          </Text>
          <ArrowRightIcon fill={themeColor.text3} width={14} height={14} />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => requestBatteryExempt()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            height: 55,
            paddingHorizontal: 16,
            backgroundColor: "#fff",
          }}
        >
          <Fontisto
            name="battery-full"
            size={20}
            color={themeColor.iconBlue}
            style={{ marginRight: 14 }}
          />
          <Text style={{ flex: 1, fontSize: 16, color: "#1A1A1A" }}>
            电池优化白名单
          </Text>
          <ArrowRightIcon fill={themeColor.text3} width={14} height={14} />
        </TouchableOpacity>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 20,
        }}
      >
        <View style={{ flex: 1, height: 0.5, backgroundColor: "#E5E6EB" }} />
        <Text
          style={{
            color: themeColor.text3,
            fontSize: 12,
            marginHorizontal: 10,
          }}
        >
          点击可跳转到对应系统设置
        </Text>
        <View style={{ flex: 1, height: 0.5, backgroundColor: "#E5E6EB" }} />
      </View>

      <TouchableOpacity
        onPress={() => Linking.openSettings()}
        style={{ alignItems: "center", marginTop: 18 }}
      >
        <Text style={{ color: "#576B95", fontSize: 15 }}>前往系统设置</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

export default Permission;
