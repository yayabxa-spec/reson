import { useCallback, useEffect, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useLayoutEffect } from "react";
import { useTheme } from "../../../../../theme/useTheme";
import Toast from "../../../../component/base/Toast";
import Segment from "../../../../component/base/Segment";
import ChatBgLayer from "../../../../component/complex/ChatBgLayer";
import eventBus from "../../../../utils/eventBus";
import {
  CHAT_BG_PRESET_COLORS,
  CHAT_BG_PRESET_GRADIENTS,
  type ChatBg,
  type ChatBgMode,
  hasConvoOverride,
  resolveChatBg,
  setConvoChatBg,
  setGlobalChatBg,
} from "../../../../store/chatBg";
import PressableScale from "../../../../anim/PressableScale";
import { hapticLight } from "../../../../utils/haptics";

/**
 * 聊天背景设置页：
 * - 从聊天设置进入带 convoId → 可设"当前聊天"专属背景或全局默认
 * - 从"界面与显示"进入不带 convoId → 只设全局默认
 * 支持相册图片 / 纯色 / 渐变，浅色与深色模式各存一份（当前深色模式暂未启用，实际生效浅色档）。
 */
const Page = () => {
  const navigate = useNavigation();
  const params = useLocalSearchParams<{ convoId?: string }>();
  const convoId = params.convoId || undefined;
  const { themeColor, themeName } = useTheme();
  // themeName 目前固定返回 "light"（深色模式整体未启用），断言宽开避免误报
  const mode: ChatBgMode = (themeName as string) === "dark" ? "dark" : "light";
  const [scope, setScope] = useState<"convo" | "global">(
    convoId ? "convo" : "global"
  );
  const [preview, setPreview] = useState<ChatBg | null>(null);
  const [convoOverridden, setConvoOverridden] = useState(false);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerTitle: "聊天背景",
      headerShadowVisible: false,
    } as any);
  }, [navigate]);

  const refresh = useCallback(async () => {
    const [cur, overridden] = await Promise.all([
      resolveChatBg(convoId, mode),
      convoId ? hasConvoOverride(convoId, mode) : Promise.resolve(false),
    ]);
    setPreview(cur);
    setConvoOverridden(overridden);
  }, [convoId, mode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const apply = useCallback(
    async (bg: ChatBg | null) => {
      try {
        if (scope === "convo" && convoId) {
          await setConvoChatBg(convoId, mode, bg);
          Toast.success(bg ? "已设为当前聊天背景" : "已恢复使用全局背景");
        } else {
          await setGlobalChatBg(mode, bg);
          Toast.success(bg ? "已设为全局聊天背景" : "已清除全局背景");
        }
        refresh();
      } catch {
        Toast.fail("设置失败，请重试");
      }
    },
    [scope, convoId, mode, refresh]
  );

  const pickImage = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (res.canceled || !res.assets?.length) return;
    // 进入自由裁剪页：用户拖动/缩放选好范围后，裁剪结果经 "chat-bg-cropped" 事件带回
    navigate.navigate("pages/chats/screens/chat-bg/crop", {
      imageUri: res.assets[0].uri,
    });
  }, [navigate]);

  // 接收裁剪结果并按当前作用范围应用
  useEffect(() => {
    const handler = (e: { uri: string }) => {
      if (!e?.uri) return;
      apply({ type: "image", uri: e.uri });
    };
    eventBus.on("chat-bg-cropped", handler);
    return () => {
      eventBus.off("chat-bg-cropped", handler);
    };
  }, [apply]);

  const cell = (label: string, onPress: () => void, last = false) => (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        height: 48,
        justifyContent: "center",
        backgroundColor: themeColor.white,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: themeColor.outlineVariant + "66",
          height: "100%",
        }}
      >
        <Text style={{ fontSize: 15, color: themeColor.onSurface }}>
          {label}
        </Text>
        <Text style={{ fontSize: 14, color: themeColor.text3 }}>›</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: themeColor.fillColor }}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* 预览区：模拟聊天气泡效果 */}
      <View style={{ padding: 16 }}>
        <View
          style={{
            height: 190,
            borderRadius: 12,
            overflow: "hidden",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: themeColor.outlineVariant + "66",
          }}
        >
          <View style={{ flex: 1, backgroundColor: themeColor.fillColor }}>
            <ChatBgLayer bg={preview} />
            <View style={{ padding: 12, gap: 10 }}>
              <View style={{ flexDirection: "row" }}>
                <View
                  style={{
                    backgroundColor: themeColor.white,
                    borderRadius: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    maxWidth: 200,
                  }}
                >
                  <Text style={{ fontSize: 14, color: themeColor.text5 }}>
                    {preview ? "这就是新的聊天背景" : "当前没有自定义背景"}
                  </Text>
                </View>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                }}
              >
                <View
                  style={{
                    backgroundColor: themeColor.brand2,
                    borderRadius: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    maxWidth: 200,
                  }}
                >
                  <Text style={{ fontSize: 14, color: themeColor.text5 }}>
                    看起来不错！
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* 作用范围（仅从聊天页进入时显示） */}
      {convoId && (
        <View style={{ alignItems: "center", marginBottom: 12 }}>
          <Segment
            options={[
              { label: "当前聊天", value: "convo" },
              { label: "全局默认", value: "global" },
            ]}
            value={scope}
            onChange={(v) => setScope(v as "convo" | "global")}
          />
        </View>
      )}

      {/* 从相册选择 */}
      <View>
        {cell("从相册选择", () => {
          hapticLight();
          pickImage();
        }, true)}
      </View>

      {/* 纯色 */}
      <Text
        style={{
          fontSize: 13,
          color: themeColor.text3,
          paddingHorizontal: 16,
          marginTop: 16,
          marginBottom: 8,
        }}
      >
        纯色背景
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
          paddingHorizontal: 16,
        }}
      >
        {CHAT_BG_PRESET_COLORS.map((c) => (
          <PressableScale key={c} scaleTo={0.9} onPress={() => apply({ type: "color", value: c })}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                backgroundColor: c,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: themeColor.outlineVariant + "88",
              }}
            />
          </PressableScale>
        ))}
      </View>

      {/* 渐变 */}
      <Text
        style={{
          fontSize: 13,
          color: themeColor.text3,
          paddingHorizontal: 16,
          marginTop: 20,
          marginBottom: 8,
        }}
      >
        渐变背景
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
          paddingHorizontal: 16,
        }}
      >
        {CHAT_BG_PRESET_GRADIENTS.map((g) => (
          <PressableScale
            key={g.from + g.to}
            scaleTo={0.9}
            onPress={() => apply({ type: "gradient", from: g.from, to: g.to })}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <ChatBgLayer
                bg={{ type: "gradient", from: g.from, to: g.to }}
              />
            </View>
          </PressableScale>
        ))}
      </View>

      {/* 恢复默认 */}
      <View style={{ marginTop: 28 }}>
        {(scope === "convo" && convoOverridden) || scope === "global"
          ? cell(
              scope === "convo" ? "恢复使用全局背景" : "清除全局背景",
              () => apply(null),
              true
            )
          : null}
      </View>
    </ScrollView>
  );
};

export default Page;
