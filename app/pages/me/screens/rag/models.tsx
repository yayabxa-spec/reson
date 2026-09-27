import { useEffect, useLayoutEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import {
  DEFAULT_RAG_SETTINGS,
  RAG_PRESETS,
  RagSettings,
  readRagSettings,
} from "../../../../store/memory";

const RagModels = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [s, setS] = useState<RagSettings>({ ...DEFAULT_RAG_SETTINGS });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    readRagSettings().then((v) => {
      setS(v);
      setLoaded(true);
    });
  }, []);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "模型列表",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
    });
  }, []);

  const nvidia = RAG_PRESETS.find((p) => p.name === "NVIDIA");
  const isNvidia = !!nvidia && s.embedding.baseUrl === nvidia.embedding.baseUrl;
  const providerName = s.providerName || (isNvidia ? "NVIDIA" : "自定义");
  const keyOk =
    !!s.embedding.apiKey && (!s.rerankEnabled || !!s.rerank.apiKey);

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView style={{ flex: 1 }}>
        {!loaded && (
          <Text
            style={{
              color: themeColor.text3,
              marginTop: 20,
              paddingHorizontal: 16,
            }}
          >
            加载中…
          </Text>
        )}

        <Text
          style={{
            color: themeColor.text3,
            fontSize: 12,
            marginTop: 16,
            paddingHorizontal: 16,
          }}
        >
          一个供应商同时配置 Embedding 与 Rerank 两个模型
        </Text>

        <TouchableOpacity
          onPress={() =>
            navigate.navigate("pages/me/screens/rag/model-form")
          }
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 8,
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 0.5,
            borderBottomColor: themeColor.line2,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: themeColor.text5 }}>
              {providerName}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: themeColor.text3, fontSize: 12, marginTop: 3 }}
            >
              Embedding：{s.embedding.model} · Rerank：
              {s.rerankEnabled ? s.rerank.model : "未启用"}
            </Text>
          </View>
          <Text style={{ color: themeColor.text3, fontSize: 12 }}>
            {keyOk ? "已填 Key" : "未填 Key"}
          </Text>
          <Text style={{ color: themeColor.text3, fontSize: 16, marginLeft: 8 }}>
            →
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <TouchableOpacity
        onPress={() =>
          navigate.navigate("pages/me/screens/rag/model-form", {
            fresh: "1",
          })
        }
        style={{
          backgroundColor: themeColor.primary,
          paddingVertical: 13,
          alignItems: "center",
          margin: 16,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16 }}>新建</Text>
      </TouchableOpacity>
    </View>
  );
};

export default RagModels;