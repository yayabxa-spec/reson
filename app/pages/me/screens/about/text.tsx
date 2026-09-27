import { useLayoutEffect } from "react";
import { ScrollView, Text } from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";

const CONTENT: Record<string, { title: string; body: string[] }> = {
  terms: {
    title: "用户协议",
    body: [
      "1. 本应用为个人非商业项目，供用户与 AI 角色进行扮演聊天。",
      "2. 角色回复由 AI 模型生成，内容仅供参考，不代表任何官方立场。",
      "3. 用户不得利用本应用从事任何违法或侵害他人权益的行为。",
      "4. 本应用按「现状」提供，不提供任何明示或默示的担保。",
      "5. 使用本应用即表示你已阅读并同意本协议；如不同意，请停止使用。",
    ],
  },
  privacy: {
    title: "隐私政策",
    body: [
      "· 聊天记录、角色卡、记忆等数据默认保存在本机应用私有目录，不会主动上传。",
      "· 备份功能导出的数据由你自行保管；启用备份加密时，密钥不会随备份文件明文保存。",
      "· 你配置的 API Key 加密存储在系统安全存储（Android Keystore）中。",
      "· AI 对话：发送给模型服务商的内容由你配置的供应商处理，请参考对应供应商的隐私政策。",
      "· 语音合成：为生成角色语音，相关文本会发送给第三方 TTS 服务商（海豚 TTS）。",
      "· 天气与定位：仅在获得授权后获取定位，用于查询本地天气；坐标会发送给定位/天气服务商。",
      "· 本应用不会收集或出售你的个人信息用于广告等目的。",
    ],
  },
  disclaimer: {
    title: "免责声明",
    body: [
      "· 角色回复由 AI 生成，可能存在不准确、不恰当或与角色设定不符的内容，请理性看待。",
      "· 本应用中的角色形象、名称、世界观等版权归原版权方所有（如米哈游等），本应用为非官方、非商业用途。",
      "· 语音、天气等第三方服务不可用或异常时，可能导致相关功能无法正常使用，本应用不承担由此产生的责任。",
      "· 本应用仅供个人娱乐与学习使用，请勿用于任何商业用途。",
    ],
  },
  opensource: {
    title: "开源组件许可",
    body: [
      "本应用基于以下开源项目构建，并遵循其各自的许可证：",
      "· React Native / React",
      "· Expo（含 Expo Router、SQLite、Audio、Notifications 等模块）",
      "· React Native Paper（Material Design 组件）",
      "· React Native Reanimated / Gesture Handler",
      "· Recoil、i18next、dayjs、expo-vector-icons 等",
      "各项目完整许可见其官方仓库与发布页。",
    ],
  },
  services: {
    title: "第三方服务声明",
    body: [
      "· 角色语音：由海豚 AI TTS（api.ttson.cn）合成，文本会发送至其服务器。",
      "· 天气数据：由 uapis.cn 等公开天气接口提供，可通过设置更换为自定义接口。",
      "· 定位服务：使用系统定位能力，坐标用于反查所在城市以提供天气。",
      "· AI 模型：由用户在设置中自行配置供应商与密钥，对话内容由其处理。",
      "各第三方服务的使用受其自身条款与隐私政策约束。",
    ],
  },
};

const AboutText = () => {
  const { themeColor } = useTheme();
  const navigator = useNavigation();
  const params = useLocalSearchParams<{ type?: string }>();
  const item = CONTENT[params.type || ""] || CONTENT.terms;

  useLayoutEffect(() => {
    navigator.setOptions({
      headerShown: true,
      headerTitle: item.title,
      headerTitleAlign: "center",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: themeColor.surfaceContainerLow },
      headerTintColor: themeColor.onSurface,
    });
  }, [item.title]);

  return (
    <ScrollView
      style={{ backgroundColor: themeColor.surfaceContainerLow, flex: 1 }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
    >
      {item.body.map((line, i) => (
        <Text
          key={i}
          style={{
            color: themeColor.onSurfaceVariant,
            fontSize: 14,
            lineHeight: 24,
            marginBottom: 12,
          }}
        >
          {line}
        </Text>
      ))}
    </ScrollView>
  );
};

export default AboutText;
