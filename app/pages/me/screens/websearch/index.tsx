import { useEffect, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import {
  readRagSettings,
  saveRagSettings,
  RagSettings,
} from "../../../../store/memory";
import Toast from "../../../../component/base/Toast";
import WeChatSwitch from "../../../../component/base/WeChatSwitch";
import Segment from "../../../../component/base/Segment";

const WebSearch = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [s, setS] = useState<RagSettings | null>(null);

  useEffect(() => {
    readRagSettings().then(setS);
  }, []);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "联网搜索",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, []);

  if (!s) return null;

  const save = async () => {
    await saveRagSettings(s);
    Toast.success("已保存");
    navigate.goBack();
  };

  return (
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
    >
      <View style={{ backgroundColor: "#fff", borderRadius: 8, padding: 14 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ fontSize: 15, color: themeColor.text5 }}>启用联网搜索</Text>
          <WeChatSwitch
            value={s.webSearchEnabled}
            onValueChange={(v) => setS({ ...s, webSearchEnabled: v })}
          />
        </View>
        <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 6 }}>
          AI 回答需要实时信息时，自动联网检索资料
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 14,
          }}
        >
          <Text style={{ color: themeColor.text3, fontSize: 13, marginRight: 10 }}>
            供应商
          </Text>
          <Segment
            options={[
              { label: "Tavily", value: "tavily" },
              { label: "Bocha", value: "bocha" },
              { label: "Brave", value: "brave" },
            ]}
            value={s.webSearchProvider}
            onChange={(v) =>
              setS({
                ...s,
                webSearchProvider: v as "tavily" | "bocha" | "brave",
              })
            }
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={{ color: themeColor.text3, fontSize: 13 }}>API Key</Text>
          <TextInput
            style={{
              backgroundColor: themeColor.bg2,
              borderRadius: 6,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14,
              color: themeColor.text5,
              marginTop: 6,
            }}
            value={s.webSearchKey}
            onChangeText={(v) => setS({ ...s, webSearchKey: v })}
            placeholder="tavily.com / bochaai.com / brave.com 的 Key"
            placeholderTextColor={themeColor.text2}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
          <Text style={{ color: themeColor.text3, fontSize: 13, marginRight: 10 }}>
            结果数量
          </Text>
          <TextInput
            style={{
              backgroundColor: themeColor.bg2,
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 8,
              fontSize: 14,
              color: themeColor.text5,
              width: 80,
              textAlign: "center",
            }}
            value={String(s.webSearchTopK)}
            onChangeText={(v) =>
              setS({ ...s, webSearchTopK: Math.max(1, parseInt(v, 10) || 5) })
            }
            keyboardType="number-pad"
          />
        </View>
      </View>

      <TouchableOpacity
        onPress={save}
        style={{
          backgroundColor: themeColor.primary,
          paddingVertical: 12,
          borderRadius: 6,
          alignItems: "center",
          marginTop: 24,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16 }}>保存</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

export default WebSearch;
