import { useEffect, useLayoutEffect, useState } from "react";
import {
  Linking,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import {
  RAG_PRESETS,
  readRagSettings,
  saveRagSettings,
} from "../../../../store/memory";
import Toast from "../../../../component/base/Toast";
import Segment from "../../../../component/base/Segment";
import WeChatSwitch from "../../../../component/base/WeChatSwitch";

const RagModelForm = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const params = useLocalSearchParams<{ fresh?: string }>();
  const isFresh = params.fresh === "1";

  const [loaded, setLoaded] = useState(false);
  const [preset, setPreset] = useState<"custom" | "nvidia">("custom");
  const [isNvidia, setIsNvidia] = useState(false);
  const [providerName, setProviderName] = useState("");
  const [consoleUrl, setConsoleUrl] = useState("");
  const [embBaseUrl, setEmbBaseUrl] = useState("");
  const [embKey, setEmbKey] = useState("");
  const [embModel, setEmbModel] = useState("");
  const [rerankEnabled, setRerankEnabled] = useState(true);
  const [rerBaseUrl, setRerBaseUrl] = useState("");
  const [rerKey, setRerKey] = useState("");
  const [rerModel, setRerModel] = useState("");

  const nvidia = RAG_PRESETS.find((p) => p.name === "NVIDIA");

  useEffect(() => {
    readRagSettings().then((s) => {
      if (isFresh) {
        setPreset("custom");
        setIsNvidia(false);
        setProviderName("");
        setConsoleUrl("");
        setEmbBaseUrl("");
        setEmbKey("");
        setEmbModel("");
        setRerankEnabled(true);
        setRerBaseUrl("");
        setRerKey("");
        setRerModel("");
      } else {
        const nv =
          s.providerName === "NVIDIA" ||
          (!!nvidia && s.embedding.baseUrl === nvidia.embedding.baseUrl);
        setIsNvidia(nv);
        setProviderName(s.providerName || "");
        setConsoleUrl(s.consoleUrl || "");
        setEmbBaseUrl(s.embedding.baseUrl);
        setEmbKey(s.embedding.apiKey);
        setEmbModel(s.embedding.model);
        setRerankEnabled(s.rerankEnabled);
        setRerBaseUrl(s.rerank.baseUrl);
        setRerKey(s.rerank.apiKey);
        setRerModel(s.rerank.model);
      }
      setLoaded(true);
    });
  }, [isFresh]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: isFresh ? "新建供应商" : "编辑供应商",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
    });
  }, [isFresh]);

  const inputStyle = {
    backgroundColor: themeColor.bg2,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: themeColor.text5,
    marginTop: 6,
  };

  const sectionTitle = (title: string) => (
    <Text
      style={{
        color: themeColor.text3,
        fontSize: 13,
        marginTop: 16,
        marginBottom: 4,
      }}
    >
      {title}
    </Text>
  );

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string
  ) => (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: themeColor.text3, fontSize: 13 }}>{label}</Text>
      <TextInput
        style={inputStyle}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={themeColor.text2}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );

  const choosePreset = (v: string) => {
    const id = v as "custom" | "nvidia";
    setPreset(id);
    if (id === "nvidia" && nvidia) {
      setEmbBaseUrl(nvidia.embedding.baseUrl);
      setEmbKey("");
      setEmbModel(nvidia.embedding.model);
      setRerankEnabled(nvidia.rerankEnabled);
      setRerBaseUrl(nvidia.rerank.baseUrl);
      setRerKey("");
      setRerModel(nvidia.rerank.model);
    } else {
      setEmbBaseUrl("");
      setEmbKey("");
      setEmbModel("");
      setRerankEnabled(true);
      setRerBaseUrl("");
      setRerKey("");
      setRerModel("");
    }
  };

  const save = async () => {
    const s = await readRagSettings();
    const nvMode = isFresh ? preset === "nvidia" : isNvidia;
    if (nvMode && nvidia) {
      s.providerName = "NVIDIA";
      s.embedding = {
        baseUrl: nvidia.embedding.baseUrl,
        apiKey: embKey,
        model: embModel,
      };
      s.rerankEnabled = rerankEnabled;
      s.rerank = {
        baseUrl: nvidia.rerank.baseUrl,
        apiKey: embKey,
        model: rerModel,
      };
      s.consoleUrl = nvidia.embeddingConsole;
    } else {
      s.providerName = providerName.trim() || "自定义";
      s.embedding = { baseUrl: embBaseUrl, apiKey: embKey, model: embModel };
      s.rerankEnabled = rerankEnabled;
      s.rerank = { baseUrl: rerBaseUrl, apiKey: rerKey, model: rerModel };
      s.consoleUrl = consoleUrl.trim();
    }
    await saveRagSettings(s);
    Toast.success("已保存");
    navigate.goBack();
  };

  const nvMode = isFresh ? preset === "nvidia" : isNvidia;
  const consoleTarget = nvMode && nvidia ? nvidia.embeddingConsole : consoleUrl;

  return (
    <ScrollView
      style={{ backgroundColor: "#fff", flex: 1, padding: 16 }}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {!loaded && (
        <Text style={{ color: themeColor.text3, marginTop: 20 }}>加载中…</Text>
      )}

      {isFresh && (
        <>
          <Text style={{ color: themeColor.text3, fontSize: 13 }}>快捷选择</Text>
          <View style={{ marginTop: 8 }}>
            <Segment
              options={[
                { label: "自定义", value: "custom" },
                { label: "NVIDIA", value: "nvidia" },
              ]}
              value={preset}
              onChange={choosePreset}
            />
          </View>
          <Text style={{ color: themeColor.text2, fontSize: 11, marginTop: 6 }}>
            一个供应商同时提供 Embedding 与 Rerank，选 NVIDIA 会自动填好两个模型
          </Text>
        </>
      )}

      {nvMode ? (
        <>
          {sectionTitle("Embedding")}
          {field("密钥", embKey, setEmbKey, "API Key")}
          {field("模型", embModel, setEmbModel, "模型名称")}

          {sectionTitle("Rerank")}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 4,
            }}
          >
            <Text style={{ fontSize: 15, color: themeColor.text5 }}>
              启用 Rerank
            </Text>
            <WeChatSwitch
              value={rerankEnabled}
              onValueChange={setRerankEnabled}
            />
          </View>
          {field("模型", rerModel, setRerModel, "模型名称")}
        </>
      ) : (
        <>
          {field("名称", providerName, setProviderName, "供应商名称")}
          {sectionTitle("Embedding")}
          {field("连接地址", embBaseUrl, setEmbBaseUrl, "https://…")}
          {field("密钥", embKey, setEmbKey, "API Key")}
          {field("模型", embModel, setEmbModel, "模型名称")}

          {sectionTitle("Rerank")}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 4,
            }}
          >
            <Text style={{ fontSize: 15, color: themeColor.text5 }}>
              启用 Rerank
            </Text>
            <WeChatSwitch
              value={rerankEnabled}
              onValueChange={setRerankEnabled}
            />
          </View>
          {field("连接地址", rerBaseUrl, setRerBaseUrl, "https://…")}
          {field("密钥", rerKey, setRerKey, "API Key")}
          {field("模型", rerModel, setRerModel, "模型名称")}

          {field("控制台网址", consoleUrl, setConsoleUrl, "https://…（可选）")}
        </>
      )}

      {!!consoleTarget && (
        <TouchableOpacity
          onPress={() => Linking.openURL(consoleTarget)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: themeColor.textBlue,
            borderRadius: 6,
          }}
        >
          <Text style={{ color: themeColor.textBlue, fontSize: 13 }}>
            {nvMode ? "打开 NVIDIA 控制台" : "打开控制台"}
          </Text>
          <Text style={{ color: themeColor.textBlue, fontSize: 13 }}>↗</Text>
        </TouchableOpacity>
      )}


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

export default RagModelForm;