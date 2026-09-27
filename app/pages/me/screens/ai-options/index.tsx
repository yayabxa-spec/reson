import { useEffect, useLayoutEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import WeChatSwitch from "../../../../component/base/WeChatSwitch";
import {
  AiOptions,
  readAiOptions,
  saveAiOptions,
} from "../../../../store/aiOptions";

const AiOptionsScreen = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [opts, setOpts] = useState<AiOptions>({
    thinkingEnabled: false,
    convertTopSystem: false,
  });

  useEffect(() => {
    readAiOptions().then(setOpts).catch(() => {});
  }, []);

  const set = (patch: Partial<AiOptions>) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    saveAiOptions(next).catch(() => {});
  };

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "AI 对话选项",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, []);

  const Row = ({
    title,
    desc,
    value,
    onChange,
    last = false,
  }: {
    title: string;
    desc: string;
    value: boolean;
    onChange: (v: boolean) => void;
    last?: boolean;
  }) => (
    <View
      style={{
        backgroundColor: "#fff",
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: "#E5E6EB",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 15, color: themeColor.text5 }}>{title}</Text>
        <WeChatSwitch value={value} onValueChange={onChange} />
      </View>
      <Text
        style={{
          color: themeColor.text2,
          fontSize: 12,
          lineHeight: 18,
          marginTop: 6,
          paddingRight: 20,
        }}
      >
        {desc}
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
    >
      <View style={{ borderRadius: 10, overflow: "hidden" }}>
        <Row
          title="允许 AI 思考链"
          desc="默认关闭：所有角色回复/动态/祝福等直接生成，防止思考过程混进消息。开启后模型可先思考再回复（更复杂的问题可能更准），系统仍会拦截思考内容，不会发出来。"
          value={opts.thinkingEnabled}
          onChange={(v) => set({ thinkingEnabled: v })}
        />
        <Row
          title="system 消息兼容模式"
          desc="部分模型或网关不接受 system 角色消息。开启后会把系统提示转成 user 消息再发送（参考爱语兼容方案）。如果某个模型报“system 消息不支持”类错误，打开此项。"
          value={opts.convertTopSystem}
          onChange={(v) => set({ convertTopSystem: v })}
          last
        />
      </View>
    </ScrollView>
  );
};

export default AiOptionsScreen;
