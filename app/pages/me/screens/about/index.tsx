import { useLayoutEffect, useRef } from "react";
import { Image, ScrollView, Text, View, Vibration } from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import { Divider, List } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import AsyncStorage from "../../../../utils/storage";
import Toast from "../../../../component/base/Toast";

// 隐藏入口：连续点击"当前版本"10 次解锁设置页底部的"开发者选项"（持久化）
const DEBUG_UNLOCK_KEY = "wc_prompt_debug_unlocked_v1";
const DEBUG_TAPS_REQUIRED = 10;

const About = () => {
  const navigator = useNavigation();
  const { themeColor } = useTheme();
  const version = Constants.expoConfig?.version || "";
  const versionTapCountRef = useRef(0);
  const debugUnlockedRef = useRef(false);

  const handleVersionTap = () => {
    if (debugUnlockedRef.current) return;
    versionTapCountRef.current += 1;
    // 最强震动：直接驱动震动马达满幅 60ms（比系统轻/中/重反馈都强）
    Vibration.vibrate(60);
    if (versionTapCountRef.current >= DEBUG_TAPS_REQUIRED) {
      versionTapCountRef.current = 0;
      debugUnlockedRef.current = true;
      Toast.info("debug：已开启隐藏页面");
      AsyncStorage.setItem(DEBUG_UNLOCK_KEY, "1").catch(() => {});
      return;
    }
    // 中间点击只震动，不弹提示
  };

  useLayoutEffect(() => {
    navigator.setOptions({
      headerShown: true,
      headerTitle: "关于 RE:SON",
      headerTitleAlign: "center",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: themeColor.surfaceContainerLow },
      headerTintColor: themeColor.onSurface,
    });
  }, []);

  const openText = (type: string) =>
    navigator.navigate("pages/me/screens/about/text", { type });

  const iconWrap = (icon: any, bg: string, color: string) => (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        marginRight: 12,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MaterialCommunityIcons name={icon} size={21} color={color} />
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: themeColor.surfaceContainerLow, flex: 1 }}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* 头部 */}
      <View style={{ alignItems: "center", paddingTop: 36, paddingBottom: 24 }}>
        <Image
          source={require("../../../../../assets/app-icon.png")}
          style={{ width: 84, height: 84, borderRadius: 20 }}
        />
        <Text
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: themeColor.onSurface,
            marginTop: 14,
          }}
        >
          RE:SON
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: themeColor.onSurfaceVariant,
            marginTop: 6,
          }}
        >
          每一次发声都有回应
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: themeColor.onSurfaceVariant,
            marginTop: 8,
          }}
        >
          v{version}
        </Text>
      </View>

      {/* 简介 */}
      <View
        style={{
          backgroundColor: themeColor.surfaceContainerLowest,
          marginHorizontal: 12,
          borderRadius: 12,
          padding: 16,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            lineHeight: 22,
            color: themeColor.onSurfaceVariant,
          }}
        >
          RE:SON 是一款 AI 角色扮演聊天应用。角色拥有自己的世界线、记忆和情绪，
          会按性格主动找你聊天，也会在对话中记住你们之间的约定。聊天数据默认保存在本机。
        </Text>
      </View>

      <View style={{ marginTop: 8 }}>
        <Text
          style={{
            color: themeColor.onSurfaceVariant,
            fontSize: 13,
            marginLeft: 16,
            marginTop: 18,
            marginBottom: 4,
          }}
        >
          版本信息
        </Text>
        <View style={{ backgroundColor: themeColor.surfaceContainerLowest }}>
          <List.Item
            title="当前版本"
            titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
            style={{ minHeight: 52, paddingRight: 8 }}
            onPress={handleVersionTap}
            right={() => (
              <Text
                style={{
                  fontSize: 14,
                  color: themeColor.onSurfaceVariant,
                  alignSelf: "center",
                }}
              >
                v{version}
              </Text>
            )}
          />
          <Divider style={{ marginLeft: 16 }} />
          <List.Item
            title="更新日志"
            titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
            style={{ minHeight: 56, paddingLeft: 16, paddingRight: 8 }}
            onPress={() =>
              navigator.navigate("pages/me/screens/about/changelog")
            }
            right={() => (
              <List.Icon
                icon="chevron-right"
                color={themeColor.onSurfaceVariant}
              />
            )}
          />
        </View>
      </View>

      <View>
        <Text
          style={{
            color: themeColor.onSurfaceVariant,
            fontSize: 13,
            marginLeft: 16,
            marginTop: 18,
            marginBottom: 4,
          }}
        >
          法律与合规
        </Text>
        <View style={{ backgroundColor: themeColor.surfaceContainerLowest }}>
          <List.Item
            title="用户协议"
            titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
            style={{ minHeight: 56, paddingLeft: 16, paddingRight: 8 }}
            onPress={() => openText("terms")}
            left={() =>
              iconWrap(
                "file-document-outline",
                themeColor.secondaryContainer,
                themeColor.onSecondaryContainer
              )
            }
            right={() => (
              <List.Icon
                icon="chevron-right"
                color={themeColor.onSurfaceVariant}
              />
            )}
          />
          <Divider style={{ marginLeft: 72 }} />
          <List.Item
            title="隐私政策"
            titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
            style={{ minHeight: 56, paddingLeft: 16, paddingRight: 8 }}
            onPress={() => openText("privacy")}
            left={() =>
              iconWrap(
                "shield-lock-outline",
                themeColor.primaryContainer,
                themeColor.onPrimaryContainer
              )
            }
            right={() => (
              <List.Icon
                icon="chevron-right"
                color={themeColor.onSurfaceVariant}
              />
            )}
          />
          <Divider style={{ marginLeft: 72 }} />
          <List.Item
            title="免责声明"
            titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
            style={{ minHeight: 56, paddingLeft: 16, paddingRight: 8 }}
            onPress={() => openText("disclaimer")}
            left={() =>
              iconWrap(
                "information-outline",
                themeColor.tertiaryContainer,
                themeColor.onTertiaryContainer
              )
            }
            right={() => (
              <List.Icon
                icon="chevron-right"
                color={themeColor.onSurfaceVariant}
              />
            )}
          />
        </View>
      </View>

      <View>
        <Text
          style={{
            color: themeColor.onSurfaceVariant,
            fontSize: 13,
            marginLeft: 16,
            marginTop: 18,
            marginBottom: 4,
          }}
        >
          开源与致谢
        </Text>
        <View style={{ backgroundColor: themeColor.surfaceContainerLowest }}>
          <List.Item
            title="开源组件许可"
            titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
            style={{ minHeight: 56, paddingLeft: 16, paddingRight: 8 }}
            onPress={() => openText("opensource")}
            left={() =>
              iconWrap(
                "code-tags",
                themeColor.surfaceVariant,
                themeColor.onSurfaceVariant
              )
            }
            right={() => (
              <List.Icon
                icon="chevron-right"
                color={themeColor.onSurfaceVariant}
              />
            )}
          />
          <Divider style={{ marginLeft: 72 }} />
          <List.Item
            title="第三方服务声明"
            titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
            style={{ minHeight: 56, paddingLeft: 16, paddingRight: 8 }}
            onPress={() => openText("services")}
            left={() =>
              iconWrap(
                "cloud-outline",
                themeColor.surfaceVariant,
                themeColor.onSurfaceVariant
              )
            }
            right={() => (
              <List.Icon
                icon="chevron-right"
                color={themeColor.onSurfaceVariant}
              />
            )}
          />
        </View>
      </View>

      <Text
        style={{
          textAlign: "center",
          color: themeColor.onSurfaceVariant,
          fontSize: 12,
          marginTop: 28,
        }}
      >
        © 2026 RE:SON · 非商业个人项目
      </Text>
    </ScrollView>
  );
};

export default About;
