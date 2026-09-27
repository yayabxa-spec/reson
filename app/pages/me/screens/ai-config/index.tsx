import { useEffect, useLayoutEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import {
  useLocalChat,
  PROVIDER_PRESETS,
  DEFAULT_AI_CONFIG,
} from "../../../../store/localChat";
import { testConnection, fetchModels, AIConfig } from "../../../../utils/ai";
import Toast from "../../../../component/base/Toast";
import WeChatDialog from "../../../../component/base/WeChatDialog";

const AiConfig = () => {
  const { themeColor } = useTheme();
  const navigator = useNavigation();
  const {
    aiConfigs,
    activeConfigId,
    getAIConfigs,
    saveAIConfigs,
    setActiveConfig,
    addConfig,
  } = useLocalChat();
  const [form, setForm] = useState<AIConfig>({ ...DEFAULT_AI_CONFIG });
  const [testing, setTesting] = useState(false);
  const [modelList, setModelList] = useState<string[] | null>(null);
  const [modelLoading, setModelLoading] = useState(false);

  useLayoutEffect(() => {
    navigator.setOptions({
      headerShown: true,
      headerTitle: "AI 设置",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
    });
  }, []);

  useEffect(() => {
    getAIConfigs().then((list) => {
      const activeId = activeConfigId || list[0]?.id;
      const active = list.find((c) => c.id === activeId) || list[0];
      if (active) setForm({ ...active });
    });
  }, [activeConfigId]);

  const pickConfig = (cfg: AIConfig) => {
    setActiveConfig(cfg.id || "");
    setForm({ ...cfg });
    setModelList(null);
  };

  const set = (key: keyof AIConfig) => (val: string) => {
    setForm((pre) => ({ ...pre, [key]: val }));
  };

  const chooseProvider = (provider: NonNullable<AIConfig["provider"]>) => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === provider);
    setForm((pre) => ({
      ...pre,
      provider,
      apiDomain: preset?.apiDomain || pre.apiDomain,
    }));
  };

  const save = async () => {
    if (!form.apiDomain.trim() || !form.apiKey.trim() || !form.model.trim()) {
      Toast.fail("接口地址、API Key、模型名称都不能为空");
      return;
    }
    await saveAIConfigs(
      aiConfigs.map((c) => (c.id === form.id ? { ...form } : c))
    );
    Toast.success("已保存");
  };

  const test = async () => {
    if (!form.apiDomain.trim() || !form.apiKey.trim()) {
      Toast.fail("请先填写接口地址和 API Key");
      return;
    }
    setTesting(true);
    try {
      const msg = await testConnection(form);
      Toast.success(msg);
    } catch (e: any) {
      Toast.fail(e?.message || "连接失败");
    } finally {
      setTesting(false);
    }
  };

  const getModels = async () => {
    if (!form.apiDomain.trim() || !form.apiKey.trim()) {
      Toast.fail("请先填写接口地址和 API Key");
      return;
    }
    setModelLoading(true);
    try {
      const { models: list } = await fetchModels(form);
      if (!list.length) {
        Toast.fail("服务端没有返回可用模型");
      }
      setModelList(list);
    } catch (e: any) {
      Toast.fail(e?.message || "获取失败");
    } finally {
      setModelLoading(false);
    }
  };

  const delConfig = async () => {
    if (aiConfigs.length <= 1) {
      Toast.fail("至少保留一个配置");
      return;
    }
    const next = aiConfigs.filter((c) => c.id !== form.id);
    await saveAIConfigs(next);
    await setActiveConfig(next[0].id || "");
    setForm({ ...next[0] });
    Toast.success("已删除");
  };

  const inputStyle = {
    backgroundColor: themeColor.bg2,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: themeColor.text5,
    marginTop: 8,
  };

  return (
    <ScrollView style={{ backgroundColor: "#fff", flex: 1, padding: 16 }}>
      {/* 配置切换 */}
      <Text style={{ color: themeColor.text3, fontSize: 13 }}>配置管理</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {aiConfigs.map((cfg) => (
            <TouchableOpacity
              key={cfg.id}
              onPress={() => pickConfig(cfg)}
              style={{
                borderWidth: 2,
                borderColor:
                  cfg.id === form.id ? themeColor.primary : themeColor.line2,
                borderRadius: 8,
                paddingHorizontal: 14,
                paddingVertical: 8,
                backgroundColor: themeColor.bg2,
              }}
            >
              <Text
                style={{
                  color:
                    cfg.id === form.id ? themeColor.primary : themeColor.text5,
                  fontSize: 14,
                }}
              >
                {cfg.name || "配置"}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={async () => {
              const cfg = await addConfig({
                ...DEFAULT_AI_CONFIG,
                name: "配置 " + (aiConfigs.length + 1),
              });
              setForm({ ...cfg });
              setModelList(null);
            }}
            style={{
              borderWidth: 1,
              borderColor: themeColor.text3,
              borderRadius: 8,
              paddingHorizontal: 16,
              paddingVertical: 8,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: themeColor.text3, fontSize: 20 }}>＋</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 服务商预设 */}
      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 20 }}>
        服务提供商
      </Text>
      <View style={{ marginTop: 8, gap: 6 }}>
        {PROVIDER_PRESETS.map((p) => (
          <TouchableOpacity
            key={p.id}
            onPress={() => chooseProvider(p.id)}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                borderWidth: 2,
                borderColor:
                  form.provider === p.id ? themeColor.primary : themeColor.text3,
                marginRight: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {form.provider === p.id && (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: themeColor.primary,
                  }}
                />
              )}
            </View>
            <Text style={{ fontSize: 15, color: themeColor.text5 }}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 18 }}>
        接口地址（OpenAI 兼容）
      </Text>
      <TextInput
        style={inputStyle}
        value={form.apiDomain}
        onChangeText={set("apiDomain")}
        placeholder="https://api.example.com/v1"
        placeholderTextColor={themeColor.text2}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
        API Key
      </Text>
      <TextInput
        style={inputStyle}
        value={form.apiKey}
        onChangeText={set("apiKey")}
        placeholder="sk-..."
        placeholderTextColor={themeColor.text2}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
        主模型
      </Text>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
        <TextInput
          style={[inputStyle, { flex: 1, marginTop: 0 }]}
          value={form.model}
          onChangeText={set("model")}
          placeholder="gpt-5.6-sol"
          placeholderTextColor={themeColor.text2}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          onPress={getModels}
          style={{
            borderRadius: 6,
            borderWidth: 1,
            borderColor: themeColor.primary,
            paddingHorizontal: 14,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: themeColor.primary, fontSize: 13 }}>
            {modelLoading ? "获取中…" : "获取列表"}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
        辅助视觉模型（图片识别，可选）
      </Text>
      <TextInput
        style={inputStyle}
        value={form.visionModel || ""}
        onChangeText={set("visionModel")}
        placeholder="如 Qwen3-VL"
        placeholderTextColor={themeColor.text2}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
        辅助听觉模型（语音转文字，可选）
      </Text>
      <TextInput
        style={inputStyle}
        value={form.audioModel || ""}
        onChangeText={set("audioModel")}
        placeholder="如 Qwen3-Omni"
        placeholderTextColor={themeColor.text2}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={{ flexDirection: "row", marginTop: 24, gap: 10 }}>
        <TouchableOpacity
          onPress={save}
          style={{
            flex: 1,
            backgroundColor: themeColor.primary,
            borderRadius: 6,
            paddingVertical: 11,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 15 }}>保存</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={test}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: themeColor.primary,
            borderRadius: 6,
            paddingVertical: 11,
            alignItems: "center",
          }}
        >
          <Text style={{ color: themeColor.primary, fontSize: 15 }}>
            {testing ? "测试中…" : "测试连接"}
          </Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={delConfig}
        style={{ alignItems: "center", paddingVertical: 12 }}
      >
        <Text style={{ color: themeColor.danger6, fontSize: 14 }}>删除当前配置</Text>
      </TouchableOpacity>

      {/* 模型列表弹窗 */}
            <WeChatDialog
        visible={!!modelList}
        title="选择模型"
        onCancel={() => setModelList(null)}
      >
        <ScrollView style={{ marginTop: 4, maxHeight: 320 }}>
          {(modelList || []).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => {
                setForm((pre) => ({ ...pre, model: m }));
                setModelList(null);
              }}
              style={{
                paddingVertical: 10,
                borderBottomWidth: 0.5,
                borderBottomColor: themeColor.line2,
              }}
            >
              <Text style={{ fontSize: 15, color: themeColor.text5 }}>
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </WeChatDialog>
    </ScrollView>
  );
};

export default AiConfig;
